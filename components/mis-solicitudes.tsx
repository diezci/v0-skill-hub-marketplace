"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { 
  Clock, CheckCircle2, XCircle, Loader2, Calendar, MapPin, Euro, MessageSquare, FileText,
  CreditCard, AlertCircle, Send, Check, Star, ChevronRight, ArrowRight, Package,
  Banknote, ShieldCheck, Timer, TrendingUp, User, Building, Eye
} from "lucide-react"
import { obtenerSolicitudesPorUsuario } from "@/app/actions/solicitudes"
import { crearTransaccionEscrow, liberarFondosEscrow } from "@/app/actions/escrow"
import { obtenerMisTrabajos, actualizarProgresoTrabajo, marcarTrabajoEntregado, confirmarTrabajoCompletado } from "@/app/actions/trabajos"
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
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    async function cargarDatos() {
      setLoading(true)
      
      const [solicitudesResult, trabajosResult] = await Promise.all([
        obtenerSolicitudesPorUsuario(),
        obtenerMisTrabajos()
      ])
      
      if (solicitudesResult.data && solicitudesResult.data.length > 0) {
        setSolicitudes(solicitudesResult.data)
      } else {
        setSolicitudes(MOCK_SOLICITUDES)
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
      description: "Creando transacción de pago seguro",
    })
    
    // In real implementation, this would create the escrow and redirect to payment
    router.push(`/pago?oferta=${oferta.id}`)
  }

  const handleConfirmarTrabajo = async (trabajo: any) => {
    const result = await confirmarTrabajoCompletado(trabajo.id)
    
    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      // Release escrow funds
      if (trabajo.escrow?.id) {
        await liberarFondosEscrow(trabajo.escrow.id)
      }
      
      toast({
        title: "Trabajo confirmado",
        description: "El pago ha sido liberado al profesional. ¡Gracias por usar SkillHub!",
      })
      setShowConfirmDialog(false)
      setSelectedTrabajo(null)
      
      // Refresh data
      const result = await obtenerMisTrabajos()
      if (result.data) setTrabajos(result.data)
    }
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

  const solicitudesPendientes = solicitudes.filter(s => s.estado === "pendiente")
  const solicitudesEnProgreso = solicitudes.filter(s => s.estado === "en-progreso")
  const solicitudesCompletadas = solicitudes.filter(s => s.estado === "completado" || s.estado === "completada")

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
                        {solicitud.presupuesto_min}€ - {solicitud.presupuesto_max}€
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground mb-4">{solicitud.descripcion}</p>
                  
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
                                      <p className="text-xl font-bold text-primary">{oferta.precio}€</p>
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
                        <p className="text-2xl font-bold">{trabajo?.precio_acordado}€</p>
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
                                  Al confirmar, el pago de {trabajo?.precio_acordado}€ será liberado al profesional.
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
                          <Button variant="outline" className="bg-transparent">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            Reportar Problema
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
            solicitudesCompletadas.map((solicitud) => (
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
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{solicitud.trabajo?.precio_acordado || solicitud.presupuesto_max}€</p>
                      <Button size="sm" variant="outline" className="mt-2 bg-transparent">
                        <Star className="h-4 w-4 mr-1" />
                        Dejar Valoración
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
