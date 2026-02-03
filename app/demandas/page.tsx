import DemandasServicios from "@/components/demandas-servicios"

export const metadata = {
  title: "Demandas de Servicios | SkillHub",
  description: "Explora las demandas de servicios publicadas y envía tus presupuestos",
}

export default function DemandasPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Demandas de Servicios</h1>
        <p className="text-muted-foreground">
          Explora las solicitudes de servicios publicadas por usuarios. Filtra por tu especialidad y ubicación para
          encontrar proyectos y enviar tus presupuestos.
        </p>
      </div>
      <DemandasServicios />
    </div>
  )
}
