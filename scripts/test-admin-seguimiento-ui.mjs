// Component regressions with real translations and isolated transport. No browser or network.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = fileURLToPath(new URL("../", import.meta.url))
const modules = new Map()
function loadLocal(relative) {
  const filename = path.resolve(root, relative)
  if (modules.has(filename)) return modules.get(filename)
  const exports = {}
  modules.set(filename, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Intl,
    require(name) {
      assert.ok(name.startsWith("."), `Unexpected dependency in translation/format fixture: ${name}`)
      return loadLocal(path.resolve(path.dirname(filename), `${name}.ts`))
    },
  })
  return exports
}
const { traducir, localeDe } = loadLocal("lib/i18n.ts")
const catalogo = loadLocal("lib/operaciones-catalogo.ts")
const { CONTROLES_OPERATIVOS, anclaControl } = catalogo
const jsx = (type, props) => ({ type, props })
const ui = new Proxy({ __esModule: true }, { get: (object, key) => key in object ? object[key] : String(key) })
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props?.children)]
const text = node => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const sample = (overrides = {}) => ({ generadoAt: "2026-11-08T12:00:00.000Z", controles: Object.fromEntries(Object.keys(CONTROLES_OPERATIVOS).map(key => [key, {total:0,error:null}])), ...overrides })

function harness({ language = "es" } = {}) {
  let cursor = 0, dirty = false, tree, mounted = true, writesAfterUnmount = 0
  let response = () => Promise.resolve({ ok: true, data: sample() })
  const slots = [], pendingEffects = [], calls = []
  const handlers = new Map(), intervals = new Map()
  const document = { visibilityState: "visible", addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) }
  const window = { addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) }
  const hooks = {
    useState(initial) {
      const index = cursor++
      slots[index] ||= { value: typeof initial === "function" ? initial() : initial }
      return [slots[index].value, updater => {
        if (!mounted) writesAfterUnmount++
        const value = typeof updater === "function" ? updater(slots[index].value) : updater
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true }
      }]
    },
    useRef(initial) { return slots[cursor++] ||= { current: initial } },
    useEffect(effect, dependencies) {
      const index = cursor++
      if (!slots[index] || dependencies.some((value, i) => value !== slots[index].dependencies[i])) {
        pendingEffects.push(() => {
          slots[index]?.cleanup?.()
          slots[index] = { dependencies, cleanup: effect() }
        })
      }
    },
  }
  const exports = {}
  const dependencies = {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "@/components/idioma-provider": { useIdioma: () => ({ idioma: language, t: (key, params) => traducir(language, key, params) }) },
    "@/lib/i18n": { localeDe },
    "@/lib/operaciones-catalogo": catalogo,
    "@/app/actions/operaciones": { obtenerIndicadoresOperativosAdmin() { calls.push(true); return response() } },
  }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, "components/admin/resumen-operativo.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Intl, Date, document, window, setInterval: (fn, delay) => { intervals.set(delay, fn); return delay }, clearInterval: id => intervals.delete(id), encodeURIComponent, require: name => dependencies[name] || ui })
  function render() {
    dirty = false; cursor = 0
    tree = exports.ResumenOperativoPanel()
    pendingEffects.splice(0).forEach(effect => effect())
  }
  async function flush() {
    for (let i = 0; i < 20; i++) { if (mounted && dirty) render(); await Promise.resolve() }
    if (mounted && dirty) render()
  }
  const refreshButton = () => nodes(tree).find(node => node.props?.["aria-label"] === traducir(language, "Actualizar seguimiento"))
  return {
    calls, intervals, document, handlers,
    async event(name) { handlers.get(name)?.(); await flush() },
    async poll() { intervals.get(60_000)?.(); await flush() },
    get tree() { return tree },
    get writesAfterUnmount() { return writesAfterUnmount },
    response(fn) { response = fn },
    async start() { render(); await flush() },
    async refresh() { refreshButton().props.onClick(); await flush() },
    refreshButton,
    unmount() { mounted = false; slots.forEach(slot => slot.cleanup?.()) },
    flush,
  }
}
let checks = 0
async function check(name, fn) { await fn(); checks++; console.log("PASS", name) }
const status = tree => text(nodes(tree).find(node => node.props?.role === 'status'))
await check('Loading and unknown checks never certify that there are no alerts', async () => {
 const h=harness(), p=deferred(); h.response(()=>p.promise); await h.start()
 assert.match(status(h.tree),/Consultando controles/); assert.doesNotMatch(status(h.tree),/Sin avisos/)
 assert.equal(h.tree.props['aria-busy'],true); assert.equal(h.refreshButton().props.disabled,true)
 p.resolve({ok:true,data:sample()}); await h.flush(); assert.match(status(h.tree),/Sin avisos en los controles disponibles/)
 assert.equal(h.refreshButton().props.disabled,false)
})
await check('Every one of the 15 checks links to its exact admin section, including zero counts', async () => {
 const h=harness(); await h.start()
 for(const key of Object.keys(CONTROLES_OPERATIVOS)) assert.ok(nodes(h.tree).some(n=>n.props?.href===`/admin/operaciones#${anclaControl(key)}`),key)
 assert.equal(nodes(h.tree).filter(n=>n.props?.href).length,15)
 assert.doesNotMatch(text(h.tree),/Todo funciona|usuarios afectados|100%/)
})
await check('The headline counts alerting controls, not duplicated cases or people', async () => {
 const data=sample(); data.controles.eventos.total=37;data.controles.liquidacionesError.total=37
 const h=harness();h.response(async()=>({ok:true,data}));await h.start()
 assert.match(status(h.tree),/2 de 15/);assert.doesNotMatch(status(h.tree),/74|37/)
 assert.ok(nodes(h.tree).filter(n=>n.type==='details'&&n.props.open).length===2)
})
await check('One unavailable source keeps other observations and marks partial coverage', async () => {
 const data=sample();data.controles.eventos={total:null,error:'Unavailable'}
 const h=harness();h.response(async()=>({ok:true,data}));await h.start()
 assert.match(status(h.tree),/Datos parciales: 14 de 15/);assert.doesNotMatch(status(h.tree),/Sin avisos/)
 assert.match(text(h.tree),/Sin datos/)
})
await check('Network failure keeps the timestamp of stale data and enables retry', async () => {
 const h=harness();await h.start();h.response(async()=>{throw Error('Transport')});await h.refresh()
 assert.match(status(h.tree),/No se pudo actualizar.*Última lectura disponible:/)
 assert.match(text(h.tree),/Sin actualizar/);assert.equal(h.refreshButton().props.disabled,false)
 h.response(async()=>({ok:true,data:sample()}));await h.refresh();assert.doesNotMatch(status(h.tree),/No se pudo|Última lectura disponible/)
})
await check('Authorization rejection clears any previously visible observations', async () => {
 const data=sample();data.controles.eventos.total=73
 const h=harness();h.response(async()=>({ok:true,data}));await h.start();assert.match(text(h.tree),/73/)
 h.response(async()=>({ok:false,error:'No access'}));await h.refresh();assert.doesNotMatch(text(h.tree),/73|Comprobado:/);assert.match(text(h.tree),/Sin datos/)
})
await check('Polling uses 60 seconds, pauses while hidden and refreshes on return', async () => {
 const h=harness();await h.start();assert.deepEqual([...h.intervals.keys()],[60000]);assert.equal(h.calls.length,1)
 h.document.visibilityState='hidden';await h.poll();await h.event('focus');assert.equal(h.calls.length,1)
 h.document.visibilityState='visible';await h.event('visibilitychange');assert.equal(h.calls.length,2)
 await h.poll();assert.equal(h.calls.length,3);h.unmount();assert.equal(h.intervals.size,0);assert.equal(h.handlers.size,0)
})
await check('Overlapping polls do not start duplicate reads and unmount drops late results', async () => {
 const h=harness(),p=deferred();h.response(()=>p.promise);await h.start();await h.poll();await h.event('focus');assert.equal(h.calls.length,1)
 h.unmount();p.resolve({ok:true,data:sample()});await h.flush();assert.equal(h.writesAfterUnmount,0)
})
await check('An earlier request cannot overwrite a newer refresh or clear its loading state', async () => {
 const h=harness(),p=deferred();h.response(()=>p.promise);await h.start()
 const data=sample();data.controles.eventos.total=9;h.response(async()=>({ok:true,data}));await h.refresh()
 p.resolve({ok:true,data:sample()});await h.flush();assert.match(text(h.tree),/9/);assert.match(status(h.tree),/1 de 15/)
})
await check('English includes monitoring coverage and translated control criteria', async () => {
 const h=harness({language:'en'});await h.start()
 assert.match(text(h.tree),/User experience monitoring/);assert.match(text(h.tree),/Loading times and device failures are not yet measured/)
 assert.doesNotMatch(text(h.tree),/Seguimiento de la experiencia|Sin avisos|Fallos registrados|Comprobado:/)
})
console.log(`${checks} monitoring UI regressions passed without network or mutations`)
