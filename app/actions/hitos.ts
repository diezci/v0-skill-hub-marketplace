"use server"

import type Stripe from "stripe"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { puedePagarTrabajo, obtenerDestinoCobroTrabajo } from "@/lib/empresas/cobros"
import { validarActorTrabajoEmpresa } from "@/lib/empresas/identidad"
import { conciliarSesionPagada, liquidarPagoReclamado } from "@/lib/flujo-pagos"
import { validarAdjuntosEntrega } from "@/lib/entregas"
import { errorContenidoProhibido } from "@/lib/moderacion"
import { validarPlanHitos, type HitoBorrador, type ModalidadPago } from "@/lib/hitos"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refrescar(trabajoId?: string) {
  for (const ruta of ["/mis-solicitudes", "/mis-ofertas", "/mis-trabajos", "/mi-empresa", "/demandas"]) revalidatePath(ruta)
  if (trabajoId) revalidatePath(`/trabajos/${trabajoId}/hitos`)
}

async function contexto() {
  const supabase = await createClient()
  if (!supabase) throw new Error("No se pudo conectar con la base de datos.")
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || user.is_anonymous) throw new Error("Inicia sesión para consultar este plan.")
  return { supabase, user }
}

function mensajeError(error: unknown) {
  return error instanceof Error ? error.message : (error as { message?: string })?.message || "No se pudo guardar el cambio. Actualiza el plan y vuelve a intentarlo."
}

async function rpcPlan(nombre: string, params: Record<string, unknown>, trabajoId?: string) {
  try {
    const { supabase } = await contexto()
    const { data, error } = await supabase.rpc(nombre, params)
    if (error) throw error
    refrescar(trabajoId)
    // A notification failure never turns an already committed proposal into a
    // failed operation in the UI, which would invite an accidental resubmission.
    try {
      const { notificarCambioHitos } = await import("@/lib/hitos-avisos")
      await notificarCambioHitos(nombre, data, params)
    } catch { console.error("No se pudo enviar el aviso del cambio de hitos.") }
    return { data }
  } catch (error) { return { error: mensajeError(error) } }
}

export async function obtenerPlanOferta(ofertaId: string) {
  if (!uuid.test(ofertaId)) return { error: "El presupuesto no es válido." }
  try {
    const { supabase } = await contexto()
    const { data, error } = await supabase.rpc("obtener_plan_oferta", { p_oferta: ofertaId })
    if (error) throw error
    return { data }
  } catch (error) { return { error: mensajeError(error) } }
}

export async function obtenerPlanHitos(trabajoId: string) {
  if (!uuid.test(trabajoId)) return { error: "El trabajo no es válido." }
  try {
    const { supabase } = await contexto()
    const { data, error } = await supabase.rpc("obtener_plan_hitos", { p_trabajo: trabajoId })
    if (error) throw error
    return { data }
  } catch (error) { return { error: mensajeError(error) } }
}

type PropuestaPlan = { version: number; modalidad: ModalidadPago; hitos: HitoBorrador[] }

function validarPropuesta(datos: PropuestaPlan) {
  if (!datos || !Number.isSafeInteger(datos.version) || datos.version < 0 || !["unico", "hitos"].includes(datos.modalidad)) return "La versión del plan no es válida. Actualiza la página."
  if (!Array.isArray(datos.hitos)) return "Los hitos no son válidos."
  if (datos.modalidad === "unico") return datos.hitos.length ? "El pago único no incluye hitos." : null
  const error = validarPlanHitos(datos.hitos, datos.hitos.reduce((total, h) => total + (h?.importe_centimos || 0), 0))
  return error || errorContenidoProhibido(...datos.hitos.flatMap(h => [h.titulo, h.descripcion, h.criterio_aceptacion]))
}

export async function proponerPlanOferta(ofertaId: string, datos: PropuestaPlan) {
  const error = validarPropuesta(datos)
  if (error || !uuid.test(ofertaId)) return { error: error || "El presupuesto no es válido." }
  return rpcPlan("proponer_plan_oferta", { p_oferta: ofertaId, p_modalidad: datos.modalidad, p_hitos: datos.hitos, p_version: datos.version })
}

export async function responderPlanOferta(ofertaId: string, version: number, aceptar: boolean) {
  if (!uuid.test(ofertaId) || !Number.isSafeInteger(version) || typeof aceptar !== "boolean") return { error: "La respuesta al plan no es válida." }
  return rpcPlan("responder_plan_oferta", { p_oferta: ofertaId, p_version: version, p_aceptar: aceptar })
}

export async function proponerPlanHitos(trabajoId: string, datos: PropuestaPlan) {
  const error = validarPropuesta(datos)
  if (error || !uuid.test(trabajoId)) return { error: error || "El trabajo no es válido." }
  return rpcPlan("proponer_plan_trabajo", { p_trabajo: trabajoId, p_modalidad: datos.modalidad, p_hitos: datos.hitos, p_version: datos.version }, trabajoId)
}

export async function responderPlanHitos(trabajoId: string, version: number, aceptar: boolean) {
  if (!uuid.test(trabajoId) || !Number.isSafeInteger(version) || typeof aceptar !== "boolean") return { error: "La respuesta al plan no es válida." }
  return rpcPlan("responder_plan_trabajo", { p_trabajo: trabajoId, p_version: version, p_aceptar: aceptar }, trabajoId)
}

export async function entregarHito(trabajoId: string, hitoId: string, entrega: { mensaje: string; archivos: string[] }) {
  if (!uuid.test(trabajoId) || !uuid.test(hitoId) || typeof entrega?.mensaje !== "string" || !entrega.mensaje.trim() || entrega.mensaje.length > 5000) return { error: "Describe qué has entregado para certificar este hito (hasta 5.000 caracteres)." }
  const adjuntos = validarAdjuntosEntrega(entrega.archivos)
  if (adjuntos.error) return { error: adjuntos.error }
  return rpcPlan("entregar_hito", { p_trabajo: trabajoId, p_hito: hitoId, p_mensaje: entrega.mensaje.trim(), p_archivos: adjuntos.archivos }, trabajoId)
}

export async function solicitarCambiosHito(trabajoId: string, hitoId: string, motivo: string, archivos: string[] = []) {
  if (!uuid.test(trabajoId) || !uuid.test(hitoId) || typeof motivo !== "string" || !motivo.trim() || motivo.length > 5000) return { error: "Explica los cambios necesarios (hasta 5.000 caracteres)." }
  const adjuntos = validarAdjuntosEntrega(archivos)
  if (adjuntos.error) return { error: adjuntos.error }
  return rpcPlan("rechazar_entrega_hito", { p_trabajo: trabajoId, p_hito: hitoId, p_mensaje: motivo.trim(), p_archivos: adjuntos.archivos }, trabajoId)
}

export async function aprobarHito(trabajoId: string, hitoId: string) {
  if (!uuid.test(trabajoId) || !uuid.test(hitoId)) return { error: "El hito no es válido." }
  try {
    const { supabase, user } = await contexto()
    const permiso = await validarActorTrabajoEmpresa(supabase, trabajoId, user.id, "gestionar_cobros", "cliente")
    if (permiso) throw new Error(permiso)
    const admin = createAdminClient()
    if (!admin) throw new Error("La configuración segura de pagos no está disponible.")
    const { data: escrow, error } = await admin.from("transacciones_escrow").select("*")
      .eq("trabajo_id", trabajoId).eq("hito_id", hitoId)
      .or("estado.in.(retenido,fondos_retenidos,liquidando),liquidacion_operacion_id.like.confirmacion-%").maybeSingle()
    if (error || !escrow) throw new Error("No se encontró el pago de este hito pendiente de aprobación.")
    const { data: reclamada, error: claimError } = await admin.rpc("diime_reclamar_liquidacion", {
      p_escrow: escrow.id, p_actor: user.id, p_tipo: "confirmacion",
    })
    if (claimError) throw claimError
    await liquidarPagoReclamado(admin, reclamada)
    refrescar(trabajoId)
    return { success: true }
  } catch (error) { return { error: mensajeError(error) } }
}

export async function cerrarPagoHito(trabajoId: string, hitoId: string) {
  if (!uuid.test(trabajoId) || !uuid.test(hitoId)) return { error: "El hito no es válido." }
  try {
    const { supabase, user } = await contexto()
    const permiso = await validarActorTrabajoEmpresa(supabase, trabajoId, user.id, "gestionar_cobros", "cliente")
    if (permiso) throw new Error(permiso)
    const admin = createAdminClient()
    if (!admin) throw new Error("La configuración segura de pagos no está disponible.")
    const { data: escrow, error } = await admin.from("transacciones_escrow").select("id,stripe_session_id")
      .eq("trabajo_id", trabajoId).eq("hito_id", hitoId).eq("estado", "pendiente").maybeSingle()
    if (error) throw error
    if (!escrow) return { error: "No hay un intento de pago abierto para este hito. Actualiza su estado." }
    if (escrow.stripe_session_id) {
      let session = await stripe.checkout.sessions.retrieve(escrow.stripe_session_id)
      if (session.status === "open") {
        try { session = await stripe.checkout.sessions.expire(session.id) }
        catch { session = await stripe.checkout.sessions.retrieve(session.id) }
      }
      if (session.payment_status === "paid") {
        await conciliarSesionPagada(admin, session)
        refrescar(trabajoId)
        return { error: "El pago ya se ha completado. Las condiciones de este hito se conservan." }
      }
      if (session.status !== "expired") return { error: "Stripe está procesando el pago. Espera a su confirmación antes de modificar el plan." }
    }
    const { error: cierreError } = await admin.rpc("diime_cerrar_intento", { p_escrow: escrow.id, ...(escrow.stripe_session_id ? { p_session: escrow.stripe_session_id } : {}) })
    if (cierreError) throw cierreError
    refrescar(trabajoId)
    return { success: true }
  } catch (error) { return { error: mensajeError(error) } }
}

/** The database reserves one immutable payment attempt before contacting Stripe. */
export async function pagarHito(trabajoId: string, hitoId: string): Promise<{
  error?: string; codigo?: string; hrefContrato?: string; clientSecret?: string
  escrow?: { id: string; stripe_session_id: string }
  desglose?: { precioBase: number; comisionCliente: number; totalCliente: number }
}> {
  if (!uuid.test(trabajoId) || !uuid.test(hitoId)) return { error: "El hito no es válido." }
  try {
    const { supabase, user } = await contexto()
    const admin = createAdminClient()
    if (!admin) throw new Error("La configuración segura de pagos no está disponible.")
    const { data: trabajo, error: trabajoError } = await admin.from("trabajos").select("*").eq("id", trabajoId).single()
    if (trabajoError || !trabajo || trabajo.modalidad_pago !== "hitos" || !await puedePagarTrabajo(supabase, trabajo, user.id)) throw new Error("No tienes permiso para pagar este hito.")
    const { destino, titularId } = await obtenerDestinoCobroTrabajo(admin, trabajo)
    const { error: destinoError } = await admin.rpc("empresa_fijar_destino_cobro_trabajo", { p_trabajo: trabajo.id, p_actor: user.id, p_destino: destino })
    if (destinoError) throw destinoError
    for (let intento = 0; intento < 2; intento++) {
      const { data: escrow, error: reservaError } = await admin.rpc("preparar_pago_hito", { p_trabajo: trabajoId, p_hito: hitoId, p_actor: user.id })
      if (reservaError || !escrow?.id) throw reservaError || new Error("No se pudo preparar el pago de este hito.")
      const metadata = {
        type: "diime_pago_protegido", contrato_id: trabajoId, trabajo_id: trabajoId, hito_id: hitoId,
        escrow_id: escrow.id, cliente_id: escrow.cliente_id, profesional_id: escrow.profesional_id,
        actor_pago_id: escrow.actor_pago_id,
        proveedor_cobros_usuario_id: titularId || "", proveedor_stripe_account_id: destino,
        empresa_cliente_id: trabajo.empresa_cliente_id || "", empresa_proveedora_id: trabajo.empresa_proveedora_id || "",
        diime_proveedor_tipo: trabajo.empresa_proveedora_id ? "empresa" : "personal",
      }
      // Stable parameters also recover a crash after Stripe accepted the request
      // but before its session ID was saved. Never rotate the idempotency key.
      const params: Stripe.Checkout.SessionCreateParams = {
        ui_mode: "embedded", redirect_on_completion: "never", locale: "auto", mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: Math.round(Number(escrow.monto) * 100), product_data: { name: `Hito del contrato ${trabajo.id.slice(0, 8)}`, description: "Importe de este hito y gastos Diime con IVA incluido. La aprobación de la entrega autoriza su liquidación." } } }],
        metadata, payment_intent_data: { metadata, transfer_group: escrow.stripe_transfer_group },
      }
      const session = escrow.stripe_session_id
        ? await stripe.checkout.sessions.retrieve(escrow.stripe_session_id)
        : await stripe.checkout.sessions.create(params, { idempotencyKey: `diime-hito-checkout-${escrow.id}` })
      if (session.payment_status === "paid") {
        await conciliarSesionPagada(admin, session, trabajo.cliente_id)
        refrescar(trabajoId)
        return { codigo: "CHECKOUT_CERRADO", hrefContrato: `/trabajos/${trabajoId}/hitos`, error: "Este hito ya está pagado. Consulta el estado del trabajo." }
      }
      if (session.status === "expired") {
        const { error: cierreError } = await admin.rpc("diime_cerrar_intento", { p_escrow: escrow.id, p_session: session.id })
        if (cierreError) throw cierreError
        continue
      }
      if (session.status !== "open" || !session.client_secret) throw new Error("Stripe está procesando este pago. Espera a su confirmación antes de volver a pagar.")
      if (session.amount_total !== Math.round(Number(escrow.monto) * 100) || session.currency !== "eur" || Object.entries(metadata).some(([key, value]) => session.metadata?.[key] !== value)) throw new Error("La sesión de pago no coincide con el hito acordado.")
      const { data: guardado, error: guardarError } = await admin.from("transacciones_escrow")
        .update({ stripe_session_id: session.id }).eq("id", escrow.id).eq("estado", "pendiente").select("id,stripe_session_id").maybeSingle()
      if (guardarError || !guardado || !await puedePagarTrabajo(supabase, trabajo, user.id)) {
        await stripe.checkout.sessions.expire(session.id)
        const { error: cierreError } = await admin.rpc("diime_cerrar_intento", { p_escrow: escrow.id, p_session: session.id })
        if (cierreError) throw cierreError
        throw guardarError || new Error("El pago se ha cerrado porque han cambiado los permisos o el estado del plan.")
      }
      return {
        clientSecret: session.client_secret, escrow: guardado,
        desglose: { precioBase: Number(escrow.monto_base), comisionCliente: Number(escrow.comision_cliente), totalCliente: Number(escrow.monto) },
      }
    }
    throw new Error("El intento de pago ha caducado. Vuelve a abrir el hito.")
  } catch (error) { return { error: mensajeError(error) } }
}
