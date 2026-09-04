"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, BellRing, CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { obtenerEstadoOperativo, resolverEventoOperativo, type ResumenOperativo } from "@/app/actions/operaciones"
import { useToast } from "@/hooks/use-toast"

function fecha(value?: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })
}

export default function OperacionesPage() {
  const [resumen, setResumen] = useState<ResumenOperativo | null>(null)
  const [loading, setLoading] = useState(true)
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const { toast } = useToast()

  const cargar = async () => {
    setLoading(true)
    const resultado = await obtenerEstadoOperativo()
    if (!resultado.ok) {
      toast({ title: "No se pudo cargar operaciones", description: resultado.error, variant: "destructive" })
    } else {
      setResumen(resultado.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const resolver = async (id: string) => {
    setResolviendo(id)
    const resultado = await resolverEventoOperativo(id)
    if ("error" in resultado && resultado.error) {
      toast({ title: "No se pudo resolver", description: resultado.error, variant: "destructive" })
    } else {
      toast({ title: "Evento resuelto", description: "Volverá a abrirse automáticamente si el fallo se repite." })
      await cargar()
    }
    setResolviendo(null)
  }

  if (loading && !resumen) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>
  }

  const eventos = resumen?.detalle.eventos || []
  const grupos = [
    ["Webhooks fallidos", resumen?.detalle.webhooksError || [], "Revisar en Stripe y reintentar el mismo evento."],
    ["Webhooks atascados", resumen?.detalle.webhooksAtascados || [], "Procesando durante más de 15 minutos."],
    ["Liquidaciones fallidas", resumen?.detalle.liquidacionesError || [], "Confirmar el movimiento en Stripe antes de reintentar."],
    ["Liquidaciones atascadas", resumen?.detalle.liquidacionesAtascadas || [], "Procesando durante más de 15 minutos."],
    ["Disputas fuera de SLA", resumen?.detalle.disputasVencidas || [], "Abiertas durante más de 24 horas."],
    ["Incidencias críticas", resumen?.detalle.incidenciasCriticas || [], "Requieren atención inmediata."],
    ["Demandas sin oferta", resumen?.detalle.solicitudesSinOferta || [], "Madrid, abiertas y sin oferta después de 4 horas."],
  ] as const

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><BellRing className="h-8 w-8 text-primary" />Operaciones</h1>
          <p className="text-muted-foreground mt-1">Pagos, comunicaciones, moderación y matching del piloto de Madrid.</p>
        </div>
        <Button variant="outline" onClick={cargar} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Actualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Total accionable</CardDescription><CardTitle className="text-3xl">{resumen?.total || 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Alertas técnicas</CardDescription><CardTitle className="text-3xl">{resumen?.alertasTecnicas || 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Operación y matching</CardDescription><CardTitle className="text-3xl">{resumen?.alertasOperacion || 0}</CardTitle></CardHeader></Card>
      </div>

      {(resumen?.total || 0) === 0 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-8 text-center"><CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" /><p className="font-medium">No hay elementos fuera de SLA.</p><p className="text-sm text-muted-foreground">Último control: {fecha(resumen?.generadoAt)}</p></CardContent>
        </Card>
      )}

      {eventos.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Fallos registrados por la aplicación</CardTitle><CardDescription>Email, push y errores técnicos agregados sin datos personales completos.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {eventos.map((evento: any) => (
              <div key={evento.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                <AlertTriangle className={evento.severidad === "critica" ? "h-5 w-5 text-red-500" : "h-5 w-5 text-amber-500"} />
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{evento.mensaje}</p><Badge variant="outline">{evento.area}</Badge><Badge variant="secondary">×{evento.ocurrencias}</Badge></div><p className="text-xs text-muted-foreground mt-1">{evento.codigo} · {fecha(evento.ultimo_evento_at)}</p></div>
                <Button size="sm" variant="outline" onClick={() => resolver(evento.id)} disabled={resolviendo === evento.id}>{resolviendo === evento.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Marcar resuelto"}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {grupos.map(([titulo, filas, ayuda]) => filas.length > 0 && (
        <Card key={titulo}>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />{titulo}<Badge>{filas.length}</Badge></CardTitle><CardDescription>{ayuda}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {filas.map((fila: any) => <pre key={fila.id} className="overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{JSON.stringify(fila, null, 2)}</pre>)}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
