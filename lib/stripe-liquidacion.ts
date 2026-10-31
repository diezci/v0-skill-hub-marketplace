import "server-only"

import { stripe } from "@/lib/stripe"
import type Stripe from "stripe"

export class ReembolsoStripeNoCompletado extends Error {
  constructor(readonly refund: Stripe.Refund) {
    super(refund.status === "pending" || refund.status === "requires_action"
      ? "El reembolso sigue pendiente en Stripe; aún no se ha transferido nada al profesional."
      : `El reembolso terminó como ${refund.status}${refund.failure_reason ? ` (${refund.failure_reason})` : ""}. Administración debe revisar el pago antes de autorizar otro intento.`)
    this.name = "ReembolsoStripeNoCompletado"
  }
}

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

/** Stripe's disputed flag survives a win. Every actual case still needs an audited local reconciliation. */
export async function comprobarContracargosParaLiquidacion(chargeId: string, conciliados: readonly string[] = []) {
  const charge = await stripe.charges.retrieve(chargeId)
  if (!charge.disputed) return
  if (!conciliados.length) throw new Error("El cargo tiene un contracargo bancario; requiere conciliación en Stripe antes de mover fondos.")
  let total = 0
  for await (const dispute of stripe.disputes.list({ charge: chargeId, limit: 100 })) {
    total++
    if (idStripe(dispute.charge) !== chargeId || dispute.livemode !== charge.livemode ||
        dispute.status !== "won" || !conciliados.includes(dispute.id)) {
      throw new Error("El cargo tiene un contracargo pendiente de ganar o conciliar.")
    }
  }
  if (!total) throw new Error("No se pudo verificar el resultado de los contracargos del cargo.")
}

export async function obtenerCargoDePaymentIntent(paymentIntentId: string) {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
  const cargo = paymentIntent.latest_charge
  return typeof cargo === "string" ? cargo : cargo?.id || null
}

async function buscarMovimientosPorOperacion<T extends { id: string; metadata?: Record<string, string> | null }>(
  obtenerPagina: (cursor?: string) => Promise<{ data: T[]; has_more: boolean }>,
  operacionId: string,
): Promise<T[]> {
  let cursor: string | undefined
  const encontrados: T[] = []
  for (let pagina = 0; pagina < 1000; pagina++) {
    const respuesta = await obtenerPagina(cursor)
    for (const movimiento of respuesta.data) {
      if (movimiento.metadata?.liquidacion_operacion_id !== operacionId) continue
      encontrados.push(movimiento)
    }
    if (!respuesta.has_more) return encontrados
    const siguiente = respuesta.data.at(-1)?.id
    if (!siguiente || siguiente === cursor) throw new Error("No se pudo recorrer el historial completo de Stripe.")
    cursor = siguiente
  }
  throw new Error("El historial de Stripe requiere una conciliación adicional antes de repetir movimientos.")
}

async function buscarMovimientoPorOperacion<T extends { id: string; metadata?: Record<string, string> | null }>(
  obtenerPagina: (cursor?: string) => Promise<{ data: T[]; has_more: boolean }>, operacionId: string,
) {
  const movimientos = await buscarMovimientosPorOperacion(obtenerPagina, operacionId)
  if (movimientos.length > 1) throw new Error("Stripe contiene movimientos duplicados para esta liquidación; requiere conciliación.")
  return movimientos[0]
}

async function crearORecuperarMovimiento<T>(crear: () => Promise<T>, recuperar: () => Promise<T | undefined>): Promise<T> {
  try {
    return await crear()
  } catch (error: any) {
    if (error?.statusCode !== 409 && error?.code !== "idempotency_key_in_use") throw error
    // Another worker owns the same Stripe operation. Read its result; never
    // submit a second create, change the key or report an unconfirmed movement.
    for (let intento = 0; intento < 6; intento++) {
      const movimiento = await recuperar()
      if (movimiento) return movimiento
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    throw new Error("Otra petición está terminando esta liquidación. Actualiza el estado y reintenta la misma operación si sigue pendiente.")
  }
}

/** Ejecuta los dos únicos movimientos permitidos por una liquidación. */
export async function ejecutarLiquidacionStripe(params: {
  paymentIntentId: string
  chargeId?: string | null
  connectedAccountId?: string | null
  transferGroup: string
  montoTotal?: number
  refundId?: string | null
  /** Only a persisted, administrator-authorized retry may replace this failed Refund. */
  reintentarTrasRefundId?: string | null
  transferId?: string | null
  /** IDs read by the backend from completed local bank reconciliations. */
  contracargosGanadosConciliados?: string[]
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
  await comprobarContracargosParaLiquidacion(chargeId, params.contracargosGanadosConciliados)
  let refundId: string | null = null
  let refundStatus: string | null = null
  let transferId: string | null = null

  if (reembolsoCentimos > 0) {
    const historial = await buscarMovimientosPorOperacion(
      (cursor) => stripe.refunds.list({ payment_intent: params.paymentIntentId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }), params.operacionId,
    )
    if (params.refundId && !historial.some(r => r.id === params.refundId)) historial.push(await stripe.refunds.retrieve(params.refundId))
    for (const r of historial) {
      if (r.amount !== reembolsoCentimos || idStripe(r.payment_intent) !== params.paymentIntentId ||
        (r.metadata?.liquidacion_operacion_id && r.metadata.liquidacion_operacion_id !== params.operacionId)) {
        throw new Error("El reembolso existente en Stripe no coincide con el reparto fijado.")
      }
    }
    const esTerminal = (r: Stripe.Refund) => r.status === "failed" || r.status === "canceled"
    const activos = historial.filter(r => !esTerminal(r))
    if (activos.length > 1) throw new Error("Stripe contiene reembolsos activos duplicados; requiere conciliación.")
    let refundCreado = activos[0]
    if (!refundCreado && params.reintentarTrasRefundId) {
      const anterior = historial.find(r => r.id === params.reintentarTrasRefundId)
      if (!anterior || !esTerminal(anterior) || anterior.failure_reason === "charge_for_pending_refund_disputed") {
        throw new Error("El reembolso anterior no permite un nuevo intento; requiere conciliación.")
      }
      // A failed replacement requires another explicit authorization. Repeated
      // clicks, webhooks and expired idempotency keys resume this same attempt.
      const sustitutos = historial.filter(r => r.metadata?.reintento_de === anterior.id)
      if (sustitutos.length > 1) throw new Error("Hay varios reintentos del mismo reembolso; requiere conciliación.")
      refundCreado = sustitutos[0]
    } else if (!refundCreado && historial.length) {
      refundCreado = historial.find(r => r.id === params.refundId) || historial[0]
    }
    if (!refundCreado) {
      // La idempotencia de Stripe puede caducar. La metadata permite recuperar
      // el movimiento original incluso tras ese plazo o tras una caída entre
      // Stripe y la escritura final en nuestra base de datos.
      await comprobarContracargosParaLiquidacion(chargeId, params.contracargosGanadosConciliados)
      refundCreado = await crearORecuperarMovimiento<Stripe.Refund>(() => stripe.refunds.create(
        {
          payment_intent: params.paymentIntentId,
          amount: reembolsoCentimos,
          reason: "requested_by_customer",
          metadata: {
            ...params.metadata,
            liquidacion_operacion_id: params.operacionId,
            reembolso_centimos: String(reembolsoCentimos),
            ...(params.reintentarTrasRefundId ? { reintento_de: params.reintentarTrasRefundId } : {}),
          },
        },
        { idempotencyKey: params.reintentarTrasRefundId ? `${params.operacionId}:refund:retry:${params.reintentarTrasRefundId}` : `${params.operacionId}:refund:v1` },
      ), async () => {
        const movimientos = await buscarMovimientosPorOperacion(
          (cursor) => stripe.refunds.list({ payment_intent: params.paymentIntentId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }), params.operacionId,
        )
        const activos = movimientos.filter((r) => !esTerminal(r))
        if (activos.length > 1) throw new Error("Stripe contiene reembolsos activos duplicados; requiere conciliación.")
        return activos[0]
      })
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
      throw new ReembolsoStripeNoCompletado(refund)
    }
  }

  if (transferenciaCentimos > 0) {
    await comprobarContracargosParaLiquidacion(chargeId, params.contracargosGanadosConciliados)
    if (!params.connectedAccountId) {
      throw new Error("El profesional no tiene una cuenta Stripe Connect preparada para recibir el pago.")
    }
    const cuentaDestino = params.connectedAccountId
    if (!chargeId) {
      throw new Error("Stripe no ha devuelto el cargo asociado al pago; no se puede transferir de forma segura.")
    }

    let transfer
    if (params.transferId) {
      transfer = await stripe.transfers.retrieve(params.transferId)
    } else {
      transfer = await buscarMovimientoPorOperacion(
        (cursor) => stripe.transfers.list({ transfer_group: params.transferGroup, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }),
        params.operacionId,
      )
      if (!transfer) {
        const crearTransferencia = (idempotencyKey: string) => crearORecuperarMovimiento<Stripe.Transfer>(() => stripe.transfers.create(
          {
            amount: transferenciaCentimos,
            currency: "eur",
            destination: cuentaDestino,
            source_transaction: chargeId,
            transfer_group: params.transferGroup,
            metadata: {
              ...params.metadata,
              liquidacion_operacion_id: params.operacionId,
              transferencia_centimos: String(transferenciaCentimos),
            },
          },
          { idempotencyKey },
        ), () => buscarMovimientoPorOperacion(
          (cursor) => stripe.transfers.list({ transfer_group: params.transferGroup, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }),
          params.operacionId,
        ))
        let clave = `${params.operacionId}:transfer:v1`
        for (let intento = 0; intento < 4; intento++) {
          try {
            transfer = await crearTransferencia(clave)
            break
          } catch (error: any) {
            // Stripe caches this definitive rejection even after Connect is
            // re-enabled. Only replace a replayed, side-effect-free capability
            // rejection; timeouts, 5xx and ambiguous outcomes keep the old key.
            const original = error?.headers?.["original-request"]
            if (intento === 3 || error?.statusCode !== 400 ||
                !["insufficient_capabilities_for_transfer", "balance_insufficient"].includes(error?.code) ||
                error?.headers?.["idempotent-replayed"] !== "true" ||
                typeof original !== "string" || !/^req_[A-Za-z0-9]+$/.test(original)) throw error
            transfer = await buscarMovimientoPorOperacion(
              (cursor) => stripe.transfers.list({ transfer_group: params.transferGroup, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }),
              params.operacionId,
            )
            if (transfer) break
            if (error.code === "insufficient_capabilities_for_transfer") {
              const cuenta = await stripe.accounts.retrieve(cuentaDestino)
              if (cuenta.capabilities?.transfers !== "active") throw error
            } else {
              const saldo = await stripe.balance.retrieve()
              const disponible = saldo.available.filter((item) => item.currency === "eur").reduce((total, item) => total + item.amount, 0)
              if (disponible < transferenciaCentimos) throw error
            }
            await comprobarContracargosParaLiquidacion(chargeId, params.contracargosGanadosConciliados)
            // Concurrent retries derive the same successor key from Stripe's
            // original rejected request, including after a local process crash.
            clave = `${params.operacionId}:transfer:after:${original}`
          }
        }
      }
    }
    if (!transfer) throw new Error("La transferencia sigue pendiente de conciliación.")
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
