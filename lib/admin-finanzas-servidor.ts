import "server-only"
import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"
import { centimos, comisionLiquidada, esPagoLiquidado, gastoMovimiento, idStripe, sumarCentimos } from "@/lib/admin-finanzas"
import type { DisputaFinanzas, MovimientoFinanzas, PagoFinanzas, ResultadoFinanzasAdmin, ResumenFinanzasAdmin } from "@/lib/admin-finanzas"

const CAMPOS_PAGOS = "id,trabajo_id,estado,monto,retencion_plataforma,comision_cliente,comision_proveedor,monto_reembolsado,liquidacion_estado,liquidacion_error,stripe_payment_intent_id,stripe_charge_id,stripe_session_id,stripe_refund_id,stripe_refund_status,stripe_disputa_id,fecha_liberacion,fecha_reembolso,created_at,trabajo:trabajos(titulo)"
const CAMPOS_DISPUTAS = "id,escrow_id,stripe_disputa_id,stripe_disputa_estado,stripe_disputa_importe,stripe_disputa_moneda,contracargo_conciliacion"
const ERROR_RESUMEN = "No se pudo completar la consulta financiera. Vuelve a intentarlo."
const OPCIONES_STRIPE = { timeout: 15_000, maxNetworkRetries: 1 }

interface Dependencias {
  sesion: () => Promise<SupabaseClient | null>
  admin: () => SupabaseClient | null
  stripe: () => Stripe
  ahora?: () => number
}

async function autorizar(sesion: SupabaseClient, esperado?: string): Promise<string | null> {
  const { data, error } = await sesion.auth.getUser()
  if (error || !data.user || (esperado && data.user.id !== esperado)) return null
  const perfil = await sesion.from("profiles").select("es_admin,cuenta_eliminada").eq("id", data.user.id).maybeSingle()
  return !perfil.error && perfil.data?.es_admin === true && !perfil.data.cuenta_eliminada ? data.user.id : null
}

async function leerFilas<T extends { id: string }>(admin: SupabaseClient, tabla: string, campos: string, corte: string): Promise<T[]> {
  const filas: T[] = [], vistos = new Set<string>()
  for (let desde = 0; ; desde += 500) {
    let consulta = admin.from(tabla).select(campos).lte("created_at", corte).order("id", { ascending: true }).range(desde, desde + 499)
    if (tabla === "disputas") consulta = consulta.eq("origen", "stripe")
    const { data, error } = await consulta
    if (error || !Array.isArray(data)) throw new Error("Consulta de libro incompleta")
    for (const fila of data as unknown as T[]) {
      if (!fila.id || vistos.has(fila.id)) throw new Error("Paginación del libro inconsistente")
      vistos.add(fila.id); filas.push(fila)
    }
    if (data.length < 500) return filas
  }
}

async function leerGastos(stripe: Stripe, corte: number) {
  let total = 0, cursor: string | undefined, creditos = false
  const ids = new Set<string>(), idsEur = new Set<string>(), monedas = new Set<string>(), cursores = new Set<string>()
  for (;;) {
    const pagina = await stripe.balanceTransactions.list({ limit: 100, created: { lte: corte }, ...(cursor ? { starting_after: cursor } : {}) }, OPCIONES_STRIPE)
    if (!Array.isArray(pagina.data) || typeof pagina.has_more !== "boolean") throw new Error("Balance incompleto")
    for (const fila of pagina.data) {
      if (!fila.id || !Number.isSafeInteger(fila.created) || fila.created > corte) throw new Error("Movimiento fuera del corte")
      if (ids.has(fila.id)) continue
      ids.add(fila.id)
      const moneda = fila.currency?.toLowerCase()
      if (!moneda || !/^[a-z]{3}$/.test(moneda)) throw new Error("Moneda desconocida")
      if (moneda !== "eur") { monedas.add(moneda.toUpperCase()); continue }
      idsEur.add(fila.id)
      const movimiento = fila as MovimientoFinanzas
      creditos ||= movimiento.type === "fee_credit_funding" || movimiento.balance_type === "fee_credits"
      total = sumarCentimos(total, gastoMovimiento(movimiento))
    }
    if (!pagina.has_more) return { total, idsEur, monedas, creditos }
    const siguiente = pagina.data.at(-1)?.id
    if (!siguiente || cursores.has(siguiente)) throw new Error("Paginación Stripe inconsistente")
    cursores.add(siguiente); cursor = siguiente
  }
}

async function verificarPago(stripe: Stripe, pago: PagoFinanzas, disputas: DisputaFinanzas[], modoReal: boolean) {
  if (pago.liquidacion_error || (pago.liquidacion_estado && pago.liquidacion_estado !== "completada")) throw new Error("Liquidación pendiente")
  let chargeId = pago.stripe_charge_id
  if (!chargeId && pago.stripe_payment_intent_id) {
    const intent = await stripe.paymentIntents.retrieve(pago.stripe_payment_intent_id, OPCIONES_STRIPE)
    if (intent.id !== pago.stripe_payment_intent_id || intent.livemode !== modoReal || intent.status !== "succeeded") throw new Error("PaymentIntent no conciliado")
    chargeId = idStripe(intent.latest_charge)
  }
  if (!chargeId) throw new Error("Sin referencia de cargo")
  // No stripeAccount override: retrieval must succeed in the configured account.
  const cargo = await stripe.charges.retrieve(chargeId, OPCIONES_STRIPE)
  const monto = centimos(pago.monto)
  if (cargo.id !== chargeId || cargo.livemode !== modoReal || !cargo.paid || !cargo.captured || monto == null || monto !== cargo.amount
    || (pago.stripe_payment_intent_id && idStripe(cargo.payment_intent) !== pago.stripe_payment_intent_id)
    || (cargo.metadata?.escrow_id && cargo.metadata.escrow_id !== pago.id)
    || (pago.stripe_session_id?.startsWith("cs_live_") && !modoReal) || (pago.stripe_session_id?.startsWith("cs_test_") && modoReal)) throw new Error("Cargo no conciliado")
  if (cargo.currency.toLowerCase() !== "eur") return { moneda: cargo.currency.toUpperCase(), cargo, bruto: null }
  if (disputas.length > 1 || (cargo.disputed && disputas.length === 0) || (pago.stripe_disputa_id && !disputas.some(d => d.stripe_disputa_id === pago.stripe_disputa_id))) throw new Error("Contracargo sin conciliar")
  for (const registro of disputas) {
    if (!registro.stripe_disputa_id) throw new Error("Contracargo sin referencia")
    const disputa = await stripe.disputes.retrieve(registro.stripe_disputa_id, OPCIONES_STRIPE)
    if (disputa.id !== registro.stripe_disputa_id || disputa.livemode !== modoReal || idStripe(disputa.charge) !== cargo.id || disputa.currency !== "eur"
      || disputa.amount !== cargo.amount || Number(registro.stripe_disputa_importe) !== disputa.amount || registro.stripe_disputa_moneda !== "eur"
      || registro.stripe_disputa_estado !== disputa.status || !["lost", "won"].includes(disputa.status)
      || registro.contracargo_conciliacion?.estado !== "completada" || registro.contracargo_conciliacion.resultado !== disputa.status) throw new Error("Contracargo parcial o pendiente")
    if (disputa.status === "lost") return { cargo, bruto: 0, moneda: "EUR" }
  }
  const bruto = comisionLiquidada(pago), reembolsado = centimos(pago.monto_reembolsado ?? 0)
  if (bruto == null || reembolsado == null || reembolsado < 0 || reembolsado !== cargo.amount_refunded || bruto > cargo.amount - reembolsado) throw new Error("Liquidación no conciliada")
  if (reembolsado > 0) {
    if (!pago.stripe_refund_id || pago.stripe_refund_status !== "succeeded") throw new Error("Reembolso pendiente")
    const refund = await stripe.refunds.retrieve(pago.stripe_refund_id, OPCIONES_STRIPE)
    if (refund.id !== pago.stripe_refund_id || refund.status !== "succeeded" || refund.amount !== reembolsado || refund.currency !== "eur"
      || idStripe(refund.charge) !== cargo.id || (pago.stripe_payment_intent_id && idStripe(refund.payment_intent) !== pago.stripe_payment_intent_id)) throw new Error("Reembolso no conciliado")
  }
  return { cargo, bruto, moneda: "EUR" }
}

async function consultar(admin: SupabaseClient, stripe: Stripe, ahora: number): Promise<ResumenFinanzasAdmin> {
  const actualizadoEn = new Date(ahora).toISOString(), corte = Math.floor(ahora / 1000)
  const balance = await stripe.balance.retrieve(OPCIONES_STRIPE)
  if (typeof balance.livemode !== "boolean") throw new Error("Modo Stripe desconocido")
  const resumen: ResumenFinanzasAdmin = { brutoCentimos: null, gastosStripeCentimos: null, netoCentimos: null, modoReal: balance.livemode, actualizadoEn, pagosLiquidados: 0, pendientesConciliar: 0, otrasMonedas: [], avisos: [], ultimosCobros: [] }
  const monedas = new Set<string>()
  const [libro, gastos] = await Promise.allSettled([
    Promise.all([leerFilas<PagoFinanzas>(admin, "transacciones_escrow", CAMPOS_PAGOS, actualizadoEn), leerFilas<DisputaFinanzas>(admin, "disputas", CAMPOS_DISPUTAS, actualizadoEn)]),
    leerGastos(stripe, corte),
  ])
  if (gastos.status === "fulfilled") {
    resumen.gastosStripeCentimos = gastos.value.total
    gastos.value.monedas.forEach(moneda => monedas.add(moneda))
    if (gastos.value.creditos) resumen.avisos.push("Los gastos incluyen comisiones pagadas con créditos Stripe; los créditos concedidos no se suman a los ingresos. Los créditos anteriores al 2 de abril de 2026 no figuran en este balance.")
  } else resumen.avisos.push("No se pudieron consultar todos los gastos de Stripe. El gasto y el neto están pendientes.")
  if (libro.status === "fulfilled") {
    const [pagos, disputas] = libro.value
    let bruto = 0
    const cargos = new Set<string>(), porPago = new Map<string, DisputaFinanzas[]>()
    for (const disputa of disputas) if (disputa.escrow_id) porPago.set(disputa.escrow_id, [...(porPago.get(disputa.escrow_id) ?? []), disputa])
    for (const pago of pagos.filter(esPagoLiquidado)) {
      try {
        const verificado = await verificarPago(stripe, pago, porPago.get(pago.id) ?? [], balance.livemode)
        if (verificado.moneda !== "EUR") monedas.add(verificado.moneda)
        if (verificado.bruto == null || cargos.has(verificado.cargo.id)) throw new Error("Cargo sin conciliar o duplicado")
        cargos.add(verificado.cargo.id)
        const balanceId = idStripe(verificado.cargo.balance_transaction)
        if (!balanceId || (gastos.status === "fulfilled" && !gastos.value.idsEur.has(balanceId))) {
          resumen.gastosStripeCentimos = null
          resumen.avisos.push("Hay cargos cuyo gasto todavía no se ha podido localizar en el balance de Stripe.")
        }
        bruto = sumarCentimos(bruto, verificado.bruto)
        resumen.pagosLiquidados++
        if (verificado.bruto > 0) {
          const trabajo = Array.isArray(pago.trabajo) ? pago.trabajo[0] : pago.trabajo
          resumen.ultimosCobros.push({ id: pago.id, trabajoId: pago.trabajo_id, fecha: pago.fecha_liberacion ?? pago.fecha_reembolso ?? pago.created_at, importeCentimos: verificado.bruto, titulo: trabajo?.titulo || "Trabajo" })
        }
      } catch { resumen.pendientesConciliar++ }
    }
    if (resumen.pendientesConciliar === 0) resumen.brutoCentimos = bruto
    else resumen.avisos.push("Hay pagos liquidados pendientes de conciliar con Stripe. El bruto y el neto están pendientes.")
    resumen.ultimosCobros.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
    resumen.ultimosCobros = resumen.ultimosCobros.slice(0, 6)
  } else resumen.avisos.push("No se pudo leer el libro completo de pagos y contracargos. El bruto y el neto están pendientes.")
  resumen.otrasMonedas = [...monedas].sort()
  if (monedas.size) resumen.avisos.push("Los movimientos en otras monedas no se convierten ni se suman al resumen en euros.")
  resumen.avisos = [...new Set(resumen.avisos)]
  if (resumen.brutoCentimos != null && resumen.gastosStripeCentimos != null) resumen.netoCentimos = sumarCentimos(resumen.brutoCentimos, -resumen.gastosStripeCentimos)
  return resumen
}

/** Cache is only reachable after fresh user + admin profile authorization. */
export function crearServicioFinanzasAdmin(deps: Dependencias): () => Promise<ResultadoFinanzasAdmin> {
  let cache: { vence: number; data: ResumenFinanzasAdmin } | null = null
  let pendiente: Promise<ResumenFinanzasAdmin> | null = null
  const ahora = deps.ahora ?? Date.now
  return async () => {
    try {
      const sesion = await deps.sesion()
      const actor = sesion && await autorizar(sesion)
      if (!sesion || !actor) return { error: "No tienes permiso para consultar las finanzas." }
      if (cache && cache.vence > ahora()) return { data: cache.data }
      if (!pendiente) {
        const admin = deps.admin()
        if (!admin) return { error: ERROR_RESUMEN }
        pendiente = consultar(admin, deps.stripe(), ahora()).finally(() => { pendiente = null })
      }
      const data = await pendiente
      if (!await autorizar(sesion, actor)) return { error: "No tienes permiso para consultar las finanzas." }
      // Failed/incomplete reads retry immediately instead of caching false zeros.
      if (data.brutoCentimos != null && data.gastosStripeCentimos != null) cache = { vence: ahora() + 60_000, data }
      return { data }
    } catch { return { error: ERROR_RESUMEN } }
  }
}
