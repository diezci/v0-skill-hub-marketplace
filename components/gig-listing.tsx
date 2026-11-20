"use client"

import TarjetaEmpresa from "@/components/empresas/tarjeta-empresa"
import type { EmpresaPublica } from "@/lib/empresas/types"
import { useIdioma } from "@/components/idioma-provider"


import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { obtenerProfesionales } from "@/app/actions/profiles"
import { crearConversacion } from "@/app/actions/messages"
import { Card, CardContent } from "@/components/ui/card"
import { PieTarjetaDirectorio } from "@/components/pie-tarjeta-directorio"
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
import { PRECIO_HORA_MAX } from "@/lib/precios"


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

interface GigListingProps {
  filtros?: ProfesionalesFiltros
  empresas?: EmpresaPublica[]
}

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1504307651254-35680f356dfd?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80"

const GigListing = ({ filtros, empresas = [] }: GigListingProps) => {
  const { t, idioma } = useIdioma()
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
        toast({ title: t("Inicia sesión"), description: t("Necesitas una cuenta para escribir a un profesional.") })
        router.push("/auth/login")
        return
      }
      if (user.id === profesionalId) {
        toast({ title: t("Eres tú"), description: t("No puedes escribirte a ti mismo.") })
        return
      }
      const res = await crearConversacion({ otroUsuarioId: profesionalId })
      if (res.error || !res.data?.id) {
        toast({ title: "Error", description: t(res.error || "No se pudo abrir el chat."), variant: "destructive" })
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
        const categoriasInteres = Array.isArray(p.categorias_interes) ? p.categorias_interes : []
        return {
          id: p.id,
          title: p.titulo || nombre,
          description: p.perfil?.bio || p.titulo || "",
          price: Number(p.tarifa_por_hora) || 0,
          // La etiqueta de la tarjeta representa un servicio seleccionado de la
          // taxonomía, no una habilidad de texto libre.
          category: categoriasInteres[0] || "",
          habilidades,
          provincia: p.perfil?.ubicacion || "",
          // La imagen grande de la tarjeta es la portada; el avatar pequeño es
          // la foto de perfil. Antes ambas usaban foto_perfil, así que salían
          // duplicadas.
          image: p.perfil?.foto_portada || p.perfil?.foto_perfil || FALLBACK_IMG,
          rating: Number(p.rating_promedio) || 0,
          reviews: p.total_reseñas || 0,
          esReal: true,
          freelancer: {
            name: nombre,
            avatar: p.perfil?.foto_perfil || "",
            level: p.perfil?.verificado ? "Verificado por Diime" : "Profesional",
          },
        }
      })
      setRealGigs(mapped as any)
    }
    cargar()
  }, [])

  // Solo profesionales reales de la base de datos: sin tarjetas de ejemplo.
  const todos = useMemo(() => [...realGigs, ...empresas.map((datos) => ({
    id: `empresa-${datos.empresa.id}`, empresa: datos, title: datos.empresa.nombre,
    description: datos.empresa.descripcion, price: null, category: "Empresa",
    habilidades: datos.empresa.servicios, provincia: datos.empresa.ubicacion, provincias: datos.empresa.provincias || [],
    rating: datos.ratingPromedio ?? (datos.resenas.length ? datos.resenas.reduce((s, r) => s + r.puntuacion, 0) / datos.resenas.length : 0),
    freelancer: { name: datos.empresa.nombre },
  }))], [realGigs, empresas])

  const filtered = useMemo(() => {
    if (!filtros) return todos
    let list = todos.filter((g) => {
      // Provincia
      const provincias = "provincias" in g && g.provincias?.length ? g.provincias : [g.provincia]
      if (filtros.provincia && !provincias.some((provincia: string) => provincia.toLowerCase() === filtros.provincia.toLowerCase())) {
        return false
      }
      // Categorías: coincidencia difusa contra título + habilidades del
      // profesional (los skills son texto libre; comparar por etiqueta exacta
      // hacía desaparecer perfiles que sí encajaban).
      if (filtros.categorias.length > 0) {
        const categoriaLabels = filtros.categorias.map((id) => CATEGORIA_ID_TO_LABEL[id] || id)
        if (!categoriaLabels.some((label) => coincideCategoria(label, g.title, g.habilidades))) return false
      }
      // Precio (€/h). El tope del slider se muestra como "1.000€+", así que
      // ahí significa "sin límite": si no, un profesional con una tarifa por
      // encima del tope desaparecería del listado aun con el filtro al máximo.
      // Companies quote per project; do not invent an hourly rate.
      if (g.price === null && (filtros.precioMin > 0 || filtros.precioMax < PRECIO_HORA_MAX)) return false
      if (g.price !== null && g.price < filtros.precioMin) return false
      if (g.price !== null && filtros.precioMax < PRECIO_HORA_MAX && g.price > filtros.precioMax) return false
      // Búsqueda
      if (filtros.search) {
        const q = filtros.search.toLowerCase()
        const haystack = `${g.title} ${g.description} ${g.category} ${t(g.category)} ${g.habilidades.map((habilidad: string) => t(habilidad)).join(" ")} ${g.provincia} ${g.freelancer.name}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    switch (sortBy) {
      case "price-low":
        list = [...list].sort((a, b) => a.price === null ? 1 : b.price === null ? -1 : a.price - b.price)
        break
      case "price-high":
        list = [...list].sort((a, b) => a.price === null ? 1 : b.price === null ? -1 : b.price - a.price)
        break
      case "rating":
        list = [...list].sort((a, b) => b.rating - a.rating)
        break
      case "newest":
        list = [...list].sort((a, b) => String(b.id).localeCompare(String(a.id)))
        break
    }
    return list
  }, [filtros, sortBy, todos, t])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-muted-foreground">
             {t("Mostrando")} <span className="font-medium">{filtered.length}</span>  {t("resultados")} {filtros?.provincia && (
              <>
                {" "}
                 {t("en")}{" "}
                <span className="font-medium text-foreground inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                  {filtros.provincia}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("Ordenar por")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recommended">{t("Recomendados")}</SelectItem>
              <SelectItem value="price-low">{t("Precio: Menor a Mayor")}</SelectItem>
              <SelectItem value="price-high">{t("Precio: Mayor a Menor")}</SelectItem>
              <SelectItem value="rating">{t("Mejor Valorados")}</SelectItem>
              <SelectItem value="newest">{t("Más Recientes")}</SelectItem>
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
              <span className="sr-only">{t("Vista de cuadrícula")}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("rounded-none", viewMode === "list" && "bg-muted")}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
              <span className="sr-only">{t("Vista de lista")}</span>
            </Button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground mb-1">{t("No se encontraron profesionales")}</p>
            <p className="text-sm">{t("Prueba a cambiar los filtros o seleccionar otra provincia.")}</p>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((gig) => gig.empresa ? <TarjetaEmpresa key={gig.id} datos={gig.empresa} /> : (
            <Link key={gig.id} href={`/profesional/${gig.id}`} className="block min-w-0">
              <Card className="@container h-full min-w-0 gap-0 py-0 overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-1 cursor-pointer">
                <div className="relative h-48 shrink-0 overflow-hidden">
                  <img
                    src={gig.image || "/placeholder.svg"}
                    alt={gig.title}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                  {gig.category && (
                    <Badge className="absolute top-2 right-2 max-w-[calc(100%-1rem)]" title={t(gig.category)}>
                      <span className="truncate">{t(gig.category)}</span>
                    </Badge>
                  )}
                </div>
                <CardContent className="flex min-w-0 flex-1 flex-col p-6">
                  <div className="flex min-w-0 items-center gap-2 mb-4">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={gig.freelancer.avatar || "/placeholder.svg"} />
                      <AvatarFallback>{gig.freelancer.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={gig.freelancer.name}>{gig.freelancer.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{t(gig.freelancer.level)}</p>
                    </div>
                  </div>
                  {/* Reservar dos líneas mantiene alineadas las secciones con cualquier longitud de texto. */}
                  <h3 className="min-h-14 line-clamp-2 break-words text-xl leading-7 font-semibold mb-2" title={gig.title}>{gig.title}</h3>
                  <p className="min-h-12 line-clamp-2 break-words text-muted-foreground leading-6 mb-3">{gig.description || t("Profesional en Diime")}</p>
                  <div className="mt-auto flex min-w-0 items-center justify-between gap-2">
                    <div className="flex shrink-0 items-center space-x-1 text-amber-500">
                      <Star className="h-4 w-4 shrink-0 fill-current" />
                      <span className="font-medium">{gig.rating}</span>
                      <span className="text-muted-foreground text-sm">({gig.reviews})</span>
                    </div>
                    <span className="min-w-0 text-xs text-muted-foreground inline-flex items-center gap-1" title={gig.provincia}>
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{gig.provincia}</span>
                    </span>
                  </div>
                </CardContent>
                <PieTarjetaDirectorio precio={
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Desde")}</p>
                    <p className="text-xl font-bold">€{gig.price}</p>
                  </div>
                }>
                  {(gig as any).esReal && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full bg-transparent"
                      disabled={enviando === String(gig.id)}
                      onClick={(e) => handleMensaje(e, String(gig.id))}
                    >
                      <MessageSquare className="h-4 w-4 mr-1.5" />
                       {t("Mensaje")} </Button>
                  )}
                </PieTarjetaDirectorio>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4">
          {filtered.map((gig) => gig.empresa ? <TarjetaEmpresa key={gig.id} datos={gig.empresa} /> : (
            <Card key={gig.id} className="@container relative min-w-0 gap-0 overflow-hidden py-0 transition-shadow duration-200 hover:shadow-md">
              <div className="flex min-w-0 flex-col @2xl:flex-row">
                <div className="relative h-48 shrink-0 overflow-hidden @2xl:h-auto @2xl:w-1/4">
                  <img
                    src={gig.image || "/placeholder.svg"}
                    alt={gig.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {gig.category && <Badge className="absolute top-2 right-2 max-w-[calc(100%-1rem)]" title={t(gig.category)}><span className="truncate">{t(gig.category)}</span></Badge>}
                </div>
                <div className="min-w-0 flex-1 p-6">
                  <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={gig.freelancer.avatar || "/placeholder.svg"} />
                      <AvatarFallback>{gig.freelancer.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={gig.freelancer.name}>{gig.freelancer.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{t(gig.freelancer.level)}</p>
                    </div>
                    <div className="flex min-w-0 basis-full items-center justify-between gap-3 @2xl:max-w-[50%] @2xl:basis-auto">
                      <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground" title={gig.provincia}>
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{gig.provincia}</span>
                      </span>
                      <div className="flex shrink-0 items-center space-x-1 text-amber-500">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="font-medium">{gig.rating}</span>
                        <span className="text-muted-foreground text-sm">({gig.reviews})</span>
                      </div>
                    </div>
                  </div>
                  <h3 className="mb-2 break-words text-xl font-semibold">{gig.title}</h3>
                  <p className="mb-4 break-words text-muted-foreground">{gig.description || t("Profesional en Diime")}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">{t("Desde")}</p>
                      <p className="text-xl font-bold">€{gig.price}</p>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {(gig as any).esReal && (
                        <Button
                          variant="outline"
                          className="relative z-10 bg-transparent"
                          disabled={enviando === String(gig.id)}
                          onClick={(e) => handleMensaje(e, String(gig.id))}
                        >
                          <MessageSquare className="h-4 w-4 mr-1.5" />
                           {t("Mensaje")} </Button>
                      )}
                      <Button asChild>
                        <Link href={`/profesional/${gig.id}`} className="after:absolute after:inset-0">{t("Ver Detalles")}</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default GigListing
