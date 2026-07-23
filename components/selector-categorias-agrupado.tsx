"use client"

import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { GRUPOS_CATEGORIAS } from "@/lib/categorias"

function normalizar(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function slug(s: string) {
  return normalizar(s).replace(/[^a-z0-9]+/g, "-")
}

/**
 * Selección múltiple de subcategorías con cada grupo en un desplegable.
 *
 * Son 55 subcategorías: en una sola lista quedaban en un scroll larguísimo e
 * ilegible. Plegadas, se ven de un vistazo los 12 grupos y solo se abre el que
 * interesa. El contador del encabezado deja ver lo elegido sin desplegar.
 *
 * Lo usan el filtro de /profesionales y el perfil del profesional, para que la
 * taxonomía se presente igual en toda la web.
 */
export function SelectorCategoriasAgrupado({
  seleccionadas,
  onChange,
  disabled,
  idPrefix = "cat",
  conBusqueda = true,
}: {
  seleccionadas: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  idPrefix?: string
  conBusqueda?: boolean
}) {
  const [busqueda, setBusqueda] = useState("")
  const [abiertos, setAbiertos] = useState<string[]>([])

  const alternar = (nombre: string) =>
    onChange(
      seleccionadas.includes(nombre) ? seleccionadas.filter((c) => c !== nombre) : [...seleccionadas, nombre],
    )

  const q = normalizar(busqueda.trim())
  const grupos = GRUPOS_CATEGORIAS.map((g) => ({
    grupo: g.grupo,
    subcategorias: q
      ? g.subcategorias.filter((s) => normalizar(s.nombre).includes(q) || normalizar(g.grupo).includes(q))
      : g.subcategorias,
  })).filter((g) => g.subcategorias.length > 0)

  // Al buscar se abren solos los grupos con resultados; si no, manda el usuario.
  const valorAcordeon = q ? grupos.map((g) => g.grupo) : abiertos

  return (
    <div className="space-y-2">
      {conBusqueda && !disabled && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar servicio..."
            className="pl-8"
          />
        </div>
      )}

      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Ningún servicio coincide.</p>
      ) : (
        <Accordion
          type="multiple"
          value={valorAcordeon}
          onValueChange={(v) => !q && setAbiertos(v)}
          className="rounded-lg border divide-y"
        >
          {grupos.map((g) => {
            const nSel = g.subcategorias.filter((s) => seleccionadas.includes(s.nombre)).length
            return (
              <AccordionItem key={g.grupo} value={g.grupo} className="border-b-0 px-3">
                <AccordionTrigger className="py-2.5 hover:no-underline">
                  <span className="flex items-center gap-2 text-left text-sm font-medium">
                    {g.grupo}
                    {nSel > 0 && (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold px-2 py-0.5">
                        {nSel}
                      </span>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="space-y-1.5">
                    {g.subcategorias.map((s) => {
                      const id = `${idPrefix}-${slug(s.nombre)}`
                      return (
                        <div key={s.nombre} className="flex items-start gap-2">
                          <Checkbox
                            id={id}
                            checked={seleccionadas.includes(s.nombre)}
                            onCheckedChange={() => alternar(s.nombre)}
                            disabled={disabled}
                            className="mt-0.5"
                          />
                          <label htmlFor={id} className="text-sm leading-tight cursor-pointer">
                            {s.nombre}
                          </label>
                        </div>
                      )
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
    </div>
  )
}
