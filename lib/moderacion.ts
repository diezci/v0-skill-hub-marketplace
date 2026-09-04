// Moderacion preventiva y determinista para contenido generado por usuarios.
//
// Las reglas buscan combinaciones de intencion + objeto, no palabras aisladas.
// Asi, por ejemplo, "bomba de calor", "pistola de pintura" o "retirada de
// amianto" siguen siendo solicitudes validas. La misma politica se replica en
// una migracion/trigger de Postgres para que no pueda eludirse escribiendo
// directamente contra la API de Supabase.

export type CodigoModeracionSolicitud =
  | "drogas_ilegales"
  | "violencia_contra_personas"
  | "explotacion_sexual"
  | "contenido_sexual_explicito"
  | "armas_y_explosivos"
  | "fraude_y_falsificacion"
  | "intrusion_informatica"
  | "vigilancia_sin_consentimiento"
  | "residuos_ilegales"
  | "maltrato_animal"
  | "robo_y_bienes_robados"

export interface ReglaModeracionSolicitud {
  codigo: CodigoModeracionSolicitud
  descripcionInterna: string
  motivoUsuario: string
  patrones: readonly RegExp[]
  // Solo se usan para contextos legitimamente preventivos o regulados. No son
  // una lista generica de palabras magicas que permita saltarse el filtro.
  excepciones?: readonly RegExp[]
}

export type ResultadoModeracion =
  | { permitido: true }
  | {
      permitido: false
      codigo: CodigoModeracionSolicitud
      motivo: string
      error: string
    }

const ACCIONES_DROGAS =
  /\b(?:comprar|compra|vender|venta|distribuir|distribucion|transportar|transporte|fabricar|fabricacion|traficar|conseguir|entregar|buy|sell|distribute|transport|manufacture|traffic|deliver)\b/
const DROGAS_ILEGALES =
  /\b(?:cocaina|heroina|metanfetamina|fentanilo|farlopa|drogas?\s+ilegales?|cocaine|heroin|methamphetamine|fentanyl|illegal\s+drugs?)\b/

const ACCIONES_ARMAS =
  /\b(?:comprar|vender|conseguir|fabricar|montar|modificar|transportar|buy|sell|get|make|build|modify|transport)\b/
const ARMAS_ILEGALES =
  /\b(?:bomba\s+(?:casera|explosiva|molotov|con\s+detonador)|homemade\s+bomb|molotov\s+cocktail|weapons?\s+(?:without\s+(?:a\s+)?licen[cs]e|with\s+(?:the\s+)?serial\s+number\s+(?:removed|erased))|armas?\s+(?:sin\s+licencia|sin\s+papeles|con\s+el\s+numero\s+(?:de\s+serie\s+)?borrado))\b/

const DOCUMENTO_SENSIBLE =
  /\b(?:dni|nie|pasaporte|permiso\s+de\s+conducir|titulo\s+academico|certificado|receta\s+medica|factura|nomina|boletin\s+(?:electrico|de\s+gas)|itv|passport|driving\s+licen[cs]e|academic\s+degree|certificate|medical\s+prescription|invoice|payslip)\b/
const CALIFICADOR_FALSO =
  /\b(?:fals[oa]s?|fraudulent[oa]s?|inventad[oa]s?|sin\s+(?:inspeccion|pasar)|fake|forged|fraudulent|without\s+inspection)\b/
const INTENCION_DOCUMENTO_FALSO =
  /\b(?:fabricar|crear|conseguir|necesitar|buscar|comprar|encargar|hacer|obtener|make|create|need|find|buy|get|order)\b/

// Configuracion unica de la capa TypeScript. Se exporta para que los cambios de
// politica sean revisables y para poder probar cada regla sin servicios
// externos. La tabla `moderacion_reglas_solicitudes` permite activar, ordenar o
// ajustar la barrera equivalente de base de datos sin cambiar el esquema.
export const REGLAS_MODERACION_SOLICITUDES: readonly ReglaModeracionSolicitud[] = [
  {
    codigo: "drogas_ilegales",
    descripcionInterna: "Compraventa, fabricacion o transporte de drogas inequivocamente ilegales.",
    motivoUsuario:
      "la solicitud parece pedir la compra, venta, fabricación o transporte de drogas ilegales",
    patrones: [
      new RegExp(`${ACCIONES_DROGAS.source}.{0,60}${DROGAS_ILEGALES.source}`),
      new RegExp(`${DROGAS_ILEGALES.source}.{0,60}${ACCIONES_DROGAS.source}`),
    ],
  },
  {
    codigo: "violencia_contra_personas",
    descripcionInterna: "Contratacion o encargo explicito de agresiones, secuestro o asesinato.",
    motivoUsuario: "la solicitud parece encargar violencia, amenazas o daño contra una persona",
    patrones: [
      /\b(?:contratar|buscar|necesitar|pagar)\b.{0,45}\b(?:sicario|maton)\b/,
      /\b(?:matar|asesinar|agredir|secuestrar|torturar)\b.{0,45}\b(?:a\s+)?(?:una?\s+persona|alguien|mi\s+(?:pareja|expareja|vecino|vecina|jefe|jefa))\b/,
    ],
  },
  {
    codigo: "explotacion_sexual",
    descripcionInterna: "Explotacion sexual y contenido sexual de menores.",
    motivoUsuario: "la solicitud parece implicar explotación sexual o contenido sexual de menores",
    patrones: [
      /\b(?:crear|grabar|fotografiar|comprar|vender|distribuir|compartir|conseguir)\b.{0,60}\b(?:pornografia\s+infantil|contenido\s+sexual\s+(?:de|con)\s+menores?|imagenes?\s+sexuales?\s+de\s+menores?)\b/,
      /\b(?:explotar|prostituir|captar)\b.{0,45}\b(?:menores?|ninos?|ninas?|persona\s+contra\s+su\s+voluntad)\b/,
    ],
  },
  {
    codigo: "contenido_sexual_explicito",
    descripcionInterna: "Servicios o produccion sexual explicita prohibidos por las Normas de la comunidad.",
    motivoUsuario: "la solicitud parece ofrecer o pedir servicios o contenido sexual explícito",
    patrones: [
      /\b(?:contratar|buscar|necesitar|ofrecer|grabar|fotografiar|crear|producir)\b.{0,55}\b(?:pornografia|servicios?\s+sexuales?|prostitucion|sexo\s+explicito)\b/,
      /\b(?:pornografia|servicios?\s+sexuales?|prostitucion|sexo\s+explicito)\b.{0,55}\b(?:contratar|buscar|necesitar|ofrecer|grabar|fotografiar|crear|producir)\b/,
    ],
  },
  {
    codigo: "armas_y_explosivos",
    descripcionInterna: "Fabricacion de explosivos o comercio de armas expresamente irregulares.",
    motivoUsuario: "la solicitud parece pedir armas ilegales o la fabricación de explosivos",
    patrones: [
      new RegExp(`${ACCIONES_ARMAS.source}.{0,60}${ARMAS_ILEGALES.source}`),
      new RegExp(`${ARMAS_ILEGALES.source}.{0,60}${ACCIONES_ARMAS.source}`),
      /\b(?:fabricar|montar)\b.{0,45}\bexplosivos?\b/,
      /\b(?:borrar|eliminar|alterar)\b.{0,35}\bnumero\s+(?:de\s+serie\s+)?(?:de\s+)?(?:(?:un|una)\s+)?arma\b/,
    ],
  },
  {
    codigo: "fraude_y_falsificacion",
    descripcionInterna: "Falsificacion documental, fraude de pagos o blanqueo.",
    motivoUsuario: "la solicitud parece pedir falsificación documental o fraude económico",
    patrones: [
      new RegExp(`\\b(?:falsificar|falsear)\\b.{0,55}${DOCUMENTO_SENSIBLE.source}`),
      new RegExp(`${INTENCION_DOCUMENTO_FALSO.source}.{0,55}${DOCUMENTO_SENSIBLE.source}.{0,30}${CALIFICADOR_FALSO.source}`),
      new RegExp(`${INTENCION_DOCUMENTO_FALSO.source}.{0,55}${CALIFICADOR_FALSO.source}.{0,30}${DOCUMENTO_SENSIBLE.source}`),
      /\bitv\b.{0,30}\b(?:sin\s+inspeccion|sin\s+pasar)\b/,
      /\b(?:blanquear|lavar)\s+dinero\b/,
      /\b(?:cobrar|pagar|comprar)\b.{0,40}\b(?:tarjetas?\s+robadas?|cuentas?\s+bancarias?\s+ajenas?)\b/,
    ],
  },
  {
    codigo: "intrusion_informatica",
    descripcionInterna: "Acceso no autorizado, robo de credenciales, malware o denegacion de servicio.",
    motivoUsuario: "la solicitud parece pedir acceso informático no autorizado o software malicioso",
    patrones: [
      /\b(?:hackear|piratear|acceder|entrar)\b.{0,55}\b(?:cuenta|correo|email|whatsapp|instagram|movil|ordenador|wifi|red)\b.{0,45}\b(?:ajen[oa]|sin\s+(?:permiso|autorizacion)|sin\s+que\s+se\s+entere)\b/,
      /\b(?:robar|capturar|conseguir)\b.{0,35}\b(?:contrasenas?|credenciales|claves\s+de\s+acceso)\b/,
      /\b(?:crear|instalar|distribuir|programar)\b.{0,35}\b(?:ransomware|malware|troyano|keylogger)\b/,
      /\b(?:hacer|lanzar|contratar)\b.{0,35}\b(?:ataque\s+)?ddos\b/,
    ],
  },
  {
    codigo: "vigilancia_sin_consentimiento",
    descripcionInterna: "Vigilancia clandestina o software espia contra otra persona.",
    motivoUsuario: "la solicitud parece pedir vigilancia o espionaje sin consentimiento",
    patrones: [
      /\b(?:instalar|ocultar|colocar)\b.{0,40}\b(?:camara|microfono|gps|spyware|keylogger)\b.{0,55}\b(?:sin\s+(?:permiso|consentimiento)|sin\s+que\s+se\s+entere|para\s+espiar)\b/,
      /\b(?:espiar|vigilar|rastrear)\b.{0,40}\b(?:a\s+)?(?:mi\s+)?(?:pareja|expareja|empleado|empleada|vecino|vecina|otra\s+persona)\b.{0,40}\b(?:sin\s+(?:permiso|consentimiento)|sin\s+que\s+se\s+entere)\b/,
    ],
  },
  {
    codigo: "residuos_ilegales",
    descripcionInterna: "Vertido o abandono deliberadamente irregular de residuos peligrosos.",
    motivoUsuario: "la solicitud parece pedir el vertido ilegal de residuos o materiales peligrosos",
    patrones: [
      /\b(?:tirar|verter|abandonar|ocultar)\b.{0,45}\b(?:amianto|asbesto|residuos?\s+toxicos?|escombros|aceite\s+industrial)\b.{0,45}\b(?:sin\s+(?:permiso|gestor\s+autorizado)|ilegalmente|donde\s+nadie\s+lo\s+vea)\b/,
      /\b(?:sin\s+(?:permiso|gestor\s+autorizado)|ilegalmente)\b.{0,45}\b(?:tirar|verter|abandonar)\b.{0,45}\b(?:amianto|asbesto|residuos?\s+toxicos?|escombros|aceite\s+industrial)\b/,
    ],
  },
  {
    codigo: "maltrato_animal",
    descripcionInterna: "Encargo explicito de dano a mascotas o animales de compania.",
    motivoUsuario: "la solicitud parece encargar maltrato o daño deliberado a un animal",
    patrones: [
      /\b(?:matar|envenenar|torturar|herir)\b.{0,40}\b(?:perro|perra|gato|gata|mascota|animal\s+de\s+compania)\b/,
      /\b(?:perro|perra|gato|gata|mascota|animal\s+de\s+compania)\b.{0,40}\b(?:matar|envenenar|torturar|herir)\b/,
    ],
  },
  {
    codigo: "robo_y_bienes_robados",
    descripcionInterna: "Encargo de robo o manipulacion de bienes identificados como robados.",
    motivoUsuario: "la solicitud parece pedir un robo o la manipulación de bienes robados",
    patrones: [
      /\b(?:robar|sustraer)\b.{0,45}\b(?:coche|moto|vehiculo|movil|ordenador|paquete|dinero|joyas?)\b/,
      /\b(?:vender|ocultar|desmontar|transportar|cambiar\s+el\s+imei)\b.{0,45}\b(?:coche|moto|vehiculo|movil|ordenador|joyas?)\s+robad[oa]s?\b/,
    ],
  },
] as const

const SUSTITUCIONES_LEET: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
}

export function normalizarTextoModeracion(valor: string): string {
  const normalizado = valor
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es-ES")
    .replace(/[013457@$]/g, (caracter) => SUSTITUCIONES_LEET[caracter] ?? caracter)
    // Tres o mas letras repetidas son una evasion habitual ("drooogas"). Se
    // conservan las dobles legitimas de palabras como "acceder".
    .replace(/([a-z])\1{2,}/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // Une un termino escrito letra a letra ("c o c a i n a"), sin tocar frases
  // normales: se exigen al menos tres separaciones entre letras sueltas.
  return normalizado.replace(/\b(?:[a-z]\s+){3,}[a-z]\b/g, (fragmento) => fragmento.replace(/\s+/g, ""))
}

function coincide(regla: ReglaModeracionSolicitud, contenido: string): boolean {
  if (!regla.patrones.some((patron) => patron.test(contenido))) return false
  return !regla.excepciones?.some((excepcion) => excepcion.test(contenido))
}

export function evaluarContenidoSolicitud(valores: {
  titulo?: unknown
  descripcion?: unknown
  categoria?: unknown
  ubicacion?: unknown
}): ResultadoModeracion {
  const contenido = normalizarTextoModeracion(
    [valores.titulo, valores.descripcion, valores.categoria, valores.ubicacion]
      .filter((valor): valor is string => typeof valor === "string")
      .join(" \n "),
  )

  if (!contenido) return { permitido: true }

  const regla = REGLAS_MODERACION_SOLICITUDES.find((candidata) => coincide(candidata, contenido))
  if (!regla) return { permitido: true }

  const motivo = regla.motivoUsuario
  return {
    permitido: false,
    codigo: regla.codigo,
    motivo,
    error: `No se puede publicar: ${motivo}. Si se trata de un servicio legítimo, explica claramente su finalidad y las autorizaciones aplicables.`,
  }
}

export function errorSolicitudNoPublicable(valores: Parameters<typeof evaluarContenidoSolicitud>[0]) {
  const resultado = evaluarContenidoSolicitud(valores)
  if (resultado.permitido) return null
  return resultado.error
}

// Compatibilidad con mensajes, ofertas, resenas y perfiles: esas superficies ya
// llaman a esta funcion. Las solicitudes usan la variante estructurada anterior
// para incluir tambien categoria y ubicacion, y devolver un codigo auditable.
export function errorContenidoProhibido(...valores: Array<string | null | undefined>) {
  const contenidoOriginal = valores.filter(Boolean).join(" \n ")
  const errorEspecifico = errorSolicitudNoPublicable({ titulo: contenidoOriginal })
  if (errorEspecifico) return errorEspecifico

  // Conserva las barreras historicas de las otras superficies (amenazas y
  // contenido sexual explicito aun sin forma de encargo). Las demandas pasan
  // por las reglas contextuales anteriores para evitar falsos positivos.
  const contenido = normalizarTextoModeracion(contenidoOriginal)
  if (
    /\b(?:pornografia|servicios?\s+sexuales?|prostitucion|sexo\s+explicito|material\s+sexual\s+de\s+menores|explotacion\s+infantil)\b/.test(
      contenido,
    ) ||
    /\b(?:te\s+voy\s+a\s+matar|amenaza\s+de\s+muerte|exterminar\s+a)\b/.test(contenido)
  ) {
    return "El contenido incluye términos no permitidos por las Normas de la comunidad. Revísalo antes de publicarlo."
  }
  return null
}
