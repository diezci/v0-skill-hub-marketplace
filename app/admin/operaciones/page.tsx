"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { BellRing, Loader2, RefreshCw } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { FilaOperativa } from "@/components/admin/fila-operativa"
import { ResumenOperativoPanel } from "@/components/admin/resumen-operativo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { obtenerEstadoOperativo, obtenerPaginaOperativa, resolverEventoOperativo, type ResumenOperativo } from "@/app/actions/operaciones"
import { revisarPlazosWorkflow } from "@/app/actions/plazos-workflow"
import { useToast } from "@/hooks/use-toast"
import { localeDe } from "@/lib/i18n"
import { anclaControl, CONTROLES_OPERATIVOS, GRUPOS_OPERATIVOS, type ControlOperativo } from "@/lib/operaciones-catalogo"

const categorias = Object.keys(CONTROLES_OPERATIVOS) as ControlOperativo[]
const accesoDenegado = (resultado: object) => "codigo" in resultado && ["NO_AUTENTICADO", "SIN_PERMISO"].includes(String(resultado.codigo))

export default function OperacionesPage() {
  const { t, idioma } = useIdioma()
  const { toast } = useToast()
  const [resumen, setResumen] = useState<ResumenOperativo | null>(null)
  const [loading, setLoading] = useState(true)
  const [cargandoGrupo, setCargandoGrupo] = useState<ControlOperativo | null>(null)
  const [errorCarga, setErrorCarga] = useState("")
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [procesandoPlazos, setProcesandoPlazos] = useState(false)
  const montado = useRef(false)
  const sesion = useRef(0)
  const revisionCarga = useRef(0)
  const paginaEnCurso = useRef(false)
  const accionEnCurso = useRef(false)

  const cargar = useCallback(async () => {
    const revision = ++revisionCarga.current
    paginaEnCurso.current = false
    setCargandoGrupo(null)
    setLoading(true)
    setErrorCarga("")
    try {
      const resultado = await obtenerEstadoOperativo()
      if (!montado.current || revision !== revisionCarga.current) return
      if (!resultado.ok) {
        if (accesoDenegado(resultado)) setResumen(null)
        setErrorCarga(resultado.error)
        toast({ title: t("No se pudo cargar operaciones"), description: resultado.error, variant: "destructive" })
      } else setResumen(resultado.data)
    } catch {
      if (!montado.current || revision !== revisionCarga.current) return
      const mensaje = t("No se puede conectar con Diime. Inténtalo de nuevo.")
      setErrorCarga(mensaje)
      toast({ title: t("No se pudo cargar operaciones"), description: mensaje, variant: "destructive" })
    } finally {
      if (montado.current && revision === revisionCarga.current) setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    montado.current = true
    sesion.current++
    return () => { montado.current = false; sesion.current++; revisionCarga.current++ }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  useEffect(() => {
    const abrirControl = () => {
      const id = window.location.hash.slice(1)
      if (!categorias.some(categoria => anclaControl(categoria) === id)) return
      const control = document.getElementById(id)
      if (control?.tagName === "DETAILS") (control as HTMLDetailsElement).open = true
      control?.scrollIntoView({ block: "start" })
    }
    if (!loading) abrirControl()
    window.addEventListener("hashchange", abrirControl)
    return () => window.removeEventListener("hashchange", abrirControl)
  }, [loading])

  const cargarMas = async (categoria: ControlOperativo) => {
    if (!resumen || loading || paginaEnCurso.current || accionEnCurso.current) return
    const revision = revisionCarga.current
    paginaEnCurso.current = true
    setCargandoGrupo(categoria)
    try {
      const resultado = await obtenerPaginaOperativa(categoria, resumen.detalle[categoria].length)
      if (!montado.current || revision !== revisionCarga.current) return
      if (!resultado.ok) {
        if (accesoDenegado(resultado)) { setResumen(null); setErrorCarga(resultado.error) }
        toast({ title: t("No se pudo cargar operaciones"), description: resultado.error, variant: "destructive" })
      }
      else setResumen(actual => {
        if (!actual) return actual
        const anteriores = actual.detalle[categoria]
        const conocidos = new Set(anteriores.map(fila => fila.id))
        const filas = [...anteriores, ...resultado.data.filas.filter(fila => !conocidos.has(fila.id))]
        const totales = { ...actual.totales, [categoria]: resultado.data.total }
        const total = Object.values(totales).reduce((suma, cantidad) => suma + cantidad, 0)
        const alertasTecnicas = categorias.filter(control => ["pagos", "avisos"].includes(CONTROLES_OPERATIVOS[control].grupo)).reduce((suma, control) => suma + totales[control], 0)
        return { ...actual, totales, detalle: { ...actual.detalle, [categoria]: filas }, total, alertasTecnicas, alertasOperacion: total - alertasTecnicas }
      })
    } catch {
      if (montado.current && revision === revisionCarga.current) toast({ title: t("No se pudo cargar operaciones"), description: t("No se puede conectar con Diime. Inténtalo de nuevo."), variant: "destructive" })
    } finally {
      if (montado.current && revision === revisionCarga.current) { paginaEnCurso.current = false; setCargandoGrupo(null) }
    }
  }

  const resolver = async (id: string) => {
    if (accionEnCurso.current || paginaEnCurso.current || loading) return
    const actual = sesion.current
    accionEnCurso.current = true
    setResolviendo(id)
    try {
      const resultado = await resolverEventoOperativo(id)
      if (!montado.current || actual !== sesion.current) return
      if ("error" in resultado && resultado.error) toast({ title: t("No se pudo resolver"), description: resultado.error, variant: "destructive" })
      else {
        toast({ title: t("Evento resuelto"), description: t("Volverá a abrirse automáticamente si el fallo se repite.") })
        await cargar()
      }
    } catch {
      if (montado.current && actual === sesion.current) toast({ title: t("No se pudo resolver"), description: t("No se puede conectar con Diime. Inténtalo de nuevo."), variant: "destructive" })
    } finally {
      if (montado.current && actual === sesion.current) { accionEnCurso.current = false; setResolviendo(null) }
    }
  }

  const procesarPlazos = async () => {
    if (accionEnCurso.current || paginaEnCurso.current || loading) return
    const actual = sesion.current
    accionEnCurso.current = true
    setProcesandoPlazos(true)
    try {
      const resultado = await revisarPlazosWorkflow()
      if (!montado.current || actual !== sesion.current) return
      if (resultado.error) throw new Error(resultado.error)
      toast({ title: t("Plazos revisados"), description: t("Contratos caducados: {caducados}. Recordatorios: {recordatorios}. Pendientes de conciliación: {errores}.", { caducados: resultado.data!.caducados, recordatorios: resultado.data!.recordatorios, errores: resultado.data!.errores.length }) })
      await cargar()
    } catch {
      if (montado.current && actual === sesion.current) toast({ title: t("No se pudieron procesar los plazos. Inténtalo de nuevo."), variant: "destructive" })
    } finally {
      if (montado.current && actual === sesion.current) { accionEnCurso.current = false; setProcesandoPlazos(false) }
    }
  }

  const ocupado = loading || !!cargandoGrupo || !!resolviendo || procesandoPlazos

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-start gap-2 text-2xl font-bold sm:text-3xl"><BellRing aria-hidden="true" className="mt-1 h-7 w-7 shrink-0 text-primary" />{t("Funcionamiento y atención")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("Revisa las esperas y los problemas registrados, y abre cada caso para atenderlo.")}</p>
        </div>
        <Button variant="outline" onClick={() => void cargar()} disabled={ocupado} className="shrink-0 gap-2 self-start">
          {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}{t("Actualizar listas")}
        </Button>
      </div>

      <ResumenOperativoPanel />

      <div className="space-y-2 text-sm" aria-live="polite">
        <p className="text-muted-foreground">{t("Listas actualizadas")}: {resumen ? <time dateTime={resumen.generadoAt}>{new Date(resumen.generadoAt).toLocaleString(localeDe(idioma), { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" })}</time> : "—"}</p>
        {loading && <p role="status">{t("Consultando los casos…")}</p>}
        {errorCarga && <p role="alert" className="text-destructive">{errorCarga} {resumen && t("Se conserva la última lista disponible; puede estar desactualizada.")}</p>}
        {resumen && <p className="text-muted-foreground">{t("Señales detectadas")}: {resumen.total}. {t("Un mismo caso puede aparecer en varios controles. No es un recuento de usuarios afectados.")}</p>}
      </div>

      {GRUPOS_OPERATIVOS.map(grupo => <section key={grupo.id} aria-labelledby={`grupo-${grupo.id}`} className="space-y-3">
        <h2 id={`grupo-${grupo.id}`} className="text-lg font-semibold">{t(grupo.titulo)}</h2>
        {categorias.filter(categoria => CONTROLES_OPERATIVOS[categoria].grupo === grupo.id).map(categoria => {
          const control = CONTROLES_OPERATIVOS[categoria]
          const filas = resumen?.detalle[categoria] || []
          const total = resumen?.totales[categoria]
          return <details key={categoria} id={anclaControl(categoria)} open={filas.length > 0} className="min-w-0 scroll-mt-6 rounded-2xl border bg-card">
            <summary className="cursor-pointer rounded-2xl p-4 text-sm font-medium [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
              {t(control.titulo)} <Badge variant="secondary" className="ml-2 align-middle">{total ?? "—"}</Badge>
              {errorCarga && <span className="ml-2 text-xs font-normal text-muted-foreground">{t(resumen ? "Dato anterior" : "No disponible")}</span>}
            </summary>
            <div className="min-w-0 space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
              <p className="text-sm text-muted-foreground">{t(control.criterio)}</p>
              {!resumen ? <p className="text-sm text-muted-foreground">{t(loading ? "Consultando los casos…" : "No se pudo consultar este control.")}</p>
                : filas.length === 0 && !errorCarga && !loading ? <p className="text-sm text-muted-foreground">{t(total === 0 ? "Sin señales detectadas en este control." : "No se pudieron cargar los casos de este control.")}</p> : null}
              {filas.map(fila => <FilaOperativa key={fila.id} categoria={categoria} fila={fila} observadoEn={resumen!.generadoAt} resolviendo={resolviendo === fila.id} accionesDeshabilitadas={ocupado} onResolver={id => void resolver(id)} />)}
              {resumen && filas.length < resumen.totales[categoria] && <div className="flex flex-wrap items-center gap-3 pt-2">
                <span className="text-sm text-muted-foreground">{filas.length} / {resumen.totales[categoria]}</span>
                <Button variant="outline" onClick={() => void cargarMas(categoria)} disabled={ocupado}>{cargandoGrupo === categoria ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : t("Cargar más")}</Button>
              </div>}
            </div>
          </details>
        })}
      </section>)}

      <details className="rounded-2xl border p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-medium">{t("Revisión manual de plazos")}</summary>
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted-foreground">{t("Pago sin completar: 15 días. Revisión de entrega: 7 días. Sin liberación automática de fondos.")}</p>
          <p className="text-muted-foreground">{t("Esta acción puede cerrar contratos caducados y enviar recordatorios. Solo se ejecuta al pulsar el botón.")}</p>
          <Button variant="outline" onClick={() => void procesarPlazos()} disabled={ocupado}>{procesandoPlazos && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}{t("Procesar plazos vencidos")}</Button>
        </div>
      </details>
    </div>
  )
}
