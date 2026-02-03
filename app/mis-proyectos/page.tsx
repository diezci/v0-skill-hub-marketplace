import MisSolicitudes from "@/components/mis-solicitudes"

export const metadata = {
  title: "Mis Proyectos | SkillHub",
  description: "Gestiona tus proyectos publicados y ofertas recibidas",
}

export default function MisProyectosPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Mis Proyectos</h1>
        <p className="text-muted-foreground">Gestiona tus solicitudes de servicio y revisa las ofertas recibidas</p>
      </div>
      <MisSolicitudes />
    </div>
  )
}
