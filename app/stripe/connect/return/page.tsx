import { redirect } from "next/navigation"
import { StripeConnectRetornoNativo } from "@/components/stripe-connect-retorno-nativo"

function primerValor(valor?: string | string[]) {
  return Array.isArray(valor) ? valor[0] : valor
}

function rutaSegura(valor?: string) {
  return valor?.startsWith("/") && !valor.startsWith("//") ? valor : "/mi-perfil"
}

function conEstado(ruta: string) {
  const url = new URL(ruta, "https://www.diime.es")
  url.searchParams.set("stripe_connect", "return")
  return `${url.pathname}${url.search}${url.hash}`
}

export default async function StripeConnectReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ native?: string | string[]; volver?: string | string[] }>
}) {
  const parametros = await searchParams
  const volverA = rutaSegura(primerValor(parametros.volver))

  // El navegador del sistema no comparte necesariamente la sesión de la
  // WebView. La URL HTTPS exigida por Stripe salta de vuelta a la app mediante
  // el esquema ya registrado por Diime; allí se cierra el navegador externo.
  if (primerValor(parametros.native) === "1") {
    return <StripeConnectRetornoNativo tipo="return" volverA={volverA} />
  }

  // La tarjeta de cobros consulta Stripe al montarse en la página de destino.
  // No se revalida aquí: este retorno también debe funcionar en navegadores
  // externos que no comparten las cookies de la WebView.
  redirect(conEstado(volverA))
}
