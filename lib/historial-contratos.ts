type Escrow = { estado?: string | null; fecha_retencion?: string | null }
type Contrato = { estado?: string | null; created_at?: string | null; transacciones_escrow?: Escrow[] | null }
const estadosEconomicos = new Set(['retenido', 'fondos_retenidos', 'liquidando', 'pago_tardio', 'liberado', 'completado', 'reembolsado', 'disputa'])
const estadosSinLiquidar = new Set(['retenido', 'fondos_retenidos', 'liquidando', 'pago_tardio', 'disputa'])

export function seleccionarEscrowContrato<T extends Escrow>(escrows: readonly T[]): T | null {
  return escrows.find(e => e.fecha_retencion || estadosEconomicos.has(e.estado || ''))
    ?? escrows.find(e => e.estado === 'pendiente') ?? null
}

/** Financially unresolved work must not disappear behind a newer technical cancellation. */
export function seleccionarContratoVigente<T extends Contrato>(contratos: readonly T[]): T | null {
  const prioridad = (t: T) => {
    if (t.transacciones_escrow?.some(e => estadosSinLiquidar.has(e.estado || ''))) return 0
    if (['pendiente_pago', 'pendiente', 'en_progreso', 'entregado', 'en_disputa'].includes(t.estado || '')) return 1
    return t.estado === 'cancelado' ? 3 : 2
  }
  return [...contratos].sort((a, b) => prioridad(a) - prioridad(b)
    || (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0))[0] ?? null
}
