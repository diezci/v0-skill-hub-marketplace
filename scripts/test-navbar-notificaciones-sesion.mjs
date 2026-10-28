import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

let usuarioId = 'A', cursor = 0, dirty = false, authChange, tree
const listeners = new Map()
let estadoTrabajo = 'entregado'
let consultaPendiente = null
const slots = [], effects = []
const aviso = { id: 'aviso-A', trabajo_id: 'job-A', tipo: 'trabajo_entregado', titulo: 'Entrega privada de A', mensaje: 'Trabajo de A', created_at: new Date().toISOString() }
let resumen = { noLeidas: 1, mensajesNoLeidos: 0, porSeccion: {}, notificaciones: [aviso] }
const hooks = {
  useState(initial) {
    const i = cursor++
    slots[i] ||= { value: typeof initial === 'function' ? initial() : initial }
    return [slots[i].value, updater => { slots[i].value = typeof updater === 'function' ? updater(slots[i].value) : updater; dirty = true }]
  },
  useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial } },
  useEffect(fn, deps) {
    const i = cursor++
    if (!slots[i] || deps.some((dep, j) => dep !== slots[i].deps[j])) effects.push(() => {
      slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }
    })
  },
}
const jsx = (type, props) => ({ type, props })
const t = text => text, router = { push() {} }, toast = () => {}
const storage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } }
const supabase = {
  auth: { getSession: () => new Promise(() => {}), onAuthStateChange: callback => { authChange = callback; return { data: { subscription: { unsubscribe() {} } } } } },
  from: () => ({ select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: { nombre: 'Actor', es_admin: false } }), in: async () => consultaPendiente || ({ data: [{id: 'job-A', estado: estadoTrabajo, transacciones_escrow: [{estado: estadoTrabajo === 'completado' ? 'completado' : 'fondos_retenidos', liquidacion_estado: null}]}], error: null }) }),
}
const ui = new Proxy({ __esModule: true }, { get: (object, name) => name in object ? object[name] : String(name) })
const helpers = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/celebraciones-vigentes.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:helpers});
const deps = {
  '@/lib/celebraciones-vigentes': helpers,
  react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
  'next/navigation': { usePathname: () => '/mis-trabajos', useRouter: () => router },
  '@/components/idioma-provider': { useT: () => t },
  '@/hooks/use-notificaciones-seccion': { useResumenNotificaciones: () => ({ usuarioId, resumen }) },
  '@/hooks/use-toast': { useToast: () => ({ toast }) },
  '@/lib/supabase/client': { createClient: () => supabase },
  '@/lib/push/client': { sincronizarBadgeApp: async () => {}, desvincularPushActual: async () => {} },
  '@/lib/utils': { cn: (...values) => values.filter(value => typeof value === 'string').join(' ') },
}
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/navbar.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module, exports: module.exports, require: name => deps[name] || ui, console, Date,
  localStorage: storage(), sessionStorage: storage(), window: { scrollY: 0, addEventListener(name, fn) { listeners.set(name, fn) }, removeEventListener(name) { listeners.delete(name) } },
})
const walk = node => Array.isArray(node) ? node.flatMap(walk) : !node || typeof node !== 'object' ? [] : [node, ...[].concat(node.props?.children || []).flatMap(walk)]
const visible = () => walk(tree).filter(node => node.type === 'CelebracionNotificacion').map(node => node.props.notificacion.id)
function render(runEffects = true) { dirty = false; cursor = 0; tree = module.exports.default(); if (runEffects) effects.splice(0).forEach(effect => effect()) }
async function flush() { for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) render() } }
render(); authChange('SIGNED_IN', { user: { id: 'A' } }); await flush()
assert.equal(walk(tree).some(node => node.type === 'CampanaNotificaciones'), false, 'The public navbar has no notification bell in either its desktop or mobile branch')
assert.deepEqual(visible(), ['aviso-A'])
estadoTrabajo = 'completado'
listeners.get('diime:notification')()
await flush()
assert.deepEqual(visible(), [], 'A mounted delivery overlay disappears as soon as the client completes the workflow')
resumen = { ...resumen }
render(); await flush()
assert.deepEqual(visible(), [], 'An unread historical delivery cannot reappear after the work is completed')
estadoTrabajo = 'entregado'
resumen = { ...resumen, notificaciones: [{ ...aviso, id: 'aviso-A-2' }] }
render(); await flush()
assert.deepEqual(visible(), ['aviso-A-2'])
estadoTrabajo = 'completado'
resumen = { ...resumen }
render(); await flush()
assert.deepEqual(visible(), [], 'Polling also removes a previously mounted overlay when the contract becomes terminal')
let resolverConsulta
consultaPendiente = new Promise(resolve => { resolverConsulta = resolve })
resumen = { ...resumen, notificaciones: [{ ...aviso, id: 'aviso-pendiente' }] }
render()
listeners.get('diime:notification')()
resolverConsulta({ data: [{ id: 'job-A', estado: 'entregado', transacciones_escrow: [{ estado: 'fondos_retenidos' }] }], error: null })
await flush()
assert.deepEqual(visible(), [], 'A response started before confirmation cannot restore the outdated delivery overlay')
consultaPendiente = null
estadoTrabajo = 'entregado'
resumen = { ...resumen, notificaciones: [{ ...aviso, id: 'aviso-A-3' }] }
render(); await flush()
assert.deepEqual(visible(), ['aviso-A-3'])
usuarioId = 'B'; resumen = { ...resumen, noLeidas: 0, notificaciones: [] }
render(false)
assert.deepEqual(visible(), [], 'The previous account overlay disappears before cleanup effects run')
effects.splice(0).forEach(effect => effect()); await flush()
usuarioId = 'A'; render(); await flush()
assert.deepEqual(visible(), [], 'Returning to the previous account does not restore its cached overlay')
usuarioId = null; render(false)
assert.deepEqual(visible(), [], 'Logout never displays a private notification snapshot')
console.log('Navbar notification session OK: own overlay, immediate account switch, cache reset and logout; no network.')
