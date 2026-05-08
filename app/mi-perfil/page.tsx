import { redirect } from "next/navigation"
import PerfilProfesional from "@/components/perfil-profesional"
import { ProfileCompletionCard } from "@/components/profile-completion-card"
import { createClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Mi Perfil | Diime",
  description: "Gestiona tu perfil profesional, habilidades, experiencia y trabajos pasados",
}

export default async function MiPerfilPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase!.auth.getUser()

  if (!user) {
    redirect("/auth/login?redirect=/mi-perfil")
  }

  // Load profile + professional info to calculate completion
  const [{ data: profile }, { data: profesional }, { data: portfolio }] = await Promise.all([
    supabase!.from("profiles").select("*").eq("id", user.id).single(),
    supabase!.from("profesionales").select("*").eq("id", user.id).maybeSingle(),
    supabase!.from("portfolio").select("id").eq("profesional_id", user.id).limit(1),
  ])

  const habilidades = (profesional?.habilidades as unknown[]) || []
  const certificaciones = (profesional?.certificaciones as unknown[]) || []

  const completionItems = [
    { label: "Foto de perfil", done: !!profile?.foto_perfil },
    { label: "Bio descriptiva", done: !!profile?.bio && profile.bio.length > 30 },
    { label: "Ubicacion", done: !!profile?.ubicacion },
    { label: "Telefono", done: !!profile?.telefono },
    { label: "Titulo profesional", done: !!profesional?.titulo },
    { label: "Tarifa por hora", done: !!profesional?.tarifa_por_hora },
    { label: "Habilidades anadidas", done: habilidades.length > 0 },
    { label: "Certificaciones", done: certificaciones.length > 0 },
    { label: "Al menos un proyecto", done: !!portfolio && portfolio.length > 0 },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="min-w-0">
          <PerfilProfesional editable={true} />
        </div>
        <aside className="lg:sticky lg:top-24">
          <ProfileCompletionCard items={completionItems} />
        </aside>
      </div>
    </div>
  )
}
