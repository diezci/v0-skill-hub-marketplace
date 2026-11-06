"use client"

import { localeDe, type Idioma } from "@/lib/i18n"

import { useIdioma } from "@/components/idioma-provider"

import Link from "next/link"
import { useEffect, useState } from "react"
import { AlertTriangle, BellRing, CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { obtenerEstadoOperativo, obtenerPaginaOperativa, resolverEventoOperativo, type ResumenOperativo } from "@/app/actions/operaciones"
import { useToast } from "@/hooks/use-toast"
import { revisarPlazosWorkflow } from "@/app/actions/plazos-workflow"

type Categoria = keyof ResumenOperativo["detalle"]

function fecha(value: string | null | undefined, idioma: Idioma) {
  if (!value) return "—"
  return new Date(value).toLocaleString(localeDe(idioma), { dateStyle: "short", timeStyle: "short" })
}

export default function OperacionesPage() {
  const { t, idioma } = useIdioma()

  const [resumen, setResumen] = useState<ResumenOperativo | null>(null)
  const [loading, setLoading] = useState(true)
  const [cargandoGrupo, setCargandoGrupo] = useState<Categoria | null>(null)
  const [errorCarga, setErrorCarga] = useState("")
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [procesandoPlazos, setProcesandoPlazos] = useState(false)
  const { toast } = useToast()

  const cargar = async () => {
    setLoading(true)
    setErrorCarga("")
    try {
      const resultado = await obtenerEstadoOperativo()
      if (!resultado.ok) {
        setErrorCarga(resultado.error)
        toast({ title: t("No se pudo cargar operaciones"), description: resultado.error, variant: "destructive" })
      } else {
        setResumen(resultado.data)
      }
    } catch {
      const mensaje = t("No se puede conectar con Diime. Inténtalo de nuevo.")
      setErrorCarga(mensaje)
      toast({ title: t("No se pudo cargar operaciones"), description: mensaje, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  useEffect(() => {
    if (!loading && window.location.hash === "#demandas-sin-oferta") {
      document.getElementById("demandas-sin-oferta")?.scrollIntoView({ block: "start" })
    }
  }, [loading])

  const cargarMas = async (categoria: Categoria) => {
    if (!resumen || loading || cargandoGrupo) return
    setCargandoGrupo(categoria)
    try {
      const resultado = await obtenerPaginaOperativa(categoria, resumen.detalle[categoria].length)
      if (!resultado.ok) {
        toast({ title: t("No se pudo cargar operaciones"), description: resultado.error, variant: "destructive" })
      } else {
        setResumen(actual => {
          if (!actual) return actual
          const anteriores = actual.detalle[categoria]
          const conocidos = new Set(anteriores.map(fila => fila.id))
          const filas = [...anteriores, ...resultado.data.filas.filter(fila => !conocidos.has(fila.id))]
          const totales = { ...actual.totales, [categoria]: resultado.data.total }
          const alertasTecnicas = totales.eventos + totales.webhooksError + totales.webhooksAtascados + totales.liquidacionesError + totales.liquidacionesAtascadas
          const alertasOperacion = totales.disputasVencidas + totales.incidenciasCriticas + totales.solicitudesSinOferta
          return { ...actual, totales, detalle: { ...actual.detalle, [categoria]: filas }, alertasTecnicas, alertasOperacion, total: alertasTecnicas + alertasOperacion }
        })
      }
    } catch {
      toast({ title: t("No se pudo cargar operaciones"), description: t("No se puede conectar con Diime. Inténtalo de nuevo."), variant: "destructive" })
    } finally {
      setCargandoGrupo(null)
    }
  }

  const paginacion = (categoria: Categoria) => resumen && resumen.detalle[categoria].length < resumen.totales[categoria] ? (
    <div className="flex items-center gap-3 pt-3">
      <span className="text-sm text-muted-foreground">{resumen.detalle[categoria].length} / {resumen.totales[categoria]}</span>
      <Button variant="outline" onClick={() => cargarMas(categoria)} disabled={loading || !!cargandoGrupo}>
        {cargandoGrupo === categoria ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Cargar más")}
      </Button>
    </div>
  ) : null

  const resolver = async (id: string) => {
    setResolviendo(id)
    try {
      const resultado = await resolverEventoOperativo(id)
      if ("error" in resultado && resultado.error) {
        toast({ title: t("No se pudo resolver"), description: resultado.error, variant: "destructive" })
      } else {
        toast({ title: t("Evento resuelto"), description: t("Volverá a abrirse automáticamente si el fallo se repite.") })
        await cargar()
      }
    } catch {
      toast({ title: t("No se pudo resolver"), description: t("No se puede conectar con Diime. Inténtalo de nuevo."), variant: "destructive" })
    } finally {
      setResolviendo(null)
    }
  }

  const procesarPlazos = async () => {
    setProcesandoPlazos(true)
    try {
      const r = await revisarPlazosWorkflow()
      if (r.error) throw new Error(r.error)
      toast({ title: t("Plazos revisados"), description: t("Contratos caducados: {caducados}. Recordatorios: {recordatorios}. Pendientes de conciliación: {errores}.", { caducados: r.data!.caducados, recordatorios: r.data!.recordatorios, errores: r.data!.errores.length }) })
      await cargar()
    } catch {
      toast({ title: t("No se pudieron procesar los plazos. Inténtalo de nuevo."), variant: "destructive" })
    } finally { setProcesandoPlazos(false) }
  }

  if (loading && !resumen) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>
  }

  const eventos = resumen?.detalle.eventos || []
  const grupos = [
    ["webhooksError", t("Webhooks fallidos"), resumen?.detalle.webhooksError || [], t("Revisar en Stripe y reintentar el mismo evento.")],
    ["webhooksAtascados", t("Webhooks atascados"), resumen?.detalle.webhooksAtascados || [], t("Procesando durante más de 15 minutos.")],
    ["liquidacionesError", t("Liquidaciones fallidas"), resumen?.detalle.liquidacionesError || [], t("Confirmar el movimiento en Stripe antes de reintentar.")],
    ["liquidacionesAtascadas", t("Liquidaciones atascadas"), resumen?.detalle.liquidacionesAtascadas || [], t("Procesando durante más de 15 minutos.")],
    ["disputasVencidas", t("Disputas fuera de SLA"), resumen?.detalle.disputasVencidas || [], t("Sin resolver durante más de 24 horas.")],
    ["incidenciasCriticas", t("Incidencias críticas"), resumen?.detalle.incidenciasCriticas || [], t("Requieren atención inmediata.")],
    ["solicitudesSinOferta", t("Demandas sin ofertas tras 24 h"), resumen?.detalle.solicitudesSinOferta || [], t("Abiertas desde hace al menos 24 horas y sin ofertas registradas, en cualquier ubicación.")],
  ] as const

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><BellRing className="h-8 w-8 text-primary" />{t("Operaciones")}</h1>
          <p className="text-muted-foreground mt-1">{t("Pagos, comunicaciones, moderación y demandas pendientes de atención.")}</p>
        </div>
        <Button variant="outline" onClick={cargar} disabled={loading || !!cargandoGrupo} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t("Actualizar")}</Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("Pago sin completar: 15 días. Revisión de entrega: 7 días. Sin liberación automática de fondos.")}</p>
        <Button variant="outline" onClick={procesarPlazos} disabled={procesandoPlazos}>
          {procesandoPlazos && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Procesar plazos vencidos")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>{t("Total accionable")}</CardDescription><CardTitle className="text-3xl">{resumen?.total ?? "—"}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>{t("Alertas técnicas")}</CardDescription><CardTitle className="text-3xl">{resumen?.alertasTecnicas ?? "—"}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>{t("Operación y matching")}</CardDescription><CardTitle className="text-3xl">{resumen?.alertasOperacion ?? "—"}</CardTitle></CardHeader></Card>
      </div>

      {errorCarga && <p role="alert" className="text-destructive">{errorCarga}</p>}

      {resumen && !errorCarga && resumen.total === 0 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-8 text-center"><CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" /><p className="font-medium">{t("No hay elementos fuera de SLA.")}</p><p className="text-sm text-muted-foreground">{t("Último control:")}{" "}{fecha(resumen?.generadoAt, idioma)}</p></CardContent>
        </Card>
      )}

      {eventos.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t("Fallos registrados por la aplicación")} <Badge>{resumen?.totales.eventos}</Badge></CardTitle><CardDescription>{t("Email, push y errores técnicos agregados sin datos personales completos.")}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {eventos.map((evento: any) => (
              <div key={evento.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                <AlertTriangle className={evento.severidad === "critica" ? "h-5 w-5 text-red-500" : "h-5 w-5 text-amber-500"} />
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{evento.mensaje}</p><Badge variant="outline">{evento.area}</Badge><Badge variant="secondary">×{evento.ocurrencias}</Badge></div><p className="text-xs text-muted-foreground mt-1">{evento.codigo} · {fecha(evento.ultimo_evento_at, idioma)}</p></div>
                <Button size="sm" variant="outline" onClick={() => resolver(evento.id)} disabled={resolviendo === evento.id || !!cargandoGrupo}>{resolviendo === evento.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Marcar resuelto")}</Button>
              </div>
            ))}
            {paginacion("eventos")}
          </CardContent>
        </Card>
      )}

      {grupos.map(([categoria, titulo, filas, ayuda]) => (filas.length > 0 || (categoria === "solicitudesSinOferta" && resumen)) && (
        <Card key={categoria} id={categoria === "solicitudesSinOferta" ? "demandas-sin-oferta" : undefined} className="scroll-mt-6">
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />{titulo}<Badge>{resumen?.totales[categoria]}</Badge></CardTitle><CardDescription>{ayuda}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {categoria === "solicitudesSinOferta" && filas.length === 0 && !errorCarga && <p className="text-sm text-muted-foreground">{t("No hay demandas abiertas sin ofertas registradas tras 24 h.")}</p>}
            {filas.map((fila: any) => categoria === "solicitudesSinOferta" ? (
              <article key={fila.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium [overflow-wrap:anywhere]">{fila.titulo}</p>
                  <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{fila.ubicacion}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("Publicada el")}: <time dateTime={fila.created_at}>{fecha(fila.created_at, idioma)}</time></p>
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0 self-start sm:self-center"><Link href={`/demandas?solicitud=${encodeURIComponent(fila.id)}`}>{t("Ver demanda")}</Link></Button>
              </article>
            ) : <div key={fila.id} className="space-y-2">
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{JSON.stringify(fila, null, 2)}</pre>
              {categoria === "disputasVencidas" && <div className="text-sm space-y-1">
                <p>{t("Responsable de revisión")}: {fila.responsable ? `${fila.responsable.nombre || ""} ${fila.responsable.apellido || ""}`.trim() : t("Sin asignar")}{fila.responsable && !fila.responsable.es_admin && ` · ${t("Ya no es administrador")}`}</p>
                <Link href={`/admin/disputas?disputa=${encodeURIComponent(fila.id)}`} className="text-primary underline">{t("Revisar disputa")}</Link>
              </div>}
              {categoria.startsWith("liquidaciones") && fila.trabajo_id && <Link href={`/admin/pagos?trabajo=${encodeURIComponent(fila.trabajo_id)}`} className="text-sm text-primary underline">{t("Revisar pago")}</Link>}
            </div>)}
            {paginacion(categoria)}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
