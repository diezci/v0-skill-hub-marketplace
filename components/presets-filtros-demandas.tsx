"use client"

import { useEffect, useState } from "react"
import { Bookmark, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { clavePresetsDemandas, leerPresetsDemandas, MAX_PRESETS_DEMANDAS, mismosFiltrosDemandas, type FiltrosDemandas, type PresetDemandas } from "@/lib/presets-demandas"

export function PresetsFiltrosDemandas({ usuarioId, filtros, onAplicar }: {
  usuarioId: string | null
  filtros: FiltrosDemandas
  onAplicar: (filtros: FiltrosDemandas) => void
}) {
  const t = useT()
  const [guardados, setGuardados] = useState<{ usuarioId: string | null; presets: PresetDemandas[] }>({ usuarioId: null, presets: [] })
  const [seleccionadoId, setSeleccionadoId] = useState("")
  const [modo, setModo] = useState<"guardar" | "renombrar" | null>(null)
  const [nombre, setNombre] = useState("")
  const [error, setError] = useState("")
  const [almacenamientoDisponible, setAlmacenamientoDisponible] = useState(true)
  const presets = guardados.usuarioId === usuarioId ? guardados.presets : []
  const seleccionado = presets.find((preset) => preset.id === seleccionadoId)
  const modificado = !!seleccionado && !mismosFiltrosDemandas(seleccionado.filtros, filtros)

  useEffect(() => {
    setSeleccionadoId("")
    setModo(null)
    if (!usuarioId) {
      setGuardados({ usuarioId: null, presets: [] })
      return
    }
    const key = clavePresetsDemandas(usuarioId)
    const cargar = () => {
      try {
        setGuardados({ usuarioId, presets: leerPresetsDemandas(localStorage.getItem(key)) })
        setAlmacenamientoDisponible(true)
      } catch {
        setGuardados({ usuarioId, presets: [] })
        setAlmacenamientoDisponible(false)
      }
    }
    cargar()
    const sincronizar = (event: StorageEvent) => { if (event.key === key || event.key === null) cargar() }
    window.addEventListener("storage", sincronizar)
    return () => window.removeEventListener("storage", sincronizar)
  }, [usuarioId])

  const persistir = (actualizar: (actuales: PresetDemandas[]) => PresetDemandas[]) => {
    if (!usuarioId || guardados.usuarioId !== usuarioId) return false
    try {
      // Re-read before writes so another open tab's saved searches are preserved.
      const key = clavePresetsDemandas(usuarioId)
      const siguientes = actualizar(leerPresetsDemandas(localStorage.getItem(key)))
      localStorage.setItem(key, JSON.stringify(siguientes))
      setGuardados({ usuarioId, presets: siguientes })
      return true
    } catch (error) {
      toast({ title: t("No se pudieron guardar los filtros"), description: error instanceof Error && error.message === "limite" ? t("Puedes guardar hasta {count} búsquedas.", { count: MAX_PRESETS_DEMANDAS }) : t("Comprueba que el navegador permita guardar datos en este dispositivo."), variant: "destructive" })
      return false
    }
  }

  const guardar = () => {
    const limpio = nombre.trim()
    if (!limpio) { setError(t("Escribe un nombre para estos filtros.")); return }
    if (presets.some((preset) => preset.id !== (modo === "renombrar" ? seleccionadoId : null) && preset.nombre.toLocaleLowerCase() === limpio.toLocaleLowerCase())) {
      setError(t("Ya tienes unos filtros guardados con este nombre."))
      return
    }
    const id = modo === "renombrar" ? seleccionadoId : crypto.randomUUID()
    const correcto = persistir((actuales) => {
      if (modo === "renombrar") return actuales.map((preset) => preset.id === id ? { ...preset, nombre: limpio } : preset)
      if (actuales.length >= MAX_PRESETS_DEMANDAS) throw new Error("limite")
      return [...actuales, { id, nombre: limpio, filtros: { ...filtros, presupuesto: [...filtros.presupuesto] } }]
    })
    if (!correcto) return
    setSeleccionadoId(id)
    setModo(null)
    toast({ title: t(modo === "renombrar" ? "Nombre actualizado" : "Filtros guardados") })
  }

  if (!usuarioId) return null

  return (
    <div className="rounded-xl border border-border/70 bg-card/50 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Bookmark className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <Select value={seleccionado?.id || ""} onValueChange={(id) => {
          const preset = presets.find((item) => item.id === id)
          if (!preset) return
          setSeleccionadoId(id)
          onAplicar({ ...preset.filtros, presupuesto: [...preset.filtros.presupuesto] })
        }} disabled={!presets.length}>
          <SelectTrigger aria-label={t("Filtros guardados")} className="min-w-0 flex-1 basis-40 bg-background">
            <SelectValue placeholder={t("Filtros guardados")} />
          </SelectTrigger>
          <SelectContent>{presets.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.nombre}</SelectItem>)}</SelectContent>
        </Select>
        {seleccionado && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={t("Gestionar filtros guardados")}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => {
                onAplicar({ ...seleccionado.filtros, presupuesto: [...seleccionado.filtros.presupuesto] })
              }}><RefreshCw />{t("Volver a aplicar")}</DropdownMenuItem>
              <DropdownMenuItem disabled={!modificado} onSelect={() => {
                if (persistir((actuales) => actuales.map((preset) => preset.id === seleccionado.id ? { ...preset, filtros: { ...filtros, presupuesto: [...filtros.presupuesto] } } : preset))) toast({ title: t("Filtros actualizados") })
              }}><Bookmark />{t("Actualizar con los filtros actuales")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setNombre(seleccionado.nombre); setError(""); setModo("renombrar") }}><Pencil />{t("Cambiar nombre")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => {
                if (persistir((actuales) => actuales.filter((preset) => preset.id !== seleccionado.id))) {
                  setSeleccionadoId("")
                  toast({ title: t("Filtros eliminados") })
                }
              }}><Trash2 />{t("Eliminar filtros guardados")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button variant="outline" size="sm" className="h-9" disabled={!almacenamientoDisponible || guardados.usuarioId !== usuarioId} onClick={() => { setNombre(""); setError(""); setModo("guardar") }}>
          <Bookmark className="h-4 w-4 mr-1.5" />{t("Guardar filtros")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {!almacenamientoDisponible ? t("Este navegador no permite guardar tus filtros.") : modificado ? t("Has cambiado los filtros. La búsqueda guardada conserva su configuración anterior.") : t("Tus búsquedas se guardan para tu cuenta en este dispositivo.")}
      </p>
      <Dialog open={modo !== null} onOpenChange={(abierto) => { if (!abierto) setModo(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(modo === "renombrar" ? "Cambiar nombre" : "Guardar filtros")}</DialogTitle>
            <DialogDescription>{t("Guarda la categoría, ubicación, presupuesto, plazo, búsqueda y orden actuales para aplicarlos con un clic.")}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); guardar() }}>
            <div className="space-y-2">
              <Label htmlFor="nombre-preset-demandas">{t("Nombre de la búsqueda")}</Label>
              <Input id="nombre-preset-demandas" value={nombre} onChange={(event) => { setNombre(event.target.value); setError("") }} maxLength={60} placeholder={t("Por ejemplo: Reformas en Madrid")} aria-invalid={!!error} aria-describedby={error ? "error-preset-demandas" : undefined} autoFocus />
              {error && <p id="error-preset-demandas" className="text-sm text-destructive" role="alert">{error}</p>}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setModo(null)}>{t("Cancelar")}</Button><Button type="submit">{t("Guardar")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
