"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { textoServidor } from "@/lib/i18n-servidor"
import { idNotificacionValido } from "@/lib/notificaciones-contexto"

// Read-only reconciliation for support. The caller cannot supply a Stripe
// account/refund ID, and consulting a refund never issues or retries one.
export async function comprobarReembolsoAdmin(escrowId: string) {
  if (!idNotificacionValido(escrowId)) return { error: await textoServidor("Pago no válido") }
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: await textoServidor("No autenticado") }
  const { data: perfil, error: errorPerfil } = await supabase.from("profiles").select("es_admin").eq("id", user.id).maybeSingle()
  if (errorPerfil || !perfil?.es_admin) return { error: await textoServidor("No tienes permiso") }
  const admin = createAdminClient()
  if (!admin) return { error: await textoServidor("Base de datos no disponible") }
  const { data: pago, error } = await admin.from("transacciones_escrow")
    .select("id, stripe_refund_id, stripe_payment_intent_id, stripe_charge_id, stripe_session_id")
    .eq("id", escrowId).maybeSingle()
  if (error) return { error: await textoServidor("No se pudo consultar el pago") }
  if (!pago?.stripe_refund_id) return { error: await textoServidor("Este pago no tiene un reembolso registrado en Stripe") }
  if (!pago.stripe_payment_intent_id && !pago.stripe_charge_id) {
    return { error: await textoServidor("El reembolso no corresponde al pago registrado. Revisa el caso en Stripe.") }
  }
  try {
    const refund = await stripe.refunds.retrieve(pago.stripe_refund_id)
    const paymentIntent = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id
    const charge = typeof refund.charge === "string" ? refund.charge : refund.charge?.id
    if (refund.id !== pago.stripe_refund_id ||
        (pago.stripe_payment_intent_id && paymentIntent !== pago.stripe_payment_intent_id) ||
        (pago.stripe_charge_id && charge !== pago.stripe_charge_id)) {
      return { error: await textoServidor("El reembolso no corresponde al pago registrado. Revisa el caso en Stripe.") }
    }
    const tarjeta = refund.destination_details?.card
    const referencia = tarjeta?.reference || null
    return { data: {
      id: refund.id,
      estado: refund.status || "pending",
      importe: refund.amount / 100,
      moneda: refund.currency,
      creadoEn: new Date(refund.created * 1000).toISOString(),
      referencia,
      referenciaEstado: tarjeta?.reference_status || null,
      referenciaTipo: tarjeta?.reference_type || null,
      fallo: refund.failure_reason || null,
      modoReal: pago.stripe_session_id?.startsWith("cs_live_") ? true : pago.stripe_session_id?.startsWith("cs_test_") ? false : null,
    } }
  } catch {
    // Stripe errors can contain request details; never return SDK objects/keys.
    return { error: await textoServidor("No se pudo consultar el reembolso en Stripe. Vuelve a intentarlo.") }
  }
}
