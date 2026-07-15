"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { obtenerProfesionales } from "@/app/actions/profiles"
import { crearConversacion } from "@/app/actions/messages"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Star, Grid3X3, List, MapPin, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import type { ProfesionalesFiltros } from "@/components/profesionales-content"
import { CATEGORIAS_SERVICIO } from "@/lib/categorias"


// Coincidencia difusa categoría↔profesional (mismo criterio que las
// invitaciones): substring en cualquier dirección o raíz de 5 letras.
function normalizarCat(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
}
function coincideCategoria(categoriaLabel: string, titulo: string, habilidades: string[]): boolean {
  const cat = normalizarCat(categoriaLabel)
  if (!cat) return false
  const raiz = cat.slice(0, Math.min(5, cat.length))
  const textos = [titulo || "", ...(habilidades || [])].map(normalizarCat).filter(Boolean)
  return textos.some((t) => t.includes(cat) || cat.includes(t) || t.includes(raiz))
}

const CATEGORIA_ID_TO_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS_SERVICIO.map((c) => [c.id, c.label]),
)

const NIVEL_ID_TOKENS: Record<string, string[]> = {
  any: [],
  certificado: ["certificado", "colegiado"],
  experto: ["experto", "verificado", "especialista"],
  maestro: ["maestro"],
}

interface GigListingProps {
  filtros?: ProfesionalesFiltros
}

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1504307651254-35680f356dfd?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80"

const GigListing = ({ filtros }: GigListingProps) => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState("recommended")
  const [realGigs, setRealGigs] = useState<any[]>([])
  const [enviando, setEnviando] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  // Escribir directamente a un profesional real desde la tarjeta.
  const handleMensaje = async (e: React.MouseEvent, profesionalId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setEnviando(profesionalId)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        toast({ title: "Inicia sesión", description: "Necesitas una cuenta para escribir a un profesional." })
        router.push("/auth/login")
        return
      }
      if (user.id === profesionalId) {
        toast({ title: "Eres tú", description: "No puedes escribirte a ti mismo." })
        return
      }
      const res = await crearConversacion({ otroUsuarioId: profesionalId })
      if (res.error || !res.data?.id) {
        toast({ title: "Error", description: res.error || "No se pudo abrir el chat.", variant: "destructive" })
        return
      }
      router.push(`/mensajes?c=${res.data.id}`)
    } finally {
      setEnviando(null)
    }
  }

  useEffect(() => {
    async function cargar() {
      const result = await obtenerProfesionales()
      if (!result.data) return
      const mapped = result.data.map((p: any) => {
        const nombre = `${p.perfil?.nombre || ""} ${p.perfil?.apellido || ""}`.trim() || "Profesional"
        const habilidades = Array.isArray(p.habilidades) ? p.habilidades : []
        return {
          id: p.id,
          title: p.titulo || nombre,
          description: p.perfil?.bio || p.titulo || "Profesional verificado en Diime",
          price: Number(p.tarifa_por_hora) || 0,
          category: habilidades[0] || "",
          habilidades,
          provincia: p.perfil?.ubicacion || "",
          image: p.perfil?.foto_perfil || FALLBACK_IMG,
          rating: Number(p.rating_promedio) || 0,
          reviews: p.total_reseñas || 0,
          esReal: true,
          freelancer: {
            name: nombre,
            avatar: p.perfil?.foto_perfil || "",
            level: p.nivel || "Profesional",
          },
        }
      })
      setRealGigs(mapped as any)
    }
    cargar()
  }, [])

  // Solo profesionales reales de la base de datos: sin tarjetas de ejemplo.
  const todos = realGigs

  const filtered = useMemo(() => {
    if (!filtros) return todos
    let list = todos.filter((g) => {
      // Provincia
      if (filtros.provincia && g.provincia.toLowerCase() !== filtros.provincia.toLowerCase()) {
        return false
      }
      // Categorías: coincidencia difusa contra título + habilidades del
      // profesional (los skills son texto libre; comparar por etiqueta exacta
      // hacía desaparecer perfiles que sí encajaban).
      if (filtros.categorias.length > 0) {
        const categoriaLabels = filtros.categorias.map((id) => CATEGORIA_ID_TO_LABEL[id] || id)
        if (!categoriaLabels.some((label) => coincideCategoria(label, g.title, g.habilidades))) return false
      }
      // Niveles
      if (filtros.niveles.length > 0 && !filtros.niveles.includes("any")) {
        const levelLower = g.freelancer.level.toLowerCase()
        const matches = filtros.niveles.some((id) =>
          NIVEL_ID_TOKENS[id]?.some((tok) => levelLower.includes(tok)),
        )
        if (!matches) return false
      }
      // Precio
      if (g.price < filtros.precioMin || g.price > filtros.precioMax) return false
      // Búsqueda
      if (filtros.search) {
        const q = filtros.search.toLowerCase()
        const haystack = `${g.title} ${g.description} ${g.category} ${g.provincia} ${g.freelancer.name}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    switch (sortBy) {
      case "price-low":
        list = [...list].sort((a, b) => a.price - b.price)
        break
      case "price-high":
        list = [...list].sort((a, b) => b.price - a.price)
        break
      case "rating":
        list = [...list].sort((a, b) => b.rating - a.rating)
        break
      case "newest":
        list = [...list].sort((a, b) => String(b.id).localeCompare(String(a.id)))
        break
    }
    return list
  }, [filtros, sortBy, todos])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-muted-foreground">
            Mostrando <span className="font-medium">{filtered.length}</span> resultados
            {filtros?.provincia && (
              <>
                {" "}
                en{" "}
                <span className="font-medium text-foreground inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                  {filtros.provincia}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recommended">Recomendados</SelectItem>
              <SelectItem value="price-low">Precio: Menor a Mayor</SelectItem>
              <SelectItem value="price-high">Precio: Mayor a Menor</SelectItem>
              <SelectItem value="rating">Mejor Valorados</SelectItem>
              <SelectItem value="newest">Más Recientes</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border rounded-md">
            <Button
              variant="ghost"
              size="icon"
              className={cn("rounded-none", viewMode === "grid" && "bg-muted")}
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
              <span className="sr-only">Vista de cuadrícula</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("rounded-none", viewMode === "list" && "bg-muted")}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
              <span className="sr-only">Vista de lista</span>
            </Button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground mb-1">No se encontraron profesionales</p>
            <p className="text-sm">Prueba a cambiar los filtros o seleccionar otra provincia.</p>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((gig) => (
            <Link key={gig.id} href={`/profesional/${gig.id}`}>
              <Card className="h-full overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-1 cursor-pointer">
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={gig.image || "/placeholder.svg"}
                    alt={gig.title}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                  <Badge className="absolute top-2 right-2">{gig.category}</Badge>
                </div>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2 mb-4">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={gig.freelancer.avatar || "/placeholder.svg"} />
                      <AvatarFallback>{gig.freelancer.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{gig.freelancer.name}</p>
                      <p className="text-xs text-muted-foreground">{gig.freelancer.level}</p>
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{gig.title}</h3>
                  <p className="text-muted-foreground mb-3 line-clamp-2">{gig.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1 text-amber-500">
                      <Star className="h-4 w-4 fill-current" />
                      <span className="font-medium">{gig.rating}</span>
                      <span className="text-muted-foreground text-sm">({gig.reviews})</span>
                    </div>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {gig.provincia}
                    </span>
                  </div>
                </CardContent>
                <CardFooter className="p-6 pt-0 border-t flex justify-between items-center gap-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Desde</p>
                    <p className="text-xl font-bold">€{gig.price}</p>
                  </div>
                  {(gig as any).esReal && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-transparent"
                      disabled={enviando === String(gig.id)}
                      onClick={(e) => handleMensaje(e, String(gig.id))}
                    >
                      <MessageSquare className="h-4 w-4 mr-1.5" />
                      Mensaje
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((gig) => (
            <Link key={gig.id} href={`/profesional/${gig.id}`}>
              <Card className="overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer">
                <div className="flex flex-col md:flex-row">
                  <div className="relative md:w-1/4 h-48 md:h-auto overflow-hidden">
                    <img
                      src={gig.image || "/placeholder.svg"}
                      alt={gig.title}
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                    <Badge className="absolute top-2 right-2">{gig.category}</Badge>
                  </div>
                  <div className="flex-1 p-6">
                    <div className="flex items-center space-x-2 mb-4">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={gig.freelancer.avatar || "/placeholder.svg"} />
                        <AvatarFallback>{gig.freelancer.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{gig.freelancer.name}</p>
                        <p className="text-xs text-muted-foreground">{gig.freelancer.level}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-3">
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {gig.provincia}
                        </span>
                        <div className="flex items-center space-x-1 text-amber-500">
                          <Star className="h-4 w-4 fill-current" />
                          <span className="font-medium">{gig.rating}</span>
                          <span className="text-muted-foreground text-sm">({gig.reviews})</span>
                        </div>
                      </div>
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{gig.title}</h3>
                    <p className="text-muted-foreground mb-4">{gig.description}</p>
                    <div className="flex justify-between items-center mt-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Desde</p>
                        <p className="text-xl font-bold">€{gig.price}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {(gig as any).esReal && (
                          <Button
                            variant="outline"
                            className="bg-transparent"
                            disabled={enviando === String(gig.id)}
                            onClick={(e) => handleMensaje(e, String(gig.id))}
                          >
                            <MessageSquare className="h-4 w-4 mr-1.5" />
                            Mensaje
                          </Button>
                        )}
                        <Button>Ver Detalles</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default GigListing
