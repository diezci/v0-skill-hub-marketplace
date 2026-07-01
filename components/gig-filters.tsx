"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin } from "lucide-react"
import type { ProfesionalesFiltros } from "@/components/profesionales-content"
import { PROVINCIAS_ES } from "@/lib/provincias"
import { CATEGORIAS_SERVICIO } from "@/lib/categorias"

// Re-exportada por compatibilidad con quien ya la importe desde aquí.
export { PROVINCIAS_ES }

const categories = CATEGORIAS_SERVICIO

const levels = [
  { id: "any", label: "Cualquier Nivel" },
  { id: "certificado", label: "Profesional Certificado" },
  { id: "experto", label: "Experto Verificado" },
  { id: "maestro", label: "Maestro Artesano" },
]

const radios = [
  { id: "5", label: "Menos de 5 km" },
  { id: "10", label: "Menos de 10 km" },
  { id: "25", label: "Menos de 25 km" },
  { id: "50", label: "Menos de 50 km" },
  { id: "any", label: "Toda la provincia" },
]

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

  const handleLevelChange = (levelId: string) => {
    onChange({
      niveles: filtros.niveles.includes(levelId)
        ? filtros.niveles.filter((id) => id !== levelId)
        : [...filtros.niveles, levelId],
    })
  }

  const handlePriceChange = (values: number[]) => {
    onChange({ precioMin: values[0], precioMax: values[1] })
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
          <Accordion type="multiple" defaultValue={["category", "ubicacion", "price", "level"]}>
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
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Radio de búsqueda</label>
                    <Select value={filtros.radio} onValueChange={(v) => onChange({ radio: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona radio" />
                      </SelectTrigger>
                      <SelectContent>
                        {radios.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.label}
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
                        className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
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
                <div className="space-y-2">
                  {categories.map((category) => (
                    <div key={category.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`category-${category.id}`}
                        checked={filtros.categorias.includes(category.id)}
                        onCheckedChange={() => handleCategoryChange(category.id)}
                      />
                      <label htmlFor={`category-${category.id}`} className="text-sm cursor-pointer">
                        {category.label}
                      </label>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="price">
              <AccordionTrigger>Rango de Precio</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <Slider
                    max={5000}
                    step={50}
                    value={[filtros.precioMin, filtros.precioMax]}
                    onValueChange={handlePriceChange}
                  />
                  <div className="flex justify-between">
                    <span className="text-sm">€{filtros.precioMin}</span>
                    <span className="text-sm">€{filtros.precioMax}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="level">
              <AccordionTrigger>Nivel Profesional</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {levels.map((level) => (
                    <div key={level.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`level-${level.id}`}
                        checked={filtros.niveles.includes(level.id)}
                        onCheckedChange={() => handleLevelChange(level.id)}
                      />
                      <label htmlFor={`level-${level.id}`} className="text-sm cursor-pointer">
                        {level.label}
                      </label>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </CardContent>
    </Card>
  )
}

export default GigFilters
