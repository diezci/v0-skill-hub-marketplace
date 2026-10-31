import "server-only"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"

const id = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id

/** Current Stripe state prevents an old created event from regressing a closed case. */
export async function actualizarContracargoStripe(admin: any, disputeId: string, event?: Stripe.Event) {
  const bank = await stripe.disputes.retrieve(disputeId)
  const paymentIntent = id(bank.payment_intent)
  const chargeId = id(bank.charge)
  if (!paymentIntent || !chargeId || (event && bank.livemode !== event.livemode)) throw new Error("Contracargo no válido")
  const { data: payment, error } = await admin.from("transacciones_escrow")
    .select("stripe_session_id, stripe_charge_id").eq("stripe_payment_intent_id", paymentIntent).maybeSingle()
  if (error) throw error
  if (!payment) throw new Error("Contracargo sin pago conciliado")
  const expectedLive = payment.stripe_session_id?.startsWith("cs_live_") ? true
    : payment.stripe_session_id?.startsWith("cs_test_") ? false : null
  if (expectedLive === null || expectedLive !== bank.livemode || payment.stripe_charge_id !== chargeId) throw new Error("Contracargo ajeno al cargo")
  const { data, error: saveError } = await admin.rpc("diime_actualizar_contracargo", {
    p_payment_intent: paymentIntent, p_stripe_disputa: bank.id, p_charge: chargeId,
    p_estado: bank.status, p_importe: bank.amount, p_moneda: bank.currency,
    p_plazo: bank.evidence_details.due_by ? new Date(bank.evidence_details.due_by * 1000).toISOString() : null,
    p_evento: event?.id || null,
  })
  if (saveError) throw saveError
  return { bank, disputa: data }
}

/** Recover exactly the original transfer; paginated history survives idempotency expiry. */
export async function recuperarTransferenciaContracargo(bank: Stripe.Dispute, escrow: any, antesDeRecuperar: () => Promise<void>) {
  if (bank.status !== "lost" || !escrow.stripe_transfer_id) return null
  const transfer = await stripe.transfers.retrieve(escrow.stripe_transfer_id)
  const destination = escrow.liquidacion_contexto?.destino
  if (!destination || transfer.livemode !== bank.livemode || transfer.currency !== bank.currency ||
      transfer.amount !== Math.round(Number(escrow.pago_neto_proveedor) * 100) ||
      id(transfer.destination) !== destination || id(transfer.source_transaction) !== escrow.stripe_charge_id ||
      transfer.transfer_group !== escrow.stripe_transfer_group ||
      transfer.metadata.liquidacion_operacion_id !== escrow.liquidacion_operacion_id ||
      transfer.metadata.escrow_id !== escrow.id) throw new Error("La transferencia requiere conciliación manual")
  const matches: Stripe.TransferReversal[] = []
  for await (const reversal of stripe.transfers.listReversals(transfer.id, { limit: 100 })) {
    // Unrelated reversals require a manual assessment of the remaining liability.
    if (reversal.metadata?.stripe_disputa_id !== bank.id) throw new Error("La transferencia tiene otras recuperaciones")
    matches.push(reversal)
  }
  if (matches.length > 1) throw new Error("Hay varias recuperaciones para este contracargo")
  const verify = (reversal: Stripe.TransferReversal) => {
    if (reversal.transfer !== transfer.id || reversal.amount !== transfer.amount ||
        reversal.currency !== transfer.currency || reversal.metadata?.stripe_disputa_id !== bank.id ||
        reversal.metadata?.escrow_id !== escrow.id) throw new Error("La recuperación no coincide con la transferencia")
    return reversal.id
  }
  if (matches.length) return verify(matches[0])
  if (transfer.amount_reversed !== 0) throw new Error("La transferencia ya tiene una recuperación")
  await antesDeRecuperar()
  const reversal = await stripe.transfers.createReversal(transfer.id, {
    amount: transfer.amount,
    metadata: { stripe_disputa_id: bank.id, escrow_id: escrow.id, trabajo_id: escrow.trabajo_id },
  }, { idempotencyKey: `diime-contracargo-${bank.id}-recuperacion` })
  return verify(reversal)
}
