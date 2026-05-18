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
