// Real layout hooks with isolated auth and count transports; no network or emails.
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props?.children)]
const text = node => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""

function setup({ user = "A", administrator = true } = {}) {
  let currentUser = user, currentAdmin = administrator, cursor = 0, dirty = false, tree, onAuthChange, nextTimer = 0
  let countResponse = () => Promise.resolve({ ok: true, total: 3 })
  const slots = [], effects = [], timers = new Map(), calls = [], routes = []
  const jsx = (type, props) => ({ type, props })
  const hooks = {
    useState(initial) {
      const index = cursor++
      slots[index] ||= { value: typeof initial === "function" ? initial() : initial }
      return [slots[index].value, updater => {
        const value = typeof updater === "function" ? updater(slots[index].value) : updater
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true }
      }]
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial } },
    useMemo(fn, deps) {
      const index = cursor++
      if (!slots[index] || deps.some((dep, i) => dep !== slots[index].deps[i])) slots[index] = { value: fn(), deps }
      return slots[index].value
    },
    useEffect(fn, deps) {
      const index = cursor++
      if (!slots[index] || deps.some((dep, i) => dep !== slots[index].deps[i])) effects.push(() => {
        slots[index]?.cleanup?.()
        slots[index] = { deps, cleanup: fn() }
      })
    },
  }
  const router = { push: url => routes.push(url), replace: url => routes.push(url) }
  const client = {
    auth: {
      async getUser() { return { data: { user: currentUser ? { id: currentUser } : null } } },
      onAuthStateChange(fn) { onAuthChange = fn; return { data: { subscription: { unsubscribe() {} } } } },
    },
    from(table) {
      const q = {
        select() { return q }, eq() { return q }, in() { return q },
        async single() { assert.equal(table, "profiles"); return { data: { es_admin: currentAdmin, nombre: currentUser, apellido: "" }, error: null } },
        then(resolve, reject) { return Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject) },
      }
      return q
    },
  }
  const ui = new Proxy({ __esModule: true }, { get: (object, key) => key in object ? object[key] : String(key) })
  const deps = {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { useRouter: () => router, usePathname: () => "/admin/pagos" },
    "@/components/idioma-provider": { useIdioma: () => ({ t: (key, params = {}) => key.replace(/\{([^}]+)\}/g, (_, name) => params[name] ?? `{${name}}`) }) },
    "@/hooks/use-notificaciones-seccion": { NotificacionesProvider: "NotificacionesProvider", useResumenNotificaciones: () => ({ resumen: { porSeccion: {}, mensajesNoLeidos: 0, notificaciones: [] } }) },
    "@/hooks/use-toast": { useToast: () => ({ toast() {} }) },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "@/lib/supabase/client": { createClient: () => client },
    "@/lib/auth-logout": { cerrarSesionActual: async () => {} },
    "@/app/actions/operaciones": { obtenerConteoDemandasSinOferta: () => { calls.push(currentUser); return countResponse() } },
  }
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/admin/layout.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, console, queueMicrotask,
    setInterval(fn) { const id = ++nextTimer; timers.set(id, fn); return id },
    clearInterval(id) { timers.delete(id) },
    require: name => deps[name] || ui,
  })
  const wrapper = exports.default({ children: "Contenido privado" })
  const Content = wrapper.props.children.type
  function render() {
    dirty = false; cursor = 0
    tree = Content({ children: "Contenido privado" })
    effects.splice(0).forEach(effect => effect())
  }
  async function flush() {
    for (let i = 0; i < 20; i++) { if (dirty) render(); await Promise.resolve() }
    if (dirty) render()
  }
  return {
    calls, routes,
    get tree() { return tree },
    response(fn) { countResponse = fn },
    async start() { render(); await flush() },
    async poll() { for (const fn of [...timers.values()]) fn(); await flush() },
    change(event, nextUser, nextAdmin = true) { currentUser = nextUser; currentAdmin = nextAdmin; onAuthChange(event, nextUser ? { user: { id: nextUser } } : null); render() },
    flush,
  }
}

const operationsLink = tree => nodes(tree).find(node => node.props?.href === "/admin/operaciones")
const banner = tree => nodes(tree).find(node => node.props?.role === "status")
let checks = 0
async function check(name, fn) { await fn(); checks++; console.log("PASS", name) }

await check("El administrador ve el contador de Operaciones y el aviso con enlace a demandas", async () => {
  const h = setup(); await h.start()
  assert.match(text(operationsLink(h.tree)), /Operaciones3/)
  assert.match(text(banner(h.tree)), /Hay 3 demandas abiertas sin ofertas registradas tras 24 h/)
  assert.ok(nodes(h.tree).some(node => node.props?.href === "/admin/operaciones#demandas-sin-oferta"))
})
await check("Un fallo conserva el último conteo y muestra indisponibilidad hasta recuperarse", async () => {
  const h = setup(); await h.start()
  h.response(async () => ({ ok: false, error: "Consulta fallida" })); await h.poll()
  assert.match(text(operationsLink(h.tree)), /Operaciones3/)
  assert.match(text(banner(h.tree)), /recuento puede estar desactualizado/)
  h.response(async () => { throw Error("Transporte fallido") }); await h.poll()
  assert.match(text(operationsLink(h.tree)), /Operaciones3/)
  assert.match(text(banner(h.tree)), /No se pudo comprobar/)
  h.response(async () => ({ ok: true, total: 0 })); await h.poll()
  assert.equal(text(operationsLink(h.tree)), "Operaciones")
  assert.equal(banner(h.tree), undefined)
})
await check("No se inicia el conteo sin sesión o sin permiso de administrador", async () => {
  for (const config of [{ user: null }, { administrator: false }]) {
    const h = setup(config); await h.start()
    assert.equal(h.calls.length, 0)
    assert.equal(h.tree, null)
  }
})
await check("Una respuesta tardía tras cerrar sesión no restaura datos de la cuenta anterior", async () => {
  const h = setup(); await h.start()
  const pending = deferred(); h.response(() => pending.promise); await h.poll()
  h.change("SIGNED_OUT", null)
  pending.resolve({ ok: true, total: 91 }); await h.flush()
  assert.equal(h.tree, null)
  assert.equal(h.routes.at(-1), "/auth/login")
  h.response(async () => ({ ok: true, total: 2 })); h.change("SIGNED_IN", "B"); await h.flush()
  assert.match(text(operationsLink(h.tree)), /Operaciones2/)
  assert.doesNotMatch(text(h.tree), /91/)
})
await check("El cambio de administrador invalida la respuesta de la sesión anterior", async () => {
  const h = setup(); await h.start()
  const old = deferred(); h.response(() => old.promise); await h.poll()
  h.response(async () => ({ ok: true, total: 6 })); h.change("SIGNED_IN", "B"); await h.flush()
  old.resolve({ ok: true, total: 84 }); await h.flush()
  assert.match(text(operationsLink(h.tree)), /Operaciones6/)
  assert.match(text(banner(h.tree)), /Hay 6 demandas/)
  assert.doesNotMatch(text(h.tree), /84/)
})
await check("Una respuesta antigua de polling no pisa el resultado más reciente", async () => {
  const h = setup(); await h.start()
  const old = deferred(); h.response(() => old.promise); await h.poll()
  h.response(async () => ({ ok: true, total: 5 })); await h.poll()
  old.resolve({ ok: true, total: 72 }); await h.flush()
  assert.match(text(operationsLink(h.tree)), /Operaciones5/)
  assert.doesNotMatch(text(h.tree), /72/)
})
console.log(`${checks} admin request-alert layout regressions passed`)
