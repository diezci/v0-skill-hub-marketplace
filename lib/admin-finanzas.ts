/** Reporting only: amounts returned to the UI are integer EUR cents. */
export interface ResumenFinanzasAdmin {
  brutoCentimos: number | null
  gastosStripeCentimos: number | null
  netoCentimos: number | null
  modoReal: boolean
  actualizadoEn: string
  pagosLiquidados: number
  pendientesConciliar: number
  otrasMonedas: string[]
  avisos: string[]
  ultimosCobros: { id: string; trabajoId: string | null; fecha: string | null; importeCentimos: number; titulo: string }[]
}

export type ResultadoFinanzasAdmin = { data?: ResumenFinanzasAdmin; error?: string }
type Importe = number | string | null
export interface PagoFinanzas {
  id: string
  trabajo_id: string | null
  estado: string
  monto: Importe
  retencion_plataforma: Importe
  comision_cliente: Importe
  comision_proveedor: Importe
  monto_reembolsado: Importe
  liquidacion_estado: string | null
  liquidacion_error: string | null
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  stripe_session_id: string | null
  stripe_refund_id: string | null
  stripe_refund_status: string | null
  stripe_disputa_id: string | null
  fecha_liberacion: string | null
  fecha_reembolso: string | null
  created_at: string
  trabajo?: { titulo: string | null } | { titulo: string | null }[] | null
}

export interface DisputaFinanzas {
  id: string
  escrow_id: string | null
  stripe_disputa_id: string | null
  stripe_disputa_estado: string | null
  stripe_disputa_importe: number | string | null
  stripe_disputa_moneda: string | null
  contracargo_conciliacion: { estado?: string; resultado?: string } | null
}

export interface MovimientoFinanzas {
  id: string; amount: number; fee: number; currency: string; type: string
  created: number; net: number
  fee_details: { amount: number; type: string; currency: string }[]
  reporting_category?: string
  balance_type?: string
}

export function centimos(importe: Importe | undefined): number | null {
  if (importe == null || (typeof importe === "string" && !/^-?\d+(\.\d{1,2})?$/.test(importe))) return null
  const numero = Number(importe)
  const resultado = Math.round(numero * 100)
  return Number.isFinite(numero) && Number.isSafeInteger(resultado) && Math.abs(numero * 100 - resultado) < 0.000001 ? resultado : null
}

export function sumarCentimos(a: number, b: number): number {
  const suma = a + b
  if (!Number.isSafeInteger(suma)) throw new Error("Importe fuera de rango")
  return suma
}

export function esPagoLiquidado(pago: PagoFinanzas): boolean {
  return pago.estado === "completado" || pago.estado === "reembolsado"
}

export function comisionLiquidada(pago: PagoFinanzas): number | null {
  if (!esPagoLiquidado(pago) || pago.liquidacion_error || (pago.liquidacion_estado && pago.liquidacion_estado !== "completada")) return null
  const retenido = centimos(pago.retencion_plataforma)
  if (pago.retencion_plataforma != null) return retenido != null && retenido >= 0 ? retenido : null
  const cliente = centimos(pago.comision_cliente), profesional = centimos(pago.comision_proveedor)
  if (cliente == null || profesional == null || cliente < 0 || profesional < 0) return null
  return sumarCentimos(cliente, profesional)
}

/**
 * Stripe: net = amount - fee. Only standalone fee entries have fee principal.
 * Keep signs (credits reduce costs); never count transfer/refund/payout principal.
 * Sources: docs.stripe.com/api/balance_transactions/object and
 * docs.stripe.com/reports/balance-transaction-types (checked 2026-11-06).
 */
export function gastoMovimiento(movimiento: MovimientoFinanzas): number {
  const { amount, fee, net, currency, fee_details } = movimiento
  if (![amount, fee, net].every(Number.isSafeInteger) || net !== amount - fee || !Array.isArray(fee_details)) throw new Error("Movimiento sin importe conciliable")
  let aplicaciones = 0, detalle = 0
  for (const parte of fee_details) {
    if (!Number.isSafeInteger(parte.amount) || parte.currency.toLowerCase() !== currency.toLowerCase()) throw new Error("Desglose de gastos incoherente")
    detalle = sumarCentimos(detalle, parte.amount)
    if (parte.type === "application_fee") aplicaciones = sumarCentimos(aplicaciones, parte.amount)
  }
  if (fee_details.length > 0 && detalle !== fee) throw new Error("Desglose de gastos incompleto")
  // Historical adjustments sometimes represented service fees. Category is the
  // authoritative classification; don't infer fee principal from free text.
  // Funding is a grant/prepayment, not a fee refund. Count the stripe_fee
  // consumption, including fees paid from fee_credits, only when incurred.
  const independiente = ["stripe_fee", "stripe_fx_fee", "tax_fee"].includes(movimiento.type)
    || (movimiento.type === "adjustment" && ["fee", "fee_refund"].includes(movimiento.reporting_category ?? ""))
  return sumarCentimos(fee - aplicaciones, independiente ? -amount : 0)
}

export function idStripe(valor: string | { id: string } | null | undefined): string | null {
  return typeof valor === "string" ? valor : valor?.id ?? null
}
