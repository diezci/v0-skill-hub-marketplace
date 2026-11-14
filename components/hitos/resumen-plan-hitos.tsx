"use client"

import Link from "next/link"
import { ArrowRight, Check, Layers3 } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { HitoBorrador } from "@/lib/hitos"

export function ResumenPlanHitos({ hitos }: { hitos: HitoBorrador[] }) {
  const { t, idioma } = useIdioma()
  return <ol className="min-w-0">
    {hitos.map((hito, indice) => <li key={hito.id} className="relative min-w-0 pb-4 pl-8 last:pb-0">
      {indice < hitos.length - 1 && <span className="absolute bottom-0 left-3 top-6 w-px bg-border" aria-hidden="true" />}
      <span aria-hidden="true" className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 bg-background text-xs text-primary">{indice + 1}</span>
      <div className="min-w-0 rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><p className="min-w-0 break-words text-sm font-medium">{hito.titulo}</p><p className="shrink-0 text-sm font-medium">{new Intl.NumberFormat(idioma === "en" ? "en-IE" : "es-ES", { style: "currency", currency: "EUR" }).format(hito.importe_centimos / 100)}</p></div>
        {hito.fecha_limite && <p className="mt-1 text-xs text-muted-foreground">{t("Entrega")}: {new Date(`${hito.fecha_limite}T12:00:00`).toLocaleDateString(idioma === "en" ? "en-GB" : "es-ES")}</p>}
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{hito.criterio_aceptacion}</p>
      </div>
    </li>)}
  </ol>
}

export function TarjetaTrabajoHitos({ trabajo, titulo, id, className }: { trabajo: { id: string; titulo?: string; estado?: string; precio_acordado?: number; progreso?: number }; titulo?: string; id?: string; className?: string }) {
  const { t, idioma } = useIdioma()
  return <Card id={id || `trabajo-${trabajo.id}`} tabIndex={-1} className={cn("min-w-0 scroll-mt-24 overflow-hidden", className)}>
    <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><CardTitle className="min-w-0 break-words text-xl">{titulo || trabajo.titulo}</CardTitle><Badge variant="outline" className="gap-1 border-primary/40 text-primary"><Layers3 className="h-3 w-3" />{t("Pago por hitos")}</Badge></div></CardHeader>
    <CardContent className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{t("Un trabajo · entregas y pagos por fases")}</p>{typeof trabajo.precio_acordado === "number" && <strong>{new Intl.NumberFormat(idioma === "en" ? "en-IE" : "es-ES", { style: "currency", currency: "EUR" }).format(trabajo.precio_acordado)}</strong>}</div>
      {trabajo.estado === "completado" ? <p className="flex items-center gap-2 text-sm text-emerald-600"><Check className="h-4 w-4" />{t("Todos los hitos completados")}</p> : <p className="text-sm text-muted-foreground">{t("Consulta qué hito está pagado, entrega o revisa sus evidencias y acuerda cambios en el plan.")}</p>}
      <Button asChild className="min-h-11 w-full sm:w-auto"><Link href={`/trabajos/${trabajo.id}/hitos`}>{t("Ver hitos y pagos")}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
    </CardContent>
  </Card>
}
