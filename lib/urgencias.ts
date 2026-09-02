// Niveles de urgencia de una demanda.
//
// Manda el vocabulario del formulario de publicar: el cliente elige "Esta
// semana", no "Alta". Los identificadores (urgente/alta/media/baja) son lo que
// guarda la base de datos —hay un CHECK sobre esos cuatro valores— y no se ven
// nunca en pantalla.
//
// Están aquí y no repartidos porque habían derivado en cuatro vocabularios para
// los mismos cuatro valores: el formulario decía "Este mes", el diálogo de
// editar decía "Media", el listado de demandas ponía "Media" y Mis Pujas
// enseñaba el identificador en crudo. El cliente publicaba una cosa y luego se
// la encontraba escrita de otra.

export type UrgenciaId = "urgente" | "alta" | "media" | "baja"

// Valor exclusivo de los formularios. No se guarda en `urgencia` porque esa
// columna solo admite los cuatro identificadores anteriores; la fecha se guarda
// en `fecha_necesaria` y de ella se deriva un nivel compatible.
export const OPCION_FECHA_EXACTA = "fecha_exacta" as const

export function fechaHoyEnEspana(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha)
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? ""
  return `${valor("year")}-${valor("month")}-${valor("day")}`
}

export function esFechaISOValida(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false
  const [year, month, day] = fecha.split("-").map(Number)
  const comprobacion = new Date(Date.UTC(year, month - 1, day))
  return (
    comprobacion.getUTCFullYear() === year &&
    comprobacion.getUTCMonth() === month - 1 &&
    comprobacion.getUTCDate() === day
  )
}

export function urgenciaParaFecha(fecha: string, hoy = fechaHoyEnEspana()): UrgenciaId {
  const dias = Math.round(
    (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000,
  )
  if (dias <= 3) return "urgente"
  if (dias <= 7) return "alta"
  if (dias <= 31) return "media"
  return "baja"
}

export const URGENCIAS: {
  id: UrgenciaId
  /** Lo que se lee al elegir: dice el plazo, que es lo que importa. */
  etiqueta: string
  /** Para las chapitas de los listados, donde no cabe el paréntesis. */
  corta: string
  color: string
}[] = [
  {
    id: "urgente",
    etiqueta: "Urgente (1-3 días)",
    corta: "Urgente",
    color: "bg-red-500/10 text-red-500 border-red-500/20",
  },
  {
    id: "alta",
    etiqueta: "Esta semana",
    corta: "Esta semana",
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
  {
    id: "media",
    etiqueta: "Este mes",
    corta: "Este mes",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  {
    id: "baja",
    etiqueta: "Flexible",
    corta: "Flexible",
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
]

export const URGENCIA_POR_DEFECTO: UrgenciaId = "media"

/** Demandas antiguas o con un valor inesperado caen en "Este mes". */
export function urgencia(id: string | null | undefined) {
  return URGENCIAS.find((u) => u.id === id) ?? URGENCIAS.find((u) => u.id === URGENCIA_POR_DEFECTO)!
}
