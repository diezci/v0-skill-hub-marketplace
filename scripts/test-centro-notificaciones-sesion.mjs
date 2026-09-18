import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

let usuarioId = "A", tree, key, cursor = 0, dirty = false
let slots = [], effects = []
const peticiones = []
const jsx = (type, props, key) => ({ type, props, key })
const module = { exports: {} }
const hooks = {
  useState(initial) {
    const i = cursor++
    if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial }
    // Capture the component instance so a callback from an unmounted account
    // cannot update the hooks of the next keyed instance in this test renderer.
    const instance = slots
    return [instance[i].value, updater => {
      if (instance !== slots) return
      instance[i].value = typeof updater === "function" ? updater(instance[i].value) : updater
      dirty = true
    }]
  },
  useEffect(fn, deps) {
    const i = cursor++
    if (!slots[i] || deps.some((dep, j) => dep !== slots[i].deps[j])) effects.push(() => {
      slots[i]?.cleanup?.()
      slots[i] = { deps, cleanup: fn() }
    })
  },
}
const deps = {
  react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx },
  "@/components/idioma-provider": { useT: () => x => x },
  "@/components/ui/button": { Button: "Button" },
  "@/components/avisos-seccion": { FilaAviso: "FilaAviso" },
  "@/components/aviso-mensajes-pendientes": { AvisoMensajesPendientes: "AvisoMensajesPendientes" },
  "@/hooks/use-notificaciones-seccion": { useResumenNotificaciones: () => ({ usuarioId,
    resumen: { notificaciones: [], mensajesNoLeidos: 0 }, cargando: false, error: "", marcarLeidas: async () => true,
  }) },
  "@/app/actions/notificaciones": { obtenerHistorialNotificaciones: pagina => new Promise(resolve => peticiones.push({ usuarioId, pagina, resolve })) },
}
vm.runInNewContext(ts.transpileModule(fs.readFileSync("components/centro-notificaciones.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module, exports: module.exports, require: name => { if (!(name in deps)) throw Error(name); return deps[name] } })

function render() {
  const child = module.exports.CentroNotificaciones({ enPanelAdmin: true })
  if (key !== child.key) {
    slots.forEach(slot => slot?.cleanup?.())
    slots = []; effects = []; key = child.key
  }
  dirty = false; cursor = 0
  tree = child.type(child.props)
  effects.splice(0).forEach(fn => fn())
}
async function flush() { for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) render() } }
const walk = node => Array.isArray(node) ? node.flatMap(walk) : !node || typeof node !== "object" ? [] : [node, ...[].concat(node.props?.children || []).flatMap(walk)]
function pulsar(texto) {
  const boton = walk(tree).find(node => node.type === "Button" && node.props.children === texto)
  assert.ok(boton, texto)
  boton.props.onClick()
}
const visibles = () => walk(tree).filter(node => node.type === "FilaAviso").map(node => node.props.aviso.id).join(",")
const aviso = (id, seccion = "/admin/disputas") => ({ id, seccion, titulo: id, mensaje: id, leida: true })

render()
pulsar("Historial"); await flush()
assert.equal(peticiones[0].usuarioId, "A")
assert.equal(peticiones[0].pagina, 0)
peticiones[0].resolve({ data: [aviso("A-privado")], hayMas: true }); await flush()
assert.equal(visibles(), "A-privado")
pulsar("Cargar más"); await flush()
assert.equal(peticiones[1].pagina, 1)

usuarioId = "B"; render()
assert.equal(visibles(), "", "A's rows disappear in the very first B render")
peticiones[1].resolve({ data: [aviso("A-tardio")], hayMas: true }); await flush()
assert.equal(visibles(), "", "A's late history does not populate B")
pulsar("Historial"); await flush()
assert.equal(peticiones[2].usuarioId, "B")
assert.equal(peticiones[2].pagina, 0, "The next account starts from page zero")
peticiones[2].resolve({ data: [aviso("B-admin"), aviso("B-personal", "/mis-trabajos")], hayMas: false }); await flush()
assert.equal(visibles(), "B-admin", "The admin-only filter still applies after an account switch")

usuarioId = null; render()
assert.equal(visibles(), "", "Logout immediately clears cached history")
pulsar("Historial"); await flush()
assert.equal(peticiones.length, 3, "History never queries without an authenticated identity")
slots.forEach(slot => slot?.cleanup?.())
console.log("Notification history OK: immediate account isolation, late response invalidation, page reset, admin filter and logout.")
