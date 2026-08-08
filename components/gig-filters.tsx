"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin } from "lucide-react"
import type { ProfesionalesFiltros } from "@/components/profesionales-content"
import { PROVINCIAS_ES } from "@/lib/provincias"
import { CATEGORIAS_SERVICIO } from "@/lib/categorias"
import { SelectorCategoriasAgrupado } from "@/components/selector-categorias-agrupado"
import { RangoPrecio } from "@/components/rango-precio"
import { PRECIO_HORA_MAX, PASO_PRECIO_HORA } from "@/lib/precios"

// Re-exportada por compatibilidad con quien ya la importe desde aquí.
export { PROVINCIAS_ES }

// Los filtros guardan ids (slug); la taxonomía y el selector usan nombres.
const ID_A_NOMBRE: Record<string, string> = Object.fromEntries(CATEGORIAS_SERVICIO.map((c) => [c.id, c.label]))
const NOMBRE_A_ID: Record<string, string> = Object.fromEntries(CATEGORIAS_SERVICIO.map((c) => [c.label, c.id]))


interface GigFiltersProps {
  filtros: ProfesionalesFiltros
  onChange: (cambios: Partial<ProfesionalesFiltros>) => void
  onReset: () => void
}

const GigFilters = ({ filtros, onChange, onReset }: GigFiltersProps) => {
  const handleCategoryChange = (categoryId: string) => {
    onChange({
      categorias: filtros.categorias.includes(categoryId)
        ? filtros.categorias.filter((id) => id !== categoryId)
        : [...filtros.categorias, categoryId],
    })
  }

  return (
    <Card className="sticky top-24">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Filtros</h2>
          <Button variant="ghost" size="sm" onClick={onReset}>
            Restablecer
          </Button>
        </div>

        <div className="space-y-6">
          <Accordion type="multiple" defaultValue={["category", "ubicacion", "price"]}>
            <AccordionItem value="search">
              <AccordionTrigger>Buscar</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <Input
                    placeholder="Buscar servicios..."
                    value={filtros.search}
                    onChange={(e) => onChange({ search: e.target.value })}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="ubicacion">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-600" />
                  Provincia
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Selecciona una provincia</label>
                    <Select
                      value={filtros.provincia || "todas"}
                      onValueChange={(v) => onChange({ provincia: v === "todas" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todas las provincias" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="todas">Todas las provincias</SelectItem>
                        {PROVINCIAS_ES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {["Madrid", "Barcelona", "Valencia", "Sevilla"].map((ciudad) => (
                      <button
                        key={ciudad}
                        type="button"
                        onClick={() => onChange({ provincia: ciudad })}
                        // min-h-8: son botones de filtro de verdad y medían 24px
                        // de alto, incómodos de acertar con el dedo.
                        className={`inline-flex min-h-8 items-center px-3 text-xs rounded-full transition-colors ${
                          filtros.provincia === ciudad
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-muted hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400"
                        }`}
                      >
                        {ciudad}
                      </button>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="category">
              <AccordionTrigger>Categoría</AccordionTrigger>
              <AccordionContent>
                {/* El filtro trabaja con ids (slug), pero el selector devuelve
                    nombres: se traduce en ambos sentidos. */}
                <SelectorCategoriasAgrupado
                  idPrefix="category"
                  seleccionadas={filtros.categorias.map((id) => ID_A_NOMBRE[id]).filter(Boolean)}
                  onChange={(nombres) => onChange({ categorias: nombres.map((n) => NOMBRE_A_ID[n]).filter(Boolean) })}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="price">
              <AccordionTrigger>Rango de Precio (€/h)</AccordionTrigger>
              <AccordionContent>
                {/* Aquí el precio es POR HORA, no el presupuesto de un
                    proyecto: su tope es PRECIO_HORA_MAX, no PRECIO_MAX. */}
                <RangoPrecio
                  value={[filtros.precioMin, filtros.precioMax]}
                  onChange={([min, max]) => onChange({ precioMin: min, precioMax: max })}
                  max={PRECIO_HORA_MAX}
                  paso={PASO_PRECIO_HORA}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </CardContent>
    </Card>
  )
}

export default GigFilters
