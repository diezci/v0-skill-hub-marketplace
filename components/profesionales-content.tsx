"use client"

import { useEffect, useMemo, useState } from "react"
import GigFilters from "@/components/gig-filters"
import GigListing from "@/components/gig-listing"
import { subcategoriaIdsDeCategoriaPrincipal } from "@/lib/categorias"
import { PRECIO_HORA_MAX } from "@/lib/precios"

export type ProfesionalesFiltros = {
  search: string
  provincia: string
  categorias: string[]
  precioMin: number
  precioMax: number
}

const FILTROS_INICIALES: ProfesionalesFiltros = {
  search: "",
  provincia: "",
  categorias: [],
  precioMin: 0,
  // El mismo tope que el slider: así, de inicio, el filtro de tarifa no
  // excluye a nadie. Aquí el precio es por HORA, de ahí PRECIO_HORA_MAX y no
  // PRECIO_MAX (que es el presupuesto total de un proyecto).
  precioMax: PRECIO_HORA_MAX,
}

export default function ProfesionalesContent() {
  const [filtros, setFiltros] = useState<ProfesionalesFiltros>(FILTROS_INICIALES)

  // Atajo desde el homepage: /profesionales?categoria=exteriores-y-jardin deja
  // marcadas las subcategorías de esa categoría principal (el filtro trabaja
  // con subcategorías). Antes las tarjetas del home enlazaban con ?category=,
  // que no leía nadie, así que pinchar una categoría no filtraba nada.
  //
  // Se lee de window.location en un efecto y no con useSearchParams a
  // propósito: esta página no tiene frontera de Suspense y useSearchParams
  // obligaría a añadirla.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("categoria")
    if (!slug) return
    const ids = subcategoriaIdsDeCategoriaPrincipal(slug)
    if (ids.length > 0) setFiltros((f) => ({ ...f, categorias: ids }))
  }, [])

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
