"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { X, Search } from "lucide-react"
import { GRUPOS_CATEGORIAS } from "@/lib/categorias"
import { PROVINCIAS_ES } from "@/lib/provincias"

function normalizar(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

/**
 * Selección múltiple de las subcategorías de servicio en las que trabaja el
 * profesional. Agrupadas por bloque igual que el resto de la web, con buscador
 * porque son 55.
 */
export function SelectorCategorias({
  seleccionadas,
  onChange,
  disabled,
}: {
  seleccionadas: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
}) {
  const [busqueda, setBusqueda] = useState("")

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

  return (
    <div className="space-y-3">
      {seleccionadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {seleccionadas.map((c) => (
            <Badge key={c} variant="secondary" className="gap-1">
              {c}
              {!disabled && (
                <button type="button" onClick={() => alternar(c)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {!disabled && (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar servicio..."
              className="pl-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border p-3 space-y-3">
            {grupos.length === 0 && <p className="text-sm text-muted-foreground">Ningún servicio coincide.</p>}
            {grupos.map((g) => (
              <div key={g.grupo} className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{g.grupo}</p>
                {g.subcategorias.map((s) => (
                  <label key={s.nombre} className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={seleccionadas.includes(s.nombre)}
                      onCheckedChange={() => alternar(s.nombre)}
                      className="mt-0.5"
                    />
                    <span className="text-sm leading-tight">{s.nombre}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Provincias en las que el profesional quiere cubrir demandas.
 */
export function SelectorProvincias({
  seleccionadas,
  onChange,
  disabled,
}: {
  seleccionadas: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
}) {
  const [busqueda, setBusqueda] = useState("")

  const alternar = (nombre: string) =>
    onChange(
      seleccionadas.includes(nombre) ? seleccionadas.filter((p) => p !== nombre) : [...seleccionadas, nombre],
    )

  const q = normalizar(busqueda.trim())
  const provincias = q ? PROVINCIAS_ES.filter((p) => normalizar(p).includes(q)) : PROVINCIAS_ES
  const todasPuestas = seleccionadas.length === PROVINCIAS_ES.length

  return (
    <div className="space-y-3">
      {seleccionadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {todasPuestas ? (
            <Badge variant="secondary" className="gap-1">
              Toda España
              {!disabled && (
                <button type="button" onClick={() => onChange([])} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ) : (
            seleccionadas.map((p) => (
              <Badge key={p} variant="secondary" className="gap-1">
                {p}
                {!disabled && (
                  <button type="button" onClick={() => alternar(p)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))
          )}
        </div>
      )}

      {!disabled && (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar provincia..."
                className="pl-8"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(todasPuestas ? [] : [...PROVINCIAS_ES])}
            >
              {todasPuestas ? "Ninguna" : "Toda España"}
            </Button>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border p-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {provincias.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-2">Ninguna provincia coincide.</p>
            )}
            {provincias.map((p) => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={seleccionadas.includes(p)} onCheckedChange={() => alternar(p)} />
                <span className="text-sm">{p}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
