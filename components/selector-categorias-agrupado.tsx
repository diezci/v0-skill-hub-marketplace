"use client"

import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { TAXONOMIA_SERVICIOS, type SubcategoriaServicio } from "@/lib/categorias"

function normalizar(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function slug(s: string) {
  return normalizar(s).replace(/[^a-z0-9]+/g, "-")
}

/**
 * Selección de subcategorías siguiendo la jerarquía real: los desplegables de
 * primer nivel son las 8 categorías principales y, dentro de "Reformas y
 * Construcción", sus 6 bloques son un segundo nivel.
 *
 * Dos modos, misma presentación en toda la web:
 * - múltiple (por defecto): casillas, para la cobertura del profesional y el
 *   filtro de /profesionales.
 * - único: cada servicio es una fila que se resalta al elegirla y avisa con
 *   onPick (para cerrar el desplegable), para el formulario de demanda y el
 *   filtro de /demandas, donde una demanda tiene una sola categoría.
 */
export function SelectorCategoriasAgrupado({
  seleccionadas,
  onChange,
  disabled,
  idPrefix = "cat",
  conBusqueda = true,
  multiple = true,
  onPick,
}: {
  seleccionadas: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  idPrefix?: string
  conBusqueda?: boolean
  multiple?: boolean
  onPick?: () => void
}) {
  const [busqueda, setBusqueda] = useState("")
  const [abiertas, setAbiertas] = useState<string[]>([])
  const [bloquesAbiertos, setBloquesAbiertos] = useState<string[]>([])

  const elegir = (nombre: string) => {
    if (multiple) {
      onChange(seleccionadas.includes(nombre) ? seleccionadas.filter((c) => c !== nombre) : [...seleccionadas, nombre])
    } else {
      onChange([nombre])
      onPick?.()
    }
  }

  const q = normalizar(busqueda.trim())
  const coincide = (s: SubcategoriaServicio, ctx: string) =>
    !q || normalizar(s.nombre).includes(q) || normalizar(ctx).includes(q)

  // Filtrado conservando la jerarquía; se descartan bloques y categorías vacíos.
  const categorias = TAXONOMIA_SERVICIOS.map((cat) => ({
    nombre: cat.nombre,
    bloques: cat.bloques
      .map((b) => ({
        nombre: b.nombre,
        subcategorias: b.subcategorias.filter((s) => coincide(s, `${cat.nombre} ${b.nombre}`)),
      }))
      .filter((b) => b.subcategorias.length > 0),
  })).filter((c) => c.bloques.length > 0)

  // Al buscar se abre todo lo que tiene resultados; si no, manda el usuario.
  const valorCategorias = q ? categorias.map((c) => c.nombre) : abiertas
  const valorBloques = q ? categorias.flatMap((c) => c.bloques.map((b) => `${c.nombre}|${b.nombre}`)) : bloquesAbiertos

  const nSeleccionadas = (subs: SubcategoriaServicio[]) =>
    subs.filter((s) => seleccionadas.includes(s.nombre)).length

  const Contador = ({ n }: { n: number }) =>
    n > 0 ? (
      <span className="shrink-0 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold px-2 py-0.5">
        {n}
      </span>
    ) : null

  const listaServicios = (subs: SubcategoriaServicio[]) =>
    multiple ? (
      <div className="space-y-1.5">
        {subs.map((s) => {
          const id = `${idPrefix}-${slug(s.nombre)}`
          return (
            <div key={s.nombre} className="flex items-start gap-2">
              <Checkbox
                id={id}
                checked={seleccionadas.includes(s.nombre)}
                onCheckedChange={() => elegir(s.nombre)}
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
    ) : (
      <div className="space-y-0.5">
        {subs.map((s) => {
          const activo = seleccionadas.includes(s.nombre)
          return (
            <button
              key={s.nombre}
              type="button"
              onClick={() => elegir(s.nombre)}
              className={cn(
                "w-full text-left text-sm rounded-md px-2 py-1.5 transition-colors",
                activo
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium"
                  : "hover:bg-muted",
              )}
            >
              {s.nombre}
            </button>
          )
        })}
      </div>
    )

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

      {categorias.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Ningún servicio coincide.</p>
      ) : (
        <Accordion
          type="multiple"
          value={valorCategorias}
          onValueChange={(v) => !q && setAbiertas(v)}
          className="rounded-lg border divide-y"
        >
          {categorias.map((cat) => {
            const todasLasSubs = cat.bloques.flatMap((b) => b.subcategorias)
            // Solo "Reformas y Construcción" tiene bloques intermedios.
            const tieneBloques = cat.bloques.length > 1 || cat.bloques[0].nombre !== ""
            return (
              <AccordionItem key={cat.nombre} value={cat.nombre} className="border-b-0 px-3">
                <AccordionTrigger className="py-2.5 hover:no-underline">
                  <span className="flex items-center gap-2 text-left text-sm font-medium">
                    {cat.nombre}
                    <Contador n={nSeleccionadas(todasLasSubs)} />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  {tieneBloques ? (
                    <Accordion
                      type="multiple"
                      value={valorBloques}
                      onValueChange={(v) => !q && setBloquesAbiertos(v)}
                      className="rounded-md border divide-y"
                    >
                      {cat.bloques.map((b) => (
                        <AccordionItem
                          key={b.nombre}
                          value={`${cat.nombre}|${b.nombre}`}
                          className="border-b-0 px-2.5"
                        >
                          <AccordionTrigger className="py-2 hover:no-underline">
                            <span className="flex items-center gap-2 text-left text-[13px]">
                              {b.nombre}
                              <Contador n={nSeleccionadas(b.subcategorias)} />
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="pb-2.5">{listaServicios(b.subcategorias)}</AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : (
                    listaServicios(cat.bloques[0].subcategorias)
                  )}
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
    </div>
  )
}
