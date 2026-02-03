import PerfilProfesional from "@/components/perfil-profesional"

export const metadata = {
  title: "Mi Perfil | SkillHub",
  description: "Gestiona tu perfil profesional, habilidades, experiencia y trabajos pasados",
}

export default function MiPerfilPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <PerfilProfesional editable={true} />
    </div>
  )
}
