"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatearPrecioEuros, formatearRangoPresupuesto } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { 
  Clock, CheckCircle2, XCircle, Loader2, Calendar, MapPin, Euro, MessageSquare, FileText,
  CreditCard, AlertCircle, Send, Check, Star, ChevronRight, ArrowRight, Package,
  Banknote, ShieldCheck, Timer, TrendingUp, User, Building, Eye, Pencil, Trash2, Scale
} from "lucide-react"
import { obtenerSolicitudesPorUsuario, actualizarSolicitud, eliminarSolicitud } from "@/app/actions/solicitudes"
import { aceptarOferta, rechazarOferta } from "@/app/actions/ofertas"
import { crearConversacion } from "@/app/actions/messages"
import { liberarFondosEscrow } from "@/app/actions/escrow"
import { rechazarEntrega } from "@/app/actions/disputes"
import { obtenerMisTrabajos, actualizarProgresoTrabajo, marcarTrabajoEntregado, confirmarTrabajoCompletado } from "@/app/actions/trabajos"
import { crearResena } from "@/app/actions/reviews"
import { AbrirDisputaDialog } from "@/components/abrir-disputa-dialog"
import MisDisputas from "@/components/mis-disputas"
import { AdjuntosLista } from "@/components/adjuntos-lista"
import { CancelacionTrabajo } from "@/components/cancelacion-trabajo"
import { calcularTotalCliente, PLATFORM_CONFIG } from "@/lib/comisiones"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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

// Tarjeta-resumen clicable: hover y anillo cuando su pestaña está activa.
const cnCard = (base: string, activa: boolean) =>
  `${base} w-full transition hover:shadow-md ${activa ? "ring-2 ring-primary/50" : ""}`

export default function MisSolicitudes() {
  const [activeTab, setActiveTab] = useState("solicitudes")
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [trabajos, setTrabajos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSolicitud, setSelectedSolicitud] = useState<any>(null)
  const [selectedTrabajo, setSelectedTrabajo] = useState<any>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComentario, setReviewComentario] = useState("")
  const [reviewHover, setReviewHover] = useState(0)
  const [rejectReason, setRejectReason] = useState("")
  const [actionLoading, setActionLoading] = useState(false)
  const [editSolicitud, setEditSolicitud] = useState<any>(null)
  const [editForm, setEditForm] = useState({
    titulo: "",
    descripcion: "",
    ubicacion: "",
    presupuesto_min: "",
    presupuesto_max: "",
    urgencia: "media",
  })
  const [deleteSolicitud, setDeleteSolicitud] = useState<any>(null)
  const [rejectOfertaTarget, setRejectOfertaTarget] = useState<any>(null)
  // Confirmación al aceptar una oferta: informa de los gastos de servicio
  // de Diime antes de continuar al pago.
  const [acceptOfertaTarget, setAcceptOfertaTarget] = useState<{ oferta: any; solicitud: any } | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  const refrescarSolicitudes = async () => {
    const result = await obtenerSolicitudesPorUsuario()
    if (result.data) setSolicitudes(result.data)
  }

  const abrirEditar = (solicitud: any) => {
    setEditForm({
      titulo: solicitud.titulo || "",
      descripcion: solicitud.descripcion || "",
      ubicacion: solicitud.ubicacion || "",
      presupuesto_min: solicitud.presupuesto_min?.toString() || "",
      presupuesto_max: solicitud.presupuesto_max?.toString() || "",
      urgencia: solicitud.urgencia || "media",
    })
    setEditSolicitud(solicitud)
  }

  const handleGuardarEdicion = async () => {
    if (!editSolicitud) return
    if (!editForm.titulo.trim() || editForm.descripcion.trim().length < 10) {
      toast({ title: "Faltan datos", description: "Añade un título y una descripción (mín. 10 caracteres).", variant: "destructive" })
      return
    }
    setActionLoading(true)
    const result = await actualizarSolicitud(editSolicitud.id, {
      titulo: editForm.titulo,
      descripcion: editForm.descripcion,
      ubicacion: editForm.ubicacion,
      presupuesto_min: editForm.presupuesto_min ? Number.parseFloat(editForm.presupuesto_min) : undefined,
      presupuesto_max: editForm.presupuesto_max ? Number.parseFloat(editForm.presupuesto_max) : undefined,
      urgencia: editForm.urgencia,
    })
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Demanda actualizada", description: "Los cambios se han guardado." })
      setEditSolicitud(null)
      await refrescarSolicitudes()
    }
    setActionLoading(false)
  }

  const handleContactar = async (otroUsuarioId: string, solicitudId?: string, trabajoId?: string) => {
    if (!otroUsuarioId) {
      toast({ title: "No disponible", description: "No se pudo identificar al destinatario.", variant: "destructive" })
      return
    }
    toast({ title: "Abriendo chat...", description: "Preparando la conversación." })
    const result = await crearConversacion({ otroUsuarioId, solicitudId, trabajoId })
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      router.push(result.data?.id ? `/mensajes?c=${result.data.id}` : "/mensajes")
    }
  }

  const handleBorrar = async () => {
    if (!deleteSolicitud) return
    setActionLoading(true)
    const result = await eliminarSolicitud(deleteSolicitud.id)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Demanda borrada", description: "La demanda se ha eliminado." })
      setDeleteSolicitud(null)
      await refrescarSolicitudes()
    }
    setActionLoading(false)
  }

  useEffect(() => {
    async function cargarDatos(inicial: boolean) {
      if (inicial) setLoading(true)

      const [solicitudesResult, trabajosResult] = await Promise.all([
        obtenerSolicitudesPorUsuario(),
        obtenerMisTrabajos()
      ])

      // Solo datos reales (aunque estén vacíos): nada de datos de ejemplo.
      setSolicitudes(solicitudesResult.data || [])

      if (trabajosResult.data) {
        setTrabajos(trabajosResult.data)
      }

      if (inicial) setLoading(false)
    }
    cargarDatos(true)

    // Refresco en vivo: las ofertas nuevas y los cambios de estado (entregas,
    // cancelaciones...) aparecen sin recargar la página.
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return
      cargarDatos(false)
    }, 15000)
    return () => clearInterval(id)
  }, [])

  const handleAceptarOferta = async (oferta: any, solicitud: any) => {
    toast({
      title: "Procesando...",
      description: "Creando el trabajo y preparando el pago seguro",
    })

    // Crear el trabajo a partir de la oferta y redirigir a la pasarela de pago escrow.
    const result = await aceptarOferta(oferta.id)

    if (result.error || !result.data?.id) {
      toast({
        title: "No se pudo aceptar la oferta",
        description: result.error || "Inténtalo de nuevo.",
        variant: "destructive",
      })
      return
    }

    router.push(`/pago/${result.data.id}`)
  }

  const handleRechazarOferta = async () => {
    if (!rejectOfertaTarget) return
    setActionLoading(true)
    const result = await rechazarOferta(rejectOfertaTarget.id)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Oferta rechazada", description: "El profesional ha sido notificado." })
      setRejectOfertaTarget(null)
      await refrescarSolicitudes()
    }
    setActionLoading(false)
  }

  const handleConfirmarTrabajo = async (trabajo: any) => {
    setActionLoading(true)
    const result = await confirmarTrabajoCompletado(trabajo.id)
    
    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
      setActionLoading(false)
    } else {
      // Release escrow funds (liberarFondosEscrow espera el id del trabajo)
      if (trabajo.escrow?.id) {
        await liberarFondosEscrow(trabajo.id)
      }
      
      toast({
        title: "Trabajo confirmado",
        description: "El pago ha sido liberado al profesional.",
      })
      setShowConfirmDialog(false)
      setActionLoading(false)
      
      // Show review dialog
      setShowReviewDialog(true)
    }
  }

  const handleRechazarTrabajo = async (trabajo: any) => {
    if (!rejectReason.trim()) {
      toast({
        title: "Error",
        description: "Por favor, indica el motivo del rechazo.",
        variant: "destructive",
      })
      return
    }

    setActionLoading(true)

    // Rechazar una entrega NO reembolsa: abre una disputa para que el equipo de
    // Diime decida según las pruebas y los términos. El pago sigue retenido.
    const result = await rechazarEntrega(trabajo.id, rejectReason)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Entrega rechazada · disputa abierta",
        description:
          "El pago queda retenido en custodia. El equipo de Diime revisará las pruebas y los términos acordados para decidir.",
      })
      setShowRejectDialog(false)
      setSelectedTrabajo(null)
      setRejectReason("")

      // Refresh
      const refreshResult = await obtenerSolicitudesPorUsuario()
      if (refreshResult.data) setSolicitudes(refreshResult.data)
      const trabajosResult = await obtenerMisTrabajos()
      if (trabajosResult.data) setTrabajos(trabajosResult.data)
    }
    setActionLoading(false)
  }

  const handleSubmitReview = async () => {
    if (!selectedTrabajo) return
    setActionLoading(true)

    const result = await crearResena({
      trabajo_id: selectedTrabajo.id,
      profesional_id: selectedTrabajo.profesional_id,
      rating: reviewRating,
      comentario: reviewComentario,
    })

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Valoracion enviada",
        description: "Gracias por tu valoracion. Ayuda a otros clientes a elegir mejor.",
      })
    }

    setShowReviewDialog(false)
    setSelectedTrabajo(null)
    setReviewRating(5)
    setReviewComentario("")
    setActionLoading(false)

    // Refresh
    const refreshResult = await obtenerSolicitudesPorUsuario()
    if (refreshResult.data) setSolicitudes(refreshResult.data)
    const trabajosResult = await obtenerMisTrabajos()
    if (trabajosResult.data) setTrabajos(trabajosResult.data)
  }

  const calcularDiasRestantes = (fechaFin: string) => {
    const hoy = new Date()
    const fin = new Date(fechaFin)
    const diff = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric"
    })
  }

  // DB statuses: "abierta" | "en_progreso" | "completada" | "cerrada"
  const solicitudesPendientes = solicitudes.filter(
    (s) => s.estado === "abierta" || s.estado === "pendiente",
  )
  // Entregados y a la espera de que el cliente confirme: pestaña propia.
  const solicitudesPorConfirmar = solicitudes.filter((s) => s.trabajo?.estado === "entregado")
  // Un trabajo en disputa vive solo en la pestaña Disputas (mismo criterio que
  // en Gestión de Proyectos): duplicarlo en En Progreso confundía.
  const solicitudesEnProgreso = solicitudes.filter(
    (s) =>
      (s.estado === "en_progreso" || s.estado === "en-progreso") &&
      s.trabajo?.estado !== "entregado" &&
      s.trabajo?.estado !== "en_disputa",
  )
  const solicitudesCompletadas = solicitudes.filter(
    (s) => s.estado === "completado" || s.estado === "completada" || s.estado === "cerrada",
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards: mismos estados (y orden) que las pestañas, y clicables
          para saltar directamente a la pestaña correspondiente. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button type="button" className="text-left" onClick={() => setActiveTab("solicitudes")}>
        <Card
          className={cnCard(
            "bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20",
            activeTab === "solicitudes",
          )}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Abiertas</p>
                <p className="text-3xl font-bold">{solicitudesPendientes.length}</p>
                <p className="text-xs text-muted-foreground">esperando ofertas</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <FileText className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        </button>

        <button type="button" className="text-left" onClick={() => setActiveTab("en-progreso")}>
        <Card
          className={cnCard(
            "bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20",
            activeTab === "en-progreso",
          )}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En Progreso</p>
                <p className="text-3xl font-bold">{solicitudesEnProgreso.length}</p>
                <p className="text-xs text-muted-foreground">trabajos en curso</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        </button>

        <button type="button" className="text-left" onClick={() => setActiveTab("por-confirmar")}>
        <Card
          className={cnCard(
            "bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20",
            activeTab === "por-confirmar",
          )}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Por Confirmar</p>
                <p className="text-3xl font-bold">{solicitudesPorConfirmar.length}</p>
                <p className="text-xs text-muted-foreground">entregas por revisar</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Package className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        </button>

        <button type="button" className="text-left" onClick={() => setActiveTab("historial")}>
        <Card
          className={cnCard(
            "bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20",
            activeTab === "historial",
          )}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Historial</p>
                <p className="text-3xl font-bold">{solicitudesCompletadas.length}</p>
                <p className="text-xs text-muted-foreground">completados</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        </button>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto">
          <TabsTrigger value="solicitudes" className="gap-2">
            <FileText className="h-4 w-4" />
            Abiertas
          </TabsTrigger>
          <TabsTrigger value="en-progreso" className="gap-2">
            <Loader2 className="h-4 w-4" />
            En Progreso
          </TabsTrigger>
          <TabsTrigger value="por-confirmar" className="gap-2">
            <Package className="h-4 w-4" />
            Por Confirmar
            {solicitudesPorConfirmar.length > 0 && (
              <span className="h-4 min-w-4 px-1 rounded-full bg-purple-500 text-white text-[10px] font-bold flex items-center justify-center">
                {solicitudesPorConfirmar.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="historial" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="disputas" className="gap-2">
            <Scale className="h-4 w-4" />
            Disputas
          </TabsTrigger>
        </TabsList>

        {/* Solicitudes Tab */}
        <TabsContent value="solicitudes" className="space-y-4">
          {solicitudesPendientes.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No tienes solicitudes pendientes</p>
                <p className="text-muted-foreground text-center mt-1">
                  Publica una nueva solicitud de servicio desde la página principal
                </p>
                <Button className="mt-4" onClick={() => router.push("/")}>
                  Crear Solicitud
                </Button>
              </CardContent>
            </Card>
          ) : (
            solicitudesPendientes.map((solicitud) => {
              // Solo mostramos ofertas pendientes de respuesta: las rechazadas
              // desaparecen de la vista y las aceptadas pasan a "En Progreso".
              // (mismo criterio que usa mis-ofertas.tsx del lado profesional)
              const ofertasPendientes = (solicitud.ofertas || []).filter(
                (o: any) => !["aceptada", "rechazada", "retirada"].includes(o.estado),
              )
              return (
              <Card key={solicitud.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-xl">{solicitud.titulo}</CardTitle>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatearFecha(solicitud.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {solicitud.ubicacion}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary" className="mb-1">
                        {solicitud.categoria?.nombre}
                      </Badge>
                      <p className="text-lg font-semibold text-primary">
                        {formatearRangoPresupuesto(solicitud.presupuesto_min, solicitud.presupuesto_max)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {/* Oferta aceptada con el pago sin completar (p. ej. abandonó la
                      pasarela): la demanda sigue abierta y desde aquí se retoma el
                      pago. Hasta pagar, nada se consuma. */}
                  {solicitud.trabajo?.estado === "pendiente_pago" && (
                    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                      <div className="flex items-start gap-3">
                        <CreditCard className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-amber-700 dark:text-amber-400">
                            Has aceptado la oferta de {solicitud.trabajo?.profesional?.nombre || "un profesional"}
                            {" — "}falta completar el pago
                          </p>
                          <p className="text-sm text-muted-foreground">
                            La contratación no se cierra hasta que completes el pago protegido. Mientras tanto,
                            las demás ofertas siguen disponibles.
                          </p>
                        </div>
                      </div>
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                        onClick={() => router.push(`/pago/${solicitud.trabajo.id}`)}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Pagar ahora
                      </Button>
                    </div>
                  )}

                  <p className="text-sm text-muted-foreground mb-4">{solicitud.descripcion}</p>

                  {/* Archivos que el cliente adjuntó al publicar la demanda */}
                  {Array.isArray(solicitud.archivos) && solicitud.archivos.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" /> Archivos adjuntos ({solicitud.archivos.length})
                      </p>
                      <AdjuntosLista archivos={solicitud.archivos} />
                    </div>
                  )}

                  <div className="flex gap-2 mb-4">
                    <Button variant="outline" size="sm" className="bg-transparent" onClick={() => abrirEditar(solicitud)}>
                      <Pencil className="h-4 w-4 mr-1.5" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => setDeleteSolicitud(solicitud)}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Borrar
                    </Button>
                  </div>

                  {/* Ofertas recibidas */}
                  {ofertasPendientes.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          {ofertasPendientes.length} oferta{ofertasPendientes.length !== 1 ? "s" : ""} recibida{ofertasPendientes.length !== 1 ? "s" : ""}
                        </h4>
                      </div>

                      <div className="grid gap-3">
                        {ofertasPendientes.map((oferta: any) => (
                          <Card key={oferta.id} className="bg-muted/50">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-4">
                                <Avatar className="h-12 w-12">
                                  <AvatarImage src={oferta.profesional?.profiles?.foto_perfil || "/placeholder.svg"} />
                                  <AvatarFallback>
                                    {oferta.profesional?.profiles?.nombre?.[0]}{oferta.profesional?.profiles?.apellido?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="font-semibold">
                                        {oferta.profesional?.profiles?.nombre} {oferta.profesional?.profiles?.apellido}
                                      </p>
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        {oferta.profesional?.rating_promedio != null && (
                                          <span className="flex items-center gap-1">
                                            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                                            {Number(oferta.profesional.rating_promedio).toFixed(1)}
                                          </span>
                                        )}
                                        {oferta.profesional?.titulo && <span>{oferta.profesional.titulo}</span>}
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-xl font-bold text-primary">{formatearPrecioEuros(oferta.precio)}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {oferta.tiempo_estimado} {oferta.unidad_tiempo}
                                      </p>
                                    </div>
                                  </div>
                                  <p className="text-sm mt-2 text-muted-foreground">{oferta.descripcion}</p>
                                  {oferta.materiales_incluidos && (
                                    <p className="text-sm text-muted-foreground mt-1">
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
                                  {Array.isArray(oferta.archivos) && oferta.archivos.length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                                        <FileText className="h-3.5 w-3.5" /> Archivos adjuntos ({oferta.archivos.length})
                                      </p>
                                      <AdjuntosLista archivos={oferta.archivos} />
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-2 mt-3">
                                    <Button
                                      size="sm"
                                      onClick={() => setAcceptOfertaTarget({ oferta, solicitud })}
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      Aceptar Oferta
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10"
                                      onClick={() => setRejectOfertaTarget(oferta)}
                                    >
                                      <XCircle className="h-4 w-4 mr-1" />
                                      Rechazar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="bg-transparent"
                                      onClick={() => handleContactar(oferta.profesional_id, solicitud.id)}
                                    >
                                      <MessageSquare className="h-4 w-4 mr-1" />
                                      Contactar
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => router.push(`/profesional/${oferta.profesional_id}`)}>
                                      <Eye className="h-4 w-4 mr-1" />
                                      Ver Perfil
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ) : solicitud.trabajo?.estado === "pendiente_pago" ? null : (
                    // Con una oferta aceptada pendiente de pago, el banner de arriba
                    // ya lo cuenta todo: "no has recibido ofertas" sería contradictorio.
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Aún no has recibido ofertas. Los profesionales están revisando tu solicitud.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              )
            })
          )}
        </TabsContent>

        {/* Pestañas "En Progreso" y "Por Confirmar": comparten la misma tarjeta
            de proyecto, cambian la lista y el estado vacío. */}
        {(["en-progreso", "por-confirmar"] as const).map((tab) => {
          const lista = tab === "en-progreso" ? solicitudesEnProgreso : solicitudesPorConfirmar
          return (
        <TabsContent key={tab} value={tab} className="space-y-4">
          {lista.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                {tab === "en-progreso" ? (
                  <Loader2 className="h-12 w-12 text-muted-foreground mb-4" />
                ) : (
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                )}
                <p className="text-lg font-medium">
                  {tab === "en-progreso"
                    ? "No tienes proyectos en progreso"
                    : "No tienes entregas pendientes de confirmar"}
                </p>
                <p className="text-muted-foreground text-center mt-1">
                  {tab === "en-progreso"
                    ? "Cuando aceptes una oferta, el proyecto aparecerá aquí"
                    : "Cuando un profesional te entregue un trabajo, aquí podrás confirmarlo y liberar el pago"}
                </p>
              </CardContent>
            </Card>
          ) : (
            lista.map((solicitud) => {
              const trabajo = solicitud.trabajo
              const diasRestantes = trabajo?.fecha_estimada_fin 
                ? calcularDiasRestantes(trabajo.fecha_estimada_fin)
                : null
              const esEntregado = trabajo?.estado === "entregado"
              const pagado = trabajo?.escrow?.estado === "fondos_retenidos"
              
              return (
                <Card key={solicitud.id} className={esEntregado ? "border-purple-500/50 bg-purple-500/5" : ""}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-xl">{solicitud.titulo}</CardTitle>
                          {esEntregado && (
                            <Badge className="bg-purple-500">
                              <Package className="h-3 w-3 mr-1" />
                              Pendiente de Confirmación
                            </Badge>
                          )}
                        </div>
                        <CardDescription>{solicitud.categoria?.nombre}</CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{formatearPrecioEuros(trabajo?.precio_acordado)}</p>
                        {pagado ? (
                          <Badge variant="outline" className="bg-transparent text-emerald-500 border-emerald-500/50">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Pagado · Protegido
                          </Badge>
                        ) : trabajo?.estado === "pendiente_pago" ? (
                          <Badge variant="outline" className="bg-transparent text-amber-500 border-amber-500/50">
                            <CreditCard className="h-3 w-3 mr-1" />
                            Pendiente de pago
                          </Badge>
                        ) : trabajo?.escrow?.estado === "reembolsado" ? (
                          <Badge variant="outline" className="bg-transparent text-blue-500 border-blue-500/50">
                            Reembolsado
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Professional Info */}
                    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                      <Avatar className="h-14 w-14">
                        <AvatarImage src={trabajo?.profesional?.foto_perfil || "/placeholder.svg"} />
                        <AvatarFallback>
                          {trabajo?.profesional?.nombre?.[0]}{trabajo?.profesional?.apellido?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-semibold">
                          {trabajo?.profesional?.nombre} {trabajo?.profesional?.apellido}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                          <span>{trabajo?.profesional?.rating}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-transparent"
                        onClick={() => handleContactar(trabajo?.profesional_id, solicitud.id, trabajo?.id)}
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Mensaje
                      </Button>
                    </div>

                    {/* Trabajo sin pagar (p. ej. el cliente abandonó la pasarela):
                        siempre debe poder retomar el pago desde aquí. */}
                    {trabajo?.estado === "pendiente_pago" && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                        <div className="flex items-start gap-3">
                          <CreditCard className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold text-amber-700 dark:text-amber-400">Pago pendiente</p>
                            <p className="text-sm text-muted-foreground">
                              El trabajo no empezará hasta que completes el pago protegido.
                            </p>
                          </div>
                        </div>
                        <Button
                          className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                          onClick={() => router.push(`/pago/${trabajo.id}`)}
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          Pagar ahora
                        </Button>
                      </div>
                    )}

                    {/* Cancelación de mutuo acuerdo (antes del pago o en curso) */}
                    {["pendiente_pago", "en_progreso"].includes(trabajo?.estado) && (
                      <CancelacionTrabajo trabajo={trabajo} onChange={refrescarSolicitudes} />
                    )}

                    {/* Condiciones y adjuntos de la oferta aceptada + documentos */}
                    {trabajo && (
                      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                        <p className="text-sm font-medium">Contratación</p>
                        {trabajo.oferta?.materiales_incluidos && (
                          <p className="text-sm text-muted-foreground">
                            Materiales:{" "}
                            {trabajo.oferta.materiales_incluidos === "si"
                              ? "incluidos"
                              : trabajo.oferta.materiales_incluidos === "no"
                                ? "no incluidos"
                                : trabajo.oferta.materiales_incluidos === "parcial"
                                  ? "parcialmente incluidos"
                                  : trabajo.oferta.materiales_incluidos}
                          </p>
                        )}
                        <AdjuntosLista archivos={trabajo.oferta?.archivos} />
                        <div className="flex gap-3 pt-1">
                          <a
                            href={`/trabajos/${trabajo.id}/factura`}
                            target="_blank"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <FileText className="h-3 w-3" /> Ver factura y términos
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Trabajo en disputa: en revisión por el equipo */}
                    {trabajo?.estado === "en_disputa" && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
                        <Scale className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold text-amber-700 dark:text-amber-400">Trabajo en disputa</p>
                          <p className="text-sm text-muted-foreground">
                            El equipo de Diime está revisando el caso. El pago queda retenido hasta que se resuelva
                            (reembolso al cliente o liberación al profesional).
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Progress Section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Progreso del trabajo</span>
                        <span className="text-sm font-bold text-primary">{trabajo?.progreso || 0}%</span>
                      </div>
                      <Progress value={trabajo?.progreso || 0} className="h-3" />
                      
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Inicio:</span>
                          <span className="font-medium">
                            {trabajo?.fecha_inicio ? formatearFecha(trabajo.fecha_inicio) : "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Timer className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Entrega estimada:</span>
                          <span className="font-medium">
                            {trabajo?.fecha_estimada_fin ? formatearFecha(trabajo.fecha_estimada_fin) : "—"}
                          </span>
                        </div>
                      </div>
                      
                      {diasRestantes !== null && !esEntregado && (
                        <div className={`p-3 rounded-lg ${diasRestantes <= 0 ? "bg-red-500/10" : diasRestantes <= 3 ? "bg-amber-500/10" : "bg-blue-500/10"}`}>
                          <p className={`text-sm font-medium ${diasRestantes <= 0 ? "text-red-500" : diasRestantes <= 3 ? "text-amber-500" : "text-blue-500"}`}>
                            {diasRestantes <= 0 
                              ? "Fecha de entrega vencida" 
                              : diasRestantes === 1 
                                ? "Entrega mañana" 
                                : `${diasRestantes} días restantes`}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Updates Timeline */}
                    {trabajo?.actualizaciones && trabajo.actualizaciones.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm">Actualizaciones del profesional</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {trabajo.actualizaciones.map((update: any, idx: number) => (
                            <div key={idx} className="flex gap-3 text-sm">
                              <div className="flex flex-col items-center">
                                <div className="h-2 w-2 rounded-full bg-primary" />
                                {idx < trabajo.actualizaciones.length - 1 && (
                                  <div className="w-px h-full bg-border" />
                                )}
                              </div>
                              <div className="pb-3">
                                <p className="text-muted-foreground text-xs">
                                  {formatearFecha(update.fecha)}
                                </p>
                                <p>{update.mensaje}</p>
                                {update.progreso && (
                                  <Badge variant="secondary" className="mt-1">
                                    {update.progreso}% completado
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Abrir disputa mientras el trabajo está en curso (servicio no realizado o va mal) */}
                    {trabajo?.estado === "en_progreso" && (
                      <div className="flex justify-end">
                        <AbrirDisputaDialog trabajoId={trabajo.id} rol="cliente" />
                      </div>
                    )}

                    {/* Action Buttons */}
                    {esEntregado && (
                      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <Package className="h-5 w-5 text-purple-500 mt-0.5" />
                          <div>
                            <p className="font-semibold">El profesional ha marcado el trabajo como entregado</p>
                            <p className="text-sm text-muted-foreground">
                              Revisa el trabajo realizado y confirma su finalización para liberar el pago.
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <AlertDialog open={showConfirmDialog && selectedTrabajo?.id === trabajo?.id} onOpenChange={setShowConfirmDialog}>
                            <Button 
                              className="flex-1"
                              onClick={() => {
                                setSelectedTrabajo(trabajo)
                                setShowConfirmDialog(true)
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Confirmar y Liberar Pago
                            </Button>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar finalización del trabajo</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Al confirmar, el pago de {formatearPrecioEuros(trabajo?.precio_acordado)} será liberado al profesional.
                                  Esta acción no se puede deshacer. ¿Estás seguro de que el trabajo ha sido completado satisfactoriamente?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleConfirmarTrabajo(trabajo)}>
                                  Sí, confirmar y pagar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <Button
                            variant="outline"
                            className="bg-transparent text-destructive border-destructive/50 hover:bg-destructive/10"
                            onClick={() => {
                              setSelectedTrabajo(trabajo)
                              setShowRejectDialog(true)
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Rechazar entrega
                          </Button>
                        </div>
                        <p className="text-center text-xs text-muted-foreground pt-1">
                          Si rechazas la entrega, el pago sigue retenido y el equipo de Diime decidirá según las
                          pruebas y los términos acordados.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>
          )
        })}

        {/* Historial Tab */}
        <TabsContent value="historial" className="space-y-4">
          {solicitudesCompletadas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No tienes proyectos completados</p>
                <p className="text-muted-foreground text-center mt-1">
                  Los proyectos finalizados aparecerán aquí
                </p>
              </CardContent>
            </Card>
          ) : (
            solicitudesCompletadas.map((solicitud) => {
              const hasReview = solicitud.trabajo?.review_cliente_id
              return (
                <Card key={solicitud.id} className="bg-emerald-500/5 border-emerald-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                        </div>
                        <div>
                          <p className="font-semibold">{solicitud.titulo}</p>
                          <p className="text-sm text-muted-foreground">
                            Completado el {solicitud.trabajo?.fecha_fin
                              ? formatearFecha(solicitud.trabajo.fecha_fin)
                              : formatearFecha(solicitud.created_at)}
                          </p>
                          {solicitud.trabajo?.profesional && (
                            <p className="text-sm text-muted-foreground">
                              Profesional: {solicitud.trabajo.profesional.nombre} {solicitud.trabajo.profesional.apellido}
                            </p>
                          )}
                          {solicitud.trabajo?.id && (
                            <a
                              href={`/trabajos/${solicitud.trabajo.id}/factura`}
                              target="_blank"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                            >
                              <FileText className="h-3 w-3" /> Ver factura y términos
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{solicitud.trabajo?.precio_acordado || solicitud.presupuesto_max}EUR</p>
                        {hasReview ? (
                          <Badge variant="outline" className="bg-transparent mt-2 text-emerald-500 border-emerald-500/50">
                            <Check className="h-3 w-3 mr-1" />
                            Valorado
                          </Badge>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="mt-2 bg-transparent"
                            onClick={() => {
                              setSelectedTrabajo(solicitud.trabajo)
                              setShowReviewDialog(true)
                            }}
                          >
                            <Star className="h-4 w-4 mr-1" />
                            Dejar Valoracion
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>

        {/* Seguimiento de disputas: las que ha abierto el cliente y las que el
            profesional ha abierto contra él. */}
        <TabsContent value="disputas" className="space-y-4">
          <MisDisputas rol="cliente" />
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Valorar al profesional</DialogTitle>
            <DialogDescription>
              Tu valoracion ayuda a otros clientes y motiva a los profesionales a dar lo mejor de si.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Star Rating */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Puntuacion</label>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setReviewHover(star)}
                    onMouseLeave={() => setReviewHover(0)}
                    onClick={() => setReviewRating(star)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star 
                      className={`h-8 w-8 transition-colors ${
                        star <= (reviewHover || reviewRating) 
                          ? "fill-amber-500 text-amber-500" 
                          : "text-muted-foreground"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {reviewRating === 1 && "Muy malo"}
                {reviewRating === 2 && "Malo"}
                {reviewRating === 3 && "Aceptable"}
                {reviewRating === 4 && "Bueno"}
                {reviewRating === 5 && "Excelente"}
              </p>
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Comentario</label>
              <Textarea
                placeholder="Describe tu experiencia con este profesional..."
                value={reviewComentario}
                onChange={(e) => setReviewComentario(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="bg-transparent" onClick={() => {
              setShowReviewDialog(false)
              setSelectedTrabajo(null)
              setReviewRating(5)
              setReviewComentario("")
            }}>
              Omitir
            </Button>
            <Button onClick={handleSubmitReview} disabled={actionLoading || !reviewComentario.trim()}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar Valoracion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rechazar entrega → abre disputa (no reembolsa automáticamente) */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Rechazar la entrega</DialogTitle>
            <DialogDescription>
              Si la entrega no cumple lo acordado, puedes rechazarla. El pago{" "}
              <span className="font-medium">no se reembolsa automáticamente</span>: queda retenido en custodia y el
              equipo de Diime decidirá según las pruebas y los términos acordados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground flex items-start gap-2">
              <Scale className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <span>
                Se abrirá una disputa. Adjunta tus pruebas en el chat del trabajo (fotos, mensajes): Diime las
                revisará junto con lo acordado antes de decidir si te reembolsa o libera el pago al profesional.
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo del rechazo *</label>
              <Textarea
                placeholder="Explica por qué la entrega no cumple lo acordado..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="bg-transparent" onClick={() => {
              setShowRejectDialog(false)
              setRejectReason("")
            }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleRechazarTrabajo(selectedTrabajo)}
              disabled={actionLoading || !rejectReason.trim()}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Rechazar y abrir disputa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar demanda */}
      <Dialog open={!!editSolicitud} onOpenChange={(o) => !o && setEditSolicitud(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar demanda</DialogTitle>
            <DialogDescription>Modifica los datos de tu demanda. Solo es posible mientras siga abierta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Título</label>
              <Input value={editForm.titulo} onChange={(e) => setEditForm({ ...editForm, titulo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descripción</label>
              <Textarea
                rows={4}
                value={editForm.descripcion}
                onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Ubicación</label>
              <Input value={editForm.ubicacion} onChange={(e) => setEditForm({ ...editForm, ubicacion: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Presupuesto mín. (€)</label>
                <Input
                  type="number"
                  value={editForm.presupuesto_min}
                  onChange={(e) => setEditForm({ ...editForm, presupuesto_min: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Presupuesto máx. (€)</label>
                <Input
                  type="number"
                  value={editForm.presupuesto_max}
                  onChange={(e) => setEditForm({ ...editForm, presupuesto_max: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Urgencia</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={editForm.urgencia}
                onChange={(e) => setEditForm({ ...editForm, urgencia: e.target.value })}
              >
                <option value="urgente">Urgente</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="bg-transparent" onClick={() => setEditSolicitud(null)}>
              Cancelar
            </Button>
            <Button onClick={handleGuardarEdicion} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar aceptación de oferta: informa de los gastos de servicio */}
      <AlertDialog open={!!acceptOfertaTarget} onOpenChange={(o) => !o && setAcceptOfertaTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aceptar oferta y continuar al pago</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a aceptar la oferta de{" "}
              {formatearPrecioEuros(acceptOfertaTarget?.oferta?.precio)} para "
              {acceptOfertaTarget?.solicitud?.titulo}". Al pagar, Diime añadirá los gastos de servicio de la
              plataforma ({PLATFORM_CONFIG.comisionClientePorcentaje}%, mín. 2€).
            </AlertDialogDescription>
          </AlertDialogHeader>
          {acceptOfertaTarget?.oferta?.precio != null && (
            <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Precio del servicio</span>
                <span>{formatearPrecioEuros(acceptOfertaTarget.oferta.precio)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Gastos de servicio Diime ({PLATFORM_CONFIG.comisionClientePorcentaje}%)
                </span>
                <span>
                  {formatearPrecioEuros(calcularTotalCliente(acceptOfertaTarget.oferta.precio).comisionCliente)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total a pagar</span>
                <span className="text-primary">
                  {formatearPrecioEuros(calcularTotalCliente(acceptOfertaTarget.oferta.precio).totalCliente)}
                </span>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (acceptOfertaTarget) {
                  handleAceptarOferta(acceptOfertaTarget.oferta, acceptOfertaTarget.solicitud)
                  setAcceptOfertaTarget(null)
                }
              }}
            >
              <Check className="h-4 w-4 mr-2" />
              Aceptar y pagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar rechazo de oferta */}
      <AlertDialog open={!!rejectOfertaTarget} onOpenChange={(o) => !o && setRejectOfertaTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar esta oferta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se rechazará la oferta de {formatearPrecioEuros(rejectOfertaTarget?.precio)}. El profesional será
              notificado y no podrás deshacer esta acción.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleRechazarOferta()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Rechazar oferta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar borrado */}
      <AlertDialog open={!!deleteSolicitud} onOpenChange={(o) => !o && setDeleteSolicitud(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta demanda?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "{deleteSolicitud?.titulo}" de forma permanente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleBorrar()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
