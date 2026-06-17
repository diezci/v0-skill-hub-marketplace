"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatearPrecioEuros } from "@/lib/utils"
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
  Banknote, ShieldCheck, Timer, TrendingUp, User, Building, Eye, Pencil, Trash2
} from "lucide-react"
import { obtenerSolicitudesPorUsuario, actualizarSolicitud, eliminarSolicitud } from "@/app/actions/solicitudes"
import { aceptarOferta } from "@/app/actions/ofertas"
import { crearTransaccionEscrow, liberarFondosEscrow, rechazarTrabajoYReembolsar } from "@/app/actions/escrow"
import { obtenerMisTrabajos, actualizarProgresoTrabajo, marcarTrabajoEntregado, confirmarTrabajoCompletado } from "@/app/actions/trabajos"
import { crearResena } from "@/app/actions/reviews"
import { calcularTotalCliente, calcularReembolsoCliente, PLATFORM_CONFIG } from "@/lib/comisiones"
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

// Mock data for demonstration
const MOCK_SOLICITUDES = [
  {
    id: "mock-1",
    titulo: "Mesa de mármol a medida",
    descripcion: "Necesito una mesa de mármol blanco Carrara de 180x90cm para el salón. Preferiblemente con base de acero inoxidable.",
    categoria: { nombre: "Marmolista" },
    ubicacion: "Madrid, España",
    presupuesto_min: 2000,
    presupuesto_max: 4000,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    urgencia: "media",
    estado: "pendiente",
    ofertas: [
      {
        id: "oferta-1",
        profesional_id: "prof-1",
        profesional: {
          nombre: "Antonio",
          apellido: "García",
          foto_perfil: "/professional-man-construction.jpg",
          rating: 4.9,
          trabajos_completados: 127,
        },
        precio: 3200,
        tiempo_estimado: 21,
        unidad_tiempo: "días",
        descripcion: "Mesa de mármol Carrara de primera calidad con acabado pulido mate. Base de acero inoxidable cepillado. Incluye transporte e instalación.",
        estado: "pendiente",
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "oferta-2",
        profesional_id: "prof-2",
        profesional: {
          nombre: "María",
          apellido: "López",
          foto_perfil: "/professional-woman.png",
          rating: 4.7,
          trabajos_completados: 89,
        },
        precio: 2800,
        tiempo_estimado: 18,
        unidad_tiempo: "días",
        descripcion: "Fabricación artesanal con mármol Carrara importado. Estructura de acero con acabado negro mate. 2 años de garantía.",
        estado: "pendiente",
        created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: "mock-2",
    titulo: "Reforma completa de baño",
    descripcion: "Reforma integral del baño principal: cambio de azulejos, sanitarios, plato de ducha y mampara. Superficie aproximada 6m².",
    categoria: { nombre: "Albañil" },
    ubicacion: "Barcelona, España",
    presupuesto_min: 4000,
    presupuesto_max: 6000,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    urgencia: "alta",
    estado: "en-progreso",
    trabajo: {
      id: "trabajo-1",
      estado: "en_progreso",
      progreso: 65,
      precio_acordado: 5200,
      fecha_inicio: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      fecha_estimada_fin: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      profesional: {
        nombre: "Carlos",
        apellido: "Martínez",
        foto_perfil: "/contractor-man.jpg",
        rating: 4.8,
      },
      escrow: {
        estado: "fondos_retenidos",
        monto: 5200,
      },
      actualizaciones: [
        { fecha: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), mensaje: "Demolición completada", progreso: 20 },
        { fecha: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), mensaje: "Fontanería nueva instalada", progreso: 40 },
        { fecha: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), mensaje: "Azulejos colocados al 80%", progreso: 65 },
      ]
    },
    ofertas: [],
  },
  {
    id: "mock-3",
    titulo: "Instalación de aire acondicionado",
    descripcion: "Instalar 2 splits de aire acondicionado en salón y dormitorio principal.",
    categoria: { nombre: "Instalador" },
    ubicacion: "Valencia, España",
    presupuesto_min: 1500,
    presupuesto_max: 2500,
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    urgencia: "baja",
    estado: "en-progreso",
    trabajo: {
      id: "trabajo-2",
      estado: "entregado",
      progreso: 100,
      precio_acordado: 1800,
      fecha_inicio: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      fecha_estimada_fin: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      fecha_entrega: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      profesional: {
        nombre: "Pedro",
        apellido: "Sánchez",
        foto_perfil: "/electrician-man.jpg",
        rating: 4.6,
      },
      escrow: {
        id: "escrow-2",
        estado: "fondos_retenidos",
        monto: 1800,
      },
      actualizaciones: [
        { fecha: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), mensaje: "Equipos instalados", progreso: 80 },
        { fecha: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), mensaje: "Trabajo completado. Equipos funcionando correctamente.", progreso: 100 },
      ]
    },
    ofertas: [],
  },
]

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
    async function cargarDatos() {
      setLoading(true)
      
      const [solicitudesResult, trabajosResult] = await Promise.all([
        obtenerSolicitudesPorUsuario(),
        obtenerMisTrabajos()
      ])
      
      // Always show real data (even if empty) so the user sees their own solicitudes.
      // Only fall back to mock data on actual error.
      if (solicitudesResult.data) {
        setSolicitudes(solicitudesResult.data)
      } else if (solicitudesResult.error) {
        setSolicitudes(MOCK_SOLICITUDES)
      } else {
        setSolicitudes([])
      }
      
      if (trabajosResult.data) {
        setTrabajos(trabajosResult.data)
      }
      
      setLoading(false)
    }
    cargarDatos()
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
    
    // First reject the work
    const result = await rechazarTrabajoYReembolsar(trabajo.id, rejectReason)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Trabajo rechazado",
        description: `Se te reembolsaran ${result.reembolso?.toFixed(2) || ""}EUR. La comision de la plataforma (${PLATFORM_CONFIG.comisionClientePorcentaje}%) no es reembolsable.`,
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
  // Mock data uses "pendiente" | "en-progreso" | "completado" — accept both.
  const solicitudesPendientes = solicitudes.filter(
    (s) => s.estado === "abierta" || s.estado === "pendiente",
  )
  const solicitudesEnProgreso = solicitudes.filter(
    (s) => s.estado === "en_progreso" || s.estado === "en-progreso",
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
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Esperando ofertas</p>
                <p className="text-3xl font-bold">{solicitudesPendientes.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En progreso</p>
                <p className="text-3xl font-bold">{solicitudesEnProgreso.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completados</p>
                <p className="text-3xl font-bold">{solicitudesCompletadas.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendiente confirmar</p>
                <p className="text-3xl font-bold">
                  {solicitudes.filter(s => s.trabajo?.estado === "entregado").length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Package className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="solicitudes" className="gap-2">
            <FileText className="h-4 w-4" />
            Mis Solicitudes
          </TabsTrigger>
          <TabsTrigger value="en-progreso" className="gap-2">
            <Loader2 className="h-4 w-4" />
            En Progreso
          </TabsTrigger>
          <TabsTrigger value="historial" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Historial
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
            solicitudesPendientes.map((solicitud) => (
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
                        {formatearPrecioEuros(solicitud.presupuesto_min)} - {formatearPrecioEuros(solicitud.presupuesto_max)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground mb-4">{solicitud.descripcion}</p>

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
                  {solicitud.ofertas && solicitud.ofertas.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          {solicitud.ofertas.length} oferta{solicitud.ofertas.length !== 1 ? "s" : ""} recibida{solicitud.ofertas.length !== 1 ? "s" : ""}
                        </h4>
                      </div>
                      
                      <div className="grid gap-3">
                        {solicitud.ofertas.map((oferta: any) => (
                          <Card key={oferta.id} className="bg-muted/50">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-4">
                                <Avatar className="h-12 w-12">
                                  <AvatarImage src={oferta.profesional?.foto_perfil || "/placeholder.svg"} />
                                  <AvatarFallback>
                                    {oferta.profesional?.nombre?.[0]}{oferta.profesional?.apellido?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="font-semibold">
                                        {oferta.profesional?.nombre} {oferta.profesional?.apellido}
                                      </p>
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                          <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                                          {oferta.profesional?.rating || 4.5}
                                        </span>
                                        <span>•</span>
                                        <span>{oferta.profesional?.trabajos_completados || 50} trabajos</span>
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
                                  <div className="flex gap-2 mt-3">
                                    <Button 
                                      size="sm" 
                                      onClick={() => handleAceptarOferta(oferta, solicitud)}
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      Aceptar Oferta
                                    </Button>
                                    <Button size="sm" variant="outline" className="bg-transparent">
                                      <MessageSquare className="h-4 w-4 mr-1" />
                                      Contactar
                                    </Button>
                                    <Button size="sm" variant="ghost">
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
                  ) : (
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Aún no has recibido ofertas. Los profesionales están revisando tu solicitud.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* En Progreso Tab */}
        <TabsContent value="en-progreso" className="space-y-4">
          {solicitudesEnProgreso.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No tienes proyectos en progreso</p>
                <p className="text-muted-foreground text-center mt-1">
                  Cuando aceptes una oferta, el proyecto aparecerá aquí
                </p>
              </CardContent>
            </Card>
          ) : (
            solicitudesEnProgreso.map((solicitud) => {
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
                        {pagado && (
                          <Badge variant="outline" className="bg-transparent text-emerald-500 border-emerald-500/50">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Pago Protegido
                          </Badge>
                        )}
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
                      <Button variant="outline" size="sm" className="bg-transparent">
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Mensaje
                      </Button>
                    </div>

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
                            Rechazar y Solicitar Reembolso
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>

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

      {/* Reject / Refund Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Rechazar trabajo y solicitar reembolso</DialogTitle>
            <DialogDescription>
              Si el trabajo no cumple con lo acordado, puedes rechazarlo y solicitar un reembolso.
              La comision de la plataforma ({PLATFORM_CONFIG.comisionClientePorcentaje}%) no es reembolsable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedTrabajo && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Precio acordado</span>
                  <span>{selectedTrabajo.precio_acordado} EUR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comision plataforma (no reembolsable)</span>
                  <span className="text-destructive">
                    -{calcularTotalCliente(selectedTrabajo.precio_acordado).comisionCliente.toFixed(2)} EUR
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Reembolso estimado</span>
                  <span className="text-emerald-600">
                    {calcularReembolsoCliente(selectedTrabajo.precio_acordado).reembolso.toFixed(2)} EUR
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo del rechazo *</label>
              <Textarea
                placeholder="Explica por que el trabajo no cumple con lo acordado..."
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
              Rechazar y Reembolsar
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
