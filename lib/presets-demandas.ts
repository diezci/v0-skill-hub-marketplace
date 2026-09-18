import { PRECIO_MAX } from "./precios"

export type FiltrosDemandas = {
  categoria: string
  ubicacion: string
  tiempo: string
  presupuesto: [number, number]
  busqueda: string
  orden: "recientes" | "antiguos" | "presupuesto-alto" | "presupuesto-bajo" | "menos-ofertas"
}

export type PresetDemandas = { id: string; nombre: string; filtros: FiltrosDemandas }

export const MAX_PRESETS_DEMANDAS = 20

// Account IDs keep shared browsers from mixing one person's saved searches with another's.
export function clavePresetsDemandas(usuarioId: string) {
  return `diime:demandas:presets:v1:${usuarioId}`
}

export function mismosFiltrosDemandas(a: FiltrosDemandas, b: FiltrosDemandas) {
  return a.categoria === b.categoria && a.ubicacion === b.ubicacion && a.tiempo === b.tiempo
    && a.presupuesto[0] === b.presupuesto[0] && a.presupuesto[1] === b.presupuesto[1]
    && a.busqueda === b.busqueda && a.orden === b.orden
}

export function leerPresetsDemandas(texto: string | null): PresetDemandas[] {
  if (!texto) return []
  try {
    const valor: unknown = JSON.parse(texto)
    if (!Array.isArray(valor)) return []
    const ids = new Set<string>()
    return valor.filter((preset): preset is PresetDemandas => {
      if (!preset || typeof preset !== "object" || typeof preset.id !== "string" || !preset.id || ids.has(preset.id)) return false
      if (typeof preset.nombre !== "string" || !preset.nombre.trim() || preset.nombre.length > 60) return false
      const f = preset.filtros
      if (!f || typeof f !== "object") return false
      if (typeof f.categoria !== "string" || !f.categoria || f.categoria.length > 150) return false
      if (typeof f.ubicacion !== "string" || !f.ubicacion || f.ubicacion.length > 100) return false
      if (typeof f.busqueda !== "string" || f.busqueda.length > 500) return false
      if (!["todos", "hoy", "semana", "mes"].includes(f.tiempo)) return false
      if (!["recientes", "antiguos", "presupuesto-alto", "presupuesto-bajo", "menos-ofertas"].includes(f.orden)) return false
      if (!Array.isArray(f.presupuesto) || f.presupuesto.length !== 2) return false
      if (!f.presupuesto.every((n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= PRECIO_MAX)) return false
      if (f.presupuesto[0] > f.presupuesto[1]) return false
      ids.add(preset.id)
      return true
    }).slice(0, MAX_PRESETS_DEMANDAS)
  } catch {
    return []
  }
}
