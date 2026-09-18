"use client"

import { useIdioma } from "@/components/idioma-provider"
import { localeDe } from "@/lib/i18n"

import { useState, useEffect, Suspense } from "react"
import { useNotificacionesSeccion } from "@/hooks/use-notificaciones-seccion"
import { useDestinoNotificacion } from "@/hooks/use-destino-notificacion"
import { AvisosTarjeta, type AvisoTarjeta } from "@/components/avisos-tarjeta"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent } from "@/components/ui/tabs"
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
import MisDisputas from "@/components/mis-disputas"
import { AdjuntosLista } from "@/components/adjuntos-lista"
import { EnlacePerfil } from "@/components/enlace-perfil"
import { calcularPagoProveedor } from "@/lib/comisiones"

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
  return <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>}><MisTrabajosPageContenido /></Suspense>
}

function MisTrabajosPageContenido() {
  const { t, idioma } = useIdioma()

  const { paraEntidad, marcarLeidas } = useNotificacionesSeccion("/mis-trabajos")
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
        title: t("Error"),
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: t("Progreso actualizado"),
        description: t("El progreso se ha actualizado al {progreso}%", { progreso: newProgress }),
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
        title: t("Error"),
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: t("Trabajo entregado"),
        description: t("El cliente ha sido notificado para confirmar la entrega"),
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
      toast({ title: t("No disponible"), description: t("No se pudo identificar al cliente."), variant: "destructive" })
      return
    }
    const result = await crearConversacion({ otroUsuarioId: trabajo.cliente_id, trabajoId: trabajo.id })
    if (result.error) {
      toast({ title: t("Error"), description: result.error, variant: "destructive" })
    } else {
      router.push(result.data?.id ? `/mensajes?c=${result.data.id}` : "/mensajes")
    }
  }


  // Sin fecha salía "1 ene 1970": new Date(null) es la época de Unix. Un trabajo
  // puede no tener fecha de inicio todavía (se pone al confirmarse el pago).
  const formatDate = (date: string | null | undefined) => {
    if (!date) return t("Sin fecha")
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return t("Sin fecha")
    return d.toLocaleDateString(localeDe(idioma), {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  const formatCurrency = (amount: number) => {
    const isInteger = Number.isInteger(amount)
    return new Intl.NumberFormat(localeDe(idioma), {
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

  // Los trabajos sin pagar (pendiente_pago) NO aparecen aquí: hasta que el
  // cliente complete el pago viven en Mis Pujas como "aceptada, esperando pago".
  // A Gestión de Proyectos solo llegan trabajos ya pagados.
  // Los trabajos en disputa viven solo en la pestaña Disputas: mientras Diime
  // decide no hay nada que gestionar en Activos, y verlos duplicados en ambas
  // pestañas confundía.
  const trabajosEnProgreso = trabajos.filter((t) => t.estado === "en_progreso")
  const trabajosEntregados = trabajos.filter((t) => t.estado === "entregado")
  const trabajosCompletados = trabajos.filter((t) => t.estado === "completado")
  const trabajosEnDisputa = trabajos.filter((t) => t.estado === "en_disputa")
  const trabajosCancelados = trabajos.filter((t) => t.estado === "cancelado")

  // Importes NETOS para el proveedor (tras la comisión de la plataforma).
  const netoDe = (t: any) =>
    Number(t.transaccion_escrow?.pago_neto_proveedor ?? calcularPagoProveedor(t.precio_acordado || 0).pagoNeto)
  const totalPendienteCobro = trabajosEntregados.reduce((sum, t) => sum + netoDe(t), 0)
  // Histórico cobrado: escrows con el pago ya liberado (estado "completado").
  const totalCobrado = trabajosCompletados
    .filter((t) => t.transaccion_escrow?.estado === "completado")
    .reduce((sum, t) => sum + netoDe(t), 0)
  // Total neto (a cobrar) de los trabajos activos (ya pagados y en curso).
  const totalActivosNeto = trabajosEnProgreso.reduce((sum, t) => sum + netoDe(t), 0)
  // Dinero retenido por una disputa abierta: es lo que está en juego mientras
  // Diime decide, y lo primero que se quiere ver de un vistazo.
  const totalEnDisputa = trabajosEnDisputa.reduce((sum, t) => sum + netoDe(t), 0)

  useDestinoNotificacion({
    cargando: loading,
    seleccionar: setActiveTab,
    resolver: (params) => {
      const trabajo = trabajos.find((item) => params.get("trabajo") ? item.id === params.get("trabajo")
        : params.get("solicitud") ? item.solicitud_id === params.get("solicitud") : false)
      const esDisputa = params.get("aspecto")?.includes("disputa") || params.get("aspecto") === "trabajo_rechazado"
      if (!trabajo) return esDisputa ? { id: "disputas-proveedor", tab: "disputas" } : null
      const tab = esDisputa ? "disputas" : trabajo.estado === "entregado" ? "entregados"
        : trabajo.estado === "completado" ? "completados"
        : trabajo.estado === "en_disputa" ? "disputas"
        : trabajo.estado === "cancelado" ? "cancelados" : "activos"
      return { id: tab === "disputas" ? "disputas-proveedor" : `trabajo-${trabajo.id}`, tab }
    },
  })
  const avisosTrabajo = (trabajo: any) => paraEntidad({ trabajoId: trabajo.id, solicitudId: trabajo.solicitud_id, ofertaId: trabajo.oferta_id })

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
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{t("Gestión de Proyectos")}</h1>
          <p className="text-muted-foreground">
            {t("Cronograma editable, lista de proyectos y eventos personalizados en un solo lugar")}</p>
        </div>

        {/* Estas tarjetas SON la navegación: cada una salta a su pestaña. Antes
            había además una barra de pestañas debajo con los mismos cuatro
            destinos, que solo duplicaba esto. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4 mb-8">
          <button type="button" className="text-left h-full" onClick={() => setActiveTab("activos")}>
            <Card
              className={`w-full h-full border-blue-500/20 bg-blue-500/5 transition hover:shadow-md ${
                activeTab === "activos" ? "ring-2 ring-primary/50" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Briefcase className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Activos")}</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalActivosNeto)}</p>
                    <p className="text-xs text-muted-foreground">
                      {trabajosEnProgreso.length} {" "}{t("trabajo")}{trabajosEnProgreso.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>

          <button type="button" className="text-left h-full" onClick={() => setActiveTab("entregados")}>
            <Card
              className={`w-full h-full border-purple-500/20 bg-purple-500/5 transition hover:shadow-md ${
                activeTab === "entregados" ? "ring-2 ring-primary/50" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Banknote className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Entregados · pendiente de cobro")}</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalPendienteCobro)}</p>
                    <p className="text-xs text-muted-foreground">
                      {trabajosEntregados.length} {" "}{t("esperando confirmación del cliente")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>

          <button type="button" className="text-left h-full" onClick={() => setActiveTab("completados")}>
            <Card
              className={`w-full h-full border-emerald-500/20 bg-emerald-500/5 transition hover:shadow-md ${
                activeTab === "completados" ? "ring-2 ring-primary/50" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <DollarSign className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Completados · total cobrado (neto)")}</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalCobrado)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(trabajosCompletados.length === 1 ? "{cantidad} trabajo finalizado" : "{cantidad} trabajos finalizados", { cantidad: trabajosCompletados.length })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>

          {/* Disputas: en euros, porque lo que importa es cuánto dinero está
              retenido mientras se resuelve, no solo cuántos expedientes hay. */}
          <button type="button" className="text-left h-full" onClick={() => setActiveTab("disputas")}>
            <Card
              className={`w-full h-full border-rose-500/20 bg-rose-500/5 transition hover:shadow-md ${
                activeTab === "disputas" ? "ring-2 ring-primary/50" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-rose-500/10">
                    <Scale className="h-5 w-5 text-rose-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("En disputa · retenido")}</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalEnDisputa)}</p>
                    <p className="text-xs text-muted-foreground">
                      {trabajosEnDisputa.length} {" "}{t("trabajo")}{trabajosEnDisputa.length !== 1 ? "s" : ""} {" "}{t("en disputa")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>
          <button type="button" className="text-left h-full" onClick={() => setActiveTab("cancelados")}>
            <Card className={`w-full h-full border-red-500/20 bg-red-500/5 transition hover:shadow-md ${activeTab === "cancelados" ? "ring-2 ring-primary/50" : ""}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <XCircle className="h-6 w-6 text-red-500" />
                <div><p className="text-sm text-muted-foreground">{t("Cancelados")}</p><p className="text-2xl font-bold">{trabajosCancelados.length}</p></div>
              </CardContent>
            </Card>
          </button>
        </div>

        {/* Two-column layout: jobs list on left, calendar on right */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
          {/* Left column: Tabs with job lists */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Active Jobs */}
          <TabsContent value="activos" className="space-y-4">
            {trabajosEnProgreso.length === 0 ? (
              <Card className="p-12 text-center">
                <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">{t("No tienes trabajos activos")}</h3>
                <p className="text-muted-foreground mb-4">
                  {t("Busca demandas de servicios y envía ofertas para conseguir nuevos proyectos")}</p>
                <Button onClick={() => router.push("/demandas")} className="bg-emerald-600 hover:bg-emerald-700">
                  {t("Ver demandas disponibles")}</Button>
              </Card>
            ) : (
              trabajosEnProgreso.map((trabajo) => (
                <TrabajoCard
                  key={trabajo.id}
                  trabajo={trabajo}
                  avisos={avisosTrabajo(trabajo)}
                  onMarcarLeidas={marcarLeidas}
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
                <h3 className="text-lg font-medium mb-2">{t("No tienes trabajos pendientes de confirmación")}</h3>
                <p className="text-muted-foreground">
                  {t("Los trabajos entregados aparecerán aquí hasta que el cliente confirme")}</p>
              </Card>
            ) : (
              trabajosEntregados.map((trabajo) => (
                <TrabajoCard
                  key={trabajo.id}
                  trabajo={trabajo}
                  avisos={avisosTrabajo(trabajo)}
                  onMarcarLeidas={marcarLeidas}
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
                <h3 className="text-lg font-medium mb-2">{t("No tienes trabajos completados")}</h3>
                <p className="text-muted-foreground">
                  {t("Los trabajos finalizados y confirmados aparecerán aquí")}</p>
              </Card>
            ) : (
              trabajosCompletados.map((trabajo) => (
                <TrabajoCard
                  key={trabajo.id}
                  trabajo={trabajo}
                  avisos={avisosTrabajo(trabajo)}
                  onMarcarLeidas={marcarLeidas}
                  onContactar={() => handleContactarCliente(trabajo)}
                  formatDate={formatDate}
                  formatCurrency={formatCurrency}
                  getDaysRemaining={getDaysRemaining}
                  showPaymentStatus
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="cancelados" className="space-y-4">
            {trabajosCancelados.length === 0 ? (
              <Card className="p-12 text-center">
                <XCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">{t("No tienes trabajos cancelados")}</h3>
                <p className="text-muted-foreground">{t("Los trabajos cancelados y sus novedades aparecerán aquí")}</p>
              </Card>
            ) : trabajosCancelados.map((trabajo) => (
              <TrabajoCard key={trabajo.id} trabajo={trabajo} avisos={avisosTrabajo(trabajo)} onMarcarLeidas={marcarLeidas}
                onContactar={() => handleContactarCliente(trabajo)} formatDate={formatDate} formatCurrency={formatCurrency} getDaysRemaining={getDaysRemaining} />
            ))}
          </TabsContent>

          {/* Seguimiento de disputas: las que ha abierto el profesional y las
              que el cliente ha abierto contra él. */}
          <TabsContent value="disputas" id="disputas-proveedor" tabIndex={-1} className="scroll-mt-24 space-y-4">
            <MisDisputas rol="proveedor" />
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
                    <h3 className="font-semibold leading-tight">{t("Calendario de proyectos")}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("Visualiza inicios, entregas, festivos y eventos personales")}</p>
                  </div>
                </div>
                <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700">
                  <a href="/mi-calendario">
                    {t("Abrir calendario")}<ArrowRight className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-medium text-sm">{t("Acciones rapidas")}</h3>
                </div>
                <div className="grid gap-2">
                  <Button variant="outline" size="sm" className="justify-start bg-transparent" asChild>
                    <a href="/mensajes">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      {t("Mensajes con clientes")}</a>
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start bg-transparent" asChild>
                    <a href="/mis-ofertas">
                      <FileText className="h-4 w-4 mr-2" />
                      {t("Pujas enviadas")}</a>
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start bg-transparent" asChild>
                    <a href="/incidencias">
                      <AlertCircle className="h-4 w-4 mr-2" />
                      {t("Incidencias")}</a>
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
              <DialogTitle>{t("Actualizar Progreso")}</DialogTitle>
              <DialogDescription>
                {t('Actualiza el estado de avance del proyecto "{titulo}"', { titulo: selectedTrabajo?.titulo || "" })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">{t("Progreso actual")}</span>
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
                <label className="text-sm font-medium">{t("Mensaje para el cliente (opcional)")}</label>
                <Textarea
                  placeholder={t("Describe los avances realizados...")}
                  value={updateMessage}
                  onChange={(e) => setUpdateMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUpdateDialogOpen(false)} className="bg-transparent">
                {t("Cancelar")}</Button>
              <Button
                onClick={handleUpdateProgress}
                disabled={updating}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t("Actualizar")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mark Delivered Dialog */}
        <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("Marcar como Entregado")}</DialogTitle>
              <DialogDescription>
                {t('Notifica al cliente que el trabajo "{titulo}" está listo', { titulo: selectedTrabajo?.titulo || "" })}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <div className="flex items-start gap-3">
                  <Package className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-purple-700 dark:text-purple-300">
                      {t("Al marcar como entregado:")}</p>
                    <ul className="mt-1 text-muted-foreground space-y-1">
                      <li>{t("El cliente recibirá una notificación")}</li>
                      <li>{t("Tendrá que revisar y confirmar el trabajo")}</li>
                      <li>{t("Una vez confirmado, se liberará el pago")}</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("Mensaje de entrega (opcional)")}</label>
                <Textarea
                  placeholder={t("Añade detalles sobre la entrega, instrucciones de uso, etc.")}
                  value={deliveryMessage}
                  onChange={(e) => setDeliveryMessage(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeliveryDialogOpen(false)} className="bg-transparent">
                {t("Cancelar")}</Button>
              <Button
                onClick={handleMarkDelivered}
                disabled={updating}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Package className="h-4 w-4 mr-2" />}
                {t("Marcar como Entregado")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  )
}

function TrabajoCard({
  trabajo,
  avisos,
  onMarcarLeidas,
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
  avisos: AvisoTarjeta[]
  onMarcarLeidas: (ids: string[]) => Promise<unknown> | void
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
  const { t } = useIdioma()

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
  // Trabajo en curso con el pago ya retenido: se resalta para que el proveedor
  // vea de un vistazo que puede empezar con el cobro protegido.
  const pagoRetenidoActivo = trabajo.estado === "en_progreso" && escrowEstado === "fondos_retenidos"

  return (
    <Card
      id={`trabajo-${trabajo.id}`} tabIndex={-1}
      className={`scroll-mt-24 overflow-hidden hover:shadow-md transition-shadow ${avisos.length ? "ring-2 ring-primary/50 border-primary/40" : ""} ${
        pagoRetenidoActivo ? "ring-2 ring-emerald-500/50" : ""
      }`}
    >
      {pagoRetenidoActivo && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-6 py-2.5 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {t("Pago confirmado · transferencia pendiente: puedes empezar el trabajo")}</p>
        </div>
      )}
      {/* El aviso de cancelación va a lo ancho de la tarjeta, no en la columna
          de acciones: ahí mide 224px menos el relleno y el texto salía a dos
          palabras por línea. Además es lo más importante que puede pasarle a un
          trabajo en curso, así que se lee antes que nada. Se pinta solo, con su
          propia banda, o no se pinta nada. */}
      <CancelacionTrabajo trabajo={trabajo} onChange={onRefresh} variante="aviso" />
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row">
          {/* Main Content */}
          <div className="min-w-0 flex-1 p-6">
            <AvisosTarjeta avisos={avisos} onMarcarLeidas={onMarcarLeidas} />
            <div className="flex items-start justify-between mb-4">
              <EnlacePerfil usuarioId={trabajo.cliente_id} className="flex items-center gap-3">
                <Avatar className="h-12 w-12 border-2 border-background">
                  <AvatarImage src={trabajo.cliente?.foto_perfil || "/placeholder.svg"} />
                  <AvatarFallback>
                    {trabajo.cliente?.nombre?.[0]}
                    {trabajo.cliente?.apellido?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm text-muted-foreground">{t("Cliente")}</p>
                  <p className="font-medium">
                    {trabajo.cliente?.nombre} {trabajo.cliente?.apellido}
                  </p>
                </div>
              </EnlacePerfil>
              <Badge className={`${config?.color} text-white`}>
                <Icon className="h-3 w-3 mr-1" />
                {t(config?.label || "")}
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
                  <span className="text-muted-foreground">{t("Progreso")}</span>
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
                      ? t(daysRemaining === 1 ? "{cantidad} día restante" : "{cantidad} días restantes", { cantidad: daysRemaining })
                      : daysRemaining === 0
                      ? t("Vence hoy")
                      : t(Math.abs(daysRemaining || 0) === 1 ? "{cantidad} día de retraso" : "{cantidad} días de retraso", { cantidad: Math.abs(daysRemaining || 0) })}
                  </span>
                </div>
              )}
            </div>

            {/* Adjuntos de la oferta con la que se contrató este trabajo */}
            {archivosOferta.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> {" "}{t("Archivos de tu oferta (")}{archivosOferta.length})
                </p>
                <AdjuntosLista archivos={archivosOferta} />
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
                            {t("Pago recibido:")}{" "}{formatCurrency(pagoNeto)} {" "}{t("netos")}</span>
                        ) : (
                          <span className="text-blue-600">{t("Transferencia pendiente: cobrarás")}{" "}{formatCurrency(pagoNeto)}</span>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-amber-500" />
                      <span className="text-sm text-amber-600">{t("Esperando pago del cliente")}</span>
                    </>
                  )}
                </div>
                {showPaymentStatus && isPaymentReleased && trabajo.transaccion_escrow?.fecha_liberacion && (
                  <span className="text-xs text-muted-foreground">
                    {t("Liberado el")}{" "}{formatDate(trabajo.transaccion_escrow.fecha_liberacion)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("Precio acordado")}{" "}{formatCurrency(trabajo.precio_acordado || 0)} {" "}{t("− comisión Diime (")}{formatCurrency(comisionProveedor)}) ={" "}
                <span className="font-medium text-foreground">{formatCurrency(pagoNeto)} {" "}{t("netos")}</span>
              </p>
              <div className="flex gap-3 mt-2">
                <a
                  href={`/trabajos/${trabajo.id}/factura`}
                  target="_blank"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <FileText className="h-3 w-3" /> {" "}{t("Ver justificante y términos")}</a>
              </div>
            </div>
          </div>

          {/* Actions Sidebar */}
          {(onUpdateProgress || onMarkDelivered || onContactar || showPendingConfirmation) && (
            // justify-center: en un trabajo completado esta columna solo lleva
            // "Contactar Cliente", y alineado arriba quedaba flotando con todo
            // el hueco debajo. Centrado se ve equilibrado, y cuando hay varios
            // botones (trabajo en curso) el resultado es el mismo de antes.
            <div className="lg:w-56 p-6 bg-muted/30 border-t lg:border-t-0 lg:border-l flex flex-col justify-center gap-3">
              {trabajo.estado === "en_progreso" && onUpdateProgress && (
                <>
                  <Button onClick={onUpdateProgress} variant="outline" className="w-full bg-transparent">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    {t("Actualizar Progreso")}</Button>
                  {/* Entregar en cualquier momento: no exige haber actualizado antes el progreso. */}
                  {onMarkDelivered && (
                    <Button onClick={onMarkDelivered} className="w-full bg-emerald-600 hover:bg-emerald-700">
                      <Package className="h-4 w-4 mr-2" />
                      {t("Entregar Trabajo")}</Button>
                  )}
                  {/* Cancelación de mutuo acuerdo también con el trabajo en curso:
                      si el cliente acepta, se le reembolsa íntegramente. */}
                  <CancelacionTrabajo trabajo={trabajo} onChange={onRefresh} variante="boton" />
                </>
              )}
              {trabajo.estado === "pendiente_pago" && (
                <div className="py-4 space-y-3">
                  <div className="text-center">
                    <CreditCard className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {t("El proyecto iniciará cuando el cliente realice el pago")}</p>
                  </div>
                  <CancelacionTrabajo trabajo={trabajo} onChange={onRefresh} variante="boton" />
                </div>
              )}
              {showPendingConfirmation && (
                <div className="text-center py-4">
                  <Clock className="h-8 w-8 mx-auto text-purple-500 mb-2 animate-pulse" />
                  <p className="text-sm text-muted-foreground">
                    {t("Esperando confirmación del cliente")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("Cuando confirme la entrega, el pago se liberará a tu favor. Si no responde, puedes abrir una disputa y el equipo de Diime revisará la entrega para liberarte el pago.")}</p>
                </div>
              )}
              {trabajo.estado === "en_disputa" && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                  <Scale className="h-7 w-7 mx-auto text-amber-600 mb-1.5" />
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("Trabajo en disputa")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("El equipo de Diime lo está revisando. El pago queda retenido hasta la resolución.")}</p>
                </div>
              )}
              <Button variant="ghost" size="sm" className="w-full" onClick={onContactar}>
                <MessageSquare className="h-4 w-4 mr-2" />
                {t("Contactar Cliente")}</Button>
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
                      {t("Abrir disputa")}</Button>
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
                  <p className="font-medium text-emerald-600">{t("Cobrado")}</p>
                  <p className="text-2xl font-bold">{formatCurrency(pagoNeto)}</p>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-full bg-amber-500/10 mb-3">
                    <Clock className="h-8 w-8 text-amber-500" />
                  </div>
                  <p className="font-medium text-amber-600">{t("Pendiente")}</p>
                  <p className="text-sm text-muted-foreground">{t("de cobro")}</p>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
