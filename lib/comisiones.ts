// Commission and pricing configuration for the platform
// The platform charges a service fee on top of the agreed price

export const PLATFORM_CONFIG = {
  // Las tarifas visibles de Diime son precios finales: ya incluyen este IVA.
  ivaDiimePorcentaje: 21,
  // Commission charged TO THE CLIENT on top of the agreed price (percentage)
  comision_cliente: 10, // 10% added on top
  comisionClientePorcentaje: 10, // Alias for display
  // Commission charged TO THE PROVIDER deducted from the agreed price (percentage)
  comision_proveedor: 10, // 10% deducted from payment
  comisionProveedorPorcentaje: 10, // Alias for display
  // Minimum commission in euros
  comision_minima: 2,
  // Currency
  moneda: "eur" as const,
}

// Todos los repartos se calculan en céntimos. Redondear comisión y neto por
// separado podía crear o perder un céntimo en determinados precios.
const aCentimos = (importe: number) => Math.round(importe * 100)
const aEuros = (centimos: number) => centimos / 100

/**
 * Separa la base y la cuota de IVA de un importe que ya incluye el impuesto.
 * El redondeo se hace en centimos para que base + IVA conserve siempre el total.
 */
export function desglosarIvaIncluido(
  totalConIva: number,
  porcentajeIva = PLATFORM_CONFIG.ivaDiimePorcentaje,
): {
  baseImponible: number
  cuotaIva: number
  total: number
} {
  if (!Number.isFinite(totalConIva) || totalConIva <= 0 || !Number.isFinite(porcentajeIva) || porcentajeIva < 0) {
    return { baseImponible: 0, cuotaIva: 0, total: 0 }
  }
  const totalCentimos = aCentimos(totalConIva)
  const baseCentimos = Math.round((totalCentimos * 100) / (100 + porcentajeIva))
  return {
    baseImponible: aEuros(baseCentimos),
    cuotaIva: aEuros(totalCentimos - baseCentimos),
    total: aEuros(totalCentimos),
  }
}

/**
 * Calculate what the client pays:
 * precio_acordado + comision_cliente
 */
export function calcularTotalCliente(precioAcordado: number): {
  precioBase: number
  comisionCliente: number
  totalCliente: number
} {
  if (!Number.isFinite(precioAcordado) || precioAcordado <= 0) {
    return { precioBase: 0, comisionCliente: 0, totalCliente: 0 }
  }
  const baseCentimos = aCentimos(precioAcordado)
  const comisionClienteCentimos = Math.max(
    Math.round((baseCentimos * PLATFORM_CONFIG.comision_cliente) / 100),
    aCentimos(PLATFORM_CONFIG.comision_minima),
  )
  return {
    precioBase: aEuros(baseCentimos),
    comisionCliente: aEuros(comisionClienteCentimos),
    totalCliente: aEuros(baseCentimos + comisionClienteCentimos),
  }
}

/**
 * Calculate what the provider receives:
 * precio_acordado - comision_proveedor
 */
export function calcularPagoProveedor(precioAcordado: number): {
  precioBase: number
  comisionProveedor: number
  pagoNeto: number
} {
  return calcularPagoProveedorConTarifa(
    precioAcordado,
    PLATFORM_CONFIG.comision_proveedor,
    PLATFORM_CONFIG.comision_minima,
  )
}

/**
 * Calculate the provider settlement using the terms snapshotted in an offer.
 * This keeps an accepted fee stable even if the platform tariff later changes.
 */
export function calcularPagoProveedorConTarifa(
  precioAcordado: number,
  porcentaje: number,
  comisionMinima: number,
): {
  precioBase: number
  comisionProveedor: number
  pagoNeto: number
} {
  if (!Number.isFinite(precioAcordado) || precioAcordado <= 0) {
    return { precioBase: 0, comisionProveedor: 0, pagoNeto: 0 }
  }
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || !Number.isFinite(comisionMinima) || comisionMinima < 0) {
    return { precioBase: 0, comisionProveedor: 0, pagoNeto: 0 }
  }
  const baseCentimos = aCentimos(precioAcordado)
  const comisionProveedorCentimos = Math.max(
    Math.round((baseCentimos * porcentaje) / 100),
    aCentimos(comisionMinima),
  )
  // Un importe muy pequeño nunca puede producir un neto negativo.
  const comisionAplicadaCentimos = Math.min(comisionProveedorCentimos, baseCentimos)
  return {
    precioBase: aEuros(baseCentimos),
    comisionProveedor: aEuros(comisionAplicadaCentimos),
    pagoNeto: aEuros(baseCentimos - comisionAplicadaCentimos),
  }
}

/**
 * Calculate refund when client rejects work:
 * Client gets back: totalCliente - platform margin
 * Platform keeps: comision_cliente (the platform's fee is non-refundable)
 */
export function calcularReembolsoCliente(precioAcordado: number): {
  totalPagado: number
  reembolso: number
  retencionPlataforma: number
} {
  const { totalCliente, comisionCliente } = calcularTotalCliente(precioAcordado)
  return {
    totalPagado: totalCliente,
    reembolso: Math.round((totalCliente - comisionCliente) * 100) / 100,
    retencionPlataforma: comisionCliente,
  }
}

/**
 * Format currency for display.
 * Uses Spanish locale (dot as thousand separator). Hides decimals when the
 * value is a whole number, shows two decimals otherwise.
 */
export function formatearPrecio(precio: number): string {
  const isInteger = Number.isInteger(precio)
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(precio)
}
