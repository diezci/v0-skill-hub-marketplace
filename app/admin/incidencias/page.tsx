"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, CheckCircle2, Clock, Eye, Loader2, Search, ShieldAlert, Tag, User2 } from "lucide-react"
import {
  actualizarIncidencia,
  obtenerIncidencias,
  type IncidenciaEstado,
  type IncidenciaPrioridad,
} from "@/app/actions/incidencias"
import { useToast } from "@/hooks/use-toast"
import { formatearFecha } from "@/lib/utils"
import { cn } from "@/lib/utils"

const CATEGORIA_LABELS: Record<string, string> = {
  fraude: "Fraude",
  abuso: "Abuso o conducta",
  pago: "Problema de pago",
  tecnico: "Problema técnico",
  perfil: "Perfil / verificación",
  otro: "Otro",
}

const PRIORIDAD_STYLES: Record<string, string> = {
  baja: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  media: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  alta: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  critica: "bg-red-500/10 text-red-600 border-red-500/30",
}

const ESTADO_STYLES: Record<string, string> = {
  abierta: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  en_revision: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  resuelta: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  cerrada: "bg-muted text-muted-foreground border-border",
}

const ESTADO_LABELS: Record<string, string> = {
  abierta: "Abierta",
  en_revision: "En revisión",
  resuelta: "Resuelta",
  cerrada: "Cerrada",
}

export default function AdminIncidenciasPage() {
  const [incidencias, setIncidencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas")
  const [selected, setSelected] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const [estado, setEstado] = useState<IncidenciaEstado>("abierta")
  const [prioridad, setPrioridad] = useState<IncidenciaPrioridad>("media")
  const [notas, setNotas] = useState("")
  const [saving, setSaving] = useState(false)
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    cargar()
  }, [])

  const cargar = async () => {
    setLoading(true)
    const result = await obtenerIncidencias()
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      setIncidencias(result.data || [])
    }
    setLoading(false)
  }

  const abrirDetalle = (inc: any) => {
    setSelected(inc)
    setEstado(inc.estado)
    setPrioridad(inc.prioridad)
    setNotas(inc.notas_admin || "")
    setOpen(true)
  }

  const guardar = async () => {
    if (!selected) return
    setSaving(true)
    const result = await actualizarIncidencia(selected.id, {
      estado,
      prioridad,
      notas_admin: notas,
    })
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Incidencia actualizada", description: "Los cambios se han guardado." })
      setOpen(false)
      cargar()
    }
    setSaving(false)
  }

  // Acción directa de resolver, sin pasar por el desplegable de estado: es el
  // desenlace habitual y desde la lista se hace en un clic. Guarda también las
  // notas que haya escritas para que lleguen a quien reportó la incidencia.
  const marcarResuelta = async (inc: any, notasAdmin?: string) => {
    setResolviendo(inc.id)
    const result = await actualizarIncidencia(inc.id, {
      estado: "resuelta",
      ...(notasAdmin !== undefined ? { notas_admin: notasAdmin } : {}),
    })
    setResolviendo(null)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      return
    }
    toast({
      title: "Incidencia resuelta",
      description: "Se ha avisado a quien la reportó.",
    })
    setOpen(false)
    cargar()
  }

  const filtradas = incidencias.filter((i) => {
    const matchSearch =
      !search ||
      i.asunto?.toLowerCase().includes(search.toLowerCase()) ||
      i.descripcion?.toLowerCase().includes(search.toLowerCase()) ||
      i.reportador?.email?.toLowerCase().includes(search.toLowerCase())
    const matchCat = filtroCategoria === "todas" || i.categoria === filtroCategoria
    return matchSearch && matchCat
  })

  const abiertas = filtradas.filter((i) => i.estado === "abierta")
  const enRevision = filtradas.filter((i) => i.estado === "en_revision")
  const resueltas = filtradas.filter((i) => ["resuelta", "cerrada"].includes(i.estado))

  const criticas = incidencias.filter((i) => i.prioridad === "critica" && i.estado !== "cerrada").length

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-8 w-8 text-primary" />
          Centro de Incidencias
        </h1>
        <p className="text-muted-foreground mt-1">
          Gestiona reportes de fraude, abuso, problemas de pago y soporte técnico
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Abiertas" value={incidencias.filter((i) => i.estado === "abierta").length} icon={AlertCircle} color="text-amber-500" bg="bg-amber-500/10" />
        <StatCard label="En revisión" value={incidencias.filter((i) => i.estado === "en_revision").length} icon={Clock} color="text-blue-500" bg="bg-blue-500/10" />
        <StatCard label="Resueltas" value={incidencias.filter((i) => i.estado === "resuelta").length} icon={CheckCircle2} color="text-emerald-500" bg="bg-emerald-500/10" />
        <StatCard label="Críticas pendientes" value={criticas} icon={ShieldAlert} color={criticas > 0 ? "text-red-500" : "text-muted-foreground"} bg={criticas > 0 ? "bg-red-500/10" : "bg-muted"} alert={criticas > 0} />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por asunto, descripción o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-full md:w-[220px]">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {Object.entries(CATEGORIA_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="abiertas">
        <TabsList>
          <TabsTrigger value="abiertas">Abiertas ({abiertas.length})</TabsTrigger>
          <TabsTrigger value="revision">En revisión ({enRevision.length})</TabsTrigger>
          <TabsTrigger value="resueltas">Resueltas ({resueltas.length})</TabsTrigger>
          <TabsTrigger value="todas">Todas ({filtradas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="abiertas" className="space-y-3 mt-4">
          <Lista items={abiertas} loading={loading} onOpen={abrirDetalle} onResolver={marcarResuelta} resolviendo={resolviendo} />
        </TabsContent>
        <TabsContent value="revision" className="space-y-3 mt-4">
          <Lista items={enRevision} loading={loading} onOpen={abrirDetalle} onResolver={marcarResuelta} resolviendo={resolviendo} />
        </TabsContent>
        <TabsContent value="resueltas" className="space-y-3 mt-4">
          <Lista items={resueltas} loading={loading} onOpen={abrirDetalle} onResolver={marcarResuelta} resolviendo={resolviendo} />
        </TabsContent>
        <TabsContent value="todas" className="space-y-3 mt-4">
          <Lista items={filtradas} loading={loading} onOpen={abrirDetalle} onResolver={marcarResuelta} resolviendo={resolviendo} />
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              {selected?.asunto || "Incidencia"}
            </DialogTitle>
            <DialogDescription>
              Reportada el {selected ? formatearFecha(selected.created_at) : ""}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 py-2">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Reportado por</p>
                  <p className="font-medium flex items-center gap-1.5">
                    <User2 className="h-3.5 w-3.5" />
                    {selected.reportador?.nombre || ""} {selected.reportador?.apellido || ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{selected.reportador?.email}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Categoría</p>
                  <p className="font-medium flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    {CATEGORIA_LABELS[selected.categoria] || selected.categoria}
                  </p>
                </div>
                {selected.reportado && (
                  <div className="bg-muted/50 rounded-lg p-3 col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Usuario reportado</p>
                    <p className="font-medium">
                      {selected.reportado.nombre} {selected.reportado.apellido}{" "}
                      <span className="text-xs text-muted-foreground">({selected.reportado.email})</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Descripción</p>
                <div className="bg-background border rounded-lg p-3 text-sm whitespace-pre-wrap">
                  {selected.descripcion}
                </div>
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Estado</label>
                  <Select value={estado} onValueChange={(v) => setEstado(v as IncidenciaEstado)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="abierta">Abierta</SelectItem>
                      <SelectItem value="en_revision">En revisión</SelectItem>
                      <SelectItem value="resuelta">Resuelta</SelectItem>
                      <SelectItem value="cerrada">Cerrada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Prioridad</label>
                  <Select value={prioridad} onValueChange={(v) => setPrioridad(v as IncidenciaPrioridad)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baja">Baja</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="critica">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Notas internas del admin</label>
                <Textarea
                  placeholder="Acciones tomadas, comunicaciones, conclusiones..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent">
              Cancelar
            </Button>
            <Button variant="outline" onClick={guardar} disabled={saving || !!resolviendo}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
            {selected && !["resuelta", "cerrada"].includes(selected.estado) && (
              <Button
                onClick={() => marcarResuelta(selected, notas)}
                disabled={saving || !!resolviendo}
                className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              >
                {resolviendo === selected.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Marcar como resuelta
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Lista({
  items,
  loading,
  onOpen,
  onResolver,
  resolviendo,
}: {
  items: any[]
  loading: boolean
  onOpen: (i: any) => void
  onResolver: (i: any) => void
  resolviendo: string | null
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando incidencias...</span>
        </CardContent>
      </Card>
    )
  }
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground py-12">
          <ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No hay incidencias en esta categoría</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <>
      {items.map((inc) => (
        <Card
          key={inc.id}
          className={cn(
            "cursor-pointer transition-all hover:shadow-md hover:border-primary/40",
            inc.prioridad === "critica" && inc.estado !== "cerrada" && "border-red-500/40 bg-red-500/5",
          )}
          onClick={() => onOpen(inc)}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate">{inc.asunto}</CardTitle>
                <CardDescription className="text-xs mt-1">
                  {inc.reportador?.nombre} {inc.reportador?.apellido} · {formatearFecha(inc.created_at)}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className={ESTADO_STYLES[inc.estado]}>
                  {ESTADO_LABELS[inc.estado]}
                </Badge>
                <Badge variant="outline" className={PRIORIDAD_STYLES[inc.prioridad]}>
                  {inc.prioridad}
                </Badge>
                <Badge variant="outline">{CATEGORIA_LABELS[inc.categoria]}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground line-clamp-2">{inc.descripcion}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Button variant="ghost" size="sm" className="-ml-2 gap-2">
                <Eye className="h-4 w-4" />
                Ver y gestionar
              </Button>
              {!["resuelta", "cerrada"].includes(inc.estado) && (
                <Button
                  size="sm"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  disabled={resolviendo === inc.id}
                  onClick={(e) => {
                    // La tarjeta entera abre el detalle: aquí no interesa.
                    e.stopPropagation()
                    onResolver(inc)
                  }}
                >
                  {resolviendo === inc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Marcar resuelta
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  alert,
}: {
  label: string
  value: number
  icon: any
  color: string
  bg: string
  alert?: boolean
}) {
  return (
    <Card className={cn("relative overflow-hidden", alert && "ring-1 ring-red-500/30")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={cn("p-2 rounded-lg", bg)}>
          <Icon className={cn("h-5 w-5", color)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}
