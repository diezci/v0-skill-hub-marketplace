// Commission and pricing configuration for the platform
// The platform charges a service fee on top of the agreed price

export const PLATFORM_CONFIG = {
  // Commission charged TO THE CLIENT on top of the agreed price (percentage)
  comision_cliente: 10, // 10% added on top
  // Commission charged TO THE PROVIDER deducted from the agreed price (percentage)
  comision_proveedor: 5, // 5% deducted from payment
  // Minimum commission in euros
  comision_minima: 2,
  // Currency
  moneda: "eur" as const,
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
  const comisionCliente = Math.max(
    precioAcordado * (PLATFORM_CONFIG.comision_cliente / 100),
    PLATFORM_CONFIG.comision_minima
  )
  return {
    precioBase: precioAcordado,
    comisionCliente: Math.round(comisionCliente * 100) / 100,
    totalCliente: Math.round((precioAcordado + comisionCliente) * 100) / 100,
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
  const comisionProveedor = Math.max(
    precioAcordado * (PLATFORM_CONFIG.comision_proveedor / 100),
    PLATFORM_CONFIG.comision_minima
  )
  return {
    precioBase: precioAcordado,
    comisionProveedor: Math.round(comisionProveedor * 100) / 100,
    pagoNeto: Math.round((precioAcordado - comisionProveedor) * 100) / 100,
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
 * Format currency for display
 */
export function formatearPrecio(precio: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(precio)
}
