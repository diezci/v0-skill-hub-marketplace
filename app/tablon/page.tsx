import DemandasServicios from "@/components/demandas-servicios"

export const metadata = {
  title: "Tablón de Proyectos | SkillHub",
  description: "Encuentra proyectos y ofrece tus servicios profesionales",
}

export default function TablonPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Tablón de Proyectos</h1>
        <p className="text-muted-foreground">Explora los proyectos publicados y envía tus ofertas a los clientes</p>
      </div>
      <DemandasServicios />
    </div>
  )
}
