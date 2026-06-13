import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import PerfilProfesional from "@/components/perfil-profesional"

export const metadata = {
  title: "Mi Perfil | Diime",
  description: "Gestiona tu perfil profesional, habilidades, experiencia y trabajos pasados",
}

export default async function MiPerfilPage() {
  const supabase = await createClient()

  if (!supabase) {
    redirect("/auth/login")
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <PerfilProfesional editable={true} />
    </div>
  )
}
