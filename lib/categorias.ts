// Taxonomía de servicios — fuente única de verdad para TODA la web (formulario
// de demanda, homepage, /demandas, /profesionales, wizard). Cualquier
// desplegable o filtro de categorías debe derivar de aquí.
//
// Estructura: 7 categorías principales. "Reformas y Construcción" es el pilar
// central y agrupa sus 24 subcategorías en 6 bloques intermedios (A-F); el
// resto queda a 2 niveles (categoría → subcategoría). La unidad SELECCIONABLE
// (lo que guarda una demanda y por lo que se filtra) es siempre la
// subcategoría; categorías y bloques son agrupación y navegación.

export interface SubcategoriaServicio {
  nombre: string
  // Tipos de trabajo que cubre; se usa como descripción en la tabla categorias.
  detalle?: string
}

export interface BloqueSubcategorias {
  // Nombre del bloque intermedio ("" = la categoría no agrupa en bloques)
  nombre: string
  subcategorias: SubcategoriaServicio[]
}

export interface CategoriaPrincipal {
  nombre: string
  bloques: BloqueSubcategorias[]
}

export const TAXONOMIA_SERVICIOS: CategoriaPrincipal[] = [
  {
    nombre: "Reformas y Construcción",
    bloques: [
      {
        nombre: "Estructura y obra civil",
        subcategorias: [
          { nombre: "Reformas integrales", detalle: "vivienda completa, reforma parcial, locales y oficinas" },
          { nombre: "Albañilería", detalle: "tabiquería, muros, enlucidos, obra menor" },
          { nombre: "Demoliciones y desescombro", detalle: "retirada de escombros, contenedores, vaciados" },
          { nombre: "Fachadas", detalle: "rehabilitación, SATE, revestimientos" },
          { nombre: "Tejados y cubiertas", detalle: "reparación, canalones, tejas" },
        ],
      },
      {
        nombre: "Instalaciones técnicas",
        subcategorias: [
          { nombre: "Fontanería", detalle: "instalación, averías y fugas, calentadores/termos, saneamiento" },
          { nombre: "Electricidad", detalle: "instalaciones, boletines, cuadros eléctricos, iluminación" },
          { nombre: "Climatización", detalle: "aire acondicionado, calefacción, calderas, suelo radiante" },
          { nombre: "Instalación de gas", detalle: "calderas, butano/propano, boletines de gas" },
          {
            nombre: "Domótica e instalaciones inteligentes",
            detalle: "automatización del hogar, seguridad integrada",
          },
        ],
      },
      {
        nombre: "Acabados e interiorismo",
        subcategorias: [
          { nombre: "Pintura y decoración", detalle: "interior, exterior, papel pintado, estucos, microcemento" },
          { nombre: "Carpintería", detalle: "madera a medida, puertas, armarios empotrados, PVC, aluminio" },
          { nombre: "Solados y alicatados", detalle: "suelos (parquet, tarima, gres, mármol), azulejos" },
          { nombre: "Techos y falsos techos", detalle: "pladur, escayola, techos técnicos" },
          { nombre: "Ventanas y cerramientos", detalle: "PVC, aluminio, climalit, persianas, mosquiteras" },
          { nombre: "Vidrio y cristalería a medida", detalle: "mamparas, espejos, vidrio de seguridad" },
          { nombre: "Cocinas", detalle: "diseño, montaje, encimeras, electrodomésticos integrados" },
          { nombre: "Baños", detalle: "diseño, platos de ducha, mamparas, sanitarios y grifería" },
        ],
      },
      {
        nombre: "Aislamiento, eficiencia y patologías",
        subcategorias: [
          {
            nombre: "Aislamiento e impermeabilización",
            detalle: "térmico, acústico, cubiertas, terrazas, humedades",
          },
          { nombre: "Energía y eficiencia", detalle: "placas solares, aerotermia, mejora de calificación energética" },
          { nombre: "Detección de fugas y humedades", detalle: "cámara termográfica, diagnóstico previo" },
          { nombre: "Tratamiento de madera", detalle: "carcoma, termitas" },
        ],
      },
      {
        nombre: "Seguridad y accesibilidad",
        subcategorias: [
          { nombre: "Cerrajería", detalle: "cerraduras, puertas blindadas/acorazadas, rejas y vallado" },
          { nombre: "Accesibilidad", detalle: "ascensores, salvaescaleras, rampas" },
        ],
      },
      {
        nombre: "Proyecto y gestión",
        subcategorias: [
          { nombre: "Arquitectura e interiorismo", detalle: "proyectos, planos, dirección de obra, render 3D" },
          {
            nombre: "Certificados y gestión de obra",
            detalle: "certificado energético, licencia de obra, ITE, cédula de habitabilidad",
          },
        ],
      },
    ],
  },
  {
    nombre: "Hogar y mantenimiento",
    bloques: [
      {
        nombre: "",
        subcategorias: [
          { nombre: "Limpieza", detalle: "hogar, oficinas, fin de obra, cristales, tapicerías" },
          { nombre: "Montaje de muebles" },
          { nombre: "Restauración y tapicería de muebles" },
          { nombre: '"Manitas" / pequeñas reparaciones' },
          { nombre: "Control de plagas" },
          { nombre: "Mudanzas, portes y guardamuebles" },
        ],
      },
    ],
  },
  {
    nombre: "Exteriores y jardín",
    bloques: [
      {
        nombre: "",
        subcategorias: [
          { nombre: "Jardinería y poda" },
          { nombre: "Diseño de jardines y paisajismo" },
          { nombre: "Riego automático" },
          { nombre: "Piscinas", detalle: "construcción, reforma y mantenimiento" },
          { nombre: "Toldos, pérgolas y protección solar" },
          { nombre: "Vallados y cerramientos exteriores" },
        ],
      },
    ],
  },
  {
    nombre: "Automoción",
    bloques: [
      {
        nombre: "",
        subcategorias: [
          { nombre: "Mecánica general" },
          { nombre: "Chapa y pintura" },
          { nombre: "Neumáticos" },
          { nombre: "Lavado y detailing" },
          { nombre: "Asistencia en carretera" },
        ],
      },
    ],
  },
  {
    nombre: "Tecnología y electrónica",
    bloques: [
      {
        nombre: "",
        subcategorias: [
          { nombre: "Reparación de móviles y ordenadores" },
          { nombre: "Reparación de electrodomésticos" },
          { nombre: "Instalación de TV, antenas y fibra" },
          { nombre: "Soporte informático a domicilio" },
          { nombre: "Alarmas y videovigilancia" },
        ],
      },
    ],
  },
  {
    nombre: "Eventos",
    bloques: [
      {
        nombre: "",
        subcategorias: [
          { nombre: "Catering" },
          { nombre: "Fotografía y vídeo" },
          { nombre: "Música y DJ" },
          { nombre: "Decoración de eventos" },
          { nombre: "Animación infantil" },
        ],
      },
    ],
  },
  {
    nombre: "Moda y textil",
    bloques: [
      {
        nombre: "",
        subcategorias: [{ nombre: "Arreglos de ropa y costura" }, { nombre: "Modistas a medida" }],
      },
    ],
  },
  {
    // Cajón de sastre para lo que no encaje en las categorías anteriores.
    nombre: "Otros",
    bloques: [
      {
        nombre: "",
        subcategorias: [{ nombre: "Otros", detalle: "servicios no incluidos en las demás categorías" }],
      },
    ],
  },
]

// Grupos planos para desplegables y filtros: los bloques de Reformas salen
// etiquetados "Reformas y Construcción · <bloque>", el resto con el nombre de
// su categoría. 12 grupos en total.
export interface GrupoCategorias {
  grupo: string
  subcategorias: SubcategoriaServicio[]
}

export const GRUPOS_CATEGORIAS: GrupoCategorias[] = TAXONOMIA_SERVICIOS.flatMap((cat) =>
  cat.bloques.map((bloque) => ({
    grupo: bloque.nombre ? `${cat.nombre} · ${bloque.nombre}` : cat.nombre,
    subcategorias: bloque.subcategorias,
  })),
)

// Lista plana de subcategorías (la unidad seleccionable). Mantiene el nombre
// del export histórico para no romper a los consumidores existentes.
export const CATEGORIAS_SERVICIO_NOMBRES: string[] = GRUPOS_CATEGORIAS.flatMap((g) =>
  g.subcategorias.map((s) => s.nombre),
)

export type CategoriaServicio = string

function slugify(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quitar acentos (marcas diacríticas tras NFD)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// Pares {id, label} derivados, para selects/checkboxes (p. ej. /profesionales).
export const CATEGORIAS_SERVICIO = CATEGORIAS_SERVICIO_NOMBRES.map((nombre) => ({
  id: slugify(nombre),
  label: nombre,
}))

// Grupos en formato {id, label} para filtros con checkboxes agrupados.
export const GRUPOS_CATEGORIAS_IDS = GRUPOS_CATEGORIAS.map((g) => ({
  grupo: g.grupo,
  categorias: g.subcategorias.map((s) => ({ id: slugify(s.nombre), label: s.nombre })),
}))

// Categoría principal a la que pertenece una subcategoría (por nombre).
export function categoriaPrincipalDe(subcategoria: string): string | null {
  for (const cat of TAXONOMIA_SERVICIOS) {
    for (const bloque of cat.bloques) {
      if (bloque.subcategorias.some((s) => s.nombre === subcategoria)) return cat.nombre
    }
  }
  return null
}
