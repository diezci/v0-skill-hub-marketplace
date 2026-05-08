"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Search, MapPin, Star, ShieldCheck, Zap, Filter } from "lucide-react"

const categories = [
  { id: "albanileria", label: "Albanileria" },
  { id: "fontaneria", label: "Fontaneria" },
  { id: "electricidad", label: "Electricidad" },
  { id: "pintura", label: "Pintura" },
  { id: "carpinteria", label: "Carpinteria" },
  { id: "climatizacion", label: "Climatizacion" },
  { id: "jardineria", label: "Jardineria" },
  { id: "cerrajeria", label: "Cerrajeria" },
  { id: "arquitectura", label: "Arquitectura" },
]

const ratingOptions = [
  { id: "4.5", label: "4.5 o mas" },
  { id: "4.0", label: "4.0 o mas" },
  { id: "3.5", label: "3.5 o mas" },
  { id: "any", label: "Cualquier rating" },
]

const trustOptions = [
  { id: "verified", label: "Verificado", icon: ShieldCheck },
  { id: "top", label: "Top Rated", icon: Star },
  { id: "fast", label: "Respuesta rapida", icon: Zap },
]

const GigFilters = () => {
  const [priceRange, setPriceRange] = useState([0, 5000])
  const [search, setSearch] = useState("")
  const [location, setLocation] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedRating, setSelectedRating] = useState<string>("any")
  const [selectedTrust, setSelectedTrust] = useState<string[]>([])
  const [availableNow, setAvailableNow] = useState(false)

  const toggleArray = (id: string, arr: string[], setter: (v: string[]) => void) => {
    setter(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])
  }

  const handleReset = () => {
    setPriceRange([0, 5000])
    setSearch("")
    setLocation("")
    setSelectedCategories([])
    setSelectedRating("any")
    setSelectedTrust([])
    setAvailableNow(false)
  }

  const activeCount =
    selectedCategories.length +
    selectedTrust.length +
    (selectedRating !== "any" ? 1 : 0) +
    (availableNow ? 1 : 0) +
    (location ? 1 : 0) +
    (priceRange[0] > 0 || priceRange[1] < 5000 ? 1 : 0)

  return (
    <Card className="sticky top-24">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Filtros</h2>
            {activeCount > 0 && (
              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-semibold">
                {activeCount}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={activeCount === 0}>
            Limpiar
          </Button>
        </div>

        <div className="space-y-4">
          <InputGroup>
            <InputGroupAddon>
              <Search className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>

          <InputGroup>
            <InputGroupAddon>
              <MapPin className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Ciudad o codigo postal"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </InputGroup>

          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-amber-500" />
              <Label htmlFor="available-now" className="text-sm font-medium cursor-pointer">
                Disponible ahora
              </Label>
            </div>
            <Checkbox
              id="available-now"
              checked={availableNow}
              onCheckedChange={(checked) => setAvailableNow(!!checked)}
            />
          </div>

          <Accordion type="multiple" defaultValue={["category", "price", "rating", "trust"]} className="space-y-1">
            <AccordionItem value="category" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                Categoria
                {selectedCategories.length > 0 && (
                  <span className="ml-auto mr-2 text-xs bg-muted px-2 py-0.5 rounded-full">
                    {selectedCategories.length}
                  </span>
                )}
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-2">
                  {categories.map((category) => (
                    <div key={category.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`category-${category.id}`}
                        checked={selectedCategories.includes(category.id)}
                        onCheckedChange={() =>
                          toggleArray(category.id, selectedCategories, setSelectedCategories)
                        }
                      />
                      <Label htmlFor={`category-${category.id}`} className="text-sm cursor-pointer font-normal">
                        {category.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="price" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                Rango de precio
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 py-2">
                  <Slider
                    value={priceRange}
                    max={5000}
                    step={50}
                    onValueChange={(v) => setPriceRange(v)}
                  />
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium tabular-nums">{priceRange[0]}€</span>
                    <span className="text-xs text-muted-foreground">a</span>
                    <span className="text-sm font-medium tabular-nums">{priceRange[1]}€</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="rating" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                Valoracion minima
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-2">
                  {ratingOptions.map((opt) => (
                    <label
                      key={opt.id}
                      htmlFor={`rating-${opt.id}`}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        id={`rating-${opt.id}`}
                        name="rating"
                        value={opt.id}
                        checked={selectedRating === opt.id}
                        onChange={() => setSelectedRating(opt.id)}
                        className="size-4 accent-primary"
                      />
                      <span className="text-sm font-normal flex items-center gap-1">
                        {opt.id !== "any" && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="trust" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                Confianza
                {selectedTrust.length > 0 && (
                  <span className="ml-auto mr-2 text-xs bg-muted px-2 py-0.5 rounded-full">
                    {selectedTrust.length}
                  </span>
                )}
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-2">
                  {trustOptions.map((opt) => {
                    const Icon = opt.icon
                    return (
                      <div key={opt.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`trust-${opt.id}`}
                          checked={selectedTrust.includes(opt.id)}
                          onCheckedChange={() => toggleArray(opt.id, selectedTrust, setSelectedTrust)}
                        />
                        <Label
                          htmlFor={`trust-${opt.id}`}
                          className="text-sm cursor-pointer font-normal flex items-center gap-1.5"
                        >
                          <Icon className="size-3.5 text-muted-foreground" />
                          {opt.label}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Button className="w-full">Aplicar filtros</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default GigFilters
