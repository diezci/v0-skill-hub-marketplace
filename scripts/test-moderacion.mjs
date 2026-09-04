import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  errorContenidoProhibido,
  evaluarContenidoSolicitud,
  normalizarTextoModeracion,
  REGLAS_MODERACION_SOLICITUDES,
} from "../lib/moderacion.ts"

const bloqueadas = [
  ["Transportar cocaína", "Necesito llevar varios paquetes a otra ciudad", "drogas_ilegales"],
  ["Reparto internacional", "I need to transport cocaine between two cities", "drogas_ilegales"],
  ["Compra discreta", "Quiero comprar farlopa para una fiesta", "drogas_ilegales"],
  ["Entrega discreta", "Busco transportar c0ca1na sin hacer preguntas", "drogas_ilegales"],
  ["Paquetería", "Quiero vender c o c a i n a en otra provincia", "drogas_ilegales"],
  ["Oferta", "Cocaína disponible para vender esta semana", "drogas_ilegales"],
  [
    "Dos encargos",
    "Quiero transportar cocaína. También necesito un abogado para revisar un contrato laboral.",
    "drogas_ilegales",
  ],
  ["Trabajo privado", "Busco contratar un sicario para mi vecino", "violencia_contra_personas"],
  ["Agresión", "Quiero matar a alguien por encargo", "violencia_contra_personas"],
  [
    "Encargo y rodaje",
    "Busco contratar un sicario para mi vecino. Además preparo el atrezzo de un rodaje.",
    "violencia_contra_personas",
  ],
  ["Contenido", "Necesito distribuir contenido sexual de menores", "explotacion_sexual"],
  ["Captación", "Busco captar menores para prostituirlos", "explotacion_sexual"],
  ["Sesión privada", "Busco producir pornografía explícita", "contenido_sexual_explicito"],
  ["Oferta privada", "Servicios sexuales que quiero ofrecer", "contenido_sexual_explicito"],
  ["Montaje", "Busco fabricar una bomba casera con detonador", "armas_y_explosivos"],
  ["Private build", "I need to build a homemade bomb", "armas_y_explosivos"],
  ["Transporte", "Una bomba molotov que necesito transportar", "armas_y_explosivos"],
  ["Explosivos", "Quiero montar explosivos en un local", "armas_y_explosivos"],
  ["Armero", "Borrar el número de serie de un arma", "armas_y_explosivos"],
  ["Documentación", "Necesito falsificar un DNI", "fraude_y_falsificacion"],
  ["Pasaporte", "Quiero comprar un pasaporte falso", "fraude_y_falsificacion"],
  ["Inspección", "Quiero una ITV sin pasar la revisión", "fraude_y_falsificacion"],
  ["Documents", "I need to buy a fake passport", "fraude_y_falsificacion"],
  ["Efectivo", "Necesito lavar dinero de varios cobros", "fraude_y_falsificacion"],
  ["Cobros", "Quiero pagar usando tarjetas robadas", "fraude_y_falsificacion"],
  ["Acceso", "Hackear el correo ajeno de otra persona", "intrusion_informatica"],
  ["Claves", "Conseguir credenciales de acceso privadas", "intrusion_informatica"],
  ["Informática", "Programar un ransomware para una empresa", "intrusion_informatica"],
  ["Redes", "Quiero lanzar un ataque DDoS", "intrusion_informatica"],
  ["Instalación", "Ocultar una cámara para espiar sin consentimiento", "vigilancia_sin_consentimiento"],
  ["Seguimiento", "Rastrear a mi pareja sin consentimiento", "vigilancia_sin_consentimiento"],
  ["Desescombro", "Tirar amianto donde nadie lo vea y sin gestor autorizado", "residuos_ilegales"],
  ["Vertido", "Ilegalmente tirar aceite industrial en una parcela", "residuos_ilegales"],
  ["Encargo", "Necesito envenenar al perro de mi vecino", "maltrato_animal"],
  ["Mascota", "Un perro de compañía al que quiero matar", "maltrato_animal"],
  [
    "Dos servicios",
    "Necesito envenenar al perro de mi vecino. También busco un veterinario para otro animal.",
    "maltrato_animal",
  ],
  ["Transporte", "Busco robar una moto y llevarla a otra ciudad", "robo_y_bienes_robados"],
  ["Taller", "Cambiar el IMEI de un móvil robado", "robo_y_bienes_robados"],
  ["Despiece", "Desmontar una moto robada para vender sus piezas", "robo_y_bienes_robados"],
]

for (const [titulo, descripcion, codigo] of bloqueadas) {
  const resultado = evaluarContenidoSolicitud({ titulo, descripcion, categoria: "Otros", ubicacion: "Madrid" })
  assert.equal(resultado.permitido, false, `Debía bloquear: ${titulo} / ${descripcion}`)
  assert.equal(resultado.codigo, codigo, `Código inesperado para: ${titulo} / ${descripcion}`)
  assert.match(resultado.error ?? "", /^No se puede publicar:/)
}

const permitidas = [
  ["Limpieza de tapicería", "Quitar una mancha grande de Coca-Cola del sofá"],
  ["Climatización", "Instalar una bomba de calor eficiente en una vivienda"],
  ["Pintura", "Reparar una pistola de pintura que pierde presión"],
  ["Retirada de amianto", "Gestión legal con un gestor autorizado y certificado"],
  ["Control de plagas", "Eliminar cucarachas y revisar los puntos de entrada"],
  ["Ciberseguridad", "Auditoría y prueba de penetración autorizada de mi web"],
  ["Videovigilancia", "Instalar cámaras visibles con consentimiento de la comunidad"],
  ["Asistencia legal", "Abogada para denunciar un caso de tráfico de drogas"],
  ["Cerrajería", "Abrir la puerta de mi vivienda y cambiar la cerradura"],
  ["Atrezzo", "Construir una réplica de juguete inerte para un rodaje"],
  ["Demolición", "Transportar explosivos con licencia para una demolición autorizada"],
  ["Administración", "Verificar un boletín eléctrico falso aportado como prueba"],
  ["Peritaje", "Analizar una factura falsa aportada como prueba en un juicio"],
  ["Veterinario", "Tratamiento veterinario para evitar que mi perro sufra"],
  ["Recuperar vehículo", "Localizar mi moto robada para entregar datos a la policía"],
]

for (const [titulo, descripcion] of permitidas) {
  const resultado = evaluarContenidoSolicitud({ titulo, descripcion, categoria: "Otros", ubicacion: "Madrid" })
  assert.equal(resultado.permitido, true, `Falso positivo: ${titulo} / ${descripcion}`)
}

assert.equal(normalizarTextoModeracion("C0CAÍÍÍNA"), "cocaina")
assert.equal(normalizarTextoModeracion("c.o.c.a.i.n.a"), "cocaina")
assert.ok(errorContenidoProhibido("te voy a matar"), "Debe conservarse el bloqueo histórico de amenazas")
assert.ok(errorContenidoProhibido("contenido de pornografía"), "Debe conservarse el bloqueo sexual general")
assert.equal(errorContenidoProhibido("Reparación de una bomba de calor"), null)

const migracion = readFileSync(
  new URL("../supabase/migrations/047_moderacion_solicitudes.sql", import.meta.url),
  "utf8",
)

assert.match(
  migracion,
  /alter table public\.moderacion_reglas_solicitudes enable row level security;/i,
  "La tabla de reglas debe tener RLS activado",
)
assert.match(
  migracion,
  /revoke all on table public\.moderacion_reglas_solicitudes from anon, authenticated;/i,
  "Los usuarios de la API no deben poder alterar las reglas",
)
assert.match(
  migracion,
  /security definer[\s\S]*?from public\.moderacion_reglas_solicitudes/i,
  "El trigger debe poder leer la tabla cerrada de reglas",
)
assert.match(
  migracion,
  /before insert or update on public\.solicitudes/i,
  "La moderación debe ejecutarse también para escrituras directas por REST",
)

const traduccionSql = migracion.match(
  /pg_catalog\.translate\(\s*limpio,\s*'([^']+)',\s*'([^']+)'\s*\)/,
)
assert.ok(traduccionSql, "No se pudo interpretar la normalización SQL")
const [, origenTraduccionSql, destinoTraduccionSql] = traduccionSql
assert.equal(
  [...origenTraduccionSql].length,
  [...destinoTraduccionSql].length,
  "translate() eliminaría caracteres si sus alfabetos no tienen la misma longitud",
)

function normalizarComoSql(valor) {
  const traducciones = new Map(
    [...origenTraduccionSql].map((caracter, indice) => [caracter, [...destinoTraduccionSql][indice]]),
  )
  const limpio = [...valor.toLocaleLowerCase("es-ES")]
    .map((caracter) => traducciones.get(caracter) ?? caracter)
    .join("")
    .replace(/([a-z])\1{2,}/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const resultado = []
  let letras = []
  for (const token of limpio ? limpio.split(" ") : []) {
    if (token.length === 1) {
      letras.push(token)
      continue
    }
    if (letras.length > 0) resultado.push(letras.length >= 4 ? letras.join("") : letras.join(" "))
    letras = []
    resultado.push(token)
  }
  if (letras.length > 0) resultado.push(letras.length >= 4 ? letras.join("") : letras.join(" "))
  return resultado.join(" ")
}

for (const [titulo, descripcion] of [...bloqueadas, ...permitidas]) {
  const original = `${titulo} ${descripcion} Otros Madrid`
  assert.equal(
    normalizarComoSql(original),
    normalizarTextoModeracion(original),
    `Normalización TS/SQL desincronizada: ${titulo}`,
  )
}

const filasSql = new Map()
const patronFilaSql =
  /\(\s*'([a-z0-9_]+)',\s*(\d+),\s*'([^']*)',\s*\$re\$([\s\S]*?)\$re\$,\s*(?:\$re\$([\s\S]*?)\$re\$|null),\s*'([^']*)'\s*\)/g

for (const coincidencia of migracion.matchAll(patronFilaSql)) {
  const [, codigo, prioridad, descripcionInterna, patron, exclusion, motivoUsuario] = coincidencia
  const paraJavaScript = (expresion) => new RegExp(expresion.replaceAll("\\m", "\\b").replaceAll("\\M", "\\b"))
  filasSql.set(codigo, {
    prioridad: Number(prioridad),
    descripcionInterna,
    patron: paraJavaScript(patron),
    exclusion: exclusion ? paraJavaScript(exclusion) : null,
    motivoUsuario,
  })
}

assert.equal(
  filasSql.size,
  REGLAS_MODERACION_SOLICITUDES.length,
  "La migración y TypeScript deben declarar exactamente el mismo conjunto de reglas",
)
assert.deepEqual(
  [...filasSql.keys()].sort(),
  REGLAS_MODERACION_SOLICITUDES.map((regla) => regla.codigo).sort(),
  "Los códigos de reglas SQL y TypeScript no coinciden",
)

for (const regla of REGLAS_MODERACION_SOLICITUDES) {
  const reglaSql = filasSql.get(regla.codigo)
  assert.ok(reglaSql, `No se pudo interpretar la regla SQL ${regla.codigo}`)
  assert.equal(reglaSql.descripcionInterna, regla.descripcionInterna, `Descripción desincronizada: ${regla.codigo}`)
  assert.equal(
    reglaSql.motivoUsuario,
    `No se puede publicar: ${regla.motivoUsuario}.`,
    `Motivo desincronizado: ${regla.codigo}`,
  )
  assert.equal(
    Boolean(reglaSql.exclusion),
    Boolean(regla.excepciones?.length),
    `Exclusiones desincronizadas: ${regla.codigo}`,
  )
}

const prioridades = [...filasSql.values()].map((regla) => regla.prioridad)
assert.equal(new Set(prioridades).size, prioridades.length, "Las prioridades SQL deben ser únicas")

for (const [titulo, descripcion, codigo] of bloqueadas) {
  const reglaSql = filasSql.get(codigo)
  const contenido = normalizarComoSql(`${titulo} ${descripcion} Otros Madrid`)
  assert.equal(reglaSql.patron.test(contenido), true, `La regla SQL ${codigo} no bloquearía: ${contenido}`)
  assert.equal(
    reglaSql.exclusion?.test(contenido) ?? false,
    false,
    `La exclusión SQL ${codigo} permitiría indebidamente: ${contenido}`,
  )
}

for (const [titulo, descripcion] of permitidas) {
  const contenido = normalizarComoSql(`${titulo} ${descripcion} Otros Madrid`)
  for (const [codigo, reglaSql] of filasSql) {
    const bloquea = reglaSql.patron.test(contenido) && !(reglaSql.exclusion?.test(contenido) ?? false)
    assert.equal(bloquea, false, `Falso positivo SQL (${codigo}): ${contenido}`)
  }
}

console.log(
  `Moderación verificada: ${bloqueadas.length} bloqueos, ${permitidas.length} casos legítimos y contrato TS/SQL sincronizado.`,
)
