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

function escenario({ iniciales = [], nuevo = null, entrePaginas = null, errorLectura = false, errorPagina = null, autorizado = true, bloqueado = false, autenticado = true } = {}) {
  const guardados = iniciales.map(m => ({ conversacion_id: conversacion, ...m }))
  const updates = []
  const paginas = []
  let llegadaSimulada = false
  const supabase = {
    auth: { getUser: async () => ({ data: { user: autenticado ? { id: usuario } : null } }) },
    rpc: async (nombre) => ({ data: nombre === "empresa_mensajes_listar" ? null : bloqueado }),
    from(tabla) {
      let accion = "select"
      const filtros = [], orden = []
      let limite, filtroCursor = null
      const query = {
        select() { return query },
        update() { accion = "update"; return query },
        eq(campo, valor) { filtros.push(m => m[campo] === valor); return query },
        neq(campo, valor) { filtros.push(m => m[campo] !== valor); return query },
        is(campo, valor) { filtros.push(m => m[campo] === valor); return query },
        gt(campo, valor) { filtros.push(m => m[campo] > valor); return query },
        or(expresion) {
          const partes = /^created_at\.gt\.(.+),and\(created_at\.eq\.(.+),id\.gt\.(.+)\),created_at\.is\.null$/.exec(expresion)
          assert.ok(partes, "Cursor uses the exact timestamp and UUID tuple, plus the null-date tail")
          assert.equal(partes[1], partes[2])
          filtroCursor = { created_at: partes[1], id: partes[3] }
          filtros.push(m => m.created_at === null || m.created_at > partes[1] || (m.created_at === partes[1] && m.id > partes[3]))
          return query
        },
        async single() { return { data: autorizado ? { participante_1: usuario, participante_2: otro } : { participante_1: otro, participante_2: "ajeno" } } },
        order(campo, opciones) { orden.push([campo, opciones]); return query },
        limit(n) { limite = n; return query },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            assert.equal(tabla, "mensajes")
            assert.equal(accion, "select")
            assert.equal(limite, 500)
            const indice = paginas.length
            paginas.push({ limite, filtroCursor })
            if (errorPagina === indice) return { data: null, error: { message: "page unavailable" } }
            const data = guardados.filter(m => filtros.every(fn => fn(m))).sort((a, b) => {
              for (const [campo, opciones] of orden) {
                if (a[campo] === b[campo]) continue
                if (a[campo] === null) return opciones.nullsFirst ? -1 : 1
                if (b[campo] === null) return opciones.nullsFirst ? 1 : -1
                return (a[campo] < b[campo] ? -1 : 1) * (opciones.ascending ? 1 : -1)
              }
              return 0
            }).slice(0, limite).map(m => ({ ...m }))
            // Arrivals commit after this SELECT snapshot, before the next page/update.
            if (nuevo && !llegadaSimulada) { guardados.push({ conversacion_id: conversacion, ...nuevo }); llegadaSimulada = true }
            entrePaginas?.({ indice, guardados, data })
            return { data, error: null }
          }).then(resolve, reject)
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
  return { leer: () => module.exports.obtenerMensajes(conversacion), guardados, updates, paginas }
}

let siguienteFecha = Date.parse("2026-10-26T00:00:00.000Z")
const mensaje = (id, extra = {}) => ({ id, created_at: new Date(siguienteFecha++).toISOString(), remitente_id: otro, contenido: id, leido: false, ...extra })
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

const largo = escenario({ iniciales: Array.from({ length: 1005 }, (_, i) => mensaje(`long-${i}`)) })
const completo = await largo.leer()
assert.equal(completo.data.length, 1005)
assert.equal(completo.data.at(-1).id, "long-1004")
assert.equal(largo.paginas.length, 3)
assert.equal(largo.paginas[1].filtroCursor.id, "long-499")
assert.equal(largo.paginas[2].filtroCursor.id, "long-999")
assert.equal(largo.updates.flat().length, 1005)
verificaciones += 4
const paginaFallida = escenario({ iniciales: Array.from({ length: 1005 }, (_, i) => mensaje(`failed-${i}`)), errorPagina: 1 })
assert.equal((await paginaFallida.leer()).error, "page unavailable")
assert.equal(paginaFallida.updates.length, 0, "An incomplete history never acknowledges unseen rows")
verificaciones += 2

// All original messages share a microsecond timestamp: page boundaries must
// use ID too, without parsing the database timestamp through millisecond Date.
const fechaComun = "2026-10-26T12:00:00.123456+00:00"
const uuid = n => "00000000-0000-4000-8000-" + n.toString().padStart(12, "0")
const originales = Array.from({ length: 1005 }, (_, i) => mensaje(uuid((i + 1) * 2), { created_at: fechaComun }))
const atrasado = mensaje(uuid(301), { created_at: fechaComun })
const posterior = mensaje(uuid(1001), { created_at: fechaComun })
const frontera = escenario({ iniciales: originales, entrePaginas({ indice, guardados }) {
  if (indice === 0) guardados.push(...[atrasado, posterior].map(m => ({ conversacion_id: conversacion, ...m })))
} })
const primera = await frontera.leer(), idsPrimera = Array.from(primera.data, m => m.id)
const esperados = [...originales, posterior].sort((a, b) => a.id.localeCompare(b.id)).map(m => m.id)
assert.deepEqual(idsPrimera, esperados, "Interleaving commits cannot shift page offsets or lose original rows")
assert.equal(new Set(idsPrimera).size, idsPrimera.length, "No duplicate messages across pages")
assert.equal(frontera.paginas[1].filtroCursor.created_at, fechaComun, "Microsecond precision survives the cursor")
assert.deepEqual(frontera.updates.flat(), idsPrimera, "Only IDs actually delivered by this read are acknowledged")
assert.equal(frontera.guardados.find(m => m.id === atrasado.id).leido, false, "A late commit behind the cursor remains unread")
const updatesAntes = frontera.updates.length, segunda = await frontera.leer()
assert.equal(segunda.data.length, originales.length + 2)
assert.equal(new Set(Array.from(segunda.data, m => m.id)).size, segunda.data.length)
assert.ok(segunda.data.some(m => m.id === atrasado.id), "The next read includes the previously unseen late commit")
assert.deepEqual(frontera.updates.slice(updatesAntes).flat(), [atrasado.id], "The late message is acknowledged only when delivered")
verificaciones += 9

const sinFecha = escenario({ iniciales: Array.from({ length: 1005 }, (_, i) => mensaje(uuid(i + 1), { created_at: i < 503 ? fechaComun : null })) })
const legado = await sinFecha.leer()
assert.equal(legado.data.length, 1005)
assert.equal(new Set(Array.from(legado.data, m => m.id)).size, 1005)
assert.deepEqual(Array.from(legado.data, m => m.id), Array.from({ length: 1005 }, (_, i) => uuid(i + 1)), "Legacy null dates sort last and continue by ID")
assert.equal(sinFecha.updates.flat().length, 1005)
verificaciones += 4

console.log(`OK: ${verificaciones} comprobaciones de lectura de mensajes; permisos, errores y carrera SELECT/UPDATE sin llamadas reales.`)
