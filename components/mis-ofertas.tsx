"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Clock, CheckCircle2, XCircle, MessageSquare, MapPin, Calendar, Phone, FileText, Loader2 } from "lucide-react"
import { obtenerOfertasPorProfesional } from "@/app/actions/ofertas"

type OfertaEstado = "enviada" | "aceptada" | "rechazada" | "en-negociacion"

const estadoConfig = {
  enviada: {
    label: "Enviada",
    icon: Clock,
    variant: "secondary" as const,
    color: "text-blue-600",
  },
  aceptada: {
    label: "Aceptada",
    icon: CheckCircle2,
    variant: "default" as const,
    color: "text-green-600",
  },
  rechazada: {
    label: "Rechazada",
    icon: XCircle,
    variant: "destructive" as const,
    color: "text-red-600",
  },
  "en-negociacion": {
    label: "En Negociación",
    icon: MessageSquare,
    variant: "outline" as const,
    color: "text-orange-600",
  },
}

const MOCK_OFERTAS = [
  {
    id: "oferta-mock-1",
    precio: 4200,
    tiempo_estimado: 15,
    descripcion:
      "Reforma completa con materiales de primera calidad. Incluyo desmontaje, obra nueva, fontanería completa y acabados profesionales.",
    estado: "enviada",
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    solicitud: {
      titulo: "Reforma completa de baño",
      ubicacion: "Madrid, España",
      cliente: { nombre: "María", apellido: "González" },
    },
  },
  {
    id: "oferta-mock-2",
    precio: 2800,
    tiempo_estimado: 2,
    descripcion:
      "Instalación profesional de 3 splits con equipos Mitsubishi de alta eficiencia. Incluye todo el material necesario y garantía de 3 años.",
    estado: "aceptada",
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    solicitud: {
      titulo: "Instalación de aire acondicionado",
      ubicacion: "Barcelona, España",
      cliente: { nombre: "Carlos", apellido: "Martínez" },
    },
    notas: "Cliente muy satisfecho, proyecto comenzado",
  },
  {
    id: "oferta-mock-3",
    precio: 1200,
    tiempo_estimado: 3,
    descripcion: "Reparación urgente de fuga en tubería principal con garantía de 2 años. Disponibilidad inmediata.",
    estado: "en-negociacion",
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    solicitud: {
      titulo: "Fuga urgente en cocina",
      ubicacion: "Valencia, España",
      cliente: { nombre: "Laura", apellido: "Sánchez" },
    },
  },
  {
    id: "oferta-mock-4",
    precio: 3500,
    tiempo_estimado: 10,
    descripcion: "Instalación de suelo laminado en 60m² con rodapié incluido.",
    estado: "rechazada",
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    solicitud: {
      titulo: "Instalación de suelo laminado",
      ubicacion: "Sevilla, España",
      cliente: { nombre: "Jorge", apellido: "Ruiz" },
    },
  },
]

export default function MisOfertas() {
  const [filtroEstado, setFiltroEstado] = useState<OfertaEstado | "todas">("todas")
  const [ofertas, setOfertas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargarOfertas() {
      setLoading(true)
      const result = await obtenerOfertasPorProfesional()
      if (result.data && result.data.length > 0) {
        setOfertas(result.data)
      } else {
        setOfertas(MOCK_OFERTAS)
      }
      setLoading(false)
    }
    cargarOfertas()
  }, [])

  const ofertasFiltradas = filtroEstado === "todas" ? ofertas : ofertas.filter((o) => o.estado === filtroEstado)

  const contadores = {
    todas: ofertas.length,
    enviada: ofertas.filter((o) => o.estado === "enviada").length,
    "en-negociacion": ofertas.filter((o) => o.estado === "en-negociacion").length,
    aceptada: ofertas.filter((o) => o.estado === "aceptada").length,
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Ofertas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contadores.todas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Enviadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{contadores.enviada}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">En Negociación</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{contadores["en-negociacion"]}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Aceptadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{contadores.aceptada}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mis Ofertas de Servicio</CardTitle>
          <CardDescription>Gestiona y da seguimiento a todas tus ofertas enviadas</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={filtroEstado} onValueChange={(v) => setFiltroEstado(v as OfertaEstado | "todas")}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="todas">Todas ({contadores.todas})</TabsTrigger>
              <TabsTrigger value="enviada">Enviadas ({contadores.enviada})</TabsTrigger>
              <TabsTrigger value="en-negociacion">En Negociación ({contadores["en-negociacion"]})</TabsTrigger>
              <TabsTrigger value="aceptada">Aceptadas ({contadores.aceptada})</TabsTrigger>
            </TabsList>

            <TabsContent value={filtroEstado} className="space-y-4 mt-6">
              {ofertasFiltradas.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay ofertas en esta categoría</p>
                </div>
              ) : (
                ofertasFiltradas.map((oferta) => {
                  const config = estadoConfig[oferta.estado as OfertaEstado]
                  const IconoEstado = config.icon

                  return (
                    <Card key={oferta.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CardTitle className="text-xl">{oferta.solicitud?.titulo || "Servicio"}</CardTitle>
                              <Badge variant={config.variant} className="gap-1">
                                <IconoEstado className="h-3 w-3" />
                                {config.label}
                              </Badge>
                            </div>
                            <CardDescription className="text-base">
                              {oferta.solicitud?.cliente?.nombre} {oferta.solicitud?.cliente?.apellido}
                            </CardDescription>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-primary">{oferta.precio}€</div>
                            <p className="text-sm text-muted-foreground">Precio ofertado</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>Enviada el {new Date(oferta.created_at).toLocaleDateString("es-ES")}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{oferta.solicitud?.ubicacion || "Ubicación no especificada"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{oferta.tiempo_estimado} días estimados</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t">
                          <p className="text-sm font-medium mb-2">Descripción del Servicio:</p>
                          <p className="text-sm text-muted-foreground">{oferta.descripcion}</p>
                        </div>

                        {oferta.notas && (
                          <div className="pt-3 border-t bg-muted/50 -mx-6 px-6 py-3">
                            <p className="text-sm font-medium mb-1">Notas:</p>
                            <p className="text-sm text-muted-foreground">{oferta.notas}</p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-2">
                          {oferta.estado === "enviada" && (
                            <>
                              <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Contactar Cliente
                              </Button>
                              <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                                Modificar Oferta
                              </Button>
                            </>
                          )}
                          {oferta.estado === "en-negociacion" && (
                            <>
                              <Button size="sm" className="flex-1">
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Continuar Negociación
                              </Button>
                              <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                                Actualizar Precio
                              </Button>
                            </>
                          )}
                          {oferta.estado === "aceptada" && (
                            <>
                              <Button size="sm" className="flex-1">
                                <Phone className="h-4 w-4 mr-2" />
                                Contactar Cliente
                              </Button>
                              <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                                Ver Detalles del Proyecto
                              </Button>
                            </>
                          )}
                          {oferta.estado === "rechazada" && (
                            <Button variant="outline" size="sm" className="flex-1 bg-transparent" disabled>
                              Oferta Rechazada
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
