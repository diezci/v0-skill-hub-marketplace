"use client"

import type { ReactNode } from "react"
import { Bell } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { RangoPrecio } from "@/components/rango-precio"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Idioma, Traductor } from "@/lib/i18n"
import { PRECIO_MAX } from "@/lib/precios"
import { formatearPrecioEuros } from "@/lib/utils"

function formatearPresupuestoInteres([minimo, maximo]: [number, number], t: Traductor, idioma: Idioma) {
  if (minimo <= 0 && maximo >= PRECIO_MAX) return t("Cualquier presupuesto")
  if (maximo >= PRECIO_MAX) return t("Desde {precio}", { precio: formatearPrecioEuros(minimo, idioma) })
  if (minimo === maximo) return formatearPrecioEuros(minimo, idioma)
  if (minimo <= 0) return t("Hasta {precio}", { precio: formatearPrecioEuros(maximo, idioma) })
  return `${formatearPrecioEuros(minimo, idioma)} – ${formatearPrecioEuros(maximo, idioma)}`
}

export function PreferenciasDemandas({ presupuesto, onChange, editando, sinCobertura, disabled = false, children }: {
  presupuesto: [number, number]
  onChange: (presupuesto: [number, number]) => void
  editando: boolean
  sinCobertura: boolean
  disabled?: boolean
  children?: ReactNode
}) {
  const { t, idioma } = useIdioma()

  return <Card className={sinCobertura ? "border-amber-500/50" : undefined}>
    <CardHeader>
      <CardTitle className="text-lg flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        {t("Avisos de nuevas demandas")}
      </CardTitle>
      <p className="text-sm text-muted-foreground">
        {t("Elige qué servicios, provincias y presupuestos te interesan. Solo te avisaremos de las demandas que encajen con estos filtros.")}
      </p>
    </CardHeader>
    <CardContent className="space-y-5">
      {sinCobertura && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <p className="font-medium text-amber-700 dark:text-amber-400">{t("No estás recibiendo avisos de demandas")}</p>
        <p className="text-muted-foreground mt-0.5">
          {t("Elige tus servicios y tus provincias")} {!editando && <>{t("(pulsa «Editar perfil»)")} </>}{t("para empezar a recibirlas.")}
        </p>
      </div>}
      <fieldset disabled={disabled} inert={disabled || undefined} className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("Presupuesto total del proyecto")}</p>
          {editando && (presupuesto[0] > 0 || presupuesto[1] < PRECIO_MAX) && <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => { if (!disabled) onChange([0, PRECIO_MAX]) }}
          >{t("Cualquier presupuesto")}</Button>}
        </div>
        <p className="text-xs text-muted-foreground">{t("Las demandas con presupuesto «A convenir» también se incluyen.")}</p>
        {editando ? <RangoPrecio
          value={presupuesto}
          onChange={(valor) => { if (!disabled) onChange(valor) }}
          progresivo
          etiqueta="Presupuesto de la demanda"
        /> : <p className="text-sm rounded-md border bg-muted/30 px-3 py-2">{formatearPresupuestoInteres(presupuesto, t, idioma)}</p>}
      </fieldset>
      {children}
    </CardContent>
  </Card>
}
