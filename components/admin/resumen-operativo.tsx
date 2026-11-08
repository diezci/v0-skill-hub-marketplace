"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ChevronDown, RefreshCw } from "lucide-react"
import { obtenerIndicadoresOperativosAdmin } from "@/app/actions/operaciones"
import { useIdioma } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { anclaControl, CONTROLES_OPERATIVOS, GRUPOS_OPERATIVOS, type ControlOperativo, type IndicadoresOperativos } from "@/lib/operaciones-catalogo"
import { localeDe } from "@/lib/i18n"

const controles = Object.entries(CONTROLES_OPERATIVOS) as [ControlOperativo, (typeof CONTROLES_OPERATIVOS)[ControlOperativo]][]

export function ResumenOperativoPanel() {
  const { t, idioma } = useIdioma()
  const [datos, setDatos] = useState<IndicadoresOperativos | null>(null)
  const [error, setError] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [revision, setRevision] = useState(0)
  const generacion = useRef(0)

  useEffect(() => {
    const actual = ++generacion.current
    let enCurso = false
    const cargar = async () => {
      if (enCurso) return
      enCurso = true
      setCargando(true)
      try {
        const resultado = await obtenerIndicadoresOperativosAdmin()
        if (actual !== generacion.current) return
        if (!resultado.ok) {
          setDatos(null)
          setError(true)
        } else {
          setDatos(resultado.data)
          setError(false)
        }
      } catch {
        if (actual === generacion.current) setError(true)
      } finally {
        enCurso = false
        if (actual === generacion.current) setCargando(false)
      }
    }
    const alVolver = () => { if (document.visibilityState === "visible") void cargar() }
    void cargar()
    const intervalo = setInterval(alVolver, 60_000)
    window.addEventListener("focus", alVolver)
    document.addEventListener("visibilitychange", alVolver)
    return () => {
      generacion.current++
      clearInterval(intervalo)
      window.removeEventListener("focus", alVolver)
      document.removeEventListener("visibilitychange", alVolver)
    }
  }, [revision])

  const disponibles = controles.filter(([key]) => datos?.controles[key]?.total != null).length
  const conAvisos = controles.filter(([key]) => (datos?.controles[key]?.total ?? 0) > 0).length
  const completo = disponibles === controles.length
  const actualizado = datos ? new Intl.DateTimeFormat(localeDe(idioma), { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(datos.generadoAt)) : null

  return (
    <section aria-label={t("Seguimiento de la experiencia")} aria-busy={cargando} className="min-w-0 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{t("Seguimiento de la experiencia")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Detecta esperas y problemas que pueden frenar a tus usuarios.")}</p>
        </div>
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label={t("Actualizar seguimiento")} disabled={cargando} onClick={() => setRevision(value => value + 1)}>
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <div role="status" className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className={error || !completo ? "text-amber-700 dark:text-amber-400" : conAvisos ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
          {error ? t("No se pudo actualizar el seguimiento.") : !datos ? t("Consultando controles…") : !completo ? t("Datos parciales: {cantidad} de {total} controles disponibles.", { cantidad: disponibles, total: controles.length }) : conAvisos ? t("Controles con avisos: {cantidad} de {total}.", { cantidad: conAvisos, total: controles.length }) : t("Sin avisos en los controles disponibles.")}
        </p>
        {actualizado && <p className="text-muted-foreground">{t(error ? "Última lectura disponible:" : "Comprobado:")} <time dateTime={datos!.generadoAt}>{actualizado}</time></p>}
      </div>
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {GRUPOS_OPERATIVOS.map(grupo => {
          const items = controles.filter(([, valor]) => valor.grupo === grupo.id)
          const avisos = items.filter(([key]) => (datos?.controles[key]?.total ?? 0) > 0).length
          const sinDato = items.some(([key]) => datos?.controles[key]?.total == null)
          return <details key={grupo.id} open={avisos > 0 || (datos != null && sinDato)} className="group min-w-0 self-start overflow-hidden rounded-xl border bg-card">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 text-sm [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-ring">
              <span className="min-w-0 flex-1 font-medium">{t(grupo.titulo)}</span>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs tabular-nums ${avisos > 0 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>{error ? t("Sin actualizar") : sinDato ? "—" : avisos ? t("{cantidad} con avisos", { cantidad: avisos }) : t("Sin avisos")}</span>
              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <ul className="divide-y border-t">
              {items.map(([key, control]) => {
                const valor = datos?.controles[key]?.total
                return <li key={key}>
                  <Link href={`/admin/operaciones#${anclaControl(key)}`} className="flex min-h-12 min-w-0 items-start gap-3 px-4 py-3 text-sm hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring" title={t(control.criterio)}>
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t(control.titulo)}</span>
                    <span className={`shrink-0 font-medium tabular-nums ${valor ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{valor == null ? t("Sin datos") : valor}</span>
                  </Link>
                </li>
              })}
            </ul>
          </details>
        })}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("Se actualiza cada minuto mientras esta vista está abierta. Un caso puede aparecer en varios controles.")}</p>
      <details className="text-xs leading-relaxed text-muted-foreground">
        <summary className="w-fit cursor-pointer py-2 font-medium">{t("Qué cubre este seguimiento")}</summary>
        <p className="mt-1 max-w-3xl">{t("Comprueba los estados y fallos registrados por Diime. Los avisos de comunicaciones no confirman la entrega de emails o notificaciones. Los tiempos de carga y los fallos en dispositivos todavía no se miden aquí.")}</p>
      </details>
    </section>
  )
}
