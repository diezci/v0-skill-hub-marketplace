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
  Euro
} from "lucide-react"
import { 
  obtenerTrabajosCalendario, 
  actualizarEstimacionTrabajo,
  obtenerEstadisticasCarga,
  type TrabajoCalendario 
} from "@/app/actions/calendario"
import { useToast } from "@/hooks/use-toast"

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
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

function getColorForTrabajo(index: number): string {
  return COLORES_TRABAJO[index % COLORES_TRABAJO.length]
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

export default function MiCalendarioPage() {
  const [trabajos, setTrabajos] = useState<TrabajoCalendario[]>([])
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
  const [selectedTrabajo, setSelectedTrabajo] = useState<TrabajoCalendario | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
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
    const [trabajosResult, statsResult] = await Promise.all([
      obtenerTrabajosCalendario(),
      obtenerEstadisticasCarga(),
    ])
    
    if (trabajosResult.data) {
      setTrabajos(trabajosResult.data)
    }
    setEstadisticas(statsResult)
    setLoading(false)
  }

  const diasDelMes = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    // Adjust for Monday start
    let startPadding = firstDay.getDay() - 1
    if (startPadding < 0) startPadding = 6
    
    const dias: { date: Date; isCurrentMonth: boolean }[] = []
    
    // Previous month padding
    for (let i = startPadding - 1; i >= 0; i--) {
      const d = new Date(year, month, -i)
      dias.push({ date: d, isCurrentMonth: false })
    }
    
    // Current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      dias.push({ date: new Date(year, month, i), isCurrentMonth: true })
    }
    
    // Next month padding
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

  function getTrabajosForDate(date: Date): { trabajo: TrabajoCalendario; color: string; isStart: boolean; isEnd: boolean; isMiddle: boolean }[] {
    const dateStr = date.toISOString().split("T")[0]
    
    return trabajos
      .map((trabajo, index) => {
        const inicio = trabajo.fecha_inicio ? trabajo.fecha_inicio.split("T")[0] : null
        const fin = trabajo.fecha_estimada_fin ? trabajo.fecha_estimada_fin.split("T")[0] : null
        
        if (!inicio && !fin) return null
        
        const isStart = inicio === dateStr
        const isEnd = fin === dateStr
        const isMiddle = inicio && fin && dateStr > inicio && dateStr < fin
        
        if (isStart || isEnd || isMiddle) {
          return {
            trabajo,
            color: getColorForTrabajo(index),
            isStart,
            isEnd,
            isMiddle,
          }
        }
        return null
      })
      .filter(Boolean) as { trabajo: TrabajoCalendario; color: string; isStart: boolean; isEnd: boolean; isMiddle: boolean }[]
  }

  function navegarMes(direccion: number) {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direccion, 1))
  }

  function navegarSemana(direccion: number) {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + direccion * 7)
    setCurrentDate(newDate)
  }

  function openEditDialog(trabajo: TrabajoCalendario) {
    setSelectedTrabajo(trabajo)
    setEditForm({
      horas_estimadas: trabajo.horas_estimadas || 0,
      horas_registradas: trabajo.horas_registradas || 0,
      notas_privadas_proveedor: trabajo.notas_privadas_proveedor || "",
      prioridad: trabajo.prioridad || "media",
      fecha_inicio: trabajo.fecha_inicio ? trabajo.fecha_inicio.split("T")[0] : "",
      fecha_estimada_fin: trabajo.fecha_estimada_fin ? trabajo.fecha_estimada_fin.split("T")[0] : "",
    })
    setEditDialogOpen(true)
  }

  async function handleSaveEstimacion() {
    if (!selectedTrabajo) return
    
    setSaving(true)
    const result = await actualizarEstimacionTrabajo(selectedTrabajo.id, {
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

  const isAtrasado = (trabajo: TrabajoCalendario) => {
    if (!trabajo.fecha_estimada_fin || trabajo.estado !== "en_progreso") return false
    return new Date(trabajo.fecha_estimada_fin) < new Date()
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
          {/* Panel izquierdo - Estadisticas */}
          <div className="lg:w-80 space-y-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Resumen de Carga
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

            {/* Lista de trabajos */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  Mis Trabajos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                {trabajos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tienes trabajos activos
                  </p>
                ) : (
                  trabajos.map((trabajo, index) => (
                    <div
                      key={trabajo.id}
                      className="p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => openEditDialog(trabajo)}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-3 h-3 rounded-full mt-1.5 ${getColorForTrabajo(index)}`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">
                            {trabajo.titulo || trabajo.solicitud?.titulo || "Sin titulo"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {getEstadoBadge(trabajo.estado)}
                            {isAtrasado(trabajo) && (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                                Atrasado
                              </Badge>
                            )}
                          </div>
                          {trabajo.horas_estimadas && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {trabajo.horas_registradas || 0}h / {trabajo.horas_estimadas}h estimadas
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Panel derecho - Calendario */}
          <div className="flex-1">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
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
                  
                  <Tabs value={vista} onValueChange={(v) => setVista(v as "mensual" | "semanal")}>
                    <TabsList>
                      <TabsTrigger value="mensual">Mes</TabsTrigger>
                      <TabsTrigger value="semanal">Semana</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              
              <CardContent>
                {vista === "mensual" ? (
                  <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                    {/* Header dias */}
                    {DIAS_SEMANA.map((dia) => (
                      <div key={dia} className="bg-muted p-2 text-center text-sm font-medium text-muted-foreground">
                        {dia}
                      </div>
                    ))}
                    
                    {/* Dias del mes */}
                    {diasDelMes.map(({ date, isCurrentMonth }, idx) => {
                      const trabajosDelDia = getTrabajosForDate(date)
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
                            {trabajosDelDia.slice(0, 3).map(({ trabajo, color, isStart, isEnd, isMiddle }) => (
                              <div
                                key={trabajo.id}
                                className={`text-xs p-1 text-white cursor-pointer truncate ${color} ${
                                  isStart ? "rounded-l" : ""
                                } ${isEnd ? "rounded-r" : ""} ${
                                  !isStart && !isEnd ? "rounded-none" : ""
                                } ${isMiddle ? "mx-0" : ""}`}
                                onClick={() => openEditDialog(trabajo)}
                                title={trabajo.titulo || trabajo.solicitud?.titulo}
                              >
                                {isStart && (trabajo.titulo || trabajo.solicitud?.titulo || "Trabajo")}
                              </div>
                            ))}
                            {trabajosDelDia.length > 3 && (
                              <div className="text-xs text-muted-foreground">
                                +{trabajosDelDia.length - 3} mas
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
                      const trabajosDelDia = getTrabajosForDate(date)
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
                            {trabajosDelDia.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-2">Sin trabajos programados</p>
                            ) : (
                              trabajosDelDia.map(({ trabajo, color }) => (
                                <div
                                  key={trabajo.id}
                                  className={`p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${color}`}
                                  onClick={() => openEditDialog(trabajo)}
                                >
                                  <div className="flex items-center justify-between text-white">
                                    <span className="font-medium">
                                      {trabajo.titulo || trabajo.solicitud?.titulo}
                                    </span>
                                    <span className="text-sm opacity-80">
                                      {trabajo.horas_estimadas ? `${trabajo.horas_estimadas}h` : ""}
                                    </span>
                                  </div>
                                  {trabajo.cliente && (
                                    <div className="flex items-center gap-2 mt-1 text-sm text-white/80">
                                      <User className="h-3 w-3" />
                                      {trabajo.cliente.nombre} {trabajo.cliente.apellido}
                                    </div>
                                  )}
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

      {/* Dialog de edicion */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestionar Trabajo</DialogTitle>
          </DialogHeader>
          
          {selectedTrabajo && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <h3 className="font-medium text-foreground">
                  {selectedTrabajo.titulo || selectedTrabajo.solicitud?.titulo}
                </h3>
                {selectedTrabajo.cliente && (
                  <div className="flex items-center gap-2 mt-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={selectedTrabajo.cliente.foto_perfil || ""} />
                      <AvatarFallback>
                        {selectedTrabajo.cliente.nombre?.[0]}
                        {selectedTrabajo.cliente.apellido?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-muted-foreground">
                      {selectedTrabajo.cliente.nombre} {selectedTrabajo.cliente.apellido}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  {getEstadoBadge(selectedTrabajo.estado)}
                  <span className="text-sm text-muted-foreground">
                    <Euro className="h-3 w-3 inline mr-1" />
                    {selectedTrabajo.monto}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fecha_inicio">Fecha inicio</Label>
                  <Input
                    id="fecha_inicio"
                    type="date"
                    value={editForm.fecha_inicio}
                    onChange={(e) => setEditForm({ ...editForm, fecha_inicio: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fecha_fin">Fecha estimada fin</Label>
                  <Input
                    id="fecha_fin"
                    type="date"
                    value={editForm.fecha_estimada_fin}
                    onChange={(e) => setEditForm({ ...editForm, fecha_estimada_fin: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="horas_estimadas">Horas estimadas</Label>
                  <Input
                    id="horas_estimadas"
                    type="number"
                    min="0"
                    value={editForm.horas_estimadas}
                    onChange={(e) => setEditForm({ ...editForm, horas_estimadas: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="horas_registradas">Horas trabajadas</Label>
                  <Input
                    id="horas_registradas"
                    type="number"
                    min="0"
                    value={editForm.horas_registradas}
                    onChange={(e) => setEditForm({ ...editForm, horas_registradas: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prioridad">Prioridad</Label>
                <Select
                  value={editForm.prioridad}
                  onValueChange={(v) => setEditForm({ ...editForm, prioridad: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notas">Notas privadas (solo tu las ves)</Label>
                <Textarea
                  id="notas"
                  value={editForm.notas_privadas_proveedor}
                  onChange={(e) => setEditForm({ ...editForm, notas_privadas_proveedor: e.target.value })}
                  placeholder="Anota recordatorios, detalles tecnicos, etc."
                  rows={3}
                />
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

      <Footer />
    </div>
  )
}
