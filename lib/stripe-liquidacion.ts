import "server-only"

import { stripe } from "@/lib/stripe"

function importeStripeEnCentimos(importe: number, concepto: string) {
  if (!Number.isFinite(importe) || importe < 0) {
    throw new Error(`El importe de ${concepto} no es válido.`)
  }
  const centimos = Math.round(importe * 100)
  if (importe > 0 && centimos === 0) {
    throw new Error(`El importe de ${concepto} debe ser de al menos un céntimo.`)
  }
  if (!Number.isSafeInteger(centimos)) {
    throw new Error(`El importe de ${concepto} es demasiado grande.`)
  }
  return centimos
}

function idStripe(valor: string | { id: string } | null | undefined) {
  return typeof valor === "string" ? valor : valor?.id || null
}

export function crearTransferGroup(trabajoId: string) {
  return `diime_trabajo_${trabajoId}`
}

export async function obtenerCargoDePaymentIntent(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
  const cargo = paymentIntent.latest_charge
  return typeof cargo === "string" ? cargo : cargo?.id || null
}

/** Ejecuta los dos únicos movimientos permitidos por una liquidación. */
export async function ejecutarLiquidacionStripe(params: {
  paymentIntentId: string
  chargeId?: string | null
  connectedAccountId?: string | null
  transferGroup: string
  montoTotal?: number
  refundId?: string | null
  transferId?: string | null
  reembolsoCliente: number
  netoProveedor: number
  operacionId: string
  metadata: Record<string, string>
}) {
  if (!params.operacionId.trim()) throw new Error("La liquidación necesita una clave idempotente estable.")

  const reembolsoCentimos = importeStripeEnCentimos(params.reembolsoCliente, "reembolso")
  const transferenciaCentimos = importeStripeEnCentimos(params.netoProveedor, "transferencia")
  const paymentIntent = await stripe.paymentIntents.retrieve(params.paymentIntentId)
  const chargeDelIntent = idStripe(paymentIntent.latest_charge)
  if (
    paymentIntent.currency !== "eur" ||
    paymentIntent.status !== "succeeded" ||
    !chargeDelIntent ||
    (params.chargeId && params.chargeId !== chargeDelIntent)
  ) {
    throw new Error("El PaymentIntent de Stripe no coincide con un pago EUR capturado y conciliado.")
  }
  if (
    params.montoTotal !== undefined &&
    paymentIntent.amount !== importeStripeEnCentimos(params.montoTotal, "total cobrado")
  ) {
    throw new Error("El total cobrado en Stripe no coincide con el reparto guardado.")
  }
  const chargeId = params.chargeId || chargeDelIntent
  let refundId: string | null = null
  let refundStatus: string | null = null
  let transferId: string | null = null

  if (reembolsoCentimos > 0) {
    let refundCreado
    if (params.refundId) {
      refundCreado = await stripe.refunds.retrieve(params.refundId)
    } else {
      // La idempotencia de Stripe puede caducar. La metadata permite recuperar
      // el movimiento original incluso tras ese plazo o tras una caída entre
      // Stripe y la escritura final en nuestra base de datos.
      const refunds = await stripe.refunds.list({ payment_intent: params.paymentIntentId, limit: 100 })
      const encontrados = refunds.data.filter(
        (refund) => refund.metadata?.liquidacion_operacion_id === params.operacionId,
      )
      if (encontrados.length > 1) {
        throw new Error("Stripe contiene más de un reembolso para esta liquidación; requiere revisión manual.")
      }
      refundCreado = encontrados[0]
      if (!refundCreado) {
        refundCreado = await stripe.refunds.create(
          {
            payment_intent: params.paymentIntentId,
            amount: reembolsoCentimos,
            reason: "requested_by_customer",
            metadata: {
              ...params.metadata,
              liquidacion_operacion_id: params.operacionId,
              reembolso_centimos: String(reembolsoCentimos),
            },
          },
          { idempotencyKey: `${params.operacionId}:refund:v1` },
        )
      }
    }
    if (
      refundCreado.amount !== reembolsoCentimos ||
      idStripe(refundCreado.payment_intent) !== params.paymentIntentId
    ) {
      throw new Error("El reembolso existente en Stripe no coincide con el reparto fijado.")
    }
    // Una respuesta `pending` aún no significa que el cliente haya recibido su
    // parte. Se consulta el estado actual y no se transfiere al profesional
    // hasta que el reembolso esté confirmado; el reintento conserva la misma
    // clave idempotente y recupera el mismo Refund.
    const refund = await stripe.refunds.retrieve(refundCreado.id)
    refundId = refund.id
    refundStatus = refund.status
    if (refund.status !== "succeeded") {
      throw new Error(
        refund.status === "pending"
          ? "El reembolso sigue pendiente en Stripe; aún no se ha transferido nada al profesional."
          : `Stripe no ha completado el reembolso (estado: ${refund.status}).`,
      )
    }
  }

  if (transferenciaCentimos > 0) {
    if (!params.connectedAccountId) {
      throw new Error("El profesional no tiene una cuenta Stripe Connect preparada para recibir el pago.")
    }
    if (!chargeId) {
      throw new Error("Stripe no ha devuelto el cargo asociado al pago; no se puede transferir de forma segura.")
    }

    let transfer
    if (params.transferId) {
      transfer = await stripe.transfers.retrieve(params.transferId)
    } else {
      const transfers = await stripe.transfers.list({
        destination: params.connectedAccountId,
        transfer_group: params.transferGroup,
        limit: 100,
      })
      const encontradas = transfers.data.filter(
        (item) => item.metadata?.liquidacion_operacion_id === params.operacionId,
      )
      if (encontradas.length > 1) {
        throw new Error("Stripe contiene más de una transferencia para esta liquidación; requiere revisión manual.")
      }
      transfer = encontradas[0]
      if (!transfer) {
        transfer = await stripe.transfers.create(
          {
            amount: transferenciaCentimos,
            currency: "eur",
            destination: params.connectedAccountId,
            source_transaction: chargeId,
            transfer_group: params.transferGroup,
            metadata: {
              ...params.metadata,
              liquidacion_operacion_id: params.operacionId,
              transferencia_centimos: String(transferenciaCentimos),
            },
          },
          { idempotencyKey: `${params.operacionId}:transfer:v1` },
        )
      }
    }
    if (
      transfer.amount !== transferenciaCentimos ||
      transfer.currency !== "eur" ||
      idStripe(transfer.destination) !== params.connectedAccountId ||
      idStripe(transfer.source_transaction) !== chargeId ||
      transfer.amount_reversed !== 0
    ) {
      throw new Error("La transferencia existente en Stripe no coincide con el reparto fijado.")
    }
    transferId = transfer.id
  }

  return { chargeId, refundId, refundStatus, transferId }
}
