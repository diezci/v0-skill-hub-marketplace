import "server-only"

import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { CONTROLES_OPERATIVOS, type ControlOperativo, type IndicadoresOperativos } from "@/lib/operaciones-catalogo"
import { DIAS_SIN_PAGO, DIAS_REVISION_ENTREGA } from "@/lib/plazos-workflow"

export type { IndicadoresOperativos } from "@/lib/operaciones-catalogo"

export type AreaOperativa = "stripe" | "liquidaciones" | "email" | "push" | "moderacion" | "sistema"
export type SeveridadOperativa = "aviso" | "critica"

export async function registrarEventoOperativo(params: {
  area: AreaOperativa
  severidad: SeveridadOperativa
  codigo: string
  clave?: string
  mensaje: string
  contexto?: Record<string, string | number | boolean | null>
}) {
  const admin = createAdminClient()
  if (!admin) return
  const { error } = await admin.rpc("registrar_evento_operativo", {
    p_area: params.area,
    p_severidad: params.severidad,
    p_codigo: params.codigo,
    p_clave: params.clave || "global",
    p_mensaje: params.mensaje,
    p_contexto: params.contexto || {},
  })
  if (error && error.code !== "PGRST202" && error.code !== "42P01") {
    console.error("[operaciones] No se pudo registrar el evento:", error.message)
  }
}

export const CATEGORIAS_OPERATIVAS = Object.keys(CONTROLES_OPERATIVOS) as ControlOperativo[]
export type CategoriaOperativa = ControlOperativo
// Keep the existing daily-email scope. New dashboard controls are read-only.
const CATEGORIAS_ALERTA_DIARIA = ["eventos", "webhooksError", "webhooksAtascados", "liquidacionesError", "liquidacionesAtascadas", "disputasVencidas", "incidenciasCriticas", "solicitudesSinOferta"] as const satisfies readonly CategoriaOperativa[]
type FilaOperativa = { id: string; [campo: string]: unknown }
const ERROR_CONTROL = "No se pudo consultar este control."
const CAMPOS_TRABAJO = "id, titulo, estado, cliente_id, profesional_id, precio_acordado, created_at, updated_at, fecha_entrega, cancelacion_estado, cancelacion_solicitada_por, cancelacion_aceptada_por, pago_bloqueado"
const CAMPOS_ESCROW = "id, trabajo_id, cliente_id, profesional_id, estado, monto, monto_reembolsado, liquidacion_estado, liquidacion_error, stripe_refund_id, stripe_refund_status, stripe_payment_intent_id, stripe_charge_id, created_at, updated_at, trabajo:trabajos(id, titulo)"
const CAMPOS_DISPUTA = "id, trabajo_id, cliente_id, profesional_id, tipo, estado, origen, created_at, updated_at, responsable_id, asignada_at, stripe_disputa_id, stripe_disputa_estado, stripe_disputa_plazo, stripe_disputa_importe, stripe_disputa_moneda, contracargo_conciliacion, trabajo:trabajos(id, titulo), responsable:profiles!disputas_responsable_id_fkey(nombre, apellido, es_admin)"
const CAMPOS_INCIDENCIA = "id, asunto, categoria, prioridad, estado, created_at, updated_at, reportado_por, trabajo_id"

function consultaSolicitudesSinOferta(admin: NonNullable<ReturnType<typeof createAdminClient>>, ahora: number, soloConteo = false) {
  // The stored counter can be stale. Any recorded offer, including a rejected
  // or withdrawn one, means this request has received a response.
  return admin.from("solicitudes")
    .select("id, titulo, descripcion, ubicacion, presupuesto_min, presupuesto_max, urgencia, fecha_necesaria, cliente_id, created_at, ofertas:ofertas!ofertas_solicitud_id_fkey(id)", { count: "exact", head: soloConteo })
    .eq("estado", "abierta")
    .is("ofertas", null)
    .lte("created_at", new Date(ahora - 24 * 60 * 60 * 1000).toISOString())
    .order("created_at").order("id")
}

export async function obtenerConteoSolicitudesSinOferta(ahora = Date.now()) {
  const admin = createAdminClient()
  if (!admin) throw new Error("Supabase service role no está configurado.")
  const resultado = await consultaSolicitudesSinOferta(admin, ahora, true)
  if (resultado.error) throw new Error(`solicitudesSinOferta: ${resultado.error.message || "consulta fallida"}`)
  if (resultado.count == null) throw new Error("solicitudesSinOferta: no se pudo contar el total.")
  return resultado.count
}

function consultaOperativa(admin: NonNullable<ReturnType<typeof createAdminClient>>, categoria: CategoriaOperativa, ahora: number, soloConteo = false) {
  const haceQuinceMinutos = new Date(ahora - 15 * 60 * 1000).toISOString()
  const haceVeinticuatroHoras = new Date(ahora - 24 * 60 * 60 * 1000).toISOString()
  const haceCuarentaYOchoHoras = new Date(ahora - 48 * 60 * 60 * 1000).toISOString()
  const dentroDeCuarentaYOchoHoras = new Date(ahora + 48 * 60 * 60 * 1000).toISOString()
  const opciones = { count: "exact" as const, head: soloConteo }
  // Exact count is independent of page length; the ID is a deterministic tie-breaker.
  switch (categoria) {
    case "eventos": return admin.from("eventos_operativos").select("id, area, severidad, codigo, clave, mensaje, contexto, estado, ocurrencias, primer_evento_at, ultimo_evento_at", opciones).eq("estado", "abierto").order("ultimo_evento_at", { ascending: false }).order("id")
    case "webhooksError": return admin.from("stripe_eventos_webhook").select("id, tipo, estado, intentos, ultimo_error, created_at, ultimo_intento_at, procesado_at", opciones).eq("estado", "error").order("ultimo_intento_at", { ascending: false }).order("id")
    case "webhooksAtascados": return admin.from("stripe_eventos_webhook").select("id, tipo, estado, intentos, ultimo_error, created_at, ultimo_intento_at, procesado_at", opciones).eq("estado", "procesando").lt("ultimo_intento_at", haceQuinceMinutos).order("ultimo_intento_at").order("id")
    case "liquidacionesError": return admin.from("transacciones_escrow").select(CAMPOS_ESCROW, opciones).eq("liquidacion_estado", "error").order("updated_at", { ascending: false }).order("id")
    case "liquidacionesAtascadas": return admin.from("transacciones_escrow").select(CAMPOS_ESCROW, opciones).eq("liquidacion_estado", "procesando").lt("updated_at", haceQuinceMinutos).order("updated_at").order("id")
    case "disputasVencidas": return admin.from("disputas").select(CAMPOS_DISPUTA, opciones).in("estado", ["abierta", "en_revision"]).lt("created_at", haceVeinticuatroHoras).order("created_at").order("id")
    case "incidenciasCriticas": return admin.from("incidencias").select(CAMPOS_INCIDENCIA, opciones).eq("prioridad", "critica").in("estado", ["abierta", "en_revision"]).order("created_at").order("id")
    case "solicitudesSinOferta": return consultaSolicitudesSinOferta(admin, ahora, soloConteo)
    case "pagosSinCompletar": return admin.from("trabajos").select(CAMPOS_TRABAJO, opciones).eq("estado", "pendiente_pago").lte("created_at", new Date(ahora - DIAS_SIN_PAGO * 86400000).toISOString()).order("created_at").order("id")
    case "entregasSinRevisar": return admin.from("trabajos").select(CAMPOS_TRABAJO, opciones).eq("estado", "entregado").lte("fecha_entrega", new Date(ahora - DIAS_REVISION_ENTREGA * 86400000).toISOString()).order("fecha_entrega").order("id")
    // The persisted cancellation enum is pendiente/rechazada, not solicitada.
    case "cancelacionesPendientes": return admin.from("trabajos").select(CAMPOS_TRABAJO, opciones).eq("cancelacion_estado", "pendiente").in("estado", ["pendiente_pago", "en_progreso"]).is("cancelacion_aceptada_por", null).order("updated_at").order("id")
    case "incidenciasPendientes": return admin.from("incidencias").select(CAMPOS_INCIDENCIA, opciones).in("estado", ["abierta", "en_revision"]).lte("created_at", haceVeinticuatroHoras).order("created_at").order("id")
    case "verificacionesPendientes": return admin.from("solicitudes_verificacion_profesional").select("id, profesional_id, empresa_id, estado, solicitada_at, actualizada_at, profesional:profesionales(id, titulo)", opciones).in("estado", ["pendiente", "en_revision"]).lte("solicitada_at", haceCuarentaYOchoHoras).order("solicitada_at").order("id")
    case "reembolsosPendientes": return admin.from("transacciones_escrow").select(CAMPOS_ESCROW, opciones).not("stripe_refund_id", "is", null).in("stripe_refund_status", ["pending", "requires_action"]).order("updated_at").order("id")
    case "contracargosPorResponder": return admin.from("disputas").select(CAMPOS_DISPUTA, opciones).eq("origen", "stripe").in("estado", ["abierta", "en_revision"]).in("stripe_disputa_estado", ["needs_response", "warning_needs_response"]).not("stripe_disputa_plazo", "is", null).lte("stripe_disputa_plazo", dentroDeCuarentaYOchoHoras).or("contracargo_conciliacion->>estado.is.null,contracargo_conciliacion->>estado.neq.completada").order("stripe_disputa_plazo").order("id")
  }
}

export async function obtenerIndicadoresOperativos(ahora = Date.now()): Promise<IndicadoresOperativos> {
  const admin = createAdminClient()
  const resultados = await Promise.allSettled(CATEGORIAS_OPERATIVAS.map(async categoria => {
    if (!admin) throw new Error(ERROR_CONTROL)
    const resultado = await consultaOperativa(admin, categoria, ahora, true)
    if (resultado.error || resultado.count == null || !Number.isSafeInteger(resultado.count) || resultado.count < 0) throw new Error(ERROR_CONTROL)
    return resultado.count
  }))
  const controles = Object.fromEntries(CATEGORIAS_OPERATIVAS.map((categoria, i) => {
    const resultado = resultados[i]
    return [categoria, resultado.status === "fulfilled" ? { total: resultado.value, error: null } : { total: null, error: ERROR_CONTROL }]
  })) as IndicadoresOperativos["controles"]
  return { generadoAt: new Date(ahora).toISOString(), controles }
}

export async function obtenerDetalleOperativo(categoria: CategoriaOperativa, desde = 0, ahora = Date.now()) {
  const admin = createAdminClient()
  if (!admin) throw new Error("Supabase service role no está configurado.")
  const resultado = await consultaOperativa(admin, categoria, ahora).range(desde, desde + 24)
  if (resultado.error) throw new Error(`${categoria}: ${resultado.error.message || "consulta fallida"}`)
  // A missing count is an unavailable observation, never an all-clear.
  if (resultado.count == null) throw new Error(`${categoria}: no se pudo contar el total.`)
  return { filas: (resultado.data || []) as FilaOperativa[], total: resultado.count }
}

async function resumirCategorias<T extends CategoriaOperativa>(categorias: readonly T[]) {
  const ahora = Date.now()
  const resultados = await Promise.all(categorias.map(categoria => obtenerDetalleOperativo(categoria, 0, ahora)))
  const detalle = Object.fromEntries(categorias.map((categoria, i) => [categoria, resultados[i].filas])) as Record<T, FilaOperativa[]>
  const totales = Object.fromEntries(categorias.map((categoria, i) => [categoria, resultados[i].total])) as Record<T, number>
  const tecnicas = categorias.filter(categoria => ["pagos", "avisos"].includes(CONTROLES_OPERATIVOS[categoria].grupo))
  const alertasTecnicas = tecnicas.reduce((total, categoria) => total + totales[categoria], 0)
  const alertasOperacion = categorias.filter(categoria => !tecnicas.includes(categoria)).reduce((total, categoria) => total + totales[categoria], 0)
  return { generadoAt: new Date(ahora).toISOString(), alertasTecnicas, alertasOperacion, total: alertasTecnicas + alertasOperacion, totales, detalle }
}

export async function obtenerResumenOperativo() {
  return resumirCategorias(CATEGORIAS_OPERATIVAS)
}

export async function enviarAlertaOperativaDiaria() {
  const resumen = await resumirCategorias(CATEGORIAS_ALERTA_DIARIA)
  if (resumen.total === 0) return { enviado: false, motivo: "sin_alertas", resumen }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    await registrarEventoOperativo({
      area: "email",
      severidad: "critica",
      codigo: "resend_no_configurado",
      mensaje: "No se pudo enviar el resumen operativo porque falta RESEND_API_KEY.",
    })
    throw new Error("RESEND_API_KEY no está configurado.")
  }

  const destinatario = process.env.OPERATIONS_ALERT_EMAIL || "contacto@diime.es"
  const remitente = process.env.RESEND_FROM || "Diime <avisos@diime.es>"
  const filas = [
    ["Eventos técnicos", resumen.totales.eventos],
    ["Webhooks Stripe fallidos", resumen.totales.webhooksError],
    ["Webhooks atascados", resumen.totales.webhooksAtascados],
    ["Liquidaciones fallidas", resumen.totales.liquidacionesError],
    ["Liquidaciones atascadas", resumen.totales.liquidacionesAtascadas],
    ["Disputas con más de 24 h", resumen.totales.disputasVencidas],
    ["Incidencias críticas", resumen.totales.incidenciasCriticas],
    ["Demandas abiertas sin ofertas registradas tras 24 h", resumen.totales.solicitudesSinOferta],
  ].filter(([, total]) => Number(total) > 0)
  const listaTexto = filas.map(([nombre, total]) => `- ${nombre}: ${total}`).join("\n")
  const listaHtml = filas.map(([nombre, total]) => `<li><strong>${nombre}</strong>: ${total}</li>`).join("")
  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: remitente,
    to: destinatario,
    subject: `[Diime] ${resumen.total} alerta${resumen.total === 1 ? "" : "s"} operativa${resumen.total === 1 ? "" : "s"}`,
    text: `Hay elementos que requieren revisión:\n\n${listaTexto}\n\nAbre https://www.diime.es/admin/operaciones`,
    html: `<p>Hay elementos que requieren revisión:</p><ul>${listaHtml}</ul><p><a href="https://www.diime.es/admin/operaciones">Abrir operaciones</a></p>`,
  })

  if (error) {
    const motivo = error.message || error.name || "resend_error"
    console.error("[operaciones] Resend rechazó el resumen operativo.", {
      nombre: error.name,
      mensaje: error.message,
    })
    await registrarEventoOperativo({
      area: "email",
      severidad: "critica",
      codigo: "resumen_operativo_fallido",
      mensaje: "Resend rechazó el resumen operativo diario.",
      contexto: { motivo: motivo.slice(0, 500) },
    })
    throw new Error(`Resend rechazó el resumen operativo: ${motivo}`)
  }

  return { enviado: true, resumen }
}
