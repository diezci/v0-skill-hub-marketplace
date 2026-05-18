"use client"

import { useMemo, useState } from "react"
import GigFilters from "@/components/gig-filters"
import GigListing from "@/components/gig-listing"

export type ProfesionalesFiltros = {
  search: string
  provincia: string
  radio: string
  categorias: string[]
  niveles: string[]
  precioMin: number
  precioMax: number
}

const FILTROS_INICIALES: ProfesionalesFiltros = {
  search: "",
  provincia: "",
  radio: "any",
  categorias: [],
  niveles: [],
  precioMin: 0,
  precioMax: 5000,
}

export default function ProfesionalesContent() {
  const [filtros, setFiltros] = useState<ProfesionalesFiltros>(FILTROS_INICIALES)

  const update = useMemo(
    () => (cambios: Partial<ProfesionalesFiltros>) => setFiltros((f) => ({ ...f, ...cambios })),
    [],
  )

  const reset = useMemo(() => () => setFiltros(FILTROS_INICIALES), [])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="lg:col-span-1">
        <GigFilters filtros={filtros} onChange={update} onReset={reset} />
      </div>
      <div className="lg:col-span-3">
        <GigListing filtros={filtros} />
      </div>
    </div>
  )
}
