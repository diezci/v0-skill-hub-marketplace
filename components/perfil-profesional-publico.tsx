"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  MapPin,
  Star,
  BadgeCheck,
  Clock,
  Briefcase,
  MessageSquare,
  Phone,
  Languages,
  Award,
  Euro,
  Loader2,
} from "lucide-react"
import { crearConversacion } from "@/app/actions/messages"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface PerfilPublicoProps {
  perfil: any
  // Pestaña abierta al cargar (p. ej. "valoraciones" cuando se llega desde "Valorar").
  tabInicial?: "sobre" | "portfolio" | "valoraciones"
}

export default function PerfilProfesionalPublico({ perfil, tabInicial = "sobre" }: PerfilPublicoProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [contactando, setContactando] = useState(false)
  const nombreCompleto = `${perfil.nombre || ""} ${perfil.apellido || ""}`.trim() || "Profesional"

  const handleEnviarMensaje = async () => {
    setContactando(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }
      if (user.id === perfil.id) {
        toast({ title: "Es tu propio perfil", description: "No puedes enviarte un mensaje a ti mismo." })
        return
      }
      const result = await crearConversacion({ otroUsuarioId: perfil.id })
      if (result.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      } else {
        router.push(result.data?.id ? `/mensajes?c=${result.data.id}` : "/mensajes")
      }
    } catch (e) {
      toast({ title: "Error", description: "No se pudo abrir el chat.", variant: "destructive" })
    } finally {
      setContactando(false)
    }
  }

  const handleLlamar = () => {
    if (!perfil.telefono) {
      toast({ title: "Sin teléfono", description: "Este profesional no ha publicado un teléfono de contacto." })
      return
    }
    window.location.href = `tel:${String(perfil.telefono).replace(/\s+/g, "")}`
  }
  const habilidades: string[] = Array.isArray(perfil.habilidades) ? perfil.habilidades : []
  const certificaciones: string[] = Array.isArray(perfil.certificaciones) ? perfil.certificaciones : []
  const idiomas: string[] = Array.isArray(perfil.idiomas) ? perfil.idiomas : []
  const reviews: any[] = Array.isArray(perfil.reviews) ? perfil.reviews : []
  const portfolio: any[] = Array.isArray(perfil.portfolio) ? perfil.portfolio : []

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Cabecera */}
      <Card className="overflow-hidden">
        <div className="h-32 sm:h-44 bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 relative">
          {perfil.foto_portada && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={perfil.foto_portada} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <CardContent className="pt-0">
          <div className="flex flex-col sm:flex-row gap-4 -mt-12 sm:-mt-14">
            <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-4 border-background shadow-lg">
              <AvatarImage src={perfil.foto_perfil || "/placeholder.svg"} />
              <AvatarFallback className="text-2xl">{perfil.nombre?.[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 sm:pt-14">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{nombreCompleto}</h1>
                {perfil.verificado && (
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verificado
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">{perfil.titulo || "Profesional"}</p>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
                {perfil.ubicacion && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {perfil.ubicacion}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                  <span className="font-semibold text-foreground">{Number(perfil.rating || 0).toFixed(1)}</span>
                  ({reviews.length} valoraciones)
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Responde en {perfil.tiempo_respuesta || "24 horas"}
                </span>
                <Badge variant="outline" className={perfil.disponibilidad === "Disponible" ? "text-emerald-600 border-emerald-500/40" : ""}>
                  {perfil.disponibilidad}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <Button className="flex-1 sm:flex-none" onClick={handleEnviarMensaje} disabled={contactando}>
              {contactando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-2" />}
              Enviar mensaje
            </Button>
            <Button variant="outline" className="flex-1 sm:flex-none bg-transparent" onClick={handleLlamar}>
              <Phone className="h-4 w-4 mr-2" /> Contactar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 text-center">
            <Euro className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold">{perfil.tarifa_hora || "—"}{perfil.tarifa_hora ? "€/h" : ""}</p>
            <p className="text-xs text-muted-foreground">Tarifa</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 text-center">
            <Briefcase className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xl font-bold">{perfil.anos_experiencia || perfil["años_experiencia"] || 0}</p>
            <p className="text-xs text-muted-foreground">Años exp.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 text-center">
            <Star className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <p className="text-xl font-bold">{Number(perfil.rating || 0).toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Valoración</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={tabInicial} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sobre">Sobre mí</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="valoraciones">Valoraciones ({reviews.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sobre" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {perfil.bio && (
                <div>
                  <h3 className="font-semibold mb-2">Descripción</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{perfil.bio}</p>
                </div>
              )}

              {habilidades.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Habilidades</h3>
                  <div className="flex flex-wrap gap-2">
                    {habilidades.map((h, i) => (
                      <Badge key={i} variant="secondary">{h}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {certificaciones.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Award className="h-4 w-4" /> Certificaciones
                  </h3>
                  <ul className="space-y-1">
                    {certificaciones.map((c, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                        <BadgeCheck className="h-4 w-4 text-emerald-500" /> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {idiomas.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Languages className="h-4 w-4" /> Idiomas
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {idiomas.map((l, i) => (
                      <Badge key={i} variant="outline">{l}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio">
          <Card>
            <CardContent className="pt-6">
              {portfolio.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Este profesional aún no ha añadido trabajos a su portfolio.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {portfolio.map((p) => (
                    <div key={p.id} className="rounded-lg border overflow-hidden">
                      {p.imagen && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagen} alt={p.titulo} className="h-40 w-full object-cover" />
                      )}
                      <div className="p-3">
                        <p className="font-medium text-sm">{p.titulo}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{p.descripcion}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="valoraciones" className="space-y-4">
          {reviews.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-sm text-muted-foreground py-8">
                Todavía no hay valoraciones.
              </CardContent>
            </Card>
          ) : (
            reviews.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={r.avatar || "/placeholder.svg"} />
                        <AvatarFallback>{r.cliente?.[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{r.cliente}</p>
                        <p className="text-xs text-muted-foreground">{r.proyecto} · {r.fecha}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-3.5 w-3.5 ${s <= r.rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground"}`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">{r.texto}</p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Separator />
      <p className="text-center text-xs text-muted-foreground">
        Contrata a {nombreCompleto} de forma segura con pagos protegidos por Diime.
      </p>
    </div>
  )
}
