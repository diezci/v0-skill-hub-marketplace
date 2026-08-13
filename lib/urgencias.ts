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
