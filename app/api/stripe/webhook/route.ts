import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { rechazarYNotificarOfertasPerdedoras } from "@/lib/ofertas-perdedoras"
import { obtenerCargoDePaymentIntent } from "@/lib/stripe-liquidacion"
import { registrarEventoOperativo } from "@/lib/operaciones"

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const esPagoDiime = (metadata: Stripe.Metadata | null) =>
  metadata?.type === "diime_pago_protegido" || metadata?.type === "escrow"

async function procesarPagoPagado(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid" || !esPagoDiime(session.metadata)) return
  const supabase = getAdminClient()
  const metadata = session.metadata || {}

  let consulta = supabase.from("transacciones_escrow").select("*")
  consulta = metadata.escrow_id
    ? consulta.eq("id", metadata.escrow_id)
    : consulta.eq("trabajo_id", metadata.trabajo_id || "").eq("stripe_session_id", session.id)
  const { data: escrow, error } = await consulta.maybeSingle()
  if (error || !escrow) throw new Error(error?.message || "No existe el pago preparado en Diime")
  if (escrow.estado !== "pendiente") return

  const esperado = Math.round(Number(escrow.monto || 0) * 100)
  if (session.amount_total !== esperado || session.currency !== "eur") {
    await supabase
      .from("transacciones_escrow")
      .update({ liquidacion_estado: "error", liquidacion_error: "El importe o la moneda de Stripe no coincide con el contrato." })
      .eq("id", escrow.id)
    throw new Error("El importe o la moneda del pago no coincide con la transacción preparada")
  }

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id
  if (!paymentIntentId) throw new Error("Checkout no devolvió un PaymentIntent")
  const chargeId = await obtenerCargoDePaymentIntent(paymentIntentId)
  const ahora = new Date().toISOString()

  const { data: confirmado, error: confirmarError } = await supabase
    .from("transacciones_escrow")
    .update({
      estado: "fondos_retenidos",
      fecha_retencion: ahora,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
    })
    .eq("id", escrow.id)
    .eq("estado", "pendiente")
    .select("id")
    .maybeSingle()
  if (confirmarError) throw confirmarError
  if (!confirmado) return

  await supabase
    .from("trabajos")
    .update({ estado: "en_progreso", fecha_inicio: ahora, updated_at: ahora })
    .eq("id", escrow.trabajo_id)

  await supabase.from("actualizaciones_trabajo").insert({
    trabajo_id: escrow.trabajo_id,
    usuario_id: escrow.cliente_id,
    tipo: "pago",
    mensaje: `Pago de ${Number(escrow.monto).toFixed(2)} EUR recibido. La transferencia queda pendiente hasta la confirmación o resolución.`,
    progreso: 0,
  })

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("titulo, solicitud_id")
    .eq("id", escrow.trabajo_id)
    .maybeSingle()

  if (trabajo?.solicitud_id) {
    const { data: solicitud } = await supabase
      .from("solicitudes")
      .update({ estado: "en_progreso" })
      .eq("id", trabajo.solicitud_id)
      .select("titulo")
      .maybeSingle()
    await rechazarYNotificarOfertasPerdedoras(supabase, {
      solicitudId: trabajo.solicitud_id,
      tituloSolicitud: solicitud?.titulo ?? trabajo.titulo,
    })
  }

  if (escrow.profesional_id) {
    const aviso = {
      usuario_id: escrow.profesional_id,
      tipo: "pago_recibido",
      titulo: "El cliente ha pagado: puedes empezar",
      mensaje: `El pago de "${trabajo?.titulo ?? "un trabajo"}" está confirmado. La transferencia se hará cuando el cliente acepte la entrega o se resuelva una disputa.`,
      link: "/mis-trabajos",
      leida: false,
    }
    await supabase.from("notificaciones").insert(aviso)
    const { enviarAvisoPorEmail } = await import("@/lib/emails/enviar")
    await enviarAvisoPorEmail({
      usuarioId: aviso.usuario_id,
      tipo: aviso.tipo,
      titulo: aviso.titulo,
      mensaje: aviso.mensaje,
      link: aviso.link,
    })
  }
}

async function registrarEvento(event: Stripe.Event) {
  const supabase = getAdminClient()
  const ahora = new Date().toISOString()
  const { data: nuevo, error: insertError } = await supabase
    .from("stripe_eventos_webhook")
    .insert({ id: event.id, tipo: event.type, ultimo_intento_at: ahora })
    .select("id")
    .maybeSingle()
  if (nuevo) return true
  if (insertError?.code !== "23505") throw insertError

  const { data: existente, error: readError } = await supabase
    .from("stripe_eventos_webhook")
    .select("estado, intentos, ultimo_intento_at")
    .eq("id", event.id)
    .maybeSingle()
  if (readError || !existente) throw readError || new Error("No se pudo recuperar el evento duplicado.")
  if (existente.estado === "completado") return false

  // Un segundo envío simultáneo no debe ejecutar el mismo evento dos veces.
  // Si el proceso anterior murió, se permite reclamarlo de nuevo tras cinco
  // minutos; un evento marcado como error puede reintentarse inmediatamente.
  const intentoAnterior = existente.ultimo_intento_at ? new Date(existente.ultimo_intento_at).getTime() : 0
  const atascado = Date.now() - intentoAnterior > 5 * 60 * 1000
  if (existente.estado === "procesando" && !atascado) return false

  let claim = supabase
    .from("stripe_eventos_webhook")
    .update({
      estado: "procesando",
      intentos: (existente.intentos || 1) + 1,
      ultimo_error: null,
      ultimo_intento_at: ahora,
    })
    .eq("id", event.id)
  claim = existente.estado === "error"
    ? claim.eq("estado", "error")
    : claim.eq("ultimo_intento_at", existente.ultimo_intento_at)
  const { data: reclamado, error: claimError } = await claim.select("id").maybeSingle()
  if (claimError) throw claimError
  return Boolean(reclamado)
}

async function terminarEvento(event: Stripe.Event, error?: unknown) {
  const supabase = getAdminClient()
  await supabase
    .from("stripe_eventos_webhook")
    .update(
      error
        ? { estado: "error", ultimo_error: error instanceof Error ? error.message : "Error no identificado" }
        : { estado: "completado", ultimo_error: null, procesado_at: new Date().toISOString() },
    )
    .eq("id", event.id)
}

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: "No signature" }, { status: 400 })

  const webhookSecret = process.env.DIIME_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("No hay secreto de firma configurado para el webhook de Stripe.")
    await registrarEventoOperativo({
      area: "stripe",
      severidad: "critica",
      codigo: "webhook_sin_secreto",
      mensaje: "El webhook de Stripe no tiene secreto de firma configurado.",
    })
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    if (!(await registrarEvento(event))) return NextResponse.json({ received: true, duplicate: true })
    const supabase = getAdminClient()

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await procesarPagoPagado(event.data.object)
        break

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object
        if (!esPagoDiime(session.metadata)) break
        let query = supabase.from("transacciones_escrow").update({ estado: "cancelado" }).eq("estado", "pendiente")
        query = session.metadata?.escrow_id
          ? query.eq("id", session.metadata.escrow_id)
          : query.eq("stripe_session_id", session.id)
        await query
        break
      }

      case "account.updated": {
        const account = event.data.object
        await supabase
          .from("profesionales")
          .update({
            stripe_onboarding_completado: account.details_submitted,
            stripe_transferencias_habilitadas: account.capabilities?.transfers === "active",
            stripe_payouts_habilitados: account.payouts_enabled,
            stripe_requisitos_pendientes: account.requirements?.currently_due || [],
            stripe_estado_actualizado_at: new Date().toISOString(),
          })
          .eq("stripe_account_id", account.id)
        break
      }

      case "refund.updated": {
        const refund = event.data.object
        const escrowId = refund.metadata?.escrow_id
        if (!escrowId) break
        await supabase
          .from("transacciones_escrow")
          .update({
            stripe_refund_status: refund.status,
            ...(refund.status === "failed" || refund.status === "canceled"
              ? { liquidacion_estado: "error", liquidacion_error: `El reembolso ${refund.id} terminó como ${refund.status}.` }
              : {}),
          })
          .eq("id", escrowId)
        break
      }

      case "charge.dispute.created": {
        const disputaStripe = event.data.object
        const paymentIntentId = typeof disputaStripe.payment_intent === "string"
          ? disputaStripe.payment_intent
          : disputaStripe.payment_intent?.id
        if (!paymentIntentId) break
        const { data: escrow } = await supabase
          .from("transacciones_escrow")
          .select("id, trabajo_id, cliente_id, profesional_id, estado")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .maybeSingle()
        if (!escrow) break
        await supabase.from("transacciones_escrow").update({ estado: "disputa" }).eq("id", escrow.id)
        await supabase.from("trabajos").update({ estado: "en_disputa" }).eq("id", escrow.trabajo_id)
        const { data: abierta } = await supabase
          .from("disputas")
          .select("id")
          .eq("trabajo_id", escrow.trabajo_id)
          .eq("estado", "abierta")
          .maybeSingle()
        if (!abierta) {
          await supabase.from("disputas").insert({
            trabajo_id: escrow.trabajo_id,
            cliente_id: escrow.cliente_id,
            profesional_id: escrow.profesional_id,
            tipo: "cliente",
            motivo: `Stripe ha recibido un contracargo bancario (${disputaStripe.id}). Debe gestionarse también en Stripe antes de su fecha límite.`,
            estado: "abierta",
            estado_escrow_previo: escrow.estado,
          })
        }
        const { data: admins } = await supabase.from("profiles").select("id").eq("es_admin", true)
        if (admins?.length) {
          await supabase.from("notificaciones").insert(
            admins.map((a) => ({
              usuario_id: a.id,
              tipo: "disputa_abierta_admin",
              titulo: "Contracargo bancario en Stripe",
              mensaje: `El pago del trabajo ${escrow.trabajo_id} tiene un contracargo. Revísalo inmediatamente en Stripe y en Diime.`,
              link: "/admin/disputas",
              leida: false,
            })),
          )
        }
        break
      }
    }

    await terminarEvento(event)
    return NextResponse.json({ received: true })
  } catch (error) {
    await terminarEvento(event, error)
    await registrarEventoOperativo({
      area: "stripe",
      severidad: "critica",
      codigo: "webhook_procesamiento_fallido",
      clave: event.type,
      mensaje: "Falló el procesamiento de un evento de Stripe.",
      contexto: { tipo: event.type, evento: event.id },
    })
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
