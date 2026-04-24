"use client"

import { useState, useEffect, useMemo } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  Briefcase,
  TrendingUp,
  User,
  FileText,
  Euro,
  ShoppingBag
} from "lucide-react"
import { 
  obtenerTrabajosCalendario, 
  obtenerServiciosSolicitados,
  actualizarEstimacionTrabajo,
  obtenerEstadisticasCarga,
  type TrabajoCalendario,
  type ServicioSolicitado
} from "@/app/actions/calendario"
import { useToast } from "@/hooks/use-toast"

const DIAS_SEMANA = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]

const COLORES_TRABAJO = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-indigo-500",
]

const COLORES_SERVICIO = [
  "bg-rose-500",
  "bg-teal-500",
  "bg-lime-500",
  "bg-fuchsia-500",
  "bg-sky-500",
  "bg-yellow-500",
]

function getColorForTrabajo(index: number): string {
  return COLORES_TRABAJO[index % COLORES_TRABAJO.length]
}

function getColorForServicio(index: number): string {
  return COLORES_SERVICIO[index % COLORES_SERVICIO.length]
}

function getEstadoBadge(estado: string) {
  switch (estado) {
    case "completado":
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Completado</Badge>
    case "en_progreso":
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">En progreso</Badge>
    case "pendiente_pago":
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Pendiente pago</Badge>
    default:
      return <Badge variant="outline">{estado}</Badge>
  }
}

function getPrioridadBadge(prioridad: string) {
  switch (prioridad) {
    case "alta":
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Alta</Badge>
    case "media":
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Media</Badge>
    case "baja":
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Baja</Badge>
    default:
      return <Badge variant="outline">Normal</Badge>
  }
}

type ItemCalendario = {
  id: string
  titulo: string
  tipo: "trabajo" | "servicio"
  estado: string
  fecha_inicio: string | null
  fecha_estimada_fin: string | null
  monto: number
  persona: {
    nombre: string
    apellido: string
    foto_perfil: string | null
    titulo?: string
  } | null
  horas_estimadas?: number | null
  horas_registradas?: number | null
  notas_privadas_proveedor?: string | null
  prioridad?: string
  solicitud?: { titulo: string; categoria: string } | null
}

export default function MiCalendarioPage() {
  const [trabajos, setTrabajos] = useState<TrabajoCalendario[]>([])
  const [servicios, setServicios] = useState<ServicioSolicitado[]>([])
  const [estadisticas, setEstadisticas] = useState({
    totalTrabajos: 0,
    trabajosEnProgreso: 0,
    horasEstimadasSemana: 0,
    horasRegistradasSemana: 0,
    trabajosAtrasados: 0,
  })
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [vista, setVista] = useState<"mensual" | "semanal">("mensual")
  const [tipoVista, setTipoVista] = useState<"todos" | "trabajos" | "servicios">("todos")
  const [selectedItem, setSelectedItem] = useState<ItemCalendario | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    horas_estimadas: 0,
    horas_registradas: 0,
    notas_privadas_proveedor: "",
    prioridad: "media",
    fecha_inicio: "",
    fecha_estimada_fin: "",
  })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [trabajosResult, serviciosResult, statsResult] = await Promise.all([
      obtenerTrabajosCalendario(),
      obtenerServiciosSolicitados(),
      obtenerEstadisticasCarga(),
    ])
    
    if (trabajosResult.data) {
      setTrabajos(trabajosResult.data)
    }
    if (serviciosResult.data) {
      setServicios(serviciosResult.data)
    }
    setEstadisticas(statsResult)
    setLoading(false)
  }

  // Combine trabajos and servicios into calendar items
  const itemsCalendario = useMemo((): ItemCalendario[] => {
    const items: ItemCalendario[] = []
    
    if (tipoVista === "todos" || tipoVista === "trabajos") {
      trabajos.forEach((t) => {
        items.push({
          id: t.id,
          titulo: t.titulo || t.solicitud?.titulo || "Sin titulo",
          tipo: "trabajo",
          estado: t.estado,
          fecha_inicio: t.fecha_inicio,
          fecha_estimada_fin: t.fecha_estimada_fin,
          monto: t.monto,
          persona: t.cliente,
          horas_estimadas: t.horas_estimadas,
          horas_registradas: t.horas_registradas,
          notas_privadas_proveedor: t.notas_privadas_proveedor,
          prioridad: t.prioridad,
          solicitud: t.solicitud,
        })
      })
    }
    
    if (tipoVista === "todos" || tipoVista === "servicios") {
      servicios.forEach((s) => {
        items.push({
          id: s.id,
          titulo: s.titulo || s.solicitud?.titulo || "Sin titulo",
          tipo: "servicio",
          estado: s.estado,
          fecha_inicio: s.fecha_inicio,
          fecha_estimada_fin: s.fecha_estimada_fin,
          monto: s.monto,
          persona: s.profesional,
          solicitud: s.solicitud,
        })
      })
    }
    
    return items
  }, [trabajos, servicios, tipoVista])

  const diasDelMes = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    let startPadding = firstDay.getDay() - 1
    if (startPadding < 0) startPadding = 6
    
    const dias: { date: Date; isCurrentMonth: boolean }[] = []
    
    for (let i = startPadding - 1; i >= 0; i--) {
      const d = new Date(year, month, -i)
      dias.push({ date: d, isCurrentMonth: false })
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
      dias.push({ date: new Date(year, month, i), isCurrentMonth: true })
    }
    
    const remaining = 42 - dias.length
    for (let i = 1; i <= remaining; i++) {
      dias.push({ date: new Date(year, month + 1, i), isCurrentMonth: false })
    }
    
    return dias
  }, [currentDate])

  const diasDeLaSemana = useMemo(() => {
    const startOfWeek = new Date(currentDate)
    const day = startOfWeek.getDay()
    const diff = day === 0 ? -6 : 1 - day
    startOfWeek.setDate(startOfWeek.getDate() + diff)
    
    const dias: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(d.getDate() + i)
      dias.push(d)
    }
    return dias
  }, [currentDate])

  function getItemsForDate(date: Date): { item: ItemCalendario; color: string; isStart: boolean; isEnd: boolean; isMiddle: boolean }[] {
    const dateStr = date.toISOString().split("T")[0]
    
    let trabajoIndex = 0
    let servicioIndex = 0
    
    return itemsCalendario
      .map((item) => {
        const inicio = item.fecha_inicio ? item.fecha_inicio.split("T")[0] : null
        const fin = item.fecha_estimada_fin ? item.fecha_estimada_fin.split("T")[0] : null
        
        if (!inicio && !fin) return null
        
        const isStart = inicio === dateStr
        const isEnd = fin === dateStr
        const isMiddle = inicio && fin && dateStr > inicio && dateStr < fin
        
        if (isStart || isEnd || isMiddle) {
          const color = item.tipo === "trabajo" 
            ? getColorForTrabajo(trabajoIndex++) 
            : getColorForServicio(servicioIndex++)
          
          return {
            item,
            color,
            isStart,
            isEnd,
            isMiddle,
          }
        }
        return null
      })
      .filter(Boolean) as { item: ItemCalendario; color: string; isStart: boolean; isEnd: boolean; isMiddle: boolean }[]
  }

  function navegarMes(direccion: number) {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direccion, 1))
  }

  function navegarSemana(direccion: number) {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + direccion * 7)
    setCurrentDate(newDate)
  }

  function openItemDialog(item: ItemCalendario) {
    setSelectedItem(item)
    if (item.tipo === "trabajo") {
      setEditForm({
        horas_estimadas: item.horas_estimadas || 0,
        horas_registradas: item.horas_registradas || 0,
        notas_privadas_proveedor: item.notas_privadas_proveedor || "",
        prioridad: item.prioridad || "media",
        fecha_inicio: item.fecha_inicio ? item.fecha_inicio.split("T")[0] : "",
        fecha_estimada_fin: item.fecha_estimada_fin ? item.fecha_estimada_fin.split("T")[0] : "",
      })
      setEditDialogOpen(true)
    } else {
      setViewDialogOpen(true)
    }
  }

  async function handleSaveEstimacion() {
    if (!selectedItem || selectedItem.tipo !== "trabajo") return
    
    setSaving(true)
    const result = await actualizarEstimacionTrabajo(selectedItem.id, {
      horas_estimadas: editForm.horas_estimadas,
      horas_registradas: editForm.horas_registradas,
      notas_privadas_proveedor: editForm.notas_privadas_proveedor,
      prioridad: editForm.prioridad,
      fecha_inicio: editForm.fecha_inicio || undefined,
      fecha_estimada_fin: editForm.fecha_estimada_fin || undefined,
    })
    
    setSaving(false)
    
    if (result.success) {
      toast({
        title: "Guardado",
        description: "La estimacion se ha actualizado correctamente",
      })
      setEditDialogOpen(false)
      loadData()
    } else {
      toast({
        title: "Error",
        description: result.error || "No se pudo guardar",
        variant: "destructive",
      })
    }
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isAtrasado = (item: ItemCalendario) => {
    if (!item.fecha_estimada_fin || item.estado !== "en_progreso") return false
    return new Date(item.fecha_estimada_fin) < new Date()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-pulse text-muted-foreground">Cargando calendario...</div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Panel izquierdo - Estadisticas y listas */}
          <div className="lg:w-80 space-y-4">
            {/* Filtro por tipo */}
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <Tabs value={tipoVista} onValueChange={(v) => setTipoVista(v as typeof tipoVista)}>
                  <TabsList className="w-full">
                    <TabsTrigger value="todos" className="flex-1">Todos</TabsTrigger>
                    <TabsTrigger value="trabajos" className="flex-1">Trabajos</TabsTrigger>
                    <TabsTrigger value="servicios" className="flex-1">Servicios</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardContent>
            </Card>

            {/* Estadisticas de carga (solo para trabajos) */}
            {(tipoVista === "todos" || tipoVista === "trabajos") && trabajos.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Carga de Trabajo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-foreground">{estadisticas.trabajosEnProgreso}</div>
                      <div className="text-xs text-muted-foreground">En progreso</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-foreground">{estadisticas.totalTrabajos}</div>
                      <div className="text-xs text-muted-foreground">Total activos</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Horas estimadas</span>
                      <span className="font-medium">{estadisticas.horasEstimadasSemana}h</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Horas registradas</span>
                      <span className="font-medium">{estadisticas.horasRegistradasSemana}h</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ 
                          width: `${Math.min(100, estadisticas.horasEstimadasSemana > 0 
                            ? (estadisticas.horasRegistradasSemana / estadisticas.horasEstimadasSemana) * 100 
                            : 0)}%` 
                        }}
                      />
                    </div>
                  </div>
                  
                  {estadisticas.trabajosAtrasados > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                      <span className="text-sm text-red-400">
                        {estadisticas.trabajosAtrasados} trabajo(s) atrasado(s)
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Lista de trabajos */}
            {(tipoVista === "todos" || tipoVista === "trabajos") && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-blue-500" />
                    Mis Trabajos
                    <Badge variant="outline" className="ml-auto">{trabajos.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                  {trabajos.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No tienes trabajos activos
                    </p>
                  ) : (
                    trabajos.map((trabajo, index) => (
                      <div
                        key={trabajo.id}
                        className="p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => openItemDialog({
                          id: trabajo.id,
                          titulo: trabajo.titulo || trabajo.solicitud?.titulo || "Sin titulo",
                          tipo: "trabajo",
                          estado: trabajo.estado,
                          fecha_inicio: trabajo.fecha_inicio,
                          fecha_estimada_fin: trabajo.fecha_estimada_fin,
                          monto: trabajo.monto,
                          persona: trabajo.cliente,
                          horas_estimadas: trabajo.horas_estimadas,
                          horas_registradas: trabajo.horas_registradas,
                          notas_privadas_proveedor: trabajo.notas_privadas_proveedor,
                          prioridad: trabajo.prioridad,
                          solicitud: trabajo.solicitud,
                        })}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-3 h-3 rounded-full mt-1.5 ${getColorForTrabajo(index)}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">
                              {trabajo.titulo || trabajo.solicitud?.titulo || "Sin titulo"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              Cliente: {trabajo.cliente?.nombre} {trabajo.cliente?.apellido}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {getEstadoBadge(trabajo.estado)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            {/* Lista de servicios solicitados */}
            {(tipoVista === "todos" || tipoVista === "servicios") && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 text-rose-500" />
                    Servicios Solicitados
                    <Badge variant="outline" className="ml-auto">{servicios.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
                  {servicios.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No has solicitado servicios
                    </p>
                  ) : (
                    servicios.map((servicio, index) => (
                      <div
                        key={servicio.id}
                        className="p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => openItemDialog({
                          id: servicio.id,
                          titulo: servicio.titulo || servicio.solicitud?.titulo || "Sin titulo",
                          tipo: "servicio",
                          estado: servicio.estado,
                          fecha_inicio: servicio.fecha_inicio,
                          fecha_estimada_fin: servicio.fecha_estimada_fin,
                          monto: servicio.monto,
                          persona: servicio.profesional,
                          solicitud: servicio.solicitud,
                        })}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-3 h-3 rounded-full mt-1.5 ${getColorForServicio(index)}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">
                              {servicio.titulo || servicio.solicitud?.titulo || "Sin titulo"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              Por: {servicio.profesional?.nombre} {servicio.profesional?.apellido}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {getEstadoBadge(servicio.estado)}
                              {servicio.fecha_estimada_fin && (
                                <span className="text-xs text-muted-foreground">
                                  Entrega: {new Date(servicio.fecha_estimada_fin).toLocaleDateString("es-ES")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Panel derecho - Calendario */}
          <div className="flex-1">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => vista === "mensual" ? navegarMes(-1) : navegarSemana(-1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="text-xl font-semibold text-foreground">
                      {vista === "mensual" 
                        ? `${MESES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                        : `Semana del ${diasDeLaSemana[0].getDate()} ${MESES[diasDeLaSemana[0].getMonth()]}`
                      }
                    </h2>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => vista === "mensual" ? navegarMes(1) : navegarSemana(1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-muted-foreground">Trabajos</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-rose-500" />
                        <span className="text-muted-foreground">Servicios</span>
                      </div>
                    </div>
                    <Tabs value={vista} onValueChange={(v) => setVista(v as "mensual" | "semanal")}>
                      <TabsList>
                        <TabsTrigger value="mensual">Mes</TabsTrigger>
                        <TabsTrigger value="semanal">Semana</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                {vista === "mensual" ? (
                  <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                    {DIAS_SEMANA.map((dia) => (
                      <div key={dia} className="bg-muted p-2 text-center text-sm font-medium text-muted-foreground">
                        {dia}
                      </div>
                    ))}
                    
                    {diasDelMes.map(({ date, isCurrentMonth }, idx) => {
                      const itemsDelDia = getItemsForDate(date)
                      return (
                        <div
                          key={idx}
                          className={`bg-card min-h-[100px] p-1 ${
                            !isCurrentMonth ? "opacity-40" : ""
                          } ${isToday(date) ? "ring-2 ring-primary ring-inset" : ""}`}
                        >
                          <div className={`text-sm mb-1 ${
                            isToday(date) ? "font-bold text-primary" : "text-foreground"
                          }`}>
                            {date.getDate()}
                          </div>
                          <div className="space-y-0.5">
                            {itemsDelDia.slice(0, 3).map(({ item, color, isStart, isEnd }) => (
                              <div
                                key={item.id}
                                className={`text-xs p-1 text-white cursor-pointer truncate ${color} ${
                                  isStart ? "rounded-l" : ""
                                } ${isEnd ? "rounded-r" : ""} ${
                                  !isStart && !isEnd ? "rounded-none" : ""
                                }`}
                                onClick={() => openItemDialog(item)}
                                title={item.titulo}
                              >
                                {isStart && (
                                  <span className="flex items-center gap-1">
                                    {item.tipo === "servicio" && <ShoppingBag className="h-3 w-3" />}
                                    {item.titulo}
                                  </span>
                                )}
                              </div>
                            ))}
                            {itemsDelDia.length > 3 && (
                              <div className="text-xs text-muted-foreground">
                                +{itemsDelDia.length - 3} mas
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {diasDeLaSemana.map((date) => {
                      const itemsDelDia = getItemsForDate(date)
                      return (
                        <div
                          key={date.toISOString()}
                          className={`flex gap-4 p-3 rounded-lg ${
                            isToday(date) ? "bg-primary/10 border border-primary/30" : "bg-muted/30"
                          }`}
                        >
                          <div className="w-20 text-center">
                            <div className="text-sm font-medium text-foreground">
                              {DIAS_SEMANA[date.getDay() === 0 ? 6 : date.getDay() - 1]}
                            </div>
                            <div className={`text-2xl font-bold ${
                              isToday(date) ? "text-primary" : "text-foreground"
                            }`}>
                              {date.getDate()}
                            </div>
                          </div>
                          <div className="flex-1 space-y-2">
                            {itemsDelDia.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-2">Sin actividad programada</p>
                            ) : (
                              itemsDelDia.map(({ item, color }) => (
                                <div
                                  key={item.id}
                                  className={`p-3 rounded-lg cursor-pointer ${color} text-white`}
                                  onClick={() => openItemDialog(item)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {item.tipo === "servicio" ? (
                                        <ShoppingBag className="h-4 w-4" />
                                      ) : (
                                        <Briefcase className="h-4 w-4" />
                                      )}
                                      <span className="font-medium">{item.titulo}</span>
                                    </div>
                                    <Badge className="bg-white/20 text-white border-white/30">
                                      {item.tipo === "trabajo" ? "Trabajo" : "Servicio"}
                                    </Badge>
                                  </div>
                                  <p className="text-sm opacity-90 mt-1">
                                    {item.tipo === "trabajo" ? "Cliente" : "Profesional"}: {item.persona?.nombre} {item.persona?.apellido}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Dialog para editar trabajo */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Gestionar Trabajo
            </DialogTitle>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">{selectedItem.titulo}</h3>
                <p className="text-sm text-muted-foreground">
                  Cliente: {selectedItem.persona?.nombre} {selectedItem.persona?.apellido}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {getEstadoBadge(selectedItem.estado)}
                  {selectedItem.prioridad && getPrioridadBadge(selectedItem.prioridad)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha inicio</Label>
                  <Input
                    type="date"
                    value={editForm.fecha_inicio}
                    onChange={(e) => setEditForm({ ...editForm, fecha_inicio: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fecha estimada fin</Label>
                  <Input
                    type="date"
                    value={editForm.fecha_estimada_fin}
                    onChange={(e) => setEditForm({ ...editForm, fecha_estimada_fin: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Horas estimadas</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editForm.horas_estimadas}
                    onChange={(e) => setEditForm({ ...editForm, horas_estimadas: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Horas registradas</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editForm.horas_registradas}
                    onChange={(e) => setEditForm({ ...editForm, horas_registradas: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select value={editForm.prioridad} onValueChange={(v) => setEditForm({ ...editForm, prioridad: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="baja">Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notas privadas (solo tu las ves)</Label>
                <Textarea
                  placeholder="Anade notas sobre este trabajo..."
                  value={editForm.notas_privadas_proveedor}
                  onChange={(e) => setEditForm({ ...editForm, notas_privadas_proveedor: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-sm text-muted-foreground">
                  Monto: <span className="font-semibold text-foreground">{selectedItem.monto}€</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEstimacion} disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para ver servicio solicitado */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-rose-500" />
              Servicio Solicitado
            </DialogTitle>
          </DialogHeader>
          
          {selectedItem && selectedItem.tipo === "servicio" && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground text-lg">{selectedItem.titulo}</h3>
                {selectedItem.solicitud?.categoria && (
                  <Badge variant="outline" className="mt-1">{selectedItem.solicitud.categoria}</Badge>
                )}
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Avatar>
                  <AvatarImage src={selectedItem.persona?.foto_perfil || undefined} />
                  <AvatarFallback>
                    {selectedItem.persona?.nombre?.[0]}{selectedItem.persona?.apellido?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-foreground">
                    {selectedItem.persona?.nombre} {selectedItem.persona?.apellido}
                  </p>
                  {selectedItem.persona?.titulo && (
                    <p className="text-sm text-muted-foreground">{selectedItem.persona.titulo}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Estado</p>
                  <div className="mt-1">{getEstadoBadge(selectedItem.estado)}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Monto</p>
                  <p className="text-lg font-bold text-foreground">{selectedItem.monto}€</p>
                </div>
              </div>

              {selectedItem.fecha_estimada_fin && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="text-sm text-foreground">
                      Fecha estimada de entrega: <strong>{new Date(selectedItem.fecha_estimada_fin).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</strong>
                    </span>
                  </div>
                </div>
              )}

              {isAtrasado(selectedItem) && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <span className="text-sm text-red-400">
                    Este servicio esta atrasado. Contacta con el profesional.
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Cerrar
            </Button>
            <Button onClick={() => window.location.href = "/mensajes"}>
              Contactar profesional
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  )
}
