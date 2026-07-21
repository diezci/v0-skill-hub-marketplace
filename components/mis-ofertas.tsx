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
import { Clock, MessageSquare, MapPin, Calendar, FileText, Loader2, Pencil, Trash2, Check, Paperclip, X, Eye } from "lucide-react"
import { obtenerOfertasPorProfesional, actualizarOferta, eliminarOferta } from "@/app/actions/ofertas"
import { crearConversacion } from "@/app/actions/messages"
import { uploadFile } from "@/lib/upload-helpers"
import { useToast } from "@/hooks/use-toast"
import { AdjuntosLista } from "@/components/adjuntos-lista"

// Aquí viven las pujas pendientes de respuesta y también las aceptadas cuyo
// pago el cliente aún no ha completado: hasta que se pague, el trabajo no
// existe de verdad y no aparece en Gestión de Proyectos. Las rechazadas se
// muestran aparte, en el apartado de pujas perdidas; las retiradas (las quitó
// el propio profesional) no se muestran.
const esPendiente = (oferta: any) => !["aceptada", "rechazada", "retirada"].includes(oferta.estado)
const esAceptadaSinPagar = (oferta: any) => oferta.estado === "aceptada" && oferta.trabajo?.estado === "pendiente_pago"
const esVisible = (oferta: any) => esPendiente(oferta) || esAceptadaSinPagar(oferta)
const esPerdida = (oferta: any) => oferta.estado === "rechazada"

export default function MisOfertas() {
  const [ofertas, setOfertas] = useState<any[]>([])
  const [perdidas, setPerdidas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editOferta, setEditOferta] = useState<any>(null)
  const [editForm, setEditForm] = useState({ precio: "", tiempo_estimado: "", unidad_tiempo: "dias", descripcion: "" })
  // Adjuntos en edición: URLs ya existentes + archivos nuevos por subir.
  const [editArchivos, setEditArchivos] = useState<string[]>([])
  const [editNuevos, setEditNuevos] = useState<File[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [deleteOferta, setDeleteOferta] = useState<any>(null)
  // Demanda cuya publicación completa se está consultando.
  const [verDemanda, setVerDemanda] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function cargarOfertas() {
    setLoading(true)
    const result = await obtenerOfertasPorProfesional()
    const todas = result.data || []
    setOfertas(todas.filter(esVisible))
    setPerdidas(todas.filter(esPerdida))
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
    setEditArchivos(Array.isArray(oferta.archivos) ? oferta.archivos : [])
    setEditNuevos([])
    setEditOferta(oferta)
  }

  const handleGuardarEdicion = async () => {
    if (!editOferta) return
    setActionLoading(true)
    // Subir los archivos nuevos y combinarlos con los que se conservan.
    let archivosFinales = [...editArchivos]
    if (editNuevos.length > 0) {
      setSubiendo(true)
      const subidas = await Promise.all(editNuevos.map((f) => uploadFile(f)))
      setSubiendo(false)
      // Si falla una subida no se guarda nada: guardar sin los adjuntos nuevos
      // los perdería sin avisar.
      if (subidas.some((r) => r === null)) {
        toast({
          title: "No se pudieron subir los archivos",
          description: "No se ha guardado ningún cambio. Inténtalo de nuevo o quita los adjuntos nuevos.",
          variant: "destructive",
        })
        setActionLoading(false)
        return
      }
      archivosFinales = [...archivosFinales, ...subidas.map((r) => r!.url)]
    }
    const result = await actualizarOferta(editOferta.id, {
      precio: editForm.precio ? Number.parseFloat(editForm.precio) : undefined,
      tiempo_estimado: editForm.tiempo_estimado ? Number.parseInt(editForm.tiempo_estimado, 10) : undefined,
      unidad_tiempo: editForm.unidad_tiempo,
      descripcion: editForm.descripcion,
      archivos: archivosFinales,
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
          <CardTitle>Pujas en curso ({ofertas.length})</CardTitle>
          <CardDescription>
            Puedes editarlas o retirarlas mientras el cliente no las acepte. Cuando una puja aceptada se pague,
            pasará a Gestión de Proyectos como trabajo activo; hasta entonces sigue aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ofertas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium text-foreground mb-1">No tienes pujas pendientes</p>
              <p className="text-sm mb-4">Explora las demandas publicadas y envía tu puja.</p>
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
                        {esAceptadaSinPagar(oferta) ? (
                          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/50 bg-amber-500/10">
                            <Clock className="h-3 w-3" />
                            Aceptada · esperando pago del cliente
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="h-3 w-3" />
                            Enviada
                          </Badge>
                        )}
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
                    {oferta.materiales_incluidos && (
                      <p className="text-sm text-muted-foreground mt-1.5">
                        <span className="font-medium text-foreground">Materiales:</span>{" "}
                        {oferta.materiales_incluidos === "si"
                          ? "incluidos"
                          : oferta.materiales_incluidos === "no"
                            ? "no incluidos"
                            : oferta.materiales_incluidos === "parcial"
                              ? "parcialmente incluidos"
                              : oferta.materiales_incluidos}
                      </p>
                    )}
                  </div>

                  {Array.isArray(oferta.archivos) && oferta.archivos.length > 0 && (
                    <div className="pt-1">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" /> Archivos adjuntos ({oferta.archivos.length})
                      </p>
                      <AdjuntosLista archivos={oferta.archivos} />
                    </div>
                  )}

                  {esAceptadaSinPagar(oferta) && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
                      El cliente aceptó tu puja pero aún no ha completado el pago protegido. Cuando lo haga, el
                      trabajo aparecerá en Gestión de Proyectos.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-transparent"
                      onClick={() => setVerDemanda(oferta.solicitud)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver demanda
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-transparent"
                      onClick={() => handleContactarCliente(oferta.solicitud?.cliente_id, oferta.solicitud?.id)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Contactar Cliente
                    </Button>
                    {!esAceptadaSinPagar(oferta) && (
                      <>
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
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pujas perdidas: demandas en las que el cliente eligió a otro
          profesional (o rechazó la puja). Solo consulta; sin acciones de
          edición. Las retiradas por el propio profesional no aparecen. */}
      {perdidas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-500" />
              Pujas perdidas ({perdidas.length})
            </CardTitle>
            <CardDescription>
              El cliente eligió otra opción en estas demandas. Puedes revisar qué ofertaste y seguir pujando en
              otras demandas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {perdidas.map((oferta) => (
              <div
                key={oferta.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{oferta.solicitud?.titulo || "Servicio"}</p>
                    <Badge variant="outline" className="gap-1 text-red-600 border-red-500/50 bg-red-500/10 shrink-0">
                      <X className="h-3 w-3" />
                      No seleccionada
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {oferta.solicitud?.cliente?.nombre} {oferta.solicitud?.cliente?.apellido}
                    {" · "}Ofertaste {formatearPrecioEuros(oferta.precio)}
                    {oferta.updated_at &&
                      ` · ${new Date(oferta.updated_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 bg-transparent"
                  onClick={() => setVerDemanda(oferta.solicitud)}
                >
                  <Eye className="h-4 w-4 mr-1.5" />
                  Ver demanda
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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

            {/* Adjuntos: conservar/borrar existentes y añadir nuevos */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Archivos adjuntos</label>
              <div className="flex flex-wrap gap-2">
                {editArchivos.map((url, i) => (
                  <div
                    key={`ex-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs bg-muted/40"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <a href={url} target="_blank" rel="noreferrer" className="hover:underline max-w-[140px] truncate">
                      {decodeURIComponent(url.split("/").pop()?.split("?")[0] || `Archivo ${i + 1}`)}
                    </a>
                    <button
                      type="button"
                      onClick={() => setEditArchivos(editArchivos.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Quitar adjunto"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {editNuevos.map((f, i) => (
                  <div
                    key={`new-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 px-2.5 py-1.5 text-xs bg-emerald-500/10"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setEditNuevos(editNuevos.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Quitar archivo nuevo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <label className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs cursor-pointer hover:bg-muted transition">
                  <Paperclip className="h-3.5 w-3.5" /> Añadir
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) setEditNuevos((prev) => [...prev, ...Array.from(e.target.files!)])
                      e.target.value = ""
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="bg-transparent" onClick={() => setEditOferta(null)}>
              Cancelar
            </Button>
            <Button onClick={handleGuardarEdicion} disabled={actionLoading || subiendo}>
              {actionLoading || subiendo ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {subiendo ? "Subiendo..." : "Guardar cambios"}
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

      {/* Publicación completa de la demanda por la que se puja */}
      <Dialog open={!!verDemanda} onOpenChange={(o) => !o && setVerDemanda(null)}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{verDemanda?.titulo || "Demanda"}</DialogTitle>
            <DialogDescription>
              Publicada por {verDemanda?.cliente?.nombre} {verDemanda?.cliente?.apellido}
              {verDemanda?.created_at
                ? ` el ${new Date(verDemanda.created_at).toLocaleDateString("es-ES")}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {verDemanda && (
            <div className="space-y-4 py-1 text-sm">
              <div className="flex flex-wrap gap-2">
                {verDemanda.urgencia && (
                  <Badge variant="outline" className="capitalize">{verDemanda.urgencia}</Badge>
                )}
                {verDemanda.ubicacion && (
                  <Badge variant="outline" className="gap-1">
                    <MapPin className="h-3 w-3" />
                    {verDemanda.ubicacion}
                  </Badge>
                )}
                {(verDemanda.presupuesto_min || verDemanda.presupuesto_max) && (
                  <Badge variant="outline">
                    {verDemanda.presupuesto_min ? formatearPrecioEuros(verDemanda.presupuesto_min) : ""}
                    {verDemanda.presupuesto_min && verDemanda.presupuesto_max ? " – " : ""}
                    {verDemanda.presupuesto_max
                      ? formatearPrecioEuros(verDemanda.presupuesto_max)
                      : verDemanda.presupuesto_min
                        ? " o más"
                        : ""}
                  </Badge>
                )}
              </div>

              <div>
                <p className="font-medium mb-1.5">Descripción del cliente</p>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {verDemanda.descripcion || "Sin descripción."}
                </p>
              </div>

              {Array.isArray(verDemanda.archivos) && verDemanda.archivos.length > 0 && (
                <div>
                  <p className="font-medium mb-1.5 flex items-center gap-1">
                    <FileText className="h-4 w-4" /> Archivos adjuntos ({verDemanda.archivos.length})
                  </p>
                  <AdjuntosLista archivos={verDemanda.archivos} />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
