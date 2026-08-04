"use client"

import { Slider } from "@/components/ui/slider"
import { formatearPrecioEuros } from "@/lib/utils"
import { PRECIO_MAX, PASO_PRECIO } from "@/lib/precios"

/**
 * Control de rango de precio. Por defecto va de 0 a 100.000, que es el
 * presupuesto total de un proyecto (formulario de demanda, wizard y /demandas),
 * pero admite otro tope para usos con distinta escala, como la tarifa por hora
 * de /profesionales. El extremo derecho se muestra como "y más" (p. ej.
 * "1.000€+"). Los importes van con separador de miles.
 */
export function RangoPrecio({
  value,
  onChange,
  max = PRECIO_MAX,
  paso = PASO_PRECIO,
}: {
  value: [number, number]
  onChange: (v: [number, number]) => void
  max?: number
  paso?: number
}) {
  const [minSel, maxSel] = value
  return (
    // px-2: los tiradores del deslizador quedaban pegados al borde del
    // contenedor, que recorta (el acordeón usa overflow-hidden para animarse),
    // así que se les comía el contorno y se veían planos por fuera.
    <div className="space-y-3 pt-1 px-2">
      <Slider
        max={max}
        step={paso}
        value={[Math.min(minSel, max), Math.min(maxSel, max)]}
        onValueChange={(v) => onChange([v[0], v[1]])}
      />
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="rounded-md border px-2 py-1 tabular-nums">{formatearPrecioEuros(Math.min(minSel, max))}</span>
        <span className="text-muted-foreground">a</span>
        <span className="rounded-md border px-2 py-1 tabular-nums">
          {formatearPrecioEuros(Math.min(maxSel, max))}
          {maxSel >= max && "+"}
        </span>
      </div>
    </div>
  )
}
