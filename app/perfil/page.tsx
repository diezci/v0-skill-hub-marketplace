import EditarPerfil from "@/components/editar-perfil"

export const metadata = {
  title: "Mi Perfil Profesional | SkillHub",
  description: "Edita tu perfil profesional y gestiona tu información",
}

export default function PerfilPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Mi Perfil Profesional</h1>
        <p className="text-muted-foreground">
          Gestiona tu información, habilidades y experiencia para destacar ante los clientes
        </p>
      </div>
      <EditarPerfil />
    </div>
  )
}
