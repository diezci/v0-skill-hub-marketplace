"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin } from "lucide-react"

const categories = [
  { id: "albanileria", label: "Albañilería" },
  { id: "fontaneria", label: "Fontanería" },
  { id: "electricidad", label: "Electricidad" },
  { id: "pintura", label: "Pintura" },
  { id: "carpinteria", label: "Carpintería" },
  { id: "climatizacion", label: "Climatización" },
  { id: "jardineria", label: "Jardinería" },
  { id: "cerrajeria", label: "Cerrajería" },
  { id: "arquitectura", label: "Arquitectura" },
]

const levels = [
  { id: "any", label: "Cualquier Nivel" },
  { id: "certificado", label: "Profesional Certificado" },
  { id: "experto", label: "Experto Verificado" },
  { id: "maestro", label: "Maestro Artesano" },
]

const provincias = [
  "Madrid",
  "Barcelona",
  "Valencia",
  "Sevilla",
  "Zaragoza",
  "Málaga",
  "Murcia",
  "Palma de Mallorca",
  "Las Palmas",
  "Bilbao",
  "Alicante",
  "Córdoba",
  "Valladolid",
  "Vigo",
  "Gijón",
  "Granada",
  "A Coruña",
  "Vitoria-Gasteiz",
  "Pamplona",
  "Santander",
]

const radios = [
  { id: "5", label: "Menos de 5 km" },
  { id: "10", label: "Menos de 10 km" },
  { id: "25", label: "Menos de 25 km" },
  { id: "50", label: "Menos de 50 km" },
  { id: "any", label: "Toda España" },
]

const GigFilters = () => {
  const [priceRange, setPriceRange] = useState([0, 5000])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedLevels, setSelectedLevels] = useState<string[]>([])
  const [ubicacion, setUbicacion] = useState("")
  const [radio, setRadio] = useState("any")

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    )
  }

  const handleLevelChange = (levelId: string) => {
    setSelectedLevels((prev) => (prev.includes(levelId) ? prev.filter((id) => id !== levelId) : [...prev, levelId]))
  }

  const handlePriceChange = (values: number[]) => {
    setPriceRange(values)
  }

  const handleReset = () => {
    setPriceRange([0, 5000])
    setSelectedCategories([])
    setSelectedLevels([])
    setUbicacion("")
    setRadio("any")
  }

  return (
    <Card className="sticky top-24">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Filtros</h2>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Restablecer
          </Button>
        </div>

        <div className="space-y-6">
          <Accordion type="multiple" defaultValue={["category", "ubicacion", "price", "level"]}>
            <AccordionItem value="search">
              <AccordionTrigger>Buscar</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <Input placeholder="Buscar servicios..." />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="ubicacion">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-600" />
                  Ubicación
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Ciudad o provincia</label>
                    <Input
                      placeholder="Ej: Madrid, Barcelona, código postal..."
                      value={ubicacion}
                      onChange={(e) => setUbicacion(e.target.value)}
                      list="provincias-list"
                    />
                    <datalist id="provincias-list">
                      {provincias.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Radio de búsqueda</label>
                    <Select value={radio} onValueChange={setRadio}>
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
                        onClick={() => setUbicacion(ciudad)}
                        className="px-2.5 py-1 text-xs rounded-full bg-muted hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
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
                        checked={selectedCategories.includes(category.id)}
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
                    defaultValue={priceRange}
                    max={5000}
                    step={50}
                    value={priceRange}
                    onValueChange={handlePriceChange}
                  />
                  <div className="flex justify-between">
                    <span className="text-sm">€{priceRange[0]}</span>
                    <span className="text-sm">€{priceRange[1]}</span>
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
                        checked={selectedLevels.includes(level.id)}
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

          <Button className="w-full">Aplicar Filtros</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default GigFilters
