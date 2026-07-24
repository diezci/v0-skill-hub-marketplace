"use client"

import { Slider } from "@/components/ui/slider"
import { formatearPrecioEuros } from "@/lib/utils"
import { PRECIO_MAX, PASO_PRECIO } from "@/lib/precios"

/**
 * Control de rango de precio 0–100.000, idéntico en el formulario de demanda,
 * en /demandas y en /profesionales. El tope derecho se muestra como "y más"
 * (100.000€+). Los importes van con separador de miles.
 */
export function RangoPrecio({
  value,
  onChange,
}: {
  value: [number, number]
  onChange: (v: [number, number]) => void
}) {
  const [min, max] = value
  return (
    <div className="space-y-3 pt-1">
      <Slider
        max={PRECIO_MAX}
        step={PASO_PRECIO}
        value={[min, Math.min(max, PRECIO_MAX)]}
        onValueChange={(v) => onChange([v[0], v[1]])}
      />
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="rounded-md border px-2 py-1 tabular-nums">{formatearPrecioEuros(min)}</span>
        <span className="text-muted-foreground">a</span>
        <span className="rounded-md border px-2 py-1 tabular-nums">
          {formatearPrecioEuros(max)}
          {max >= PRECIO_MAX && "+"}
        </span>
      </div>
    </div>
  )
}
