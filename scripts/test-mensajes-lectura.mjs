import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = ts.transpileModule(readFileSync(new URL("../app/actions/messages.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const usuario = "00000000-0000-4000-8000-000000000001"
const otro = "00000000-0000-4000-8000-000000000002"
const conversacion = "00000000-0000-4000-8000-000000000003"

function escenario({ iniciales = [], nuevo = null, errorLectura = false, autorizado = true, bloqueado = false, autenticado = true } = {}) {
  const guardados = iniciales.map(m => ({ conversacion_id: conversacion, ...m }))
  const updates = []
  let llegadaSimulada = false
  const supabase = {
    auth: { getUser: async () => ({ data: { user: autenticado ? { id: usuario } : null } }) },
    rpc: async () => ({ data: bloqueado }),
    from(tabla) {
      let accion = "select"
      const filtros = []
      const query = {
        select() { return query },
        update() { accion = "update"; return query },
        eq(campo, valor) { filtros.push(m => m[campo] === valor); return query },
        neq(campo, valor) { filtros.push(m => m[campo] !== valor); return query },
        async single() { return { data: autorizado ? { participante_1: usuario, participante_2: otro } : { participante_1: otro, participante_2: "ajeno" } } },
        async order() {
          assert.equal(tabla, "mensajes")
          const data = guardados.filter(m => filtros.every(fn => fn(m))).map(m => ({ ...m }))
          // A message arrives after the SELECT snapshot but before UPDATE.
          if (nuevo && !llegadaSimulada) { guardados.push({ conversacion_id: conversacion, ...nuevo }); llegadaSimulada = true }
          return { data, error: null }
        },
        async in(campo, ids) {
          assert.equal(tabla, "mensajes")
          assert.equal(accion, "update")
          assert.equal(campo, "id")
          assert.ok(ids.length <= 100, "Read updates stay below the URL/filter size limit")
          updates.push([...ids])
          if (errorLectura) return { error: { message: "denied" } }
          for (const mensaje of guardados) if (ids.includes(mensaje.id) && filtros.every(fn => fn(mensaje))) mensaje.leido = true
          return { error: null }
        },
      }
      return query
    },
  }
  const module = { exports: {} }
  runInNewContext(source, {
    module, exports: module.exports,
    require(name) {
      if (name === "@/lib/supabase/server") return { createClient: async () => supabase }
      if (name === "@/lib/i18n-servidor") return { textoServidor: async text => text }
      return {}
    },
    console,
  })
  return { leer: () => module.exports.obtenerMensajes(conversacion), guardados, updates }
}

const mensaje = (id, extra = {}) => ({ id, remitente_id: otro, contenido: id, leido: false, ...extra })
let verificaciones = 0

const carrera = escenario({ iniciales: [mensaje("visible"), mensaje("propio", { remitente_id: usuario }), mensaje("visto", { leido: true })], nuevo: mensaje("llegada-tardia") })
const resultado = await carrera.leer()
assert.deepEqual(Array.from(resultado.data, m => m.id), ["visible", "propio", "visto"])
assert.deepEqual(carrera.updates, [["visible"]])
assert.equal(carrera.guardados.find(m => m.id === "visible").leido, true)
assert.equal(carrera.guardados.find(m => m.id === "llegada-tardia").leido, false, "An unseen concurrent arrival stays unread")
assert.equal(carrera.guardados.find(m => m.id === "propio").leido, false, "Own messages are never acknowledged for the recipient")
verificaciones += 5

const fallo = escenario({ iniciales: [mensaje("visible")], errorLectura: true })
assert.equal((await fallo.leer()).error, "No se pudieron marcar los mensajes como leídos")
assert.equal(fallo.guardados[0].leido, false)
verificaciones += 2

for (const opciones of [{ autorizado: false }, { bloqueado: true }, { autenticado: false }]) {
  const privado = escenario({ iniciales: [mensaje("privado")], ...opciones })
  assert.ok((await privado.leer()).error)
  assert.equal(privado.updates.length, 0)
  verificaciones += 2
}

const vacio = escenario({ iniciales: [mensaje("ya-leido", { leido: true })] })
await vacio.leer()
assert.equal(vacio.updates.length, 0)
verificaciones++

const lotes = escenario({ iniciales: Array.from({ length: 205 }, (_, i) => mensaje(`id-${i}`)), nuevo: mensaje("nuevo") })
await lotes.leer()
assert.deepEqual(lotes.updates.map(lote => lote.length), [100, 100, 5])
assert.equal(lotes.guardados.at(-1).leido, false)
verificaciones += 2

console.log(`OK: ${verificaciones} comprobaciones de lectura de mensajes; permisos, errores y carrera SELECT/UPDATE sin llamadas reales.`)
