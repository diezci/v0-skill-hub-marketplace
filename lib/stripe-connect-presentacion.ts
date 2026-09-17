import type { EstadoStripeConnect, SaldoStripePorMoneda } from "@/app/actions/stripe-connect"
import { localeDe, type Idioma } from "@/lib/i18n"

const dias: Record<string, string> = {
  monday: "lunes",
  tuesday: "martes",
  wednesday: "miércoles",
  thursday: "jueves",
  friday: "viernes",
}

export function formatearImporteStripe(centimos: number, moneda: string, idioma: Idioma = "es") {
  return new Intl.NumberFormat(localeDe(idioma), {
    style: "currency",
    currency: moneda.toUpperCase(),
  }).format(centimos / 100)
}

export function formatearFechaStripe(timestamp: number, idioma: Idioma = "es") {
  return new Intl.DateTimeFormat(localeDe(idioma), {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(timestamp * 1000))
}

export function saldoPrincipalStripe(estado: EstadoStripeConnect | null): SaldoStripePorMoneda {
  return (
    estado?.saldo?.saldos.find((saldo) => saldo.moneda === "eur") ||
    estado?.saldo?.saldos[0] || {
      moneda: "eur",
      disponible: 0,
      pendiente: 0,
    }
  )
}

export function describirCalendarioStripe(estado: EstadoStripeConnect | null, idioma: Idioma = "es") {
  const calendario = estado?.saldo?.calendario
  const ingles = idioma === "en"
  if (!calendario?.intervalo) return ingles ? "when Stripe schedules the transfer" : "cuando Stripe programe la transferencia"
  if (calendario.intervalo === "manual") return ingles ? "when you request a payout in Stripe" : "cuando solicites el ingreso desde Stripe"
  if (calendario.intervalo === "daily") return ingles ? "on Stripe's automatic daily schedule" : "con el calendario automático diario de Stripe"
  if (calendario.intervalo === "weekly") {
    const nombres = calendario.diasSemana.map((dia) => ingles ? dia : dias[dia] || dia).join(ingles ? " and " : " y ")
    return nombres
      ? ingles ? `on Stripe's weekly schedule (${nombres})` : `con el calendario semanal de Stripe (${nombres})`
      : ingles ? "on Stripe's automatic weekly schedule" : "con el calendario automático semanal de Stripe"
  }
  const fechas = calendario.diasMes.join(", ")
  return fechas
    ? ingles ? `on day(s) ${fechas} of each month, according to Stripe's schedule` : `los días ${fechas} de cada mes, según el calendario de Stripe`
    : ingles ? "on Stripe's automatic monthly schedule" : "con el calendario automático mensual de Stripe"
}
