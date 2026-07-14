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
  Scale,
} from "lucide-react"
import {
  obtenerMisTrabajos,
  actualizarProgresoTrabajo,
  marcarTrabajoEntregado,
} from "@/app/actions/trabajos"
import { crearConversacion } from "@/app/actions/messages"
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
import { AbrirDisputaDialog } from "@/components/abrir-disputa-dialog"
import { CancelacionTrabajo } from "@/components/cancelacion-trabajo"
import { calcularPagoProveedor, PLATFORM_CONFIG } from "@/lib/comisiones"

type EstadoTrabajo = "pendiente_pago" | "en_progreso" | "entregado" | "completado" | "cancelado" | "en_disputa"

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
  en_disputa: {
    label: "En disputa",
    color: "bg-amber-500",
    icon: Scale,
    description: "En revisión por el equipo de Diime",
  },
}

export default function MisTrabajosPage() {
  const [trabajos, setTrabajos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // Pestaña activa controlada: las tarjetas-resumen también la seleccionan.
  const [activeTab, setActiveTab] = useState("activos")
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

    // Refresco en vivo: cancelaciones, pagos y confirmaciones del cliente
    // aparecen sin recargar la página.
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return
      loadTrabajos(false)
    }, 15000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadTrabajos = async (inicial = true) => {
    if (inicial) setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id || null)

    const result = await obtenerMisTrabajos()
    // Solo datos reales (aunque estén vacíos): nada de datos de ejemplo.
    if (user && result.data) {
      const misTrabajos = result.data.filter((t: any) => t.profesional_id === user.id)
      setTrabajos(misTrabajos)
    } else {
      setTrabajos([])
    }
    if (inicial) setLoading(false)
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

  const handleContactarCliente = async (trabajo: any) => {
    if (!trabajo?.cliente_id) {
      toast({ title: "No disponible", description: "No se pudo identificar al cliente.", variant: "destructive" })
      return
    }
    const result = await crearConversacion({ otroUsuarioId: trabajo.cliente_id, trabajoId: trabajo.id })
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      router.push(result.data?.id ? `/mensajes?c=${result.data.id}` : "/mensajes")
    }
  }


  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  const formatCurrency = (amount: number) => {
    const isInteger = Number.isInteger(amount)
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: isInteger ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const getDaysRemaining = (fechaFin: string) => {
    const diff = new Date(fechaFin).getTime() - Date.now()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return days
  }

  const trabajosPendientePago = trabajos.filter((t) => t.estado === "pendiente_pago")
  // Los trabajos en disputa se muestran junto a los activos para que no desaparezcan de la vista.
  const trabajosEnProgreso = trabajos.filter((t) => t.estado === "en_progreso" || t.estado === "en_disputa")
  const trabajosEntregados = trabajos.filter((t) => t.estado === "entregado")
  const trabajosCompletados = trabajos.filter((t) => t.estado === "completado")

  // Importes NETOS para el proveedor (tras la comisión del 5% de la plataforma).
  const netoDe = (t: any) =>
    Number(t.transaccion_escrow?.pago_neto_proveedor ?? calcularPagoProveedor(t.precio_acordado || 0).pagoNeto)
  const totalPendienteCobro = trabajosEntregados.reduce((sum, t) => sum + netoDe(t), 0)
  // Histórico cobrado: escrows con el pago ya liberado (estado "completado").
  const totalCobrado = trabajosCompletados
    .filter((t) => t.transaccion_escrow?.estado === "completado")
    .reduce((sum, t) => sum + netoDe(t), 0)

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
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Gestión de Proyectos</h1>
          <p className="text-muted-foreground">
            Cronograma editable, lista de proyectos y eventos personalizados en un solo lugar
          </p>
        </div>

        {/* Summary Cards: mismos estados (y orden) que las pestañas de abajo,
            y clicables para saltar a la pestaña correspondiente. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
          <button type="button" className="text-left" onClick={() => setActiveTab("activos")}>
            <Card
              className={`w-full border-blue-500/20 bg-blue-500/5 transition hover:shadow-md ${
                activeTab === "activos" ? "ring-2 ring-primary/50" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Briefcase className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Activos</p>
                    <p className="text-2xl font-bold">
                      {trabajosEnProgreso.length + trabajosPendientePago.length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {trabajosPendientePago.length > 0
                        ? `${trabajosPendientePago.length} esperando pago`
                        : "en curso"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>

          <button type="button" className="text-left" onClick={() => setActiveTab("entregados")}>
            <Card
              className={`w-full border-purple-500/20 bg-purple-500/5 transition hover:shadow-md ${
                activeTab === "entregados" ? "ring-2 ring-primary/50" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Banknote className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Entregados</p>
                    <p className="text-2xl font-bold">{trabajosEntregados.length}</p>
                    <p className="text-xs text-muted-foreground">
                      pendiente de cobro: {formatCurrency(totalPendienteCobro)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>

          <button type="button" className="text-left" onClick={() => setActiveTab("completados")}>
            <Card
              className={`w-full border-emerald-500/20 bg-emerald-500/5 transition hover:shadow-md ${
                activeTab === "completados" ? "ring-2 ring-primary/50" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <DollarSign className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Completados</p>
                    <p className="text-2xl font-bold">{trabajosCompletados.length}</p>
                    <p className="text-xs text-muted-foreground">
                      total cobrado: {formatCurrency(totalCobrado)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>
        </div>

        {/* Two-column layout: jobs list on left, calendar on right */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
          {/* Left column: Tabs with job lists */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-muted/50 grid w-full grid-cols-3 h-auto">
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
                  onContactar={() => handleContactarCliente(trabajo)}
                  onRefresh={loadTrabajos}
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
                  onContactar={() => handleContactarCliente(trabajo)}
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
                  onContactar={() => handleContactarCliente(trabajo)}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  getDaysRemaining={getDaysRemaining}
                  showPaymentStatus
                />
              ))
            )}
          </TabsContent>
          </Tabs>

          {/* Right column: Calendar (sticky on desktop) */}
          <aside className="xl:sticky xl:top-24 xl:self-start space-y-4">
            <Card className="overflow-hidden border-emerald-200/60 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50/60 to-background dark:from-emerald-950/20">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                    <Calendar className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight">Calendario de proyectos</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Visualiza inicios, entregas, festivos y eventos personales
                    </p>
                  </div>
                </div>
                <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700">
                  <a href="/mi-calendario">
                    Abrir calendario
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-medium text-sm">Acciones rapidas</h3>
                </div>
                <div className="grid gap-2">
                  <Button variant="outline" size="sm" className="justify-start bg-transparent" asChild>
                    <a href="/mensajes">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Mensajes con clientes
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start bg-transparent" asChild>
                    <a href="/mis-ofertas">
                      <FileText className="h-4 w-4 mr-2" />
                      Ofertas enviadas
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start bg-transparent" asChild>
                    <a href="/incidencias">
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Incidencias
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>

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
  onContactar,
  onRefresh,
  formatDate,
  formatCurrency,
  getDaysRemaining,
  showPendingConfirmation,
  showPaymentStatus,
}: {
  trabajo: any
  onUpdateProgress?: () => void
  onMarkDelivered?: () => void
  onContactar?: () => void
  onRefresh?: () => void
  formatDate: (date: string) => string
  formatCurrency: (amount: number) => string
  getDaysRemaining: (date: string) => number
  showPendingConfirmation?: boolean
  showPaymentStatus?: boolean
}) {
  const config = estadoTrabajoConfig[trabajo.estado as EstadoTrabajo]
  const Icon = config?.icon || Clock
  const daysRemaining = trabajo.fecha_estimada_fin ? getDaysRemaining(trabajo.fecha_estimada_fin) : null
  // Estados reales del escrow: "fondos_retenidos" (pagado, en custodia) y
  // "completado" (pago liberado al proveedor).
  const escrowEstado = trabajo.transaccion_escrow?.estado
  const isPaid = escrowEstado === "fondos_retenidos" || escrowEstado === "completado"
  const isPaymentReleased = escrowEstado === "completado"
  const pagoNeto = Number(
    trabajo.transaccion_escrow?.pago_neto_proveedor ?? calcularPagoProveedor(trabajo.precio_acordado || 0).pagoNeto,
  )
  const comisionProveedor = Number(
    trabajo.transaccion_escrow?.comision_proveedor ??
      calcularPagoProveedor(trabajo.precio_acordado || 0).comisionProveedor,
  )
  const archivosOferta: string[] = Array.isArray(trabajo.oferta?.archivos) ? trabajo.oferta.archivos : []

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

            {/* Adjuntos de la oferta con la que se contrató este trabajo */}
            {archivosOferta.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> Archivos de tu oferta ({archivosOferta.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {archivosOferta.map((url: string, i: number) =>
                    /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) ? (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Adjunto ${i + 1}`}
                          className="h-14 w-14 rounded-md object-cover border hover:opacity-80 transition"
                        />
                      </a>
                    ) : (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted transition"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {decodeURIComponent(url.split("/").pop()?.split("?")[0] || `Archivo ${i + 1}`)}
                      </a>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Payment Status for Provider */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isPaid ? (
                    <>
                      <ShieldCheck className="h-5 w-5 text-emerald-500" />
                      <span className="text-sm">
                        {isPaymentReleased ? (
                          <span className="text-emerald-600 font-medium">
                            Pago recibido: {formatCurrency(pagoNeto)} netos
                          </span>
                        ) : (
                          <span className="text-blue-600">Pago retenido en custodia: cobrarás {formatCurrency(pagoNeto)}</span>
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
              <p className="text-xs text-muted-foreground mt-1">
                Precio acordado {formatCurrency(trabajo.precio_acordado || 0)} − comisión Diime{" "}
                {PLATFORM_CONFIG.comisionProveedorPorcentaje}% ({formatCurrency(comisionProveedor)}) ={" "}
                <span className="font-medium text-foreground">{formatCurrency(pagoNeto)} netos</span>
              </p>
              <div className="flex gap-3 mt-2">
                <a
                  href={`/trabajos/${trabajo.id}/contrato`}
                  target="_blank"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <FileText className="h-3 w-3" /> Ver contrato
                </a>
                {isPaid && (
                  <a
                    href={`/trabajos/${trabajo.id}/factura`}
                    target="_blank"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" /> Ver factura
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Actions Sidebar */}
          {(onUpdateProgress || onMarkDelivered || onContactar || showPendingConfirmation) && (
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
                  {/* Cancelación de mutuo acuerdo también con el trabajo en curso:
                      si el cliente acepta, se le reembolsa íntegramente. */}
                  <CancelacionTrabajo trabajo={trabajo} onChange={onRefresh} />
                </>
              )}
              {trabajo.estado === "pendiente_pago" && (
                <div className="py-4 space-y-3">
                  <div className="text-center">
                    <CreditCard className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      El proyecto iniciará cuando el cliente realice el pago
                    </p>
                  </div>
                  <CancelacionTrabajo trabajo={trabajo} onChange={onRefresh} />
                </div>
              )}
              {showPendingConfirmation && (
                <div className="text-center py-4">
                  <Clock className="h-8 w-8 mx-auto text-purple-500 mb-2 animate-pulse" />
                  <p className="text-sm text-muted-foreground">
                    Esperando confirmación del cliente
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cuando confirme la entrega, el pago se liberará a tu favor. Si no responde, puedes abrir una
                    disputa y el equipo de Diime revisará la entrega para liberarte el pago.
                  </p>
                </div>
              )}
              {trabajo.estado === "en_disputa" && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                  <Scale className="h-7 w-7 mx-auto text-amber-600 mb-1.5" />
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Trabajo en disputa</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    El equipo de Diime lo está revisando. El pago queda retenido hasta la resolución.
                  </p>
                </div>
              )}
              <Button variant="ghost" size="sm" className="w-full" onClick={onContactar}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Contactar Cliente
              </Button>
              {/* El proveedor puede abrir disputa cuando ya entregó y el cliente no confirma. */}
              {trabajo.estado === "entregado" && (
                <AbrirDisputaDialog
                  trabajoId={trabajo.id}
                  rol="proveedor"
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full bg-transparent text-amber-600 border-amber-500/40 hover:bg-amber-500/10"
                    >
                      <Scale className="h-4 w-4 mr-2" />
                      Abrir disputa
                    </Button>
                  }
                />
              )}
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
