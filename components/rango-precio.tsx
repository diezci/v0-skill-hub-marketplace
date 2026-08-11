"use client"

import { useEffect, useState } from "react"
import { Slider } from "@/components/ui/slider"
import { formatearPrecioEuros } from "@/lib/utils"
import { PRECIO_MAX, PASO_PRECIO } from "@/lib/precios"

/**
 * Control de rango de precio. Por defecto va de 0 a 100.000, que es el
 * presupuesto total de un proyecto (formulario de demanda y filtro de
 * /demandas), pero admite otro tope para usos con distinta escala, como la
 * tarifa por hora de /profesionales.
 *
 * Las dos cifras SE PUEDEN ESCRIBIR, no solo arrastrar. Con la barra sola era
 * imposible publicar un presupuesto concreto: en 312 px de ancho para un rango
 * de 0 a 100.000, cada píxel vale 321 €, y el salto de 500 € mide 1,5 px. Para
 * poner 7.000 € había que acertar en una diana de píxel y medio; lo normal era
 * quedarse en 6.500 o 7.500, o rendirse y dejar el tirador en el tope (que es de
 * donde salieron todas las demandas antiguas sin máximo).
 *
 * La barra se queda para lo que sirve: hacerse una idea y moverse rápido.
 */
export function RangoPrecio({
  value,
  onChange,
  max = PRECIO_MAX,
  paso = PASO_PRECIO,
  // Solo para los lectores de pantalla: en /profesionales esto no es un
  // presupuesto sino una tarifa por hora, y anunciarlo mal despista.
  etiqueta = "Presupuesto",
}: {
  value: [number, number]
  onChange: (v: [number, number]) => void
  max?: number
  paso?: number
  etiqueta?: string
}) {
  const [minSel, maxSel] = value

  // Mientras se teclea hace falta un estado propio: si se reformatea a cada
  // pulsación, borrar un dígito de "7000" para escribir "20000" es imposible.
  const [escribiendo, setEscribiendo] = useState<{ cual: "min" | "max"; texto: string } | null>(null)
  useEffect(() => {
    setEscribiendo(null)
  }, [value[0], value[1]])

  const aplicar = (cual: "min" | "max", texto: string) => {
    const n = Number(texto.replace(/[^\d]/g, ""))
    const limpio = Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0
    // Los dos extremos no pueden cruzarse: el que se mueve empuja al otro.
    if (cual === "min") onChange([limpio, Math.max(limpio, maxSel)])
    else onChange([Math.min(minSel, limpio), limpio])
    setEscribiendo(null)
  }

  const caja = (cual: "min" | "max", valor: number) => {
    const enEdicion = escribiendo?.cual === cual
    return (
      <input
        type="text"
        inputMode="numeric"
        aria-label={cual === "min" ? `${etiqueta} mínimo` : `${etiqueta} máximo`}
        className="w-28 rounded-md border bg-transparent px-2 py-1 text-sm tabular-nums text-center outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        value={
          enEdicion
            ? escribiendo!.texto
            : `${formatearPrecioEuros(Math.min(valor, max))}${cual === "max" && valor >= max ? "+" : ""}`
        }
        onFocus={(e) => {
          setEscribiendo({ cual, texto: String(Math.min(valor, max)) })
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => setEscribiendo({ cual, texto: e.target.value })}
        onBlur={(e) => aplicar(cual, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === "Escape") setEscribiendo(null)
        }}
      />
    )
  }

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
        {caja("min", minSel)}
        <span className="text-muted-foreground shrink-0">a</span>
        {caja("max", maxSel)}
      </div>
    </div>
  )
}
