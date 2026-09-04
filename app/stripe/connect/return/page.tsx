import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { refrescarEstadoStripeConnect } from "@/app/actions/stripe-connect"

export default async function StripeConnectReturnPage() {
  const resultado = await refrescarEstadoStripeConnect()
  const listo = !!resultado.data?.onboardingCompletado && !!resultado.data?.transferenciasHabilitadas

  return (
    <main className="container mx-auto max-w-xl px-4 pb-16 pt-28">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Datos recibidos por Stripe</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {listo
              ? "Tu cuenta ya puede recibir transferencias de Diime."
              : "Stripe ha guardado tus datos. Si queda alguna verificación pendiente, podrás completarla desde tu perfil."}
          </p>
          <Button asChild><Link href="/mi-perfil">Volver a mi perfil</Link></Button>
        </CardContent>
      </Card>
    </main>
  )
}

