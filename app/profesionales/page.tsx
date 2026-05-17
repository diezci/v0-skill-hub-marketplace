import type { Metadata } from "next"
import ProfesionalesContent from "@/components/profesionales-content"

export const metadata: Metadata = {
  title: "Profesionales - Diime",
  description: "Encuentra profesionales verificados para tus proyectos de construcción y reformas",
}

export default function ProfesionalesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col space-y-4 mb-8">
        <h1 className="text-3xl font-bold">Profesionales</h1>
        <p className="text-muted-foreground">
          Encuentra y contacta directamente con profesionales verificados para tu proyecto.
        </p>
      </div>

      <ProfesionalesContent />
    </div>
  )
}
