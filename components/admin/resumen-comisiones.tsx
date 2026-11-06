"use client"

import { useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import Link from "next/link"
import { obtenerResumenFinanzasAdmin } from "@/app/actions/admin-finanzas"
import { useIdioma } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { localeDe } from "@/lib/i18n"

type Resultado = Awaited<ReturnType<typeof obtenerResumenFinanzasAdmin>>

export function ResumenComisiones({ mostrarCobros = false }: { mostrarCobros?: boolean }) {
  const { t, idioma } = useIdioma()
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [cargando, setCargando] = useState(true)
  const [revision, setRevision] = useState(0)
  const solicitud = useRef(0)

  useEffect(() => {
    const id = ++solicitud.current
    setCargando(true)
    setResultado(null)
    obtenerResumenFinanzasAdmin().then(res => {
      if (solicitud.current === id) setResultado(res)
    }).catch(() => {
      if (solicitud.current === id) setResultado({ error: "No se pudo cargar el resumen de comisiones." })
    }).finally(() => {
      if (solicitud.current === id) setCargando(false)
    })
    return () => { solicitud.current++ }
  }, [revision])

  const data = resultado?.data
  const importe = (centimos: number | null | undefined) => centimos == null ? "—" : new Intl.NumberFormat(localeDe(idioma), { style: "currency", currency: "EUR" }).format(centimos / 100)

  return (
    <section aria-label={t("Comisiones de Diime")} aria-busy={cargando} className="min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{t("Comisiones de Diime")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Histórico completo · EUR")}
            {data && <span className={data.modoReal ? "" : "font-medium text-amber-600 dark:text-amber-400"}> · {t(data.modoReal ? "Pagos reales" : "Modo de prueba")}</span>}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" disabled={cargando} onClick={() => setRevision(value => value + 1)} aria-label={t("Actualizar comisiones")}>
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <dl className="grid min-w-0 divide-y divide-border/60 px-4 py-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-0 sm:py-5">
        {[
          { etiqueta: "Comisiones brutas", valor: data?.brutoCentimos },
          { etiqueta: "Gastos de Stripe", valor: data?.gastosStripeCentimos },
          { etiqueta: "Neto tras Stripe", valor: data?.netoCentimos, destacado: true },
        ].map(item => (
          <div key={item.etiqueta} className="flex min-w-0 items-baseline justify-between gap-3 py-3 sm:block sm:px-5 sm:py-0">
            <dt className="text-xs text-muted-foreground">{t(item.etiqueta)}</dt>
            <dd className={`max-w-[60%] text-right text-2xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:mt-2 sm:max-w-none sm:text-left ${item.destacado ? "text-primary" : ""}`}>{importe(item.valor)}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2 border-t border-border/60 bg-muted/15 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
        {cargando && <p role="status">{t("Consultando comisiones y gastos reales…")}</p>}
        {resultado?.error && <p role="alert" className="text-destructive">{t(resultado.error)}</p>}
        {data && <>
          <p>{t("Comisiones de pagos liquidados, con IVA incluido. Se restan los gastos contabilizados en el saldo de Stripe, incluidos los de pagos en curso y los gastos generales.")}</p>
          {data.pendientesConciliar > 0 && <p className="font-medium text-amber-700 dark:text-amber-400">{t(data.pendientesConciliar === 1 ? "Hay un pago pendiente de conciliar. El total y el neto se mostrarán cuando esté verificado." : "{cantidad} pagos pendientes de conciliar. El total y el neto se mostrarán cuando estén verificados.", { cantidad: data.pendientesConciliar })}</p>}
          {data.avisos.map(aviso => <p key={aviso}>{t(aviso)}</p>)}
          {data.otrasMonedas.length > 0 && <p>{t("Monedas excluidas del resumen en euros")}: {data.otrasMonedas.join(", ").toUpperCase()}</p>}
          <p>{t("Actualizado")}: <time dateTime={data.actualizadoEn}>{new Intl.DateTimeFormat(localeDe(idioma), { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(data.actualizadoEn))}</time></p>
        </>}
      </div>
      {mostrarCobros && data && <div className="border-t border-border/60 px-4 py-4 sm:px-5">
        <h3 className="text-sm font-medium">{t("Últimos cobros")}</h3>
        {data.ultimosCobros?.length ? <ul className="mt-2 divide-y divide-border/60">
          {data.ultimosCobros.map(cobro => <li key={cobro.id}>
            <Link href={`/admin/pagos?escrow=${encodeURIComponent(cobro.id)}`} className="flex min-w-0 items-center justify-between gap-4 py-3 text-sm hover:text-primary">
              <span className="min-w-0"><span className="block truncate">{cobro.titulo}</span>{cobro.fecha && <time dateTime={cobro.fecha} className="mt-1 block text-xs text-muted-foreground">{new Intl.DateTimeFormat(localeDe(idioma), { dateStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(cobro.fecha))}</time>}</span>
              <span className="shrink-0 font-medium tabular-nums">{importe(cobro.importeCentimos)}</span>
            </Link>
          </li>)}
        </ul> : <p className="mt-2 text-xs text-muted-foreground">{t(data.brutoCentimos == null ? "Los últimos cobros están pendientes de verificación." : "No hay comisiones cobradas verificadas.")}</p>}
      </div>}
    </section>
  )
}
