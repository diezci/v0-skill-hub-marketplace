import MisSolicitudes from "@/components/mis-solicitudes"

export const metadata = {
  title: "Mis Solicitudes | SkillHub",
  description: "Gestiona tus demandas de servicios publicadas y revisa las ofertas recibidas",
}

export default function MisSolicitudesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Mis Solicitudes</h1>
        <p className="text-muted-foreground">
          Gestiona las demandas de servicios que has publicado. Revisa las ofertas recibidas, el estado de cada
          solicitud y el progreso de los trabajos contratados.
        </p>
      </div>
      <MisSolicitudes />
    </div>
  )
}
