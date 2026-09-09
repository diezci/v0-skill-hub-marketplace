import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { conciliarSesionPagada, liquidarPagoReclamado } from "@/lib/flujo-pagos"
import { registrarEventoOperativo } from "@/lib/operaciones"
import { errorIdentidadCuentaStripe } from "@/lib/stripe-connect-identidad"

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const esPagoDiime = (metadata: Stripe.Metadata | null) =>
  metadata?.type === "diime_pago_protegido" || metadata?.type === "escrow"

async function procesarPagoPagado(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid" || !esPagoDiime(session.metadata)) return
  await conciliarSesionPagada(getAdminClient(), session)
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
        let query = supabase.from("transacciones_escrow").select("id,stripe_session_id")
        query = session.metadata?.escrow_id
          ? query.eq("id", session.metadata.escrow_id)
          : query.eq("stripe_session_id", session.id)
        const { data: intento, error: readError } = await query.maybeSingle()
        if (readError) throw readError
        if (intento) {
          const { error: cierreError } = await supabase.rpc("diime_cerrar_intento", {
            p_escrow: intento.id, p_session: session.id,
          })
          if (cierreError) throw cierreError
        }
        break
      }

      case "account.updated": {
        const account = await stripe.accounts.retrieve(event.data.object.id)
        const { data: profesional, error: profesionalError } = await supabase.from("profesionales")
          .select("id").eq("stripe_account_id", account.id).maybeSingle()
        if (profesionalError) throw profesionalError
        if (profesional) {
          const { data: perfil, error: perfilError } = await supabase.from("profiles")
            .select("empresa_id").eq("id", profesional.id).single()
          if (perfilError) throw perfilError
          const identidadError = errorIdentidadCuentaStripe(account, { id: profesional.id, empresa_id: perfil.empresa_id })
          const { error: actualizarError } = await supabase.rpc("actualizar_estado_cuenta_stripe", {
            p_profesional_id: profesional.id, p_account_id: account.id,
            p_empresa_esperada: perfil.empresa_id,
            p_onboarding: !identidadError && account.details_submitted,
            p_transferencias: !identidadError && account.capabilities?.transfers === "active",
            p_payouts: !identidadError && account.payouts_enabled,
            p_requisitos: account.requirements?.currently_due || [],
          })
          if (actualizarError) throw actualizarError
        }
        break
      }

      case "refund.updated": {
        // Delivery can be delayed or unordered. Re-read Stripe's current state
        // and match the durable operation before changing our ledger.
        const refund = await stripe.refunds.retrieve(event.data.object.id)
        const escrowId = refund.metadata?.escrow_id
        if (!escrowId) break
        const { data: escrow, error: readError } = await supabase.from("transacciones_escrow")
          .select("*").eq("id", escrowId).single()
        if (readError) throw readError
        const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id
        if (!escrow.liquidacion_operacion_id ||
          refund.metadata?.liquidacion_operacion_id !== escrow.liquidacion_operacion_id ||
          paymentIntentId !== escrow.stripe_payment_intent_id ||
          (escrow.stripe_refund_id && escrow.stripe_refund_id !== refund.id) ||
          refund.amount !== Math.round(Number(escrow.monto_reembolsado) * 100)) {
          throw new Error("El reembolso de Stripe no coincide con la operación guardada.")
        }
        if (escrow.liquidacion_estado === "completada" && refund.status !== "succeeded") {
          throw new Error("Una liquidación completada tiene un reembolso no confirmado; requiere conciliación.")
        }
        const { data: actualizado, error: actualizarError } = await supabase.from("transacciones_escrow")
          .update({
            stripe_refund_id: refund.id,
            stripe_refund_status: refund.status,
            ...(refund.status === "failed" || refund.status === "canceled"
              ? { liquidacion_estado: "error", liquidacion_error: `El reembolso ${refund.id} terminó como ${refund.status}.` }
              : {}),
          }).eq("id", escrow.id).eq("liquidacion_operacion_id", escrow.liquidacion_operacion_id)
          .select("*").single()
        if (actualizarError) throw actualizarError
        if (refund.status === "succeeded" && actualizado.liquidacion_contexto &&
          actualizado.liquidacion_estado !== "completada" && !actualizado.stripe_disputa_id) {
          await liquidarPagoReclamado(supabase, actualizado)
        }
        break
      }

      case "charge.dispute.created": {
        const disputaStripe = event.data.object
        const paymentIntentId = typeof disputaStripe.payment_intent === "string"
          ? disputaStripe.payment_intent
          : disputaStripe.payment_intent?.id
        if (!paymentIntentId) break
        const { data: disputa, error: disputaError } = await supabase.rpc("diime_registrar_contracargo", {
          p_payment_intent: paymentIntentId, p_stripe_disputa: disputaStripe.id,
        })
        if (disputaError) throw disputaError
        const { data: admins } = await supabase.from("profiles").select("id").eq("es_admin", true)
        if (admins?.length) {
          await supabase.from("notificaciones").insert(
            admins.map((a) => ({
              usuario_id: a.id,
              tipo: "disputa_abierta_admin",
              titulo: "Contracargo bancario en Stripe",
              mensaje: `El pago del trabajo ${disputa.trabajo_id} tiene un contracargo. Revísalo inmediatamente en Stripe y en Diime.`,
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
