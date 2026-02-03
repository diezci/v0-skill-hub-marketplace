"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Clock, CheckCircle2, XCircle, Loader2, Calendar, MapPin, Euro, MessageSquare, FileText } from "lucide-react"
import { obtenerSolicitudesPorUsuario } from "@/app/actions/solicitudes"
import { crearTransaccionEscrow } from "@/app/actions/escrow"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type EstadoSolicitud = "pendiente" | "en-progreso" | "completado" | "rechazado"

const estadoConfig: Record<
  EstadoSolicitud,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }
> = {
  pendiente: {
    label: "Pendiente",
    variant: "secondary",
    icon: Clock,
  },
  "en-progreso": {
    label: "En Progreso",
    variant: "default",
    icon: Loader2,
  },
  completado: {
    label: "Completado",
    variant: "outline",
    icon: CheckCircle2,
  },
  rechazado: {
    label: "Rechazado",
    variant: "destructive",
    icon: XCircle,
  },
}

const MOCK_SOLICITUDES = [
  {
    id: "mock-1",
    titulo: "Reforma completa de baño",
    descripcion:
      "Necesito una reforma completa del baño principal incluyendo cambio de azulejos, sanitarios, plato de ducha y mampara. El baño tiene aproximadamente 6m².",
    categoria: { nombre: "Albañil" },
    ubicacion: "Madrid, España",
    presupuesto_min: 3000,
    presupuesto_max: 5000,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    urgencia: "media",
    estado: "pendiente",
    ofertas: [
      {
        id: "oferta-1",
        precio: 4200,
        tiempo_estimado: 15,
        unidad_tiempo: "días",
        descripcion:
          "Reforma completa con materiales de primera calidad. Incluye desmontaje, obra, fontanería y acabados.",
        estado: "pendiente",
      },
      {
        id: "oferta-2",
        precio: 3800,
        tiempo_estimado: 12,
        unidad_tiempo: "días",
        descripcion: "Oferta competitiva con 10 años de experiencia en reformas integrales.",
        estado: "pendiente",
      },
    ],
  },
  {
    id: "mock-2",
    titulo: "Instalación de aire acondicionado",
    descripcion:
      "Necesito instalar 3 splits de aire acondicionado en mi vivienda: salón, dormitorio principal y dormitorio secundario.",
    categoria: { nombre: "Instalador" },
    ubicacion: "Barcelona, España",
    presupuesto_min: 2000,
    presupuesto_max: 3500,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    urgencia: "alta",
    estado: "en-progreso",
    ofertas: [
      {
        id: "oferta-3",
        precio: 2800,
        tiempo_estimado: 2,
        unidad_tiempo: "días",
        descripcion: "Instalación profesional con equipos Mitsubishi. Garantía de 3 años.",
        estado: "aceptada",
      },
    ],
  },
  {
    id: "mock-3",
    titulo: "Pintura interior vivienda",
    descripcion:
      "Pintar 90m² de vivienda incluyendo salón, 3 habitaciones, pasillo y techos. Las paredes están en buen estado.",
    categoria: { nombre: "Pintor" },
    ubicacion: "Valencia, España",
    presupuesto_min: 1500,
    presupuesto_max: 2500,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    urgencia: "baja",
    estado: "completado",
    ofertas: [],
  },
]

export default function MisSolicitudes() {
  const [filtroEstado, setFiltroEstado] = useState<EstadoSolicitud | "todas">("todas")
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState<any>(null)
  const { toast } = useToast()
  const router = useRouter()

  const handleAceptarOferta = async (oferta: any) => {
    const result = await crearTransaccionEscrow({
      oferta_id: oferta.id,
      monto: oferta.precio,
      descripcion: `Pago por: ${oferta.solicitud?.titulo || "servicio"}`,
    })

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Oferta aceptada",
        description: "Se ha creado la transacción escrow y el trabajo. Procede con el pago.",
      })
      setSolicitudSeleccionada(null)
      router.push("/escrow")
    }
  }

  useEffect(() => {
    async function cargarSolicitudes() {
      setLoading(true)
      const result = await obtenerSolicitudesPorUsuario()
      if (result.data && result.data.length > 0) {
        setSolicitudes(result.data)
      } else {
        setSolicitudes(MOCK_SOLICITUDES)
      }
      setLoading(false)
    }
    cargarSolicitudes()
  }, [])

  const solicitudesFiltradas =
    filtroEstado === "todas" ? solicitudes : solicitudes.filter((s) => s.estado === filtroEstado)

  const contadores = {
    todas: solicitudes.length,
    pendiente: solicitudes.filter((s) => s.estado === "pendiente").length,
    "en-progreso": solicitudes.filter((s) => s.estado === "en-progreso").length,
    completado: solicitudes.filter((s) => s.estado === "completado").length,
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
      <Card>
        <CardHeader>
          <CardTitle>Mis Solicitudes de Servicio</CardTitle>
          <CardDescription>Visualiza y gestiona todas tus solicitudes de servicio en un solo lugar</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="todas" className="space-y-6" onValueChange={(v) => setFiltroEstado(v as any)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="todas">
                Todas
                <Badge variant="secondary" className="ml-2">
                  {contadores.todas}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="pendiente">
                Pendientes
                <Badge variant="secondary" className="ml-2">
                  {contadores.pendiente}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="en-progreso">
                En Progreso
                <Badge variant="secondary" className="ml-2">
                  {contadores["en-progreso"]}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="completado">
                Completadas
                <Badge variant="secondary" className="ml-2">
                  {contadores.completado}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={filtroEstado} className="space-y-4">
              {solicitudesFiltradas.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center">
                      No tienes solicitudes{" "}
                      {filtroEstado !== "todas" &&
                        `en estado "${estadoConfig[filtroEstado as EstadoSolicitud]?.label}"`}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                solicitudesFiltradas.map((solicitud) => {
                  const config = estadoConfig[solicitud.estado as EstadoSolicitud]
                  const IconoEstado = config.icon

                  return (
                    <Card key={solicitud.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-start gap-3">
                              <div className="flex-1">
                                <CardTitle className="text-xl">{solicitud.titulo}</CardTitle>
                                <CardDescription className="mt-1">
                                  {solicitud.categoria?.nombre || "Categoría no especificada"}
                                </CardDescription>
                              </div>
                            </div>
                          </div>
                          <Badge variant={config.variant} className="gap-1.5 self-start">
                            <IconoEstado className="h-3.5 w-3.5" />
                            {config.label}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">{solicitud.descripcion}</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>Solicitado: {new Date(solicitud.created_at).toLocaleDateString("es-ES")}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{solicitud.ubicacion}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Euro className="h-4 w-4" />
                            <span className="font-semibold text-foreground">
                              {solicitud.presupuesto_min}€ - {solicitud.presupuesto_max}€
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span className="capitalize">{solicitud.urgencia}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2">
                          <Dialog
                            open={solicitudSeleccionada?.id === solicitud.id}
                            onOpenChange={(open) => {
                              if (!open) setSolicitudSeleccionada(null)
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="default"
                                size="sm"
                                className="gap-2"
                                onClick={() => setSolicitudSeleccionada(solicitud)}
                              >
                                <MessageSquare className="h-4 w-4" />
                                Ver Ofertas ({solicitud.ofertas?.length || 0})
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>Ofertas recibidas</DialogTitle>
                                <DialogDescription>
                                  Revisa las ofertas de profesionales para tu solicitud
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                {solicitud.ofertas && solicitud.ofertas.length > 0 ? (
                                  solicitud.ofertas.map((oferta: any) => (
                                    <Card key={oferta.id}>
                                      <CardContent className="pt-6">
                                        <div className="space-y-3">
                                          <div className="flex items-start justify-between">
                                            <div>
                                              <p className="font-semibold text-lg">{oferta.precio}€</p>
                                              <p className="text-sm text-muted-foreground">
                                                {oferta.tiempo_estimado} {oferta.unidad_tiempo}
                                              </p>
                                            </div>
                                            <Badge>{oferta.estado}</Badge>
                                          </div>
                                          <p className="text-sm">{oferta.descripcion}</p>
                                          {oferta.estado === "pendiente" && (
                                            <Button onClick={() => handleAceptarOferta(oferta)} className="w-full">
                                              Aceptar Oferta
                                            </Button>
                                          )}
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ))
                                ) : (
                                  <p className="text-center text-muted-foreground py-8">
                                    Aún no has recibido ofertas para esta solicitud
                                  </p>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>

                          {solicitud.estado === "completado" && (
                            <Button variant="outline" size="sm">
                              Dejar Valoración
                            </Button>
                          )}
                          {solicitud.estado === "pendiente" && (
                            <Button variant="outline" size="sm" className="text-destructive bg-transparent">
                              Cancelar Solicitud
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
