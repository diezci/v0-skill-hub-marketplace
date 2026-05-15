"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { ChevronLeft, ChevronRight, Plus, Trash2, Briefcase, ShoppingBag, CalendarDays, MapPin } from "lucide-react"
import {
  obtenerTrabajosCalendario,
  obtenerServiciosSolicitados,
  obtenerEventosCalendario,
  crearEventoCalendario,
  actualizarEventoCalendario,
  eliminarEventoCalendario,
  type TrabajoCalendario,
  type ServicioSolicitado,
  type EventoCalendario,
} from "@/app/actions/calendario"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

const COLOR_OPTIONS = [
  { value: "emerald", label: "Verde", class: "bg-emerald-500" },
  { value: "blue", label: "Azul", class: "bg-blue-500" },
  { value: "amber", label: "Ámbar", class: "bg-amber-500" },
  { value: "rose", label: "Rosa", class: "bg-rose-500" },
  { value: "violet", label: "Violeta", class: "bg-violet-500" },
  { value: "cyan", label: "Cian", class: "bg-cyan-500" },
]

function colorClass(color: string) {
  return COLOR_OPTIONS.find((c) => c.value === color)?.class || "bg-emerald-500"
}

function toDateStr(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

type CalendarItem = {
  id: string
  titulo: string
  tipo: "trabajo_entrega" | "trabajo_inicio" | "servicio_entrega" | "servicio_inicio" | "evento"
  fecha: string
  color: string
  meta?: string
}

export function ProjectCalendar() {
  const [trabajos, setTrabajos] = useState<TrabajoCalendario[]>([])
  const [servicios, setServicios] = useState<ServicioSolicitado[]>([])
  const [eventos, setEventos] = useState<EventoCalendario[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    fecha_inicio: toDateStr(new Date()),
    fecha_fin: "",
    color: "emerald",
    todo_el_dia: true,
    ubicacion: "",
  })
  const { toast } = useToast()

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [t, s, e] = await Promise.all([
      obtenerTrabajosCalendario(),
      obtenerServiciosSolicitados(),
      obtenerEventosCalendario(),
    ])
    if (t.data) setTrabajos(t.data)
    if (s.data) setServicios(s.data)
    if (e.data) setEventos(e.data)
    setLoading(false)
  }

  const items = useMemo<CalendarItem[]>(() => {
    const list: CalendarItem[] = []
    trabajos.forEach((t) => {
      const titulo = t.titulo || t.solicitud?.titulo || "Trabajo"
      if (t.fecha_inicio) {
        list.push({
          id: `t-ini-${t.id}`,
          titulo,
          tipo: "trabajo_inicio",
          fecha: t.fecha_inicio.split("T")[0],
          color: "blue",
          meta: "Inicio del trabajo",
        })
      }
      if (t.fecha_estimada_fin) {
        list.push({
          id: `t-fin-${t.id}`,
          titulo,
          tipo: "trabajo_entrega",
          fecha: t.fecha_estimada_fin.split("T")[0],
          color: "amber",
          meta: "Entrega prevista",
        })
      }
    })
    servicios.forEach((s) => {
      const titulo = s.titulo || s.solicitud?.titulo || "Servicio"
      if (s.fecha_inicio) {
        list.push({
          id: `s-ini-${s.id}`,
          titulo,
          tipo: "servicio_inicio",
          fecha: s.fecha_inicio.split("T")[0],
          color: "cyan",
          meta: "Inicio del servicio",
        })
      }
      if (s.fecha_estimada_fin) {
        list.push({
          id: `s-fin-${s.id}`,
          titulo,
          tipo: "servicio_entrega",
          fecha: s.fecha_estimada_fin.split("T")[0],
          color: "rose",
          meta: "Recepción prevista",
        })
      }
    })
    eventos.forEach((ev) => {
      list.push({
        id: `e-${ev.id}`,
        titulo: ev.titulo,
        tipo: "evento",
        fecha: ev.fecha_inicio.split("T")[0],
        color: ev.color || "emerald",
        meta: ev.descripcion || undefined,
      })
    })
    return list
  }, [trabajos, servicios, eventos])

  const dias = useMemo(() => {
    const y = currentDate.getFullYear()
    const m = currentDate.getMonth()
    const firstDay = new Date(y, m, 1)
    const lastDay = new Date(y, m + 1, 0)
    let pad = firstDay.getDay() - 1
    if (pad < 0) pad = 6
    const out: { date: Date; isCurrentMonth: boolean }[] = []
    for (let i = pad - 1; i >= 0; i--) out.push({ date: new Date(y, m, -i), isCurrentMonth: false })
    for (let i = 1; i <= lastDay.getDate(); i++) out.push({ date: new Date(y, m, i), isCurrentMonth: true })
    const rest = 42 - out.length
    for (let i = 1; i <= rest; i++) out.push({ date: new Date(y, m + 1, i), isCurrentMonth: false })
    return out
  }, [currentDate])

  function itemsOnDay(date: Date) {
    const s = toDateStr(date)
    return items.filter((i) => i.fecha === s)
  }

  function isToday(d: Date) {
    const t = new Date()
    return d.toDateString() === t.toDateString()
  }

  function openNewEvent(date?: Date) {
    setEditingId(null)
    setForm({
      titulo: "",
      descripcion: "",
      fecha_inicio: toDateStr(date || new Date()),
      fecha_fin: "",
      color: "emerald",
      todo_el_dia: true,
      ubicacion: "",
    })
    setDialogOpen(true)
  }

  function openEditEvent(ev: EventoCalendario) {
    setEditingId(ev.id)
    setForm({
      titulo: ev.titulo,
      descripcion: ev.descripcion || "",
      fecha_inicio: ev.fecha_inicio.split("T")[0],
      fecha_fin: ev.fecha_fin ? ev.fecha_fin.split("T")[0] : "",
      color: ev.color || "emerald",
      todo_el_dia: ev.todo_el_dia,
      ubicacion: ev.ubicacion || "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.titulo.trim()) {
      toast({ title: "Falta el título", description: "Pon un nombre al evento", variant: "destructive" })
      return
    }
    setSaving(true)
    const payload = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || undefined,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin || null,
      color: form.color,
      todo_el_dia: form.todo_el_dia,
      ubicacion: form.ubicacion.trim() || undefined,
    }
    const result = editingId
      ? await actualizarEventoCalendario(editingId, payload)
      : await crearEventoCalendario(payload)
    setSaving(false)
    if (result.success) {
      toast({ title: editingId ? "Evento actualizado" : "Evento creado" })
      setDialogOpen(false)
      loadAll()
    } else {
      toast({ title: "Error", description: result.error || "No se pudo guardar", variant: "destructive" })
    }
  }

  async function handleDelete() {
    if (!editingId) return
    setSaving(true)
    const result = await eliminarEventoCalendario(editingId)
    setSaving(false)
    if (result.success) {
      toast({ title: "Evento eliminado" })
      setDialogOpen(false)
      loadAll()
    } else {
      toast({ title: "Error", description: result.error || "No se pudo eliminar", variant: "destructive" })
    }
  }

  const proximos = useMemo(() => {
    const today = toDateStr(new Date())
    return [...items].filter((i) => i.fecha >= today).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 6)
  }, [items])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">Cargando calendario...</CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-xl min-w-[180px] text-center">
              {MESES[currentDate.getMonth()]} {currentDate.getFullYear()}
            </CardTitle>
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())} className="ml-1">
              Hoy
            </Button>
          </div>
          <Button onClick={() => openNewEvent()} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Plus className="h-4 w-4" />
            Añadir evento
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="text-xs font-medium text-muted-foreground text-center py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dias.map(({ date, isCurrentMonth }, idx) => {
              const dayItems = itemsOnDay(date)
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => openNewEvent(date)}
                  className={cn(
                    "min-h-[90px] p-1.5 rounded-lg border text-left transition-colors flex flex-col gap-1",
                    isCurrentMonth ? "bg-card border-border hover:bg-muted/50" : "bg-muted/20 border-transparent text-muted-foreground/60",
                    isToday(date) && "ring-2 ring-emerald-500/50",
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isToday(date) && "text-emerald-600 dark:text-emerald-400 font-bold",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className="flex flex-col gap-1 overflow-hidden">
                    {dayItems.slice(0, 3).map((it) => (
                      <div
                        key={it.id}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded text-white truncate leading-tight",
                          colorClass(it.color),
                        )}
                        title={`${it.titulo} - ${it.meta || ""}`}
                      >
                        {it.titulo}
                      </div>
                    ))}
                    {dayItems.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">+{dayItems.length - 3}</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Inicio trabajo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Entrega trabajo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" /> Inicio servicio
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Recepción servicio
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Evento personal
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Panel lateral */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-500" />
              Próximos eventos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {proximos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No hay próximos eventos</p>
            ) : (
              proximos.map((it) => {
                const isEvento = it.tipo === "evento"
                const evento = isEvento ? eventos.find((e) => `e-${e.id}` === it.id) : null
                return (
                  <button
                    type="button"
                    key={it.id}
                    onClick={() => (evento ? openEditEvent(evento) : undefined)}
                    className="w-full text-left p-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors flex gap-2"
                  >
                    <div className={cn("w-1 rounded-full shrink-0", colorClass(it.color))} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{it.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(it.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                        {it.meta ? ` · ${it.meta}` : ""}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Briefcase className="h-4 w-4" /> Trabajos
              </span>
              <Badge variant="outline">{trabajos.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <ShoppingBag className="h-4 w-4" /> Servicios
              </span>
              <Badge variant="outline">{servicios.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-4 w-4" /> Eventos personales
              </span>
              <Badge variant="outline">{eventos.length}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog evento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar evento" : "Nuevo evento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="titulo">Título *</Label>
              <Input
                id="titulo"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Reunión con cliente"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fecha_inicio">Fecha inicio *</Label>
                <Input
                  id="fecha_inicio"
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha_fin">Fecha fin (opcional)</Label>
                <Input
                  id="fecha_fin"
                  type="date"
                  value={form.fecha_fin}
                  onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="todo_dia" className="cursor-pointer">
                Todo el día
              </Label>
              <Switch
                id="todo_dia"
                checked={form.todo_el_dia}
                onCheckedChange={(v) => setForm({ ...form, todo_el_dia: v })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ubicacion" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Ubicación
              </Label>
              <Input
                id="ubicacion"
                value={form.ubicacion}
                onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descripcion">Notas</Label>
              <Textarea
                id="descripcion"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                rows={3}
                placeholder="Detalles del evento..."
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={form.color} onValueChange={(v) => setForm({ ...form, color: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-3 w-3 rounded-full", c.class)} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex-row justify-between sm:justify-between">
            {editingId ? (
              <Button variant="outline" onClick={handleDelete} disabled={saving} className="text-red-600 gap-2">
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Guardando..." : editingId ? "Guardar" : "Crear"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
