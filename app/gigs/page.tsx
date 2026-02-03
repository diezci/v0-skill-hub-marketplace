import type { Metadata } from "next"
import GigListing from "@/components/gig-listing"
import GigFilters from "@/components/gig-filters"

export const metadata: Metadata = {
  title: "Servicios - SkillHub",
  description: "Explora nuestra amplia selección de profesionales de la construcción y reformas",
}

export default function GigsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col space-y-4 mb-8">
        <h1 className="text-3xl font-bold">Explorar Servicios</h1>
        <p className="text-muted-foreground">
          Encuentra al profesional perfecto para tu proyecto de construcción o reforma del hogar.
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
