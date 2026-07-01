// Categorías de "Tipo de Servicio" — fuente única de verdad. El formulario
// rápido del homepage es el origen; /profesionales debe usar exactamente las
// mismas categorías para que un profesional filtrado ahí sea el mismo tipo de
// profesional que puede recibir esa demanda desde el homepage.
export const CATEGORIAS_SERVICIO_NOMBRES = [
  "Arquitecto",
  "Diseñador de Interiores",
  "Contratista",
  "Albañil",
  "Carpintero",
  "Fontanero",
  "Electricista",
  "Pintor",
  "Yesero/Pladurista",
  "Instalador de Suelos",
  "Climatización",
  "Cerrajero",
  "Marmolista",
  "Instalador de Ventanas",
  "Ebanista",
  "Tapicero",
  "Jardinero",
  "Domótica",
  "Impermeabilizaciones",
] as const

export type CategoriaServicio = (typeof CATEGORIAS_SERVICIO_NOMBRES)[number]

function slugify(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quitar acentos (marcas diacríticas tras NFD)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// Pares {id, label} derivados de la lista anterior, para selects/checkboxes
// (p. ej. los filtros de /profesionales).
export const CATEGORIAS_SERVICIO = CATEGORIAS_SERVICIO_NOMBRES.map((nombre) => ({
  id: slugify(nombre),
  label: nombre,
}))
