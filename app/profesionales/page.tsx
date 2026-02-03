import type { Metadata } from "next"
import GigListing from "@/components/gig-listing"
import GigFilters from "@/components/gig-filters"

export const metadata: Metadata = {
  title: "Profesionales - SkillHub",
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1">
          <GigFilters />
        </div>
        <div className="lg:col-span-3">
          <GigListing />
        </div>
      </div>
    </div>
  )
}
