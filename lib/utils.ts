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
 * Formatea el rango de presupuesto de una demanda de forma fiel a lo que el
 * cliente eligió: "Hasta 500€" (sin mínimo), "Más de 5.000€" (sin máximo),
 * "900€ - 1.500€" (rango completo) o "A convenir" (sin presupuesto).
 */
export function formatearRangoPresupuesto(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): string {
  const nMin = min === null || min === undefined || min === "" ? null : Number(min)
  const nMax = max === null || max === undefined || max === "" ? null : Number(max)
  const hayMin = nMin !== null && !Number.isNaN(nMin) && nMin > 0
  const hayMax = nMax !== null && !Number.isNaN(nMax) && nMax > 0

  if (hayMin && hayMax) return `${formatearPrecioEuros(nMin)} - ${formatearPrecioEuros(nMax)}`
  if (!hayMin && hayMax) return `Hasta ${formatearPrecioEuros(nMax)}`
  if (hayMin && !hayMax) return `Más de ${formatearPrecioEuros(nMin)}`
  return "A convenir"
}
