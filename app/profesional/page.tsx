"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Star, MapPin, Search, SlidersHorizontal, Loader2 } from "lucide-react"
import { obtenerProfesionales } from "@/app/actions/profiles"

const categories = ["Todas", "Albañilería", "Fontanería", "Electricidad", "Pintura", "Carpintería", "Climatización"]

const locations = ["Todas", "Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao", "Málaga"]

export default function ProfesionalesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("Todas")
  const [selectedLocation, setSelectedLocation] = useState("Todas")
  const [minRating, setMinRating] = useState("0")
  const [showFilters, setShowFilters] = useState(false)
  const [professionals, setProfessionals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargarProfesionales() {
      setLoading(true)
      const result = await obtenerProfesionales({
        categoria: selectedCategory !== "Todas" ? selectedCategory : undefined,
        ubicacion: selectedLocation !== "Todas" ? selectedLocation : undefined,
        rating_min: Number.parseFloat(minRating) || undefined,
      })
      if (result.data) {
        setProfessionals(result.data)
      }
      setLoading(false)
    }
    cargarProfesionales()
  }, [selectedCategory, selectedLocation, minRating])

  const filteredProfessionals = useMemo(() => {
    return professionals.filter((prof) => {
      const matchesSearch =
        searchQuery === "" ||
        prof.perfil?.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prof.titulo?.toLowerCase().includes(searchQuery.toLowerCase())

      return matchesSearch
    })
  }, [searchQuery, professionals])

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">Perfiles Profesionales</h1>
          <p className="text-muted-foreground mb-8">
            Encuentra profesionales verificados filtrando por categoría, ubicación y valoración.
          </p>

          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nombre o especialidad..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Filtros
                  </Button>
                </div>

                {showFilters && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="category">Categoría</Label>
                      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger id="category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Ubicación</Label>
                      <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                        <SelectTrigger id="location">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
                            <SelectItem key={loc} value={loc}>
                              {loc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rating">Valoración Mínima</Label>
                      <Select value={minRating} onValueChange={setMinRating}>
                        <SelectTrigger id="rating">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Todas</SelectItem>
                          <SelectItem value="4.5">4.5+ ⭐</SelectItem>
                          <SelectItem value="4.7">4.7+ ⭐⭐</SelectItem>
                          <SelectItem value="4.9">4.9+ ⭐⭐⭐</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {filteredProfessionals.length}{" "}
                {filteredProfessionals.length === 1 ? "profesional encontrado" : "profesionales encontrados"}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredProfessionals.map((professional) => (
                  <Link key={professional.id} href={`/profesional/${professional.id}`}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardHeader>
                        <div className="flex items-start gap-4">
                          <Avatar className="h-16 w-16">
                            <AvatarImage src={professional.perfil?.foto_perfil || "/placeholder.svg"} />
                            <AvatarFallback>{professional.perfil?.nombre?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <CardTitle className="text-xl mb-1">
                              {professional.perfil?.nombre} {professional.perfil?.apellido}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mb-2">{professional.titulo}</p>
                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                                <span className="font-semibold">
                                  {professional.rating_promedio?.toFixed(1) || "N/A"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="h-4 w-4" />
                                <span>{professional.perfil?.ubicacion}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Button variant="outline" className="w-full bg-transparent">
                          Ver Perfil Completo
                        </Button>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>

              {filteredProfessionals.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    No se encontraron profesionales con los filtros seleccionados.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4 bg-transparent"
                    onClick={() => {
                      setSearchQuery("")
                      setSelectedCategory("Todas")
                      setSelectedLocation("Todas")
                      setMinRating("0")
                    }}
                  >
                    Limpiar Filtros
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
