import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

function cargar(ruta, dependencias, env = {}) {
  const codigo = ts.transpileModule(readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const modulo = { exports: {} }
  vm.runInNewContext(codigo, {
    exports: modulo.exports, module: modulo, process: { env },
    console: { error() {}, info() {} },
    require(nombre) {
      if (nombre === "server-only") return {}
      if (nombre in dependencias) return dependencias[nombre]
      throw new Error(`Dependencia sin simular: ${nombre}`)
    },
  }, { filename: ruta })
  return modulo.exports
}

const moduloPreferencias = cargar("lib/preferencias-notificaciones.ts", {})

function preparar({
  aceptaEmail = true,
  configurado = false,
  errorPerfil = null,
  errorPreferencias = null,
  preferencias = {},
} = {}) {
  const eventos = [], envios = []
  let clientesResend = 0
  const perfil = {
    select() { return perfil }, eq() { return perfil },
    maybeSingle: async () => ({ data: errorPerfil ? null : {
      email: "destino@example.test", nombre: "Destinatario", email_notificaciones: aceptaEmail, cuenta_eliminada: null,
    }, error: errorPerfil }),
  }
  const preferencia = {
    select() { return preferencia }, eq() { return preferencia },
    maybeSingle: async () => ({
      data: errorPreferencias ? null : {
        email_activo: aceptaEmail,
        email_oportunidades: true,
        email_ofertas: true,
        email_proyectos: true,
        email_pagos: true,
        email_disputas: true,
        email_cuenta: true,
        ...preferencias,
      },
      error: errorPreferencias,
    }),
  }
  const modulo = cargar("lib/emails/enviar.ts", {
    resend: { Resend: class {
      constructor() { clientesResend++ }
      emails = { send: async (datos) => { envios.push(datos); return { error: null } } }
    } },
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: (tabla) => tabla === "profiles" ? perfil : preferencia }) },
    "./plantilla": { BASE_URL: "https://test.diime.es", plantillaEmail: () => "HTML", plantillaTexto: () => "Texto" },
    "@/lib/operaciones": { registrarEventoOperativo: async (evento) => { eventos.push(evento) } },
    "@/lib/preferencias-notificaciones": moduloPreferencias,
  }, configurado ? { RESEND_API_KEY: "re_unit_test" } : {})
  return { ...modulo, eventos, envios, clientesResend: () => clientesResend }
}

const aviso = { usuarioId: "destino", tipo: "oferta_nueva", titulo: "Nueva oferta", link: "/mis-solicitudes" }
let casos = 0
async function comprobar(nombre, prueba) { await prueba(); casos++; console.log(`PASS ${nombre}`) }

await comprobar("Desactivar el correo evita falsas alertas aunque Resend no esté configurado", async () => {
  const f = preparar({ aceptaEmail: false })
  await f.enviarAvisoPorEmail(aviso)
  assert.equal(f.eventos.length, 0)
  assert.equal(f.envios.length, 0)
})

await comprobar("Desactivar el correo evita inicializar y llamar a Resend", async () => {
  const f = preparar({ aceptaEmail: false, configurado: true })
  await f.enviarAvisoPorEmail(aviso)
  assert.equal(f.clientesResend(), 0)
  assert.equal(f.envios.length, 0)
  assert.equal(f.eventos.length, 0)
})

await comprobar("Quien recibe correo conserva la alerta crítica de configuración ausente", async () => {
  const f = preparar()
  await f.enviarAvisoPorEmail(aviso)
  assert.equal(f.eventos.length, 1)
  assert.equal(f.eventos[0].codigo, "resend_no_configurado")
  assert.equal(f.eventos[0].severidad, "critica")
  assert.equal(f.envios.length, 0)
})

await comprobar("El correo habilitado se envía al destinatario con el mismo contenido", async () => {
  const f = preparar({ configurado: true })
  await f.enviarAvisoPorEmail(aviso)
  assert.equal(f.envios.length, 1)
  assert.equal(f.envios[0].to, "destino@example.test")
  assert.equal(f.envios[0].subject, aviso.titulo)
  assert.equal(f.envios[0].html, "HTML")
  assert.equal(f.envios[0].text, "Texto")
  assert.equal(f.envios[0].headers["List-Unsubscribe"], "<https://test.diime.es/mi-cuenta#avisos-email>")
  assert.equal(f.eventos.length, 0)
})

await comprobar("Desactivar una categoría solo silencia sus correos", async () => {
  const f = preparar({ configurado: true, preferencias: { email_ofertas: false } })
  await f.enviarAvisoPorEmail(aviso)
  assert.equal(f.envios.length, 0)
  assert.equal(f.eventos.length, 0)

  await f.enviarAvisoPorEmail({ ...aviso, tipo: "pago_liberado" })
  assert.equal(f.envios.length, 1)
})

await comprobar("Las nuevas demandas respetan su preferencia específica", async () => {
  const f = preparar({ configurado: true, preferencias: { email_oportunidades: false } })
  await f.enviarAvisoPorEmail({ ...aviso, tipo: "demanda_nueva" })
  assert.equal(f.envios.length, 0)
})

await comprobar("Un fallo al consultar la preferencia conserva su diagnóstico", async () => {
  const f = preparar({ errorPerfil: { code: "42501" } })
  await f.enviarAvisoPorEmail(aviso)
  assert.equal(f.eventos.length, 1)
  assert.equal(f.eventos[0].codigo, "destinatario_no_consultable")
  assert.equal(f.envios.length, 0)
})

await comprobar("Si no pueden leerse las categorías, el envío se cierra de forma segura", async () => {
  const f = preparar({ configurado: true, errorPreferencias: { code: "42501" } })
  await f.enviarAvisoPorEmail(aviso)
  assert.equal(f.eventos.length, 1)
  assert.equal(f.eventos[0].codigo, "preferencias_no_consultables")
  assert.equal(f.envios.length, 0)
})

await comprobar("La preferencia de correo no elimina el aviso web ni bloquea el canal push", async () => {
  const email = preparar({ aceptaEmail: false })
  const avisosWeb = [], avisosPush = []
  const escritor = cargar("lib/notificaciones.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "remitente" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => ({ insert: async (datos) => { avisosWeb.push(datos); return { error: null } } }) }) },
    "@/lib/push/enviar": { enviarPushAUsuario: async (...datos) => { avisosPush.push(datos) } },
    "@/lib/emails/enviar": email,
  })
  await escritor.crearNotificacion(aviso)
  assert.equal(avisosWeb.length, 1)
  assert.equal(avisosWeb[0].usuario_id, aviso.usuarioId)
  assert.equal(avisosPush.length, 1)
  assert.equal(avisosPush[0][0], aviso.usuarioId)
  assert.equal(email.eventos.length, 0)
  assert.equal(email.envios.length, 0)
})

const migracion = readFileSync(
  new URL("../supabase/migrations/20260910182003_preferencias_notificaciones_email.sql", import.meta.url),
  "utf8",
)
assert.match(migracion, /alter table public\.preferencias_notificaciones enable row level security/)
assert.match(migracion, /to authenticated\s+using \(\(select auth\.uid\(\)\) = usuario_id\)/)
assert.match(migracion, /with check \(\(select auth\.uid\(\)\) = usuario_id\)/)

assert.equal(moduloPreferencias.categoriaEmailParaTipo("demanda_nueva"), "oportunidades")
assert.equal(moduloPreferencias.categoriaEmailParaTipo("pago_liberado"), "pagos")
assert.equal(moduloPreferencias.categoriaEmailParaTipo("disputa_abierta_admin"), null)
assert.equal(
  moduloPreferencias.sonPreferenciasEmailValidas(moduloPreferencias.PREFERENCIAS_EMAIL_POR_DEFECTO),
  true,
)

console.log(`${casos} pruebas de preferencia de correo completadas, sin red ni base de datos.`)
