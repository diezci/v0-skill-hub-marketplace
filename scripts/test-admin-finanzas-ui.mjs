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
const { formatearPrecio } = loadLocal("lib/comisiones.ts")
const jsx = (type, props) => ({ type, props })
const ui = new Proxy({ __esModule: true }, { get: (object, key) => key in object ? object[key] : String(key) })
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props?.children)]
const text = node => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const euro = (cents, language = "es") => new Intl.NumberFormat(localeDe(language), { style: "currency", currency: "EUR" }).format(cents / 100)
const sample = overrides => ({
  brutoCentimos: 2400, gastosStripeCentimos: 183, netoCentimos: 2217,
  pendientesConciliar: 0, modoReal: true, avisos: [], otrasMonedas: [],
  actualizadoEn: "2026-11-06T10:00:00.000Z", ultimosCobros: [], ...overrides,
})

function harness({ language = "es", showCollections = false } = {}) {
  let cursor = 0, dirty = false, tree, mounted = true, writesAfterUnmount = 0
  let response = () => Promise.resolve({ data: sample() })
  const slots = [], pendingEffects = [], calls = []
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
    "@/lib/comisiones": { formatearPrecio },
    "@/app/actions/admin-finanzas": { obtenerResumenFinanzasAdmin() { calls.push(true); return response() } },
  }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, "components/admin/resumen-comisiones.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Intl, Date, encodeURIComponent, require: name => dependencies[name] || ui })
  function render() {
    dirty = false; cursor = 0
    tree = exports.ResumenComisiones({ mostrarCobros: showCollections })
    pendingEffects.splice(0).forEach(effect => effect())
  }
  async function flush() {
    for (let i = 0; i < 20; i++) { if (mounted && dirty) render(); await Promise.resolve() }
    if (mounted && dirty) render()
  }
  const refreshButton = () => nodes(tree).find(node => node.props?.["aria-label"] === traducir(language, "Actualizar comisiones"))
  return {
    calls,
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
const metrics = tree => nodes(tree).filter(node => node.type === "dd").map(text)
let checks = 0
async function check(name, fn) { await fn(); checks++; console.log("PASS", name) }

await check("Loading announces progress and shows dashes instead of fabricated zero commissions", async () => {
  const h = harness(), pending = deferred(); h.response(() => pending.promise); await h.start()
  assert.deepEqual(metrics(h.tree), ["—", "—", "—"])
  assert.equal(h.tree.props["aria-busy"], true)
  assert.equal(h.refreshButton().props.disabled, true)
  assert.match(text(nodes(h.tree).find(node => node.props?.role === "status")), /Consultando comisiones/)
  assert.doesNotMatch(text(h.tree), /Pagos reales|Modo de prueba|No hay comisiones cobradas/)
  pending.resolve({ data: sample() }); await h.flush()
})

await check("Gross, Stripe costs and net preserve their cent amounts and two-decimal EUR display", async () => {
  const h = harness(); await h.start()
  assert.deepEqual(metrics(h.tree), [euro(2400), euro(183), euro(2217)])
  assert.equal(h.tree.props["aria-busy"], false)
  assert.equal(h.refreshButton().props.disabled, false)
  assert.match(text(h.tree), /Pagos reales/)
  assert.match(text(h.tree), /IVA incluido.*gastos contabilizados en el saldo de Stripe/)
  const updated = nodes(h.tree).find(node => node.type === "time")
  assert.equal(updated.props.dateTime, sample().actualizadoEn)
  assert.match(text(updated), /11:00/)
})

await check("A negative net amount remains negative rather than being clamped to zero", async () => {
  const h = harness(); h.response(async () => ({ data: sample({ gastosStripeCentimos: 3725, netoCentimos: -1325 }) })); await h.start()
  assert.deepEqual(metrics(h.tree), [euro(2400), euro(3725), euro(-1325)])
})

await check("A verified zero is distinct from unknown or pending values", async () => {
  const h = harness(); h.response(async () => ({ data: sample({ brutoCentimos: 0, gastosStripeCentimos: 0, netoCentimos: 0 }) })); await h.start()
  assert.deepEqual(metrics(h.tree), [euro(0), euro(0), euro(0)])
  h.response(async () => ({ data: sample({ brutoCentimos: null, gastosStripeCentimos: 183, netoCentimos: null, pendientesConciliar: 2 }) })); await h.refresh()
  assert.deepEqual(metrics(h.tree), ["—", euro(183), "—"])
  assert.match(text(h.tree), /2 pagos pendientes de conciliar.*total y el neto se mostrarán cuando estén verificados/)
  h.response(async () => ({ data: sample({ brutoCentimos: 2400, gastosStripeCentimos: null, netoCentimos: null, avisos: ["Gastos de Stripe pendientes de verificar."] }) })); await h.refresh()
  assert.deepEqual(metrics(h.tree), [euro(2400), "—", "—"])
  assert.match(text(h.tree), /Gastos de Stripe pendientes de verificar/)
})

await check("Returned errors clear the figures, announce the failure and retain an available retry", async () => {
  const h = harness(); await h.start()
  const pending = deferred(); h.response(() => pending.promise); await h.refresh()
  assert.deepEqual(metrics(h.tree), ["—", "—", "—"])
  pending.resolve({ error: "No se pudo cargar el resumen de comisiones." }); await h.flush()
  assert.deepEqual(metrics(h.tree), ["—", "—", "—"])
  assert.match(text(nodes(h.tree).find(node => node.props?.role === "alert")), /No se pudo cargar/)
  assert.equal(h.refreshButton().props.disabled, false)
  h.response(async () => ({ data: sample() })); await h.refresh()
  assert.deepEqual(metrics(h.tree), [euro(2400), euro(183), euro(2217)])
  assert.equal(nodes(h.tree).some(node => node.props?.role === "alert"), false)
})

await check("A rejected transport never produces a false zero or leaves refresh blocked", async () => {
  const h = harness(); h.response(async () => { throw Error("Synthetic interruption") }); await h.start()
  assert.deepEqual(metrics(h.tree), ["—", "—", "—"])
  assert.match(text(nodes(h.tree).find(node => node.props?.role === "alert")), /No se pudo cargar/)
  assert.equal(h.tree.props["aria-busy"], false)
  assert.equal(h.refreshButton().props.disabled, false)
})

await check("Test mode and excluded currencies remain visible with fully translated English labels", async () => {
  const h = harness({ language: "en" }); h.response(async () => ({ data: sample({ modoReal: false, otrasMonedas: ["usd", "gbp"], pendientesConciliar: 3, brutoCentimos: null, netoCentimos: null }) })); await h.start()
  assert.equal(h.tree.props["aria-label"], "Diime fees")
  assert.match(text(h.tree), /Test mode/)
  assert.match(text(h.tree), /Gross commission.*Stripe costs.*Net after Stripe/)
  assert.match(text(h.tree), /Commissions from settled payments, including VAT/)
  assert.match(text(h.tree), /3 payments awaiting reconciliation/)
  assert.match(text(h.tree), /Currencies excluded from the euro summary.*USD, GBP/)
  assert.doesNotMatch(text(h.tree), /Pagos reales|Comisiones de pagos|pendientes de conciliar/)
  assert.deepEqual(metrics(h.tree), ["—", euro(183, "en"), "—"])
})

await check("An earlier refresh cannot overwrite the latest figures or finish its pending loading state", async () => {
  const h = harness(); await h.start()
  const older = deferred(), latest = deferred()
  h.response(() => older.promise); await h.refresh()
  h.response(() => latest.promise); await h.refresh()
  older.resolve({ data: sample({ brutoCentimos: 9900 }) }); await h.flush()
  assert.deepEqual(metrics(h.tree), ["—", "—", "—"])
  assert.equal(h.tree.props["aria-busy"], true)
  latest.resolve({ data: sample({ brutoCentimos: 4000, netoCentimos: 3817 }) }); await h.flush()
  assert.deepEqual(metrics(h.tree), [euro(4000), euro(183), euro(3817)])
  assert.equal(h.tree.props["aria-busy"], false)
})

await check("An old failure after a newer success cannot replace current figures with an error", async () => {
  const h = harness(); await h.start()
  const older = deferred(); h.response(() => older.promise); await h.refresh()
  h.response(async () => ({ data: sample({ brutoCentimos: 7000, netoCentimos: 6817 }) })); await h.refresh()
  older.reject(Error("Stale transport")); await h.flush()
  assert.deepEqual(metrics(h.tree), [euro(7000), euro(183), euro(6817)])
  assert.equal(nodes(h.tree).some(node => node.props?.role === "alert"), false)
})

await check("Unmount ignores both successful and rejected late responses, including their finalizers", async () => {
  for (const outcome of ["resolve", "reject"]) {
    const h = harness(), pending = deferred(); h.response(() => pending.promise); await h.start(); h.unmount()
    pending[outcome](outcome === "resolve" ? { data: sample() } : Error("Unmounted transport")); await h.flush()
    assert.equal(h.writesAfterUnmount, 0)
  }
})

await check("Latest collections expose exact payment links, dates and amounts only when requested", async () => {
  const latest = [
    { id: "00000000-0000-4000-8000-000000000001", titulo: "Reparación de prueba", importeCentimos: 2400, fecha: "2026-11-05T23:30:00.000Z" },
    { id: "fixture&reserved/id", titulo: "Otra comisión de prueba", importeCentimos: 350, fecha: null },
  ]
  const h = harness({ showCollections: true }); h.response(async () => ({ data: sample({ ultimosCobros: latest }) })); await h.start()
  const links = nodes(h.tree).filter(node => node.props?.href?.startsWith("/admin/pagos?escrow="))
  assert.equal(links.length, 2)
  latest.forEach((collection, i) => {
    assert.equal(links[i].props.href, `/admin/pagos?escrow=${encodeURIComponent(collection.id)}`)
    assert.ok(text(links[i]).includes(collection.titulo))
    assert.ok(text(links[i]).includes(euro(collection.importeCentimos)))
  })
  assert.match(text(links[0]), /6\/11\/26/)
  assert.equal(nodes(links[1]).filter(node => node.type === "time").length, 0)
  const payments = harness(); payments.response(async () => ({ data: sample({ ultimosCobros: latest }) })); await payments.start()
  assert.doesNotMatch(text(payments.tree), /Últimos cobros|Reparación de prueba/)
})

await check("An empty verified history is explicit and does not invent collection links", async () => {
  const h = harness({ showCollections: true }); await h.start()
  assert.match(text(h.tree), /No hay comisiones cobradas verificadas/)
  assert.equal(nodes(h.tree).some(node => node.props?.href?.startsWith("/admin/pagos?escrow=")), false)
})

await check("An unverified collection history is not presented as a confirmed empty history", async () => {
  for (const language of ["es", "en"]) {
    const h = harness({ showCollections: true, language })
    h.response(async () => ({ data: sample({ brutoCentimos: null, netoCentimos: null, pendientesConciliar: 2, ultimosCobros: [] }) }))
    await h.start()
    assert.ok(text(h.tree).includes(traducir(language, "Últimos cobros")))
    assert.equal(text(h.tree).includes(traducir(language, "No hay comisiones cobradas verificadas.")), false)
    assert.ok(text(h.tree).includes(traducir(language, "Los últimos cobros están pendientes de verificación.")))
    if (language === "en") assert.doesNotMatch(text(h.tree), /Los últimos cobros están pendientes de verificación/)
    assert.equal(nodes(h.tree).some(node => node.props?.href?.startsWith("/admin/pagos?escrow=")), false)
  }
})

await check("The dashboard mounts the shared commission summary with its latest collections enabled", async () => {
  const exports = {}, component = "ResumenComisionesFixture"
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, "app/admin/page.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, console,
    require(name) {
      if (name === "react") return { useState: initial => [initial, () => {}], useEffect() {} }
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }
      if (name === "@/components/admin/resumen-comisiones") return { ResumenComisiones: component }
      if (name === "@/components/idioma-provider") return { useIdioma: () => ({ idioma: "es", t: (key, params) => traducir("es", key, params) }) }
      if (name === "@/lib/supabase/client") return { createClient: () => ({ from() { throw Error("No remote data in a component wiring test") } }) }
      if (name === "@/lib/comisiones") return { formatearPrecio }
      return ui
    },
  })
  const summaries = nodes(exports.default()).filter(node => node.type === component)
  assert.equal(summaries.length, 1)
  assert.equal(summaries[0].props.mostrarCobros, true)
})

console.log(`${checks} admin finance UI regressions passed`)
