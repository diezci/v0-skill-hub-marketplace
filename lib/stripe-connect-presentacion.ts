import type { EstadoStripeConnect, SaldoStripePorMoneda } from "@/app/actions/stripe-connect"

const dias: Record<string, string> = {
  monday: "lunes",
  tuesday: "martes",
  wednesday: "miércoles",
  thursday: "jueves",
  friday: "viernes",
}

export function formatearImporteStripe(centimos: number, moneda: string) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: moneda.toUpperCase(),
  }).format(centimos / 100)
}

export function formatearFechaStripe(timestamp: number) {
  return new Intl.DateTimeFormat("es-ES", {
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
      instantaneo: 0,
    }
  )
}

export function describirCalendarioStripe(estado: EstadoStripeConnect | null) {
  const calendario = estado?.saldo?.calendario
  if (!calendario?.intervalo) return "cuando Stripe programe la transferencia"
  if (calendario.intervalo === "manual") return "cuando solicites el ingreso desde Stripe"
  if (calendario.intervalo === "daily") return "con el calendario automático diario de Stripe"
  if (calendario.intervalo === "weekly") {
    const nombres = calendario.diasSemana.map((dia) => dias[dia] || dia).join(" y ")
    return nombres
      ? `con el calendario semanal de Stripe (${nombres})`
      : "con el calendario automático semanal de Stripe"
  }
  const fechas = calendario.diasMes.join(", ")
  return fechas
    ? `los días ${fechas} de cada mes, según el calendario de Stripe`
    : "con el calendario automático mensual de Stripe"
}
