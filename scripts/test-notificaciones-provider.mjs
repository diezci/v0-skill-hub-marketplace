import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const codigo = ts.transpileModule(fs.readFileSync("hooks/use-notificaciones-seccion.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const diferido = () => {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
const resumen = (...ids) => ({
  notificaciones: ids.map(id => ({ id, seccion: "/mis-trabajos", leida: false })),
  noLeidas: ids.length, mensajesNoLeidos: 0, porSeccion: ids.length ? { "/mis-trabajos": ids.length } : {}, ultimoMensajeNoLeido: null,
})
const perfil = id => ({ data: { user: id ? { id } : null } })

// Run the real provider with deterministic hooks and controllable server/auth
// promises. Requests resolve in adversarial order; no network/account writes.
function montar() {
  let cursor = 0, dirty = false, desactivado = false, value, authCallback
  const slots = [], pendingEffects = [], listeners = new Map(), intervals = new Map()
  const iniciales = [], lecturas = [], marcados = []
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const hooks = {
    createContext: initial => ({ Provider: "Provider", initial }),
    useContext: () => value,
    useState(initial) {
      const i = cursor++
      if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial }
      return [slots[i].value, updater => {
        const next = typeof updater === "function" ? updater(slots[i].value) : updater
        if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true }
      }]
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial } },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps) },
    useMemo(fn, deps) {
      const i = cursor++
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }
      return slots[i].value
    },
    useEffect(fn, deps) {
      const i = cursor++
      if (!slots[i] || !same(slots[i].deps, deps)) pendingEffects.push(() => {
        slots[i]?.cleanup?.()
        slots[i] = { deps, cleanup: fn() }
      })
    },
  }
  const escuchar = (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) }
  const dejar = (name, fn) => listeners.get(name)?.delete(fn)
  const emitir = name => { for (const fn of listeners.get(name) || []) fn() }
  const supabase = { auth: {
    getUser: () => { const d = diferido(); iniciales.push(d); return d.promise },
    onAuthStateChange: fn => { authCallback = fn; return { data: { subscription: { unsubscribe() { if (authCallback === fn) authCallback = null } } } } },
  } }
  const module = { exports: {} }
  const dependencias = {
    react: hooks,
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "@/app/actions/notificaciones": {
      obtenerResumenNotificaciones: () => { const d = diferido(); lecturas.push(d); return d.promise },
      marcarNotificacionesLeidasPorIds: ids => { const d = diferido(); marcados.push({ ...d, ids }); return d.promise },
    },
    "@/lib/notificaciones-contexto": { avisoPerteneceAEntidad: () => true },
    "@/lib/supabase/client": { createClient: () => supabase },
    "@/hooks/use-toast": { useToast: () => ({ toast() {} }) },
    "@/components/idioma-provider": { useT: () => texto => texto },
  }
  vm.runInNewContext(codigo, {
    module, exports: module.exports, console, queueMicrotask,
    CustomEvent: class { constructor(type) { this.type = type } },
    clearInterval: id => intervals.delete(id),
    window: {
      addEventListener: escuchar, removeEventListener: dejar,
      dispatchEvent: event => emitir(event.type),
      setInterval: fn => { const id = intervals.size + 1; intervals.set(id, fn); return id },
    },
    document: { visibilityState: "visible", addEventListener: escuchar, removeEventListener: dejar },
    require: nombre => { if (!(nombre in dependencias)) throw Error(nombre); return dependencias[nombre] },
  })
  function render() {
    dirty = false; cursor = 0
    value = module.exports.NotificacionesProvider({ children: null, desactivado }).props.value
    pendingEffects.splice(0).forEach(fn => fn())
  }
  async function flush() { for (let i = 0; i < 10; i++) { await Promise.resolve(); if (dirty) render() } }
  render()
  return {
    iniciales, lecturas, marcados, flush, emitir,
    get value() { return value },
    auth(id) { authCallback?.(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id } } : null) },
    desactivar(valor) { desactivado = valor; render() },
    desmontar() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}

let casos = 0
async function prueba(nombre, fn) { await fn(); casos++; console.log(`PASS ${nombre}`) }
async function conectado(ids = ["A-1", "A-2"]) {
  const h = montar()
  h.iniciales[0].resolve(perfil("A")); await h.flush()
  h.lecturas[0].resolve(resumen(...ids)); await h.flush()
  return h
}
const ids = h => h.value.resumen.notificaciones.map(n => n.id).join(",")

await prueba("Un auth inicial tardío no restaura una cuenta anterior", async () => {
  const h = montar()
  h.auth("B"); await h.flush()
  h.lecturas[0].resolve(resumen("B-1")); await h.flush()
  h.iniciales[0].resolve(perfil("A")); await h.flush()
  assert.equal(ids(h), "B-1")
  assert.equal(h.value.usuarioId, "B")
  assert.equal(h.lecturas.length, 1)
  h.desmontar()
})

await prueba("La identidad cambia aunque ambas cuentas todavía tengan resúmenes vacíos", async () => {
  const h = montar()
  h.auth("A"); await h.flush()
  assert.equal(h.value.usuarioId, "A")
  h.auth("B"); await h.flush()
  assert.equal(h.value.usuarioId, "B")
  assert.equal(ids(h), "")
  h.auth(null); await h.flush()
  assert.equal(h.value.usuarioId, null)
  h.desmontar()
})

await prueba("Cambiar A a B descarta la respuesta A y no desbloquea la consulta B", async () => {
  const h = await conectado()
  const vieja = h.value.recargar()
  h.auth("B"); await h.flush()
  assert.equal(ids(h), "")
  assert.equal(h.value.cargando, true)
  h.lecturas[1].resolve(resumen("A-privado")); await vieja; await h.flush()
  assert.equal(ids(h), "")
  h.emitir("focus"); await h.flush()
  assert.equal(h.lecturas.length, 3, "Old finally must not unlock the new account's request")
  h.lecturas[2].resolve(resumen("B-1")); await h.flush()
  assert.equal(ids(h), "B-1")
  h.desmontar()
})

await prueba("Logout invalida una lectura ya resuelta antes de procesar su microtarea", async () => {
  const h = await conectado()
  const vieja = h.value.recargar()
  h.lecturas[1].resolve(resumen("A-privado"))
  h.auth(null)
  await vieja; await h.flush()
  assert.equal(ids(h), "")
  assert.equal(h.value.cargando, false)
  assert.equal(await h.value.marcarLeidas(["A-1"]), false)
  assert.equal(h.marcados.length, 0)
  h.desmontar()
})

await prueba("Un resumen viejo no resucita un aviso marcado como leído", async () => {
  const h = await conectado()
  const vieja = h.value.recargar()
  const marcar = h.value.marcarLeidas(["A-1"])
  h.marcados[0].resolve({ success: true }); assert.equal(await marcar, true); await h.flush()
  assert.equal(ids(h), "A-2")
  h.lecturas[1].resolve(resumen("A-1", "A-2")); await vieja; await h.flush()
  assert.equal(ids(h), "A-2")
  h.lecturas[2].resolve(resumen("A-2")); await h.flush()
  assert.equal(h.value.resumen.noLeidas, 1)
  assert.equal(h.value.resumen.porSeccion["/mis-trabajos"], 1)
  h.desmontar()
})

await prueba("Dos marcados simultáneos se aplican sin confundirse con cambios de sesión", async () => {
  const h = await conectado()
  const uno = h.value.marcarLeidas(["A-1"]), dos = h.value.marcarLeidas(["A-2"])
  h.marcados[1].resolve({ success: true }); assert.equal(await dos, true); await h.flush()
  h.marcados[0].resolve({ success: true }); assert.equal(await uno, true); await h.flush()
  assert.equal(ids(h), "")
  h.lecturas[1].resolve(resumen("A-1")); await h.flush()
  assert.equal(ids(h), "", "The refresh started between both mutations is obsolete")
  h.lecturas[2].resolve(resumen()); await h.flush()
  assert.equal(h.value.error, "")
  h.desmontar()
})

await prueba("Un marcado de A finalizado después del cambio a B no toca B", async () => {
  const h = await conectado()
  const marcar = h.value.marcarLeidas(["A-1"])
  h.auth("B"); await h.flush()
  h.lecturas[1].resolve(resumen("B-1")); await h.flush()
  h.marcados[0].resolve({ success: true }); assert.equal(await marcar, false); await h.flush()
  assert.equal(ids(h), "B-1")
  assert.equal(h.value.error, "")
  h.desmontar()
})

await prueba("Una lectura fallida conserva avisos y permite reintentar", async () => {
  const h = await conectado()
  const marcar = h.value.marcarLeidas(["A-1"])
  h.marcados[0].reject(Error("sin red")); assert.equal(await marcar, false); await h.flush()
  assert.equal(ids(h), "A-1,A-2")
  assert.ok(h.value.error)
  const reintento = h.value.marcarLeidas(["A-1"])
  h.marcados[1].resolve({ success: true }); assert.equal(await reintento, true); await h.flush()
  assert.equal(ids(h), "A-2")
  h.desmontar()
})

await prueba("Desactivar limpia la cuenta y bloquea respuestas antiguas", async () => {
  const h = await conectado()
  const vieja = h.value.recargar()
  h.desactivar(true); await h.flush()
  assert.equal(ids(h), "")
  assert.equal(h.value.cargando, false)
  h.lecturas[1].resolve(resumen("A-privado")); await vieja; await h.flush()
  assert.equal(ids(h), "")
  h.desactivar(false); await h.flush()
  h.iniciales[1].resolve(perfil("B")); await h.flush()
  h.lecturas[2].resolve(resumen("B-1")); await h.flush()
  assert.equal(ids(h), "B-1")
  h.desmontar()
})

console.log(`${casos} escenarios de concurrencia del provider verificados, sin red ni escrituras reales.`)
