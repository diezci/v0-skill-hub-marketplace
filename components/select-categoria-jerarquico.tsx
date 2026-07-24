"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SelectorCategoriasAgrupado } from "@/components/selector-categorias-agrupado"

/**
 * Desplegable de UNA categoría con la misma presentación jerárquica en acordeón
 * que el filtro de /profesionales. Sustituye al <Select> plano en el formulario
 * de demanda y en el filtro de /demandas, para que el selector se vea igual en
 * toda la web. Una demanda tiene una sola categoría, de ahí la selección única.
 *
 * `opcionTodas` añade arriba una opción de "sin filtro" (p. ej. "Todas las
 * categorías") para el filtro de /demandas.
 */
export function SelectCategoriaJerarquico({
  value,
  onChange,
  placeholder = "Selecciona un servicio",
  opcionTodas,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  opcionTodas?: string
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const esTodas = opcionTodas !== undefined && (value === opcionTodas || value === "")

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        <span className={cn("truncate", esTodas && "text-muted-foreground")}>
          {esTodas ? opcionTodas : value || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,90vw)] p-2 max-h-[70vh] overflow-y-auto">
        {opcionTodas !== undefined && (
          <button
            type="button"
            onClick={() => {
              onChange(opcionTodas)
              setAbierto(false)
            }}
            className={cn(
              "w-full text-left text-sm rounded-md px-2 py-1.5 mb-1 transition-colors",
              esTodas ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium" : "hover:bg-muted",
            )}
          >
            {opcionTodas}
          </button>
        )}
        <SelectorCategoriasAgrupado
          multiple={false}
          seleccionadas={esTodas ? [] : [value]}
          onChange={(v) => onChange(v[0] ?? "")}
          onPick={() => setAbierto(false)}
          idPrefix="cat-unica"
        />
      </PopoverContent>
    </Popover>
  )
}
