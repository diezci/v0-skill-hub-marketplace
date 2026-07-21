import type { Metadata } from "next"
import { redirect } from "next/navigation"
import MisOfertas from "@/components/mis-ofertas"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Presupuestos enviados | Diime",
  description: "Consulta y gestiona los presupuestos enviados a clientes.",
}

export default async function PresupuestosEnviadosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login?next=/presupuestos-enviados")

  const { data: profesional } = await supabase.from("profesionales").select("id").eq("id", user.id).maybeSingle()
  if (!profesional) redirect("/convertirse-profesional")

  return <main className="container mx-auto px-4 py-8"><MisOfertas /></main>
}
