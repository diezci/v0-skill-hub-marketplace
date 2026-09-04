import { calcularPagoProveedor } from "@/lib/comisiones"

export const aCentimos = (importe: number) => {
  const valor = Number(importe)
  return Number.isFinite(valor) ? Math.round(valor * 100) : 0
}
const aEuros = (centimos: number) => centimos / 100

export const mismoImporte = (primero: unknown, segundo: number) => {
  if (primero === null || primero === undefined || !Number.isFinite(Number(primero))) return false
  return aCentimos(Number(primero)) === aCentimos(segundo)
}

/**
 * Única regla económica para confirmaciones y disputas.
 *
 * El reembolso solo se descuenta del precio del servicio. La comisión que el
 * cliente pagó inicialmente queda fuera del reparto y, por tanto, se conserva
 * íntegra cuando la resolución es parcial (o a favor del cliente). La comisión
 * del profesional se vuelve a calcular sobre el importe que se le adjudica.
 */
export function calcularLiquidacion(
  baseOriginal: number,
  reembolsoSolicitado: number,
  comisionProveedorOriginal?: number,
) {
  const baseCentimos = Math.max(aCentimos(baseOriginal), 0)
  const reembolsoCentimos = Math.min(Math.max(aCentimos(reembolsoSolicitado), 0), baseCentimos)
  const brutoProveedorCentimos = baseCentimos - reembolsoCentimos
  const brutoProveedor = aEuros(brutoProveedorCentimos)

  // Se prorratea la comisión ORIGINAL, incluido su mínimo. Volver a aplicar el
  // mínimo sobre un reparto pequeño cobraría al profesional más porcentaje del
  // que aceptó (por ejemplo, 2 EUR sobre una adjudicación de 5 EUR).
  const comisionOriginalCentimos = Math.min(
    Math.max(
      aCentimos(comisionProveedorOriginal ?? calcularPagoProveedor(aEuros(baseCentimos)).comisionProveedor),
      0,
    ),
    baseCentimos,
  )
  const comisionProveedorCentimos =
    baseCentimos > 0
      ? Math.min(Math.round((comisionOriginalCentimos * brutoProveedorCentimos) / baseCentimos), brutoProveedorCentimos)
      : 0
  const comisionProveedor = aEuros(comisionProveedorCentimos)
  const pagoNeto = aEuros(brutoProveedorCentimos - comisionProveedorCentimos)

  // Invariante del precio base: cada céntimo termina en el cliente, en el
  // profesional o en la comisión proporcional aplicada al profesional.
  if (reembolsoCentimos + (brutoProveedorCentimos - comisionProveedorCentimos) + comisionProveedorCentimos !== baseCentimos) {
    throw new Error("El reparto económico no cuadra con el precio original.")
  }

  return {
    base: aEuros(baseCentimos),
    reembolsoCliente: aEuros(reembolsoCentimos),
    brutoProveedor,
    comisionProveedor,
    netoProveedor: pagoNeto,
  }
}
