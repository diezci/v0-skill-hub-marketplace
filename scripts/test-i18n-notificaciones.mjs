import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

function cargar(ruta, dependencias = {}, contexto = {}) {
  const codigo = ts.transpileModule(readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const modulo = { exports: {} }
  vm.runInNewContext(codigo, {
    exports: modulo.exports, module: modulo, process: { env: {} }, Buffer, URLSearchParams,
    console: { error() {}, info() {}, warn() {} },
    require(nombre) {
      if (nombre === "server-only") return {}
      if (nombre in dependencias) return dependencias[nombre]
      throw new Error(`Dependencia sin simular: ${nombre}`)
    },
    ...contexto,
  }, { filename: ruta })
  return modulo.exports
}

const diccionario = cargar("lib/traducciones/notificaciones.ts")
const traduccion = cargar("lib/i18n-notificaciones.ts", {
  "./traducciones/notificaciones": diccionario,
})
const { traducirTextoNotificacion: traducir } = traduccion
const destinatario = cargar("lib/idioma-destinatario.ts", {
  "@/lib/i18n": { esIdiomaValido: (valor) => valor === "es" || valor === "en" },
})
const plantilla = cargar("lib/emails/plantilla.ts", { "@/lib/i18n-notificaciones": traduccion })
const preferencias = cargar("lib/preferencias-notificaciones.ts")

let casos = 0
async function comprobar(nombre, prueba) { await prueba(); casos++; console.log(`PASS ${nombre}`) }

await comprobar("Las plantillas conservan literalmente nombres, títulos y motivos en ambos idiomas", () => {
  for (const [es, en] of Object.entries(diccionario.EN_NOTIFICACIONES)) {
    const completar = (texto) => texto.replace(/\{(\d+)\}/g, (_, n) => `dato-${n}: Álvaro, «cocina», $& <img>\nsin traducir`)
    assert.equal(traducir("es", completar(es)), completar(es), es)
    assert.equal(traducir("en", completar(es)), completar(en), es)
  }
})

await comprobar("Los mensajes de chat y el contenido libre nunca se traducen", () => {
  const chat = 'Has recibido una oferta en "Mi proyecto".'
  assert.equal(traducir("en", chat, "mensaje"), chat)
  assert.equal(traducir("en", "Mi comentario sobre una incidencia"), "Mi comentario sobre una incidencia")
})

await comprobar("Los avisos financieros históricos se traducen sin cambiar importes ni notas", () => {
  assert.equal(
    traducir("en", "Se ha cancelado el servicio de mutuo acuerdo y se han devuelto íntegramente 22.00 EUR."),
    "The service has been cancelled by mutual agreement and EUR 22.00 has been refunded in full.",
  )
  assert.equal(
    traducir("en", "Se ha cancelado el servicio de mutuo acuerdo. Se han reembolsado 20.00 EUR. Diime conserva 2.00 EUR de comisión del cliente."),
    "The service has been cancelled by mutual agreement. EUR 20.00 has been refunded. Diime retains EUR 2.00 in client service fees.",
  )
  assert.equal(
    traducir("en", "La mediación de Diime ha concluido. Reembolso al cliente: 105.42 EUR. Motivo: Sin entregar. La decisión es privada y no impide emprender otras acciones."),
    "Diime's mediation has concluded. Refund to the client: EUR 105.42. Reason: Sin entregar. The decision is private and does not prevent further action.",
  )
})

await comprobar("El idioma se lee del destinatario y los valores ausentes o inválidos usan español", async () => {
  for (const [guardado, esperado] of [["en", "en"], ["es", "es"], ["admin", "es"], [undefined, "es"]]) {
    const admin = { auth: { admin: { getUserById: async (id) => {
      assert.equal(id, "destinatario")
      return { data: { user: { user_metadata: { idioma: guardado } } }, error: null }
    } } } }
    assert.equal(await destinatario.idiomaDestinatario(admin, "destinatario"), esperado)
  }
  assert.equal(await destinatario.idiomaDestinatario({ auth: { admin: { getUserById() { throw Error("offline") } } } }, "destinatario"), "es")
})

function crearAdmin(idioma) {
  return {
    auth: { admin: { getUserById: async (id) => {
      assert.equal(id, "destinatario")
      return { data: { user: { user_metadata: { idioma } } }, error: null }
    } } },
    from(tabla) {
      const data = tabla === "profiles" ? {
        email: "recipient@example.test", nombre: '<script>alert("name")</script>', email_notificaciones: true,
      } : tabla === "preferencias_notificaciones" ? { email_activo: true, email_ofertas: true }
        : tabla === "push_devices" ? [{ token: "test-device", plataforma: "android" }] : []
      const q = {
        select() { return q }, eq() { return q }, or() { return q },
        maybeSingle: async () => ({ data, error: null }),
        then(resolver) { return Promise.resolve({ data, count: 0, error: null }).then(resolver) },
      }
      return q
    },
  }
}

await comprobar("Correo inglés completo según el destinatario: asunto, cuerpo, CTA, pie y HTML seguro", async () => {
  const envios = []
  const enviar = cargar("lib/emails/enviar.ts", {
    resend: { Resend: class { emails = { send: async (email) => { envios.push(email); return { error: null } } } } },
    "@/lib/supabase/admin": { createAdminClient: () => crearAdmin("en") },
    "@/lib/idioma-destinatario": destinatario,
    "@/lib/i18n-notificaciones": traduccion,
    "@/lib/preferencias-notificaciones": preferencias,
    "@/lib/operaciones": { registrarEventoOperativo: async () => {} },
    "./plantilla": plantilla,
  }, { process: { env: { RESEND_API_KEY: "test-not-a-real-key" } } })
  await enviar.enviarAvisoPorEmail({ usuarioId: "destinatario", tipo: "oferta_nueva", titulo: "Nueva oferta en tu demanda", mensaje: 'Has recibido una oferta en "Reforma de Álvaro".', link: "/mis-solicitudes" })
  assert.equal(envios.length, 1)
  const email = envios[0]
  assert.equal(email.to, "recipient@example.test")
  assert.equal(email.subject, "New offer for your request")
  assert.match(email.html, /<html lang="en">/)
  assert.match(email.html, /You have received an offer/)
  assert.match(email.html, /View offer/)
  assert.match(email.text, /View offer: https:/)
  assert.match(email.text, /You are receiving this email/)
  assert.doesNotMatch(email.html, /<script>/)
  assert.match(email.html, /&lt;script&gt;/)
  assert.doesNotMatch(email.html + email.text, /Recibes este correo|Ver la oferta|Has recibido/)
})

await comprobar("Push usa el idioma del destinatario y conserva mensajes de chat, sin llamadas de red", async () => {
  const enviados = []
  const enviar = cargar("lib/push/enviar.ts", {
    "node:crypto": { createSign: () => ({ update() {}, end() {}, sign: () => Buffer.from("fake-test-signature") }) },
    "node:http2": { connect() { throw Error("No se permiten conexiones reales") } },
    "@/lib/supabase/admin": { createAdminClient: () => crearAdmin("en") },
    "@/lib/idioma-destinatario": destinatario,
    "@/lib/i18n-notificaciones": traduccion,
    "@/lib/operaciones": { registrarEventoOperativo: async () => {} },
  }, {
    process: { env: { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: "test-project", client_email: "test@example.test", private_key: "fake-key" }) } },
    fetch: async (url, opciones) => {
      if (url === "https://oauth2.googleapis.com/token") return { ok: true, json: async () => ({ access_token: "fake-access" }) }
      assert.match(url, /^https:\/\/fcm.googleapis.com\//)
      enviados.push(JSON.parse(opciones.body).message.notification)
      return { ok: true }
    },
  })
  await enviar.enviarPushAUsuario("destinatario", { tipo: "oferta_nueva", titulo: "Nueva oferta en tu demanda", cuerpo: 'Has recibido una oferta en "Reforma de Álvaro".' })
  assert.equal(enviados[0].title, "New offer for your request")
  assert.equal(enviados[0].body, 'You have received an offer for "Reforma de Álvaro".')
  await enviar.enviarPushAUsuario("destinatario", { tipo: "mensaje", titulo: "Álvaro", cuerpo: "Nueva oferta en tu demanda" })
  assert.equal(enviados[1].title, "Álvaro")
  assert.equal(enviados[1].body, "Nueva oferta en tu demanda")
})

console.log(`${casos} pruebas de idioma en notificaciones, correo y push completadas, sin red ni datos reales.`)
