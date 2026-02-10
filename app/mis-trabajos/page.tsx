"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  MapPin,
  Euro,
  MessageSquare,
  Send,
  Package,
  Banknote,
  ShieldCheck,
  Timer,
  TrendingUp,
  AlertCircle,
  CreditCard,
  ArrowRight,
  FileText,
  ChevronRight,
  Briefcase,
  DollarSign,
  CheckCheck,
} from "lucide-react"
import {
  obtenerMisTrabajos,
  actualizarProgresoTrabajo,
  marcarTrabajoEntregado,
} from "@/app/actions/trabajos"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

type EstadoTrabajo = "pendiente_pago" | "en_progreso" | "entregado" | "completado" | "cancelado"

const estadoTrabajoConfig: Record<
  EstadoTrabajo,
  { label: string; color: string; icon: any; description: string }
> = {
  pendiente_pago: {
    label: "Esperando Pago",
    color: "bg-amber-500",
    icon: CreditCard,
    description: "El cliente debe realizar el pago para iniciar",
  },
  en_progreso: {
    label: "En Progreso",
    color: "bg-blue-500",
    icon: Loader2,
    description: "Trabajo en curso",
  },
  entregado: {
    label: "Entregado",
    color: "bg-purple-500",
    icon: Package,
    description: "Pendiente de confirmación del cliente",
  },
  completado: {
    label: "Completado",
    color: "bg-emerald-500",
    icon: CheckCircle2,
    description: "Trabajo finalizado",
  },
  cancelado: {
    label: "Cancelado",
    color: "bg-red-500",
    icon: XCircle,
    description: "Trabajo cancelado",
  },
}

// Mock data for demonstration
const MOCK_TRABAJOS = [
  {
    id: "trabajo-1",
    titulo: "Mesa de mármol a medida",
    descripcion: "Fabricación de mesa de mármol Carrara 180x90cm con base de acero negro",
    cliente: { nombre: "Laura", apellido: "Martínez", foto_perfil: "/woman-young.jpg" },
    precio_acordado: 2800,
    estado: "en_progreso" as EstadoTrabajo,
    progreso: 65,
    fecha_inicio: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    fecha_estimada_fin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ubicacion: "Madrid",
    transaccion_escrow: { estado: "retenido", monto: 2800 },
  },
  {
    id: "trabajo-2",
    titulo: "Encimera cocina mármol",
    descripcion: "Instalación de encimera de mármol en cocina con fregadero integrado",
    cliente: { nombre: "Carlos", apellido: "García", foto_perfil: "/business-man.png" },
    precio_acordado: 1500,
    estado: "pendiente_pago" as EstadoTrabajo,
    progreso: 0,
    fecha_inicio: new Date().toISOString(),
    fecha_estimada_fin: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
    ubicacion: "Barcelona",
    transaccion_escrow: null,
  },
  {
    id: "trabajo-3",
    titulo: "Lápida memorial personalizada",
    descripcion: "Lápida de granito negro con grabado personalizado y letras doradas",
    cliente: { nombre: "Ana", apellido: "López", foto_perfil: "/woman-middle-age.jpg" },
    precio_acordado: 950,
    estado: "entregado" as EstadoTrabajo,
    progreso: 100,
    fecha_inicio: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    fecha_estimada_fin: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    fecha_entrega: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ubicacion: "Valencia",
    transaccion_escrow: { estado: "retenido", monto: 950 },
  },
  {
    id: "trabajo-4",
    titulo: "Chimenea de mármol clásica",
    descripcion: "Restauración y montaje de chimenea de mármol estilo Luis XV",
    cliente: { nombre: "Roberto", apellido: "Fernández", foto_perfil: "/man-elderly.jpg" },
    precio_acordado: 3200,
    estado: "completado" as EstadoTrabajo,
    progreso: 100,
    fecha_inicio: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    fecha_fin: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    ubicacion: "Sevilla",
    transaccion_escrow: { estado: "liberado", monto: 3200, fecha_liberacion: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
  },
]

export default function MisTrabajosPage() {
  const [trabajos, setTrabajos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTrabajo, setSelectedTrabajo] = useState<any>(null)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false)
  const [newProgress, setNewProgress] = useState(0)
  const [updateMessage, setUpdateMessage] = useState("")
  const [deliveryMessage, setDeliveryMessage] = useState("")
  const [updating, setUpdating] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    loadTrabajos()
  }, [])

  const loadTrabajos = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id || null)

    const result = await obtenerMisTrabajos()
    if (result.data && result.data.length > 0) {
      // Filter to show only where user is the professional
      const misTrabajos = result.data.filter((t: any) => t.profesional_id === user?.id)
      setTrabajos(misTrabajos)
    } else {
      setTrabajos(MOCK_TRABAJOS)
    }
    setLoading(false)
  }

  const handleUpdateProgress = async () => {
    if (!selectedTrabajo) return
    setUpdating(true)
    
    const result = await actualizarProgresoTrabajo(
      selectedTrabajo.id,
      newProgress,
      updateMessage || undefined
    )

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Progreso actualizado",
        description: `El progreso se ha actualizado al ${newProgress}%`,
      })
      loadTrabajos()
      setUpdateDialogOpen(false)
      setUpdateMessage("")
    }
    setUpdating(false)
  }

  const handleMarkDelivered = async () => {
    if (!selectedTrabajo) return
    setUpdating(true)

    const result = await marcarTrabajoEntregado(selectedTrabajo.id, deliveryMessage || undefined)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Trabajo entregado",
        description: "El cliente ha sido notificado para confirmar la entrega",
      })
      loadTrabajos()
      setDeliveryDialogOpen(false)
      setDeliveryMessage("")
    }
    setUpdating(false)
  }

  const openUpdateDialog = (trabajo: any) => {
    setSelectedTrabajo(trabajo)
    setNewProgress(trabajo.progreso || 0)
    setUpdateDialogOpen(true)
  }

  const openDeliveryDialog = (trabajo: any) => {
    setSelectedTrabajo(trabajo)
    setDeliveryDialogOpen(true)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(amount)
  }

  const getDaysRemaining = (fechaFin: string) => {
    const diff = new Date(fechaFin).getTime() - Date.now()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return days
  }

  const trabajosPendientePago = trabajos.filter((t) => t.estado === "pendiente_pago")
  const trabajosEnProgreso = trabajos.filter((t) => t.estado === "en_progreso")
  const trabajosEntregados = trabajos.filter((t) => t.estado === "entregado")
  const trabajosCompletados = trabajos.filter((t) => t.estado === "completado")

  const totalPendienteCobro = trabajosEntregados.reduce((sum, t) => sum + (t.precio_acordado || 0), 0)
  const totalCobrado = trabajosCompletados
    .filter((t) => t.transaccion_escrow?.estado === "liberado")
    .reduce((sum, t) => sum + (t.precio_acordado || 0), 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Mis Trabajos</h1>
          <p className="text-muted-foreground">
            Gestiona tus proyectos como proveedor, actualiza el progreso y entrega trabajos
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <CreditCard className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Esperando pago</p>
                  <p className="text-2xl font-bold">{trabajosPendientePago.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Loader2 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">En progreso</p>
                  <p className="text-2xl font-bold">{trabajosEnProgreso.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Banknote className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pendiente de cobro</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalPendienteCobro)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total cobrado</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalCobrado)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="activos" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="activos" className="gap-2">
              <Briefcase className="h-4 w-4" />
              Activos ({trabajosEnProgreso.length + trabajosPendientePago.length})
            </TabsTrigger>
            <TabsTrigger value="entregados" className="gap-2">
              <Package className="h-4 w-4" />
              Entregados ({trabajosEntregados.length})
            </TabsTrigger>
            <TabsTrigger value="completados" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Completados ({trabajosCompletados.length})
            </TabsTrigger>
          </TabsList>

          {/* Active Jobs */}
          <TabsContent value="activos" className="space-y-4">
            {[...trabajosEnProgreso, ...trabajosPendientePago].length === 0 ? (
              <Card className="p-12 text-center">
                <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No tienes trabajos activos</h3>
                <p className="text-muted-foreground mb-4">
                  Busca demandas de servicios y envía ofertas para conseguir nuevos proyectos
                </p>
                <Button onClick={() => router.push("/demandas")} className="bg-emerald-600 hover:bg-emerald-700">
                  Ver demandas disponibles
                </Button>
              </Card>
            ) : (
              [...trabajosEnProgreso, ...trabajosPendientePago].map((trabajo) => (
                <TrabajoCard
                  key={trabajo.id}
                  trabajo={trabajo}
                  onUpdateProgress={() => openUpdateDialog(trabajo)}
                  onMarkDelivered={() => openDeliveryDialog(trabajo)}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  getDaysRemaining={getDaysRemaining}
                />
              ))
            )}
          </TabsContent>

          {/* Delivered Jobs */}
          <TabsContent value="entregados" className="space-y-4">
            {trabajosEntregados.length === 0 ? (
              <Card className="p-12 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No tienes trabajos pendientes de confirmación</h3>
                <p className="text-muted-foreground">
                  Los trabajos entregados aparecerán aquí hasta que el cliente confirme
                </p>
              </Card>
            ) : (
              trabajosEntregados.map((trabajo) => (
                <TrabajoCard
                  key={trabajo.id}
                  trabajo={trabajo}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  getDaysRemaining={getDaysRemaining}
                  showPendingConfirmation
                />
              ))
            )}
          </TabsContent>

          {/* Completed Jobs */}
          <TabsContent value="completados" className="space-y-4">
            {trabajosCompletados.length === 0 ? (
              <Card className="p-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No tienes trabajos completados</h3>
                <p className="text-muted-foreground">
                  Los trabajos finalizados y confirmados aparecerán aquí
                </p>
              </Card>
            ) : (
              trabajosCompletados.map((trabajo) => (
                <TrabajoCard
                  key={trabajo.id}
                  trabajo={trabajo}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  getDaysRemaining={getDaysRemaining}
                  showPaymentStatus
                />
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Update Progress Dialog */}
        <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Actualizar Progreso</DialogTitle>
              <DialogDescription>
                Actualiza el estado de avance del proyecto "{selectedTrabajo?.titulo}"
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Progreso actual</span>
                  <span className="text-sm font-bold text-emerald-600">{newProgress}%</span>
                </div>
                <Slider
                  value={[newProgress]}
                  onValueChange={(v) => setNewProgress(v[0])}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Mensaje para el cliente (opcional)</label>
                <Textarea
                  placeholder="Describe los avances realizados..."
                  value={updateMessage}
                  onChange={(e) => setUpdateMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUpdateDialogOpen(false)} className="bg-transparent">
                Cancelar
              </Button>
              <Button
                onClick={handleUpdateProgress}
                disabled={updating}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Actualizar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mark Delivered Dialog */}
        <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Marcar como Entregado</DialogTitle>
              <DialogDescription>
                Notifica al cliente que el trabajo "{selectedTrabajo?.titulo}" está listo
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <div className="flex items-start gap-3">
                  <Package className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-purple-700 dark:text-purple-300">
                      Al marcar como entregado:
                    </p>
                    <ul className="mt-1 text-muted-foreground space-y-1">
                      <li>El cliente recibirá una notificación</li>
                      <li>Tendrá que revisar y confirmar el trabajo</li>
                      <li>Una vez confirmado, se liberará el pago</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Mensaje de entrega (opcional)</label>
                <Textarea
                  placeholder="Añade detalles sobre la entrega, instrucciones de uso, etc."
                  value={deliveryMessage}
                  onChange={(e) => setDeliveryMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeliveryDialogOpen(false)} className="bg-transparent">
                Cancelar
              </Button>
              <Button
                onClick={handleMarkDelivered}
                disabled={updating}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Package className="h-4 w-4 mr-2" />}
                Marcar como Entregado
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function TrabajoCard({
  trabajo,
  onUpdateProgress,
  onMarkDelivered,
  formatDate,
  formatCurrency,
  getDaysRemaining,
  showPendingConfirmation,
  showPaymentStatus,
}: {
  trabajo: any
  onUpdateProgress?: () => void
  onMarkDelivered?: () => void
  formatDate: (date: string) => string
  formatCurrency: (amount: number) => string
  getDaysRemaining: (date: string) => number
  showPendingConfirmation?: boolean
  showPaymentStatus?: boolean
}) {
  const config = estadoTrabajoConfig[trabajo.estado as EstadoTrabajo]
  const Icon = config?.icon || Clock
  const daysRemaining = trabajo.fecha_estimada_fin ? getDaysRemaining(trabajo.fecha_estimada_fin) : null
  const isPaid = trabajo.transaccion_escrow?.estado === "retenido" || trabajo.transaccion_escrow?.estado === "liberado"
  const isPaymentReleased = trabajo.transaccion_escrow?.estado === "liberado"

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row">
          {/* Main Content */}
          <div className="flex-1 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 border-2 border-background">
                  <AvatarImage src={trabajo.cliente?.foto_perfil || "/placeholder.svg"} />
                  <AvatarFallback>
                    {trabajo.cliente?.nombre?.[0]}
                    {trabajo.cliente?.apellido?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium">
                    {trabajo.cliente?.nombre} {trabajo.cliente?.apellido}
                  </p>
                </div>
              </div>
              <Badge className={`${config?.color} text-white`}>
                <Icon className="h-3 w-3 mr-1" />
                {config?.label}
              </Badge>
            </div>

            <h3 className="text-lg font-semibold mb-2">{trabajo.titulo}</h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {trabajo.descripcion}
            </p>

            {/* Progress Bar */}
            {(trabajo.estado === "en_progreso" || trabajo.estado === "entregado") && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Progreso</span>
                  <span className="font-medium">{trabajo.progreso || 0}%</span>
                </div>
                <Progress value={trabajo.progreso || 0} className="h-2" />
              </div>
            )}

            {/* Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{trabajo.ubicacion}</span>
              </div>
              <div className="flex items-center gap-2">
                <Euro className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{formatCurrency(trabajo.precio_acordado)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{formatDate(trabajo.fecha_inicio)}</span>
              </div>
              {trabajo.fecha_estimada_fin && trabajo.estado !== "completado" && (
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className={daysRemaining && daysRemaining < 0 ? "text-red-500 font-medium" : ""}>
                    {daysRemaining && daysRemaining > 0
                      ? `${daysRemaining} días restantes`
                      : daysRemaining === 0
                      ? "Vence hoy"
                      : `${Math.abs(daysRemaining || 0)} días de retraso`}
                  </span>
                </div>
              )}
            </div>

            {/* Payment Status for Provider */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isPaid ? (
                    <>
                      <ShieldCheck className="h-5 w-5 text-emerald-500" />
                      <span className="text-sm">
                        {isPaymentReleased ? (
                          <span className="text-emerald-600 font-medium">Pago recibido</span>
                        ) : (
                          <span className="text-blue-600">Pago retenido en escrow</span>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-amber-500" />
                      <span className="text-sm text-amber-600">Esperando pago del cliente</span>
                    </>
                  )}
                </div>
                {showPaymentStatus && isPaymentReleased && trabajo.transaccion_escrow?.fecha_liberacion && (
                  <span className="text-xs text-muted-foreground">
                    Liberado el {formatDate(trabajo.transaccion_escrow.fecha_liberacion)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions Sidebar */}
          {(onUpdateProgress || onMarkDelivered || showPendingConfirmation) && (
            <div className="lg:w-56 p-6 bg-muted/30 border-t lg:border-t-0 lg:border-l flex flex-col gap-3">
              {trabajo.estado === "en_progreso" && onUpdateProgress && (
                <>
                  <Button onClick={onUpdateProgress} className="w-full bg-emerald-600 hover:bg-emerald-700">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Actualizar Progreso
                  </Button>
                  {trabajo.progreso >= 90 && onMarkDelivered && (
                    <Button onClick={onMarkDelivered} variant="outline" className="w-full bg-transparent">
                      <Package className="h-4 w-4 mr-2" />
                      Entregar Trabajo
                    </Button>
                  )}
                </>
              )}
              {trabajo.estado === "pendiente_pago" && (
                <div className="text-center py-4">
                  <CreditCard className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    El proyecto iniciará cuando el cliente realice el pago
                  </p>
                </div>
              )}
              {showPendingConfirmation && (
                <div className="text-center py-4">
                  <Clock className="h-8 w-8 mx-auto text-purple-500 mb-2 animate-pulse" />
                  <p className="text-sm text-muted-foreground">
                    Esperando confirmación del cliente
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    El pago se liberará automáticamente
                  </p>
                </div>
              )}
              <Button variant="ghost" size="sm" className="w-full">
                <MessageSquare className="h-4 w-4 mr-2" />
                Contactar Cliente
              </Button>
            </div>
          )}

          {/* Completed Payment Status */}
          {showPaymentStatus && !showPendingConfirmation && (
            <div className="lg:w-56 p-6 bg-muted/30 border-t lg:border-t-0 lg:border-l flex flex-col justify-center items-center">
              {isPaymentReleased ? (
                <>
                  <div className="p-3 rounded-full bg-emerald-500/10 mb-3">
                    <CheckCheck className="h-8 w-8 text-emerald-500" />
                  </div>
                  <p className="font-medium text-emerald-600">Cobrado</p>
                  <p className="text-2xl font-bold">{formatCurrency(trabajo.precio_acordado)}</p>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-full bg-amber-500/10 mb-3">
                    <Clock className="h-8 w-8 text-amber-500" />
                  </div>
                  <p className="font-medium text-amber-600">Pendiente</p>
                  <p className="text-sm text-muted-foreground">de cobro</p>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
