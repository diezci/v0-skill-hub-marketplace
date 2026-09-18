"use client"

import { useT, useIdioma } from "@/components/idioma-provider"
import { localeDe } from "@/lib/i18n"

import { useState, useEffect, Suspense } from "react"
import { useNotificacionesSeccion } from "@/hooks/use-notificaciones-seccion"
import { useDestinoNotificacion } from "@/hooks/use-destino-notificacion"
import { AvisosTarjeta } from "@/components/avisos-tarjeta"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatearPrecioEuros } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Clock, MessageSquare, MapPin, Calendar, FileText, Loader2, Pencil, Trash2, Check, Paperclip, X, Eye, Send } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { EnlacePerfil } from "@/components/enlace-perfil"
import {
  obtenerOfertasPorProfesional,
  actualizarOferta,
  eliminarOferta,
  eliminarOfertaPerdida,
  crearOferta,
} from "@/app/actions/ofertas"
import { crearConversacion } from "@/app/actions/messages"
import { uploadFile } from "@/lib/upload-helpers"
import { PlazoNecesidad } from "@/components/plazo-necesidad"
import { useToast } from "@/hooks/use-toast"
import { AdjuntosLista } from "@/components/adjuntos-lista"
import { CancelacionTrabajo } from "@/components/cancelacion-trabajo"
import { calcularPagoProveedor, formatearPrecio, PLATFORM_CONFIG } from "@/lib/comisiones"

// Aquí viven las pujas pendientes de respuesta y también las aceptadas cuyo
// pago el cliente aún no ha completado: hasta que se pague, el trabajo no
// existe de verdad y no aparece en Gestión de Proyectos. Las rechazadas se
// muestran aparte, en el apartado de pujas perdidas; las retiradas (las quitó
// el propio profesional) no se muestran.
const esPendiente = (oferta: any) => !["aceptada", "rechazada", "retirada"].includes(oferta.estado)
const esAceptadaSinPagar = (oferta: any) => oferta.estado === "aceptada" && oferta.trabajo?.estado === "pendiente_pago"
const esVisible = (oferta: any) => esPendiente(oferta) || esAceptadaSinPagar(oferta)
const esPerdida = (oferta: any) => oferta.estado === "rechazada"
const necesitaConfirmarGastos = (oferta: any) => oferta.comision_proveedor_porcentaje == null ||
  oferta.comision_proveedor_minima == null || oferta.comision_proveedor_prevista == null ||
  oferta.pago_neto_proveedor_previsto == null

export default function MisOfertas() {
  return <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>}><MisOfertasContenido /></Suspense>
}

function MisOfertasContenido() {
  const t = useT()
  const { idioma } = useIdioma()

  const { paraEntidad, marcarLeidas } = useNotificacionesSeccion("/mis-ofertas")
  const [ofertas, setOfertas] = useState<any[]>([])
  const [perdidas, setPerdidas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editOferta, setEditOferta] = useState<any>(null)
  const [editForm, setEditForm] = useState({ precio: "", tiempo_estimado: "", unidad_tiempo: "dias", descripcion: "" })
  // Adjuntos en edición: URLs ya existentes + archivos nuevos por subir.
  const [editArchivos, setEditArchivos] = useState<string[]>([])
  const [editNuevos, setEditNuevos] = useState<File[]>([])
  const [aceptaGastosRepuja, setAceptaGastosRepuja] = useState(false)
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
    if (result.error) {
      toast({ title: t("No se pudieron cargar tus pujas"), description: t(result.error), variant: "destructive" })
      setLoading(false)
      return
    }
    const todas = result.data || []
    setOfertas(todas.filter(esVisible))
    setPerdidas(todas.filter(esPerdida))
    setLoading(false)
  }

  useEffect(() => {
    cargarOfertas()
  }, [])

  useDestinoNotificacion({
    cargando: loading,
    resolver: (params) => {
      const oferta = [...ofertas, ...perdidas].find((item) =>
        params.get("oferta") ? item.id === params.get("oferta")
          : params.get("solicitud") ? item.solicitud_id === params.get("solicitud")
          : params.get("trabajo") ? item.trabajo?.id === params.get("trabajo") : false,
      )
      return oferta ? { id: `puja-${oferta.id}` } : null
    },
  })
  const avisosOferta = (oferta: any) => paraEntidad({ solicitudId: oferta.solicitud_id, ofertaId: oferta.id, trabajoId: oferta.trabajo?.id })

  // Si existe historial rechazado y también una puja nueva para la misma
  // demanda, no ofrecemos volver a pujar otra vez desde la tarjeta antigua.
  const solicitudesConOfertaViva = new Set(ofertas.map((oferta) => oferta.solicitud_id).filter(Boolean))

  const abrirEditar = (oferta: any) => {
    setEditForm({
      precio: oferta.precio?.toString() || "",
      tiempo_estimado: oferta.tiempo_estimado?.toString() || "",
      unidad_tiempo: oferta.unidad_tiempo || "dias",
      descripcion: oferta.descripcion || "",
    })
    setEditArchivos(Array.isArray(oferta.archivos) ? oferta.archivos : [])
    setEditNuevos([])
    setAceptaGastosRepuja(false)
    setEditOferta(oferta)
  }

  const handleGuardarEdicion = async () => {
    if (!editOferta) return
    const esRepuja = esPerdida(editOferta)
    if ((esRepuja || necesitaConfirmarGastos(editOferta)) && !aceptaGastosRepuja) {
      toast({
        title: t("Falta aceptar los gastos de servicio"),
        description: t("Debes revisar y aceptar los gastos de servicio de Diime antes de enviar la oferta."),
        variant: "destructive",
      })
      return
    }
    const precio = Number.parseFloat(editForm.precio)
    const tiempoEstimado = Number.parseInt(editForm.tiempo_estimado, 10)
    if (!(precio > 0)) {
      toast({ title: t("Precio no válido"), description: t("El precio propuesto debe ser mayor que 0."), variant: "destructive" })
      return
    }
    if (!(tiempoEstimado > 0)) {
      toast({ title: t("Tiempo no válido"), description: t("El tiempo estimado debe ser mayor que 0."), variant: "destructive" })
      return
    }
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
          title: t("No se pudieron subir los archivos"),
          description: t("No se ha guardado ningún cambio. Inténtalo de nuevo o quita los adjuntos nuevos."),
          variant: "destructive",
        })
        setActionLoading(false)
        return
      }
      archivosFinales = [...archivosFinales, ...subidas.map((r) => r!.url)]
    }
    const result = esRepuja
      ? await crearOferta({
          solicitud_id: editOferta.solicitud_id,
          precio,
          tiempo_estimado: tiempoEstimado,
          unidad_tiempo: editForm.unidad_tiempo,
          descripcion: editForm.descripcion,
          materiales_incluidos: editOferta.materiales_incluidos,
          condiciones_pago: editOferta.condiciones_pago,
          notas: editOferta.notas,
          archivos: archivosFinales,
          acepta_gastos: aceptaGastosRepuja,
        })
      : await actualizarOferta(editOferta.id, {
          precio,
          tiempo_estimado: tiempoEstimado,
          unidad_tiempo: editForm.unidad_tiempo,
          descripcion: editForm.descripcion,
          archivos: archivosFinales,
          acepta_gastos: aceptaGastosRepuja,
        })
    if (result.error) {
      toast({ title: t("Error"), description: t(result.error), variant: "destructive" })
    } else {
      toast({
        title: esRepuja ? t("Nueva oferta enviada") : t("Oferta actualizada"),
        description: esRepuja
          ? t("Has vuelto a pujar y el cliente ha recibido tu nueva propuesta.")
          : t("Los cambios se han guardado y el cliente ha sido notificado."),
      })
      setEditOferta(null)
      setAceptaGastosRepuja(false)
      await cargarOfertas()
    }
    setActionLoading(false)
  }

  const handleEliminar = async () => {
    if (!deleteOferta) return
    const esPujaPerdida = esPerdida(deleteOferta)
    setActionLoading(true)
    const result = esPujaPerdida
      ? await eliminarOfertaPerdida(deleteOferta.id)
      : await eliminarOferta(deleteOferta.id)
    if (result.error) {
      toast({ title: t("Error"), description: t(result.error), variant: "destructive" })
    } else {
      toast(
        esPujaPerdida
          ? { title: t("Puja borrada"), description: t("La puja perdida se ha eliminado.") }
          : { title: t("Oferta retirada"), description: t("Tu oferta se ha retirado.") },
      )
      setDeleteOferta(null)
      await cargarOfertas()
    }
    setActionLoading(false)
  }

  const handleContactarCliente = async (clienteId?: string, solicitudId?: string) => {
    if (!clienteId) {
      toast({ title: t("No disponible"), description: t("No se pudo identificar al cliente."), variant: "destructive" })
      return
    }
    const result = await crearConversacion({ otroUsuarioId: clienteId, solicitudId })
    if (result.error) {
      toast({ title: t("Error"), description: t(result.error), variant: "destructive" })
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

  const precioRepuja = Number.parseFloat(editForm.precio)
  const liquidacionRepuja = precioRepuja > 0 ? calcularPagoProveedor(precioRepuja) : null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("Pujas en curso (")}{ofertas.length})</CardTitle>
          <CardDescription>{t("Puedes editarlas o retirarlas mientras el cliente no las acepte. Cuando una puja aceptada se pague, pasará a Gestión de Proyectos como trabajo activo; hasta entonces sigue aquí.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ofertas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium text-foreground mb-1">{t("No tienes pujas pendientes")}</p>
              <p className="text-sm mb-4">{t("Explora las demandas publicadas y envía tu puja.")}</p>
              <Button onClick={() => router.push("/demandas")}>{t("Ver demandas")}</Button>
            </div>
          ) : (
            ofertas.map((oferta) => (
              <Card key={oferta.id} id={`puja-${oferta.id}`} tabIndex={-1} className={`scroll-mt-24 hover:shadow-md transition-shadow ${avisosOferta(oferta).length ? "ring-2 ring-primary/50 border-primary/40" : ""}`}>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <CardTitle className="text-lg sm:text-xl">{oferta.solicitud?.titulo || t("Servicio")}</CardTitle>
                        {esAceptadaSinPagar(oferta) ? (
                          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/50 bg-amber-500/10">
                            <Clock className="h-3 w-3" />{t("Aceptada · esperando pago del cliente")}</Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="h-3 w-3" />{t("Enviada")}</Badge>
                        )}
                      </div>
                      {/* Miniatura del cliente: pone cara a la demanda de un
                          vistazo, sin tener que abrirla. */}
                      <CardDescription className="text-base">
                        <EnlacePerfil usuarioId={oferta.solicitud?.cliente_id} className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarImage src={oferta.solicitud?.cliente?.foto_perfil || "/placeholder.svg"} />
                            <AvatarFallback className="text-[10px]">
                              {oferta.solicitud?.cliente?.nombre?.[0]}
                              {oferta.solicitud?.cliente?.apellido?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">
                            {oferta.solicitud?.cliente?.nombre} {oferta.solicitud?.cliente?.apellido}
                          </span>
                        </EnlacePerfil>
                      </CardDescription>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <div className="text-2xl font-bold text-primary">{formatearPrecioEuros(oferta.precio, idioma)}</div>
                      <p className="text-sm text-muted-foreground">{t("Precio ofertado")}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AvisosTarjeta avisos={avisosOferta(oferta)} onMarcarLeidas={marcarLeidas} />
                  {necesitaConfirmarGastos(oferta) && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                      {esAceptadaSinPagar(oferta)
                        ? t("Falta confirmar la tarifa de esta oferta. Solicita cancelar el contrato pendiente y envía una nueva oferta revisando los gastos de servicio.")
                        : t("Para que el cliente pueda contratar esta oferta, ábrela en Editar y confirma los gastos de servicio y tu importe neto.")}
                    </p>
                  )}
                  <div className="grid gap-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{t("Enviada el")}{" "}{new Date(oferta.created_at).toLocaleDateString(localeDe(idioma))}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{oferta.solicitud?.ubicacion || t("Ubicación no especificada")}</span>
                    </div>
                    {oferta.solicitud?.urgencia && (
                      <div>
                        <PlazoNecesidad
                          valor={oferta.solicitud.urgencia}
                          fecha={oferta.solicitud.fecha_necesaria}
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>
                        {oferta.tiempo_estimado} {t(oferta.unidad_tiempo || "días")}{" "}{t("estimados")}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t">
                    <p className="text-sm font-medium mb-2">{t("Descripción del Servicio:")}</p>
                    <p className="text-sm text-muted-foreground">{oferta.descripcion}</p>
                    {oferta.materiales_incluidos && (
                      <p className="text-sm text-muted-foreground mt-1.5">
                        <span className="font-medium text-foreground">{t("Materiales:")}</span>{" "}
                        {oferta.materiales_incluidos === "si"
                          ? t("incluidos")
                          : oferta.materiales_incluidos === "no"
                            ? t("no incluidos")
                            : oferta.materiales_incluidos === "parcial"
                              ? t("parcialmente incluidos")
                              : oferta.materiales_incluidos}
                      </p>
                    )}
                  </div>

                  {Array.isArray(oferta.archivos) && oferta.archivos.length > 0 && (
                    <div className="pt-1">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />{" "}{t("Archivos adjuntos (")}{oferta.archivos.length})
                      </p>
                      <AdjuntosLista archivos={oferta.archivos} />
                    </div>
                  )}

                  {esAceptadaSinPagar(oferta) && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">{t("El cliente aceptó tu puja pero aún no ha completado el pago protegido. Cuando lo haga, el trabajo aparecerá en Gestión de Proyectos.")}</div>
                  )}

                  {esAceptadaSinPagar(oferta) && oferta.trabajo && (
                    <CancelacionTrabajo trabajo={oferta.trabajo} onChange={cargarOfertas} />
                  )}

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-transparent"
                      onClick={() => setVerDemanda(oferta.solicitud)}
                    >
                      <Eye className="h-4 w-4 mr-2" />{t("Ver demanda")}</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-transparent"
                      onClick={() => handleContactarCliente(oferta.solicitud?.cliente_id, oferta.solicitud?.id)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />{t("Contactar Cliente")}</Button>
                    {!esAceptadaSinPagar(oferta) && (
                      <>
                        <Button variant="outline" size="sm" className="flex-1 bg-transparent" onClick={() => abrirEditar(oferta)}>
                          <Pencil className="h-4 w-4 mr-2" />{t("Editar oferta")}</Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10"
                          onClick={() => setDeleteOferta(oferta)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />{t("Retirar")}</Button>
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
          profesional (o rechazó la puja). Si la demanda sigue abierta, se
          puede preparar y enviar una nueva propuesta; si ya cerró, queda solo
          como historial. Las retiradas por el profesional no aparecen. */}
      {perdidas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-500" />{t("Pujas perdidas (")}{perdidas.length})
            </CardTitle>
            <CardDescription>{t("Puedes revisar qué ofertaste, borrar las pujas que ya no quieras conservar y, si la demanda sigue abierta, enviar una nueva propuesta.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {perdidas.map((oferta) => (
              <div
                key={oferta.id}
                id={`puja-${oferta.id}`} tabIndex={-1}
                className={`scroll-mt-24 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4 ${avisosOferta(oferta).length ? "ring-2 ring-primary/50 border-primary/40" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <AvisosTarjeta avisos={avisosOferta(oferta)} onMarcarLeidas={marcarLeidas} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{oferta.solicitud?.titulo || t("Servicio")}</p>
                    <Badge variant="outline" className="gap-1 text-red-600 border-red-500/50 bg-red-500/10 shrink-0">
                      <X className="h-3 w-3" />{t("No seleccionada")}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <EnlacePerfil usuarioId={oferta.solicitud?.cliente_id} className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5 shrink-0">
                        <AvatarImage src={oferta.solicitud?.cliente?.foto_perfil || "/placeholder.svg"} />
                        <AvatarFallback className="text-[9px]">
                          {oferta.solicitud?.cliente?.nombre?.[0]}
                          {oferta.solicitud?.cliente?.apellido?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {oferta.solicitud?.cliente?.nombre} {oferta.solicitud?.cliente?.apellido}
                    </EnlacePerfil>
                    {" · "}{t("Ofertaste")}{" "}{formatearPrecioEuros(oferta.precio, idioma)}
                    {oferta.updated_at &&
                      ` · ${new Date(oferta.updated_at).toLocaleDateString(localeDe(idioma), { day: "numeric", month: "short", year: "numeric" })}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 bg-transparent"
                    onClick={() => setVerDemanda(oferta.solicitud)}
                  >
                    <Eye className="h-4 w-4 mr-1.5" />{t("Ver demanda")}</Button>
                  {oferta.solicitud?.estado === "abierta" &&
                    !solicitudesConOfertaViva.has(oferta.solicitud_id) && (
                      <Button size="sm" className="shrink-0" onClick={() => abrirEditar(oferta)}>
                        <Send className="h-4 w-4 mr-1.5" />{t("Volver a pujar")}</Button>
                    )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => setDeleteOferta(oferta)}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />{t("Borrar")}</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Editar una oferta viva o preparar una nueva a partir de una rechazada */}
      <Dialog open={!!editOferta} onOpenChange={(o) => !o && setEditOferta(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editOferta && esPerdida(editOferta) ? t("Volver a pujar") : t("Editar oferta")}</DialogTitle>
            <DialogDescription>
              {editOferta && esPerdida(editOferta)
                ? t("Revisa tu propuesta anterior y envíala de nuevo. El cliente la recibirá como una nueva puja.")
                : t("Puedes modificar tu oferta mientras no haya sido aceptada. El cliente recibirá una notificación.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("Precio (€)")}</label>
                <Input
                  type="number"
                  value={editForm.precio}
                  onChange={(e) => setEditForm({ ...editForm, precio: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("Tiempo estimado")}</label>
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
                    <option value="horas">{t("Horas")}</option>
                    <option value="dias">{t("Días")}</option>
                    <option value="semanas">{t("Semanas")}</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("Descripción")}</label>
              <Textarea
                rows={4}
                value={editForm.descripcion}
                onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
              />
            </div>

            {/* Adjuntos: conservar/borrar existentes y añadir nuevos */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("Archivos adjuntos")}</label>
              <div className="flex flex-wrap gap-2">
                {editArchivos.map((url, i) => (
                  <div
                    key={`ex-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs bg-muted/40"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <a href={url} target="_blank" rel="noreferrer" className="hover:underline max-w-[140px] truncate">
                      {decodeURIComponent(url.split("/").pop()?.split("?")[0] || t("Archivo {count}", { count: i + 1 }))}
                    </a>
                    <button
                      type="button"
                      onClick={() => setEditArchivos(editArchivos.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t("Quitar adjunto")}
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
                      aria-label={t("Quitar archivo nuevo")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <label className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs cursor-pointer hover:bg-muted transition">
                  <Paperclip className="h-3.5 w-3.5" />{" "}{t("Añadir")}<input
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
            {editOferta && (esPerdida(editOferta) || necesitaConfirmarGastos(editOferta)) && (
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm cursor-pointer">
                <Checkbox
                  checked={aceptaGastosRepuja}
                  onCheckedChange={(checked) => setAceptaGastosRepuja(checked === true)}
                  className="mt-0.5"
                />
                <span>{t("Acepto los gastos de servicio de Diime (")}{PLATFORM_CONFIG.comisionProveedorPorcentaje}{t("% del precio, mín.")}{" "}{formatearPrecio(PLATFORM_CONFIG.comision_minima, idioma)}{t("; IVA del")}{" "}
                  {PLATFORM_CONFIG.ivaDiimePorcentaje}{t("% incluido). Mi oferta es un precio final y soy responsable de facturar y declarar los impuestos de mi servicio.")}{liquidacionRepuja && (
                    <>
                      {" "}{t("Si el cliente acepta esta oferta, recibiré")}{" "}{formatearPrecio(liquidacionRepuja.pagoNeto, idioma)}{" "}{t("netos.")}</>
                  )}
                </span>
              </label>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="bg-transparent" onClick={() => setEditOferta(null)}>{t("Cancelar")}</Button>
            <Button onClick={handleGuardarEdicion} disabled={actionLoading || subiendo}>
              {actionLoading || subiendo ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {subiendo
                ? t("Subiendo...")
                : editOferta && esPerdida(editOferta)
                  ? t("Enviar nueva oferta")
                  : t("Guardar cambios")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar retirada de una oferta viva o borrado de una perdida */}
      <AlertDialog open={!!deleteOferta} onOpenChange={(o) => !o && setDeleteOferta(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteOferta && esPerdida(deleteOferta) ? t("¿Borrar esta puja perdida?") : t("¿Retirar esta oferta?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteOferta && esPerdida(deleteOferta)
                ? t("Se borrará tu puja de «{title}». Esta acción no se puede deshacer.", { title: deleteOferta?.solicitud?.titulo || t("esta demanda") })
                : t("Se retirará tu oferta de «{title}». Esta acción no se puede deshacer.", { title: deleteOferta?.solicitud?.titulo || t("esta demanda") })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleEliminar()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {deleteOferta && esPerdida(deleteOferta) ? t("Borrar puja") : t("Retirar oferta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publicación completa de la demanda por la que se puja */}
      <Dialog open={!!verDemanda} onOpenChange={(o) => !o && setVerDemanda(null)}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{verDemanda?.titulo || t("Demanda")}</DialogTitle>
            <DialogDescription>{t("Publicada por")}{" "}{verDemanda?.cliente?.nombre} {verDemanda?.cliente?.apellido}
              {verDemanda?.created_at
                ? t(" el {date}", { date: new Date(verDemanda.created_at).toLocaleDateString(localeDe(idioma)) })
                : ""}
            </DialogDescription>
          </DialogHeader>

          {verDemanda && (
            <div className="space-y-4 py-1 text-sm">
              <div className="flex flex-wrap gap-2">
                {verDemanda.urgencia && (
                  <PlazoNecesidad valor={verDemanda.urgencia} fecha={verDemanda.fecha_necesaria} />
                )}
                {verDemanda.ubicacion && (
                  <Badge variant="outline" className="gap-1">
                    <MapPin className="h-3 w-3" />
                    {verDemanda.ubicacion}
                  </Badge>
                )}
                {(verDemanda.presupuesto_min || verDemanda.presupuesto_max) && (
                  <Badge variant="outline">
                    {verDemanda.presupuesto_min ? formatearPrecioEuros(verDemanda.presupuesto_min, idioma) : ""}
                    {verDemanda.presupuesto_min && verDemanda.presupuesto_max ? " – " : ""}
                    {verDemanda.presupuesto_max
                      ? formatearPrecioEuros(verDemanda.presupuesto_max, idioma)
                      : verDemanda.presupuesto_min
                        ? t(" o más")
                        : ""}
                  </Badge>
                )}
              </div>

              <div>
                <p className="font-medium mb-1.5">{t("Descripción del cliente")}</p>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {verDemanda.descripcion || t("Sin descripción.")}
                </p>
              </div>

              {Array.isArray(verDemanda.archivos) && verDemanda.archivos.length > 0 && (
                <div>
                  <p className="font-medium mb-1.5 flex items-center gap-1">
                    <FileText className="h-4 w-4" />{" "}{t("Archivos adjuntos (")}{verDemanda.archivos.length})
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
