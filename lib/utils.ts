import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea una fecha a string en formato español (DD/MM/AAAA, HH:mm).
 * Acepta string, Date o null/undefined.
 */
export function formatearFecha(fecha: string | Date | null | undefined): string {
  if (!fecha) return "-"
  const date = typeof fecha === "string" ? new Date(fecha) : fecha
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Formatea un número como moneda en euros (es-ES).
 */
export function formatearMoneda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "0,00 €"
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(valor)
}

/**
 * Formatea un precio en euros con separador de miles (punto) en formato español.
 * Ejemplos: 3500 -> "3.500€", 1234567.5 -> "1.234.567,50€"
 */
export function formatearPrecioEuros(
  valor: number | string | null | undefined,
  options?: { decimales?: boolean },
): string {
  if (valor === null || valor === undefined || valor === "") return "0€"
  const num = typeof valor === "string" ? Number(valor) : valor
  if (Number.isNaN(num)) return "0€"
  const decimales = options?.decimales ?? !Number.isInteger(num)
  const formatted = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimales ? 2 : 0,
    maximumFractionDigits: decimales ? 2 : 0,
  }).format(num)
  return `${formatted}€`
}

/**
 * Formatea el presupuesto de una demanda enseñando las cifras que publicó el
 * cliente, sin añadirle interpretaciones:
 *
 *   900€ - 1.500€   rango completo
 *   1.500€          una sola cifra (mínimo y máximo coinciden, o solo hay una)
 *   Hasta 500€      solo puso techo, no suelo
 *   A convenir      no puso ninguna cifra
 *
 * Antes, una demanda con mínimo pero sin máximo se enseñaba como "Más de
 * 5.000€", que no es lo que el cliente había publicado: el formulario tiraba el
 * máximo cuando el tirador quedaba en el tope de la barra, y el texto se
 * inventaba el "más de" para rellenar el hueco. Ya no se tira (ver
 * solicitud-servicio-form), pero quedan demandas antiguas sin máximo, y para
 * esas se enseña la cifra a secas.
 */
export function formatearRangoPresupuesto(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): string {
  const nMin = min === null || min === undefined || min === "" ? null : Number(min)
  const nMax = max === null || max === undefined || max === "" ? null : Number(max)
  const hayMin = nMin !== null && !Number.isNaN(nMin) && nMin > 0
  const hayMax = nMax !== null && !Number.isNaN(nMax) && nMax > 0

  if (hayMin && hayMax) {
    // Cuando el cliente deja los dos tiradores juntos ha publicado un importe
    // exacto: repetirlo ("1.500€ - 1.500€") sobra.
    if (nMin === nMax) return formatearPrecioEuros(nMin)
    return `${formatearPrecioEuros(nMin)} - ${formatearPrecioEuros(nMax)}`
  }
  if (!hayMin && hayMax) return `Hasta ${formatearPrecioEuros(nMax)}`
  if (hayMin && !hayMax) return formatearPrecioEuros(nMin)
  return "A convenir"
}

/**
 * Convierte el importe de un trabajo del portfolio en una horquilla pública.
 * El profesional conserva el importe real para editarlo, pero el perfil solo
 * enseña un tramo amplio. Además de evitar presentarlo como una tarifa cerrada
 * aplicable a otros encargos, el tramo impide reconstruir el precio acordado a
 * partir de unos límites demasiado precisos.
 */
export function formatearRangoPortfolio(valor: number | string | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === "") return null
  const importe = typeof valor === "string" ? Number(valor) : valor
  if (!Number.isFinite(importe) || importe <= 0) return null

  const tramos = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000]
  const indiceSuperior = tramos.findIndex((limite) => importe < limite)

  return formatearTramoPortfolio(indiceSuperior === -1 ? tramos.length : indiceSuperior)
}

/** Formatea el identificador no sensible que devuelve `portfolio_publico`. */
export function formatearTramoPortfolio(indice: number | string | null | undefined): string | null {
  if (indice === null || indice === undefined || indice === "") return null
  const numeroIndice = typeof indice === "string" ? Number(indice) : indice
  const tramos = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000]

  if (!Number.isInteger(numeroIndice) || numeroIndice < 0 || numeroIndice > tramos.length) return null
  if (numeroIndice === 0) return `Hasta ${formatearPrecioEuros(tramos[0])}`
  if (numeroIndice === tramos.length) return `Más de ${formatearPrecioEuros(tramos[tramos.length - 1])}`

  return `${formatearPrecioEuros(tramos[numeroIndice - 1])} – ${formatearPrecioEuros(tramos[numeroIndice])}`
}
