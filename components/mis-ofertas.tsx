"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatearPrecioEuros } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Clock, CheckCircle2, XCircle, MessageSquare, MapPin, Calendar, Phone, FileText, Loader2, Pencil, Trash2, Check } from "lucide-react"
import { obtenerOfertasPorProfesional, actualizarOferta, eliminarOferta } from "@/app/actions/ofertas"
import { crearConversacion } from "@/app/actions/messages"
import { useToast } from "@/hooks/use-toast"

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
  const [editOferta, setEditOferta] = useState<any>(null)
  const [editForm, setEditForm] = useState({ precio: "", tiempo_estimado: "", unidad_tiempo: "dias", descripcion: "" })
  const [deleteOferta, setDeleteOferta] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

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

  useEffect(() => {
    cargarOfertas()
  }, [])

  const esReal = (oferta: any) => !String(oferta.id).startsWith("oferta-mock")

  const abrirEditar = (oferta: any) => {
    setEditForm({
      precio: oferta.precio?.toString() || "",
      tiempo_estimado: oferta.tiempo_estimado?.toString() || "",
      unidad_tiempo: oferta.unidad_tiempo || "dias",
      descripcion: oferta.descripcion || "",
    })
    setEditOferta(oferta)
  }

  const handleGuardarEdicion = async () => {
    if (!editOferta) return
    setActionLoading(true)
    const result = await actualizarOferta(editOferta.id, {
      precio: editForm.precio ? Number.parseFloat(editForm.precio) : undefined,
      tiempo_estimado: editForm.tiempo_estimado ? Number.parseInt(editForm.tiempo_estimado, 10) : undefined,
      unidad_tiempo: editForm.unidad_tiempo,
      descripcion: editForm.descripcion,
    })
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Oferta actualizada", description: "Los cambios se han guardado." })
      setEditOferta(null)
      await cargarOfertas()
    }
    setActionLoading(false)
  }

  const handleEliminar = async () => {
    if (!deleteOferta) return
    setActionLoading(true)
    const result = await eliminarOferta(deleteOferta.id)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Oferta eliminada", description: "Tu oferta se ha retirado." })
      setDeleteOferta(null)
      await cargarOfertas()
    }
    setActionLoading(false)
  }

  const handleContactarCliente = async (clienteId?: string, solicitudId?: string) => {
    if (!clienteId) {
      toast({ title: "No disponible", description: "No se pudo identificar al cliente.", variant: "destructive" })
      return
    }
    const result = await crearConversacion({ otroUsuarioId: clienteId, solicitudId })
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      router.push("/mensajes")
    }
  }

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
                            <div className="text-2xl font-bold text-primary">{formatearPrecioEuros(oferta.precio)}</div>
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

                        <div className="flex flex-wrap gap-2 pt-2">
                          {oferta.estado !== "rechazada" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 bg-transparent"
                              onClick={() => handleContactarCliente(oferta.solicitud?.cliente_id, oferta.solicitud?.id)}
                            >
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Contactar Cliente
                            </Button>
                          )}

                          {oferta.estado !== "aceptada" && oferta.estado !== "rechazada" && esReal(oferta) && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 bg-transparent"
                                onClick={() => abrirEditar(oferta)}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Editar oferta
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10"
                                onClick={() => setDeleteOferta(oferta)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Eliminar
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

      {/* Editar oferta */}
      <Dialog open={!!editOferta} onOpenChange={(o) => !o && setEditOferta(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar oferta</DialogTitle>
            <DialogDescription>Puedes modificar tu oferta mientras no haya sido aceptada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Precio (€)</label>
                <Input
                  type="number"
                  value={editForm.precio}
                  onChange={(e) => setEditForm({ ...editForm, precio: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tiempo estimado</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    className="w-20"
                    value={editForm.tiempo_estimado}
                    onChange={(e) => setEditForm({ ...editForm, tiempo_estimado: e.target.value })}
                  />
                  <select
                    className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={editForm.unidad_tiempo}
                    onChange={(e) => setEditForm({ ...editForm, unidad_tiempo: e.target.value })}
                  >
                    <option value="horas">Horas</option>
                    <option value="dias">Días</option>
                    <option value="semanas">Semanas</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descripción</label>
              <Textarea
                rows={4}
                value={editForm.descripcion}
                onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="bg-transparent" onClick={() => setEditOferta(null)}>
              Cancelar
            </Button>
            <Button onClick={handleGuardarEdicion} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      <AlertDialog open={!!deleteOferta} onOpenChange={(o) => !o && setDeleteOferta(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta oferta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se retirará tu oferta de "{deleteOferta?.solicitud?.titulo}". Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleEliminar()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
