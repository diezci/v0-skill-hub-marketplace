import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { obtenerEstadoStripeConnect } from "@/app/actions/stripe-connect"
import { StripeConnectCard } from "@/components/stripe-connect-card"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Cobros profesionales | Diime",
  description: "Consulta tu saldo de Stripe y tus próximos ingresos profesionales.",
}

export default async function CobrosPage() {
  const supabase = await createClient()
  if (!supabase) redirect("/auth/login")

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profesional } = await supabase
    .from("profesionales")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()
  if (!profesional) redirect("/mi-perfil?completar=profesional")

  const resultadoInicial = await obtenerEstadoStripeConnect()
  const estadoInicial = "data" in resultadoInicial ? resultadoInicial.data : null
  const errorInicial = "error" in resultadoInicial ? resultadoInicial.error : null

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Tus cobros</h1>
        <p className="mt-2 text-muted-foreground">
          Saldo liberado, disponibilidad y próximos ingresos bancarios gestionados por Stripe.
        </p>
      </div>
      <StripeConnectCard estadoInicial={estadoInicial} errorInicial={errorInicial} />
    </main>
  )
}
