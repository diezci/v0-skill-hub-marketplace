"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Calendar, CheckCircle2, Clock, FileText, Loader2, MapPin, MessageSquare, XCircle } from "lucide-react"
import { obtenerOfertasPorProfesional, retirarOferta } from "@/app/actions/ofertas"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { formatearPrecioEuros } from "@/lib/utils"

type Estado = "pendiente" | "aceptada" | "rechazada" | "retirada"

const estados: Record<Estado, { label: string; icon: typeof Clock; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  pendiente: { label: "Pendiente", icon: Clock, variant: "secondary" },
  aceptada: { label: "Aceptada", icon: CheckCircle2, variant: "default" },
  rechazada: { label: "Rechazada", icon: XCircle, variant: "destructive" },
  retirada: { label: "Retirada", icon: XCircle, variant: "outline" },
}

export default function MisOfertas() {
  const [filtro, setFiltro] = useState<Estado | "todas">("todas")
  const [ofertas, setOfertas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [retirando, setRetirando] = useState<string | null>(null)
  const { toast } = useToast()

  async function cargar() {
    setLoading(true)
    const result = await obtenerOfertasPorProfesional()
    setOfertas(result.data || [])
    if (result.error) toast({ title: "No se pudieron cargar los presupuestos", description: result.error, variant: "destructive" })
    setLoading(false)
  }

  useEffect(() => { void cargar() }, [])

  async function handleRetirar(id: string) {
    setRetirando(id)
    const result = await retirarOferta(id)
    if (result.error) {
      toast({ title: "No se pudo retirar", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Presupuesto retirado", description: "El cliente ya no podrá aceptarlo." })
      await cargar()
    }
    setRetirando(null)
  }

  const visibles = filtro === "todas" ? ofertas : ofertas.filter((oferta) => oferta.estado === filtro)
  const total = (estado: Estado) => ofertas.filter((oferta) => oferta.estado === estado).length

  if (loading) return <Card><CardContent className="flex items-center justify-center py-16"><Loader2 className="size-8 animate-spin text-muted-foreground" /></CardContent></Card>

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-balance text-3xl font-bold">Presupuestos enviados</h1>
        <p className="text-pretty text-muted-foreground">Consulta el estado de las ofertas que has enviado a clientes.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["pendiente", "aceptada", "rechazada", "retirada"] as Estado[]).map((estado) => (
          <Card key={estado}><CardContent className="flex items-center justify-between p-4"><span className="text-sm text-muted-foreground">{estados[estado].label}</span><strong className="text-xl">{total(estado)}</strong></CardContent></Card>
        ))}
      </div>

      <Tabs value={filtro} onValueChange={(value) => setFiltro(value as Estado | "todas")}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="todas">Todos ({ofertas.length})</TabsTrigger>
          <TabsTrigger value="pendiente">Pendientes ({total("pendiente")})</TabsTrigger>
          <TabsTrigger value="aceptada">Aceptados ({total("aceptada")})</TabsTrigger>
          <TabsTrigger value="rechazada">Rechazados ({total("rechazada")})</TabsTrigger>
          <TabsTrigger value="retirada">Retirados ({total("retirada")})</TabsTrigger>
        </TabsList>
        <TabsContent value={filtro} className="mt-5 flex flex-col gap-4">
          {visibles.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center"><FileText className="size-10 text-muted-foreground" /><div><p className="font-medium">No hay presupuestos aquí</p><p className="text-sm text-muted-foreground">Cuando envíes uno desde una demanda aparecerá en esta sección.</p></div><Button asChild><Link href="/demandas">Ver demandas</Link></Button></CardContent></Card>
          ) : visibles.map((oferta) => {
            const config = estados[(oferta.estado as Estado)] || estados.pendiente
            const Icon = config.icon
            return (
              <Card key={oferta.id}>
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-2"><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-lg">{oferta.solicitud?.titulo || "Servicio"}</CardTitle><Badge variant={config.variant}><Icon className="mr-1 size-3" />{config.label}</Badge></div><CardDescription>{oferta.solicitud?.cliente ? `${oferta.solicitud.cliente.nombre || ""} ${oferta.solicitud.cliente.apellido || ""}` : "Cliente"}</CardDescription></div>
                  <div className="shrink-0 sm:text-right"><p className="text-2xl font-bold text-primary">{formatearPrecioEuros(oferta.precio)}</p><p className="text-xs text-muted-foreground">Presupuesto enviado</p></div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-2"><Calendar className="size-4" />{new Date(oferta.created_at).toLocaleDateString("es-ES")}</span><span className="flex items-center gap-2"><MapPin className="size-4" />{oferta.solicitud?.ubicacion || "Sin ubicación"}</span><span className="flex items-center gap-2"><Clock className="size-4" />{oferta.tiempo_estimado} {oferta.unidad_tiempo || "días"}</span></div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{oferta.descripcion}</p>
                  <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                    <Button asChild variant="outline" className="sm:flex-1"><Link href={`/demandas?solicitud=${oferta.solicitud_id}`}><FileText className="mr-2 size-4" />Ver demanda</Link></Button>
                    {oferta.estado === "aceptada" && <Button asChild className="sm:flex-1"><Link href="/mis-trabajos"><MessageSquare className="mr-2 size-4" />Ver proyecto</Link></Button>}
                    {oferta.estado === "pendiente" && <Button variant="destructive" className="sm:flex-1" disabled={retirando === oferta.id} onClick={() => void handleRetirar(oferta.id)}>{retirando === oferta.id && <Loader2 className="mr-2 size-4 animate-spin" />}Retirar presupuesto</Button>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>
      </Tabs>
    </div>
  )
}
