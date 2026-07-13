"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatearPrecioEuros } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import { Clock, MessageSquare, MapPin, Calendar, FileText, Loader2, Pencil, Trash2, Check } from "lucide-react"
import { obtenerOfertasPorProfesional, actualizarOferta, eliminarOferta } from "@/app/actions/ofertas"
import { crearConversacion } from "@/app/actions/messages"
import { useToast } from "@/hooks/use-toast"

// Aquí solo viven las ofertas pendientes de respuesta: las aceptadas se
// convierten en trabajos (Gestión de Proyectos) y las rechazadas/retiradas
// desaparecen de la lista.
const esPendiente = (oferta: any) => !["aceptada", "rechazada", "retirada"].includes(oferta.estado)

export default function MisOfertas() {
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
    setOfertas((result.data || []).filter(esPendiente))
    setLoading(false)
  }

  useEffect(() => {
    cargarOfertas()
  }, [])

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
      toast({ title: "Oferta actualizada", description: "Los cambios se han guardado y el cliente ha sido notificado." })
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
      toast({ title: "Oferta retirada", description: "Tu oferta se ha retirado." })
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
      router.push(result.data?.id ? `/mensajes?c=${result.data.id}` : "/mensajes")
    }
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
          <CardTitle>Ofertas pendientes de respuesta ({ofertas.length})</CardTitle>
          <CardDescription>
            Puedes editarlas o retirarlas mientras el cliente no las acepte. Las aceptadas pasan a Gestión de
            Proyectos como trabajos activos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ofertas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium text-foreground mb-1">No tienes ofertas pendientes</p>
              <p className="text-sm mb-4">Explora las demandas publicadas y envía tu oferta.</p>
              <Button onClick={() => router.push("/demandas")}>Ver demandas</Button>
            </div>
          ) : (
            ofertas.map((oferta) => (
              <Card key={oferta.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <CardTitle className="text-lg sm:text-xl">{oferta.solicitud?.titulo || "Servicio"}</CardTitle>
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Enviada
                        </Badge>
                      </div>
                      <CardDescription className="text-base">
                        {oferta.solicitud?.cliente?.nombre} {oferta.solicitud?.cliente?.apellido}
                      </CardDescription>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
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
                      <span>
                        {oferta.tiempo_estimado} {oferta.unidad_tiempo || "días"} estimados
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t">
                    <p className="text-sm font-medium mb-2">Descripción del Servicio:</p>
                    <p className="text-sm text-muted-foreground">{oferta.descripcion}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-transparent"
                      onClick={() => handleContactarCliente(oferta.solicitud?.cliente_id, oferta.solicitud?.id)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Contactar Cliente
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 bg-transparent" onClick={() => abrirEditar(oferta)}>
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
                      Retirar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* Editar oferta */}
      <Dialog open={!!editOferta} onOpenChange={(o) => !o && setEditOferta(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar oferta</DialogTitle>
            <DialogDescription>
              Puedes modificar tu oferta mientras no haya sido aceptada. El cliente recibirá una notificación.
            </DialogDescription>
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

      {/* Confirmar retirada */}
      <AlertDialog open={!!deleteOferta} onOpenChange={(o) => !o && setDeleteOferta(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar esta oferta?</AlertDialogTitle>
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
              Retirar oferta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
