import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { crearEnlaceOnboardingStripe } from "@/app/actions/stripe-connect"
import { StripeConnectRetornoNativo } from "@/components/stripe-connect-retorno-nativo"

function primerValor(valor?: string | string[]) {
  return Array.isArray(valor) ? valor[0] : valor
}

function rutaSegura(valor?: string) {
  return valor?.startsWith("/") && !valor.startsWith("//") ? valor : "/mi-perfil"
}

export default async function StripeConnectRefreshPage({
  searchParams,
}: {
  searchParams: Promise<{ native?: string | string[]; volver?: string | string[] }>
}) {
  const parametros = await searchParams
  const volverA = rutaSegura(primerValor(parametros.volver))

  if (primerValor(parametros.native) === "1") {
    return <StripeConnectRetornoNativo tipo="refresh" volverA={volverA} />
  }

  // Los Account Links son de un solo uso. En web conservamos la sesión y
  // generamos automáticamente uno nuevo, tal como recomienda Stripe.
  const resultado = await crearEnlaceOnboardingStripe({ volverA })
  if (resultado.data?.url) redirect(resultado.data.url)

  return (
    <main className="container mx-auto max-w-xl px-4 pb-16 pt-28">
      <Card>
        <CardHeader><CardTitle>No se pudo renovar el enlace de Stripe</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{resultado.error || "Vuelve a tu perfil e inténtalo de nuevo."}</p>
          <Button asChild><Link href={volverA}>Volver a Diime</Link></Button>
        </CardContent>
      </Card>
    </main>
  )
}
