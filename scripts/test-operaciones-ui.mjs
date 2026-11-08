// Real component hooks with synthetic transports. No browser, network or messages.
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"
import { createRequire } from "node:module"

const requireLocal = createRequire(import.meta.url)
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
function compile(file, dependencies = {}, fallback = requireLocal) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions }).outputText, {
    exports, Date, Intl, Set, Map, console,
    require: name => name in dependencies ? dependencies[name] : fallback(name),
  })
  return exports
}
const utils = compile("lib/utils.ts")
const catalog = compile("lib/operaciones-catalogo.ts")
const categories = Object.keys(catalog.CONTROLES_OPERATIVOS)
const NOW = "2026-11-08T12:00:00.000Z"
const oldDate = "2026-10-10T10:00:00.000Z"
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`
const eventRows = Array.from({ length: 63 }, (_, index) => ({ id: uuid(1000 + index), mensaje: `Evento de prueba ${index}`, severidad: "aviso", area: "sistema", codigo: "prueba", ocurrencias: 1, ultimo_evento_at: oldDate }))
const demandRows = [
  { id: uuid(1), titulo: "Reparar persiana", ubicacion: "Bilbao", created_at: oldDate, descripcion: "La persiana no sube.\nRevisar motor y cinta.", presupuesto_min: 120, presupuesto_max: 240, urgencia: "alta", fecha_necesaria: "2026-11-10", cliente_id: uuid(101), ofertas: [] },
  { id: uuid(2), titulo: "Pintar despacho", ubicacion: "Barcelona", created_at: oldDate, descripcion: null, presupuesto_min: null, presupuesto_max: null, urgencia: null, fecha_necesaria: null, cliente_id: null, ofertas: [] },
]
function summary(rows = {}, totals = {}) {
  const detalle = Object.fromEntries(categories.map(key => [key, rows[key] || []]))
  const totales = Object.fromEntries(categories.map(key => [key, totals[key] ?? detalle[key].length]))
  const technical = categories.filter(key => ["pagos", "avisos"].includes(catalog.CONTROLES_OPERATIVOS[key].grupo))
  const alertasTecnicas = technical.reduce((sum, key) => sum + totales[key], 0)
  const total = Object.values(totales).reduce((sum, value) => sum + value, 0)
  return { total, alertasTecnicas, alertasOperacion: total - alertasTecnicas, generadoAt: NOW, detalle, totales }
}
const paginatedSummary = () => summary({ eventos: eventRows.slice(0, 25) }, { eventos: 63 })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props?.children)]
const text = node => Array.isArray(node) ? node.map(text).join(" ") : node && typeof node === "object" ? text(node.props?.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""
const normalizedText = node => text(node).replace(/\s+/g, " ").trim()
const section = (tree, category) => nodes(tree).find(node => node.props?.id === catalog.anclaControl(category))
const articles = tree => nodes(tree).filter(node => node.type === "article")
function button(tree, label) {
  const found = nodes(tree).find(node => (node.type === "Button" || node.type === "button") && normalizedText(node) === label)
  assert.ok(found, `Missing button: ${label}`)
  return found
}
const errorMessage = tree => nodes(tree).filter(node => node.props?.role === "alert").map(text).join(" ")

function setup({ result = paginatedSummary(), handlers = {}, hash = "" } = {}) {
  let cursor = 0, dirty = false, mounted = false, tree = null, lateWrites = 0
  const slots = [], effects = [], toasts = [], scrolls = [], listeners = new Map()
  const calls = { summary: [], page: [], resolve: [], deadlines: [] }
  const responses = {
    summary: async () => ({ ok: true, data: result }),
    page: async (category, from) => ({ ok: true, data: { total: 63, filas: eventRows.slice(from, from + 25) } }),
    resolve: async () => ({ success: true }),
    deadlines: async () => ({ data: { revisados: 0, caducados: 0, recordatorios: 0, errores: [] } }),
    ...handlers,
  }
  const changed = (previous, next) => !previous || !next || previous.length !== next.length || next.some((value, i) => !Object.is(value, previous[i]))
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial }
      return [slots[index].value, updater => {
        if (!mounted) { lateWrites++; return }
        const value = typeof updater === "function" ? updater(slots[index].value) : updater
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true }
      }]
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial } },
    useMemo(fn, deps) { const index = cursor++; if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps) },
    useEffect(fn, deps) {
      const index = cursor++
      if (!slots[index] || changed(slots[index].deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.()
        slots[index] = { deps, cleanup: fn() }
      })
    },
  }
  const jsx = (type, props) => ({ type, props })
  const ui = new Proxy({ __esModule: true }, { get: (target, key) => key in target ? target[key] : String(key) })
  const action = key => (...args) => { calls[key].push(args); return responses[key](...args) }
  const translator = () => (key, params = {}) => key.replace(/\{([^}]+)\}/g, (_, name) => params[name] ?? `{${name}}`)
  let language = "es", translate = translator()
  const toast = value => toasts.push(value)
  const dependencies = {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "@/lib/i18n": { localeDe: () => "es-ES" }, "@/lib/utils": utils, "@/lib/operaciones-catalogo": catalog,
    "@/components/idioma-provider": { useIdioma: () => ({ idioma: language, t: translate }) },
    "@/hooks/use-toast": { useToast: () => ({ toast }) },
    "@/app/actions/operaciones": { obtenerEstadoOperativo: action("summary"), obtenerPaginaOperativa: action("page"), resolverEventoOperativo: action("resolve") },
    "@/app/actions/plazos-workflow": { revisarPlazosWorkflow: action("deadlines") },
  }
  // Evaluate the production row component while keeping the independently tested
  // overview panel inert, so this test never runs its separate data transport.
  const modules = new Map()
  const dependency = name => {
    if (name in dependencies) return dependencies[name]
    if (name.startsWith("@/components/admin/") && !name.includes("resumen")) {
      if (!modules.has(name)) modules.set(name, compile(`${name.slice(2)}.tsx`, dependencies, dependency))
      return modules.get(name)
    }
    return ui
  }
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/admin/operaciones/page.tsx", "utf8"), { compilerOptions }).outputText, {
    exports, Date, Intl, Set, Map, console, queueMicrotask,
    window: { location: { hash }, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name) } },
    document: { getElementById: id => ({ tagName: "DETAILS", open: false, scrollIntoView: options => scrolls.push({ id, options }) }) },
    require: dependency,
  })
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand)
    if (!node || typeof node !== "object") return node
    if (typeof node.type === "function") return expand(node.type(node.props))
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } }
  }
  function render() {
    if (!mounted) return
    cursor = 0; dirty = false
    tree = expand(exports.default())
    effects.splice(0).forEach(effect => effect())
  }
  async function flush() {
    for (let pass = 0; pass < 30; pass++) { if (dirty && mounted) render(); await Promise.resolve() }
    if (dirty && mounted) render()
  }
  return {
    calls, toasts, scrolls, listeners,
    get tree() { return tree }, get lateWrites() { return lateWrites },
    respond(key, fn) { responses[key] = fn },
    async language(value) { language = value; translate = translator(); dirty = true; await flush() },
    async start() { mounted = true; render(); await flush() },
    // Start a handler without awaiting transport resolution, then let hook updates commit.
    async trigger(node) { assert.equal(Boolean(node.props.disabled), false, "Only enabled controls can be clicked"); const pending = node.props.onClick(); await flush(); return { pending } },
    async click(node) { const pending = node.props.onClick(); await pending; await flush() },
    unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.() },
    flush,
  }
}

let checks = 0
async function check(name, fn) { await fn(); checks++; console.log("PASS", name) }

await check("initial loading only reads data and never resolves events or processes deadlines", async () => {
  const pending = deferred(), h = setup({ handlers: { summary: () => pending.promise } })
  await h.start()
  assert.equal(h.calls.summary.length, 1)
  assert.equal(h.calls.resolve.length, 0)
  assert.equal(h.calls.deadlines.length, 0)
  assert.doesNotMatch(text(h.tree), /No hay elementos|Sin casos pendientes|Sin señales detectadas|No hay demandas abiertas/)
  pending.resolve({ ok: true, data: summary() }); await h.flush()
  assert.equal(h.calls.resolve.length, 0)
  assert.equal(h.calls.deadlines.length, 0)
})

await check("all 15 controls retain their exact anchors even at zero", async () => {
  const h = setup({ result: summary(), hash: "#control-entregasSinRevisar" }); await h.start()
  assert.equal(categories.length, 15)
  for (const category of categories) {
    assert.ok(section(h.tree, category), `Missing zero-count anchor for ${category}`)
    assert.ok(text(section(h.tree, category)).includes(catalog.CONTROLES_OPERATIVOS[category].titulo))
  }
  assert.ok(h.scrolls.some(item => item.id === "control-entregasSinRevisar"))
  assert.equal(nodes(h.tree).filter(node => node.type === "pre").length, 0)
})

await check("returned and thrown first-load errors do not claim an all-clear and can recover", async () => {
  for (const failure of [async () => ({ ok: false, error: "Consulta fallida" }), async () => { throw Error("Synthetic transport failure") }]) {
    const h = setup({ handlers: { summary: failure } }); await h.start()
    assert.ok(errorMessage(h.tree))
    for (const category of categories) assert.ok(section(h.tree, category), `Missing unavailable-control anchor ${category}`)
    assert.doesNotMatch(text(h.tree), /No hay elementos fuera de SLA|Sin casos pendientes|Sin señales detectadas|No hay demandas abiertas/)
    h.respond("summary", async () => ({ ok: true, data: paginatedSummary() }))
    await h.click(button(h.tree, "Actualizar listas"))
    assert.ok(text(h.tree).includes(eventRows[0].mensaje))
    assert.equal(errorMessage(h.tree), "")
  }
})

await check("refresh failures preserve the last rows and label the observation as stale", async () => {
  const h = setup(); await h.start()
  for (const failure of [async () => ({ ok: false, error: "Consulta fallida" }), async () => { throw Error("Synthetic transport failure") }]) {
    h.respond("summary", failure); await h.click(button(h.tree, "Actualizar listas"))
    assert.ok(text(h.tree).includes(eventRows[0].mensaje))
    assert.ok(errorMessage(h.tree))
    assert.doesNotMatch(text(h.tree), /No hay elementos fuera de SLA|Sin casos pendientes|Sin señales detectadas|No hay demandas abiertas/)
    assert.equal(Boolean(button(h.tree, "Actualizar listas").props.disabled), false)
  }
})

await check("all 63 rows remain reachable through exact-count pagination", async () => {
  const h = setup(); await h.start()
  for (const from of [25, 50]) {
    await h.click(button(section(h.tree, "eventos"), "Cargar más"))
    assert.deepEqual(h.calls.page.at(-1), ["eventos", from])
  }
  for (const row of eventRows) assert.ok(text(section(h.tree, "eventos")).includes(row.mensaje))
  assert.equal(nodes(section(h.tree, "eventos")).some(node => normalizedText(node) === "Cargar más"), false)
})

await check("returned and thrown pagination errors retain rows and retry the same cursor", async () => {
  for (const failure of [async () => ({ ok: false, error: "Consulta fallida" }), async () => { throw Error("Synthetic transport failure") }]) {
    const h = setup({ handlers: { page: failure } }); await h.start()
    await h.click(button(section(h.tree, "eventos"), "Cargar más"))
    assert.ok(text(section(h.tree, "eventos")).includes(eventRows[0].mensaje))
    assert.equal(text(section(h.tree, "eventos")).includes(eventRows[25].mensaje), false)
    assert.ok(h.toasts.some(toast => toast.variant === "destructive"))
    h.respond("page", async () => ({ ok: true, data: { total: 63, filas: eventRows.slice(25, 50) } }))
    await h.click(button(section(h.tree, "eventos"), "Cargar más"))
    assert.deepEqual(h.calls.page.map(call => call[1]), [25, 25])
    assert.ok(text(section(h.tree, "eventos")).includes(eventRows[49].mensaje))
  }
})

await check("native demand disclosures retain exact fields, admin links and unknown values", async () => {
  const h = setup({ result: summary({ solicitudesSinOferta: demandRows }) }); await h.start()
  const area = section(h.tree, "solicitudesSinOferta"), rows = articles(area)
  assert.equal(rows.length, 2)
  assert.match(text(area), /Reparar persiana.*Bilbao.*Publicada el/)
  assert.doesNotMatch(text(area), /Madrid, abiertas|piloto de Madrid|"created_at"|"ofertas"/)
  for (const row of rows) {
    const detail = nodes(row).find(node => node.type === "details")
    assert.ok(detail)
    const children = [].concat(detail.props.children).filter(Boolean)
    assert.equal(children[0].type, "summary")
    assert.equal(text(children[0]), "Ver demanda")
    assert.equal(detail.props.open, undefined)
  }
  assert.match(text(rows[0]), /La persiana no sube\.\nRevisar motor y cinta\./)
  assert.match(text(rows[0]), /120€ - 240€/)
  assert.match(text(rows[0]), /Urgencia Alta/)
  const deadline = nodes(rows[0]).find(node => node.type === "time" && node.props.dateTime === "2026-11-10")
  assert.ok(deadline)
  assert.equal(text(deadline), new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeZone: "UTC" }).format(new Date("2026-11-10")))
  assert.ok(nodes(rows[0]).some(node => node.props?.href === `/admin/usuarios/${demandRows[0].cliente_id}`))
  assert.match(text(rows[1]), /Sin descripción/)
  assert.match(text(rows[1]), /Presupuesto A convenir/)
  assert.match(text(rows[1]), /Urgencia No indicada/)
  assert.doesNotMatch(text(rows[1]), /0€|Fecha necesaria|Ver cliente|Invalid Date/)
  assert.equal(nodes(rows[1]).filter(node => node.type === "time").length, 1)
  assert.equal(nodes(area).some(node => node.props?.href?.startsWith("/demandas")), false)
  for (const [urgencia, label] of [["baja", "Baja"], ["media", "Media"], ["alta", "Alta"], ["urgente", "Urgente"]]) {
    const one = setup({ result: summary({ solicitudesSinOferta: [{ ...demandRows[0], urgencia, presupuesto_min: null, presupuesto_max: 500 }] }) }); await one.start()
    assert.ok(nodes(section(one.tree, "solicitudesSinOferta")).some(node => node.type === "dd" && text(node) === label))
    assert.match(text(section(one.tree, "solicitudesSinOferta")), /Presupuesto Hasta 500€/)
  }
})

const controlFixtures = [
  { category: "eventos", row: eventRows[0], visible: eventRows[0].mensaje },
  { category: "webhooksError", row: { id: "evt_prueba_error", tipo: "payment_intent.succeeded", intentos: 3, ultimo_error: "Confirmación pendiente de revisión", ultimo_intento_at: oldDate }, visible: "evt_prueba_error" },
  { category: "webhooksAtascados", row: { id: "evt_prueba_demorado", tipo: "charge.refunded", intentos: 2, ultimo_intento_at: oldDate }, visible: "evt_prueba_demorado" },
  ...["liquidacionesError", "liquidacionesAtascadas", "reembolsosPendientes", "reembolsosPendientes"].map((category, index) => ({ category,
    row: { id: uuid(200 + index), trabajo_id: uuid(300 + index), cliente_id: uuid(101), profesional_id: uuid(102), estado: "liquidando", monto: 110, monto_reembolsado: 60, liquidacion_estado: index === 0 ? "error" : "procesando", liquidacion_error: index === 0 ? "Revisión del destino de cobro" : null, stripe_refund_id: `re_prueba_${index}`, stripe_refund_status: index === 3 ? "requires_action" : "pending", stripe_payment_intent_id: `pi_prueba_${index}`, stripe_charge_id: `ch_prueba_${index}`, created_at: oldDate, updated_at: oldDate, trabajo: { id: uuid(300 + index), titulo: `Trabajo pago ${index}` } },
    visible: `Trabajo pago ${index}`, href: `/admin/pagos?escrow=${uuid(200 + index)}`,
  })),
  ...["disputasVencidas", "contracargosPorResponder"].map((category, index) => ({ category,
    row: { id: uuid(400 + index), trabajo_id: uuid(500 + index), estado: "abierta", tipo: "cliente", origen: index ? "stripe" : "usuario", created_at: oldDate, stripe_disputa_id: index ? "dp_prueba_urgente" : null, stripe_disputa_estado: index ? "needs_response" : null, stripe_disputa_plazo: index ? "2026-11-09T12:00:00.000Z" : null, stripe_disputa_importe: index ? 11000 : null, stripe_disputa_moneda: index ? "eur" : null, contracargo_conciliacion: null, responsable_id: null, responsable: null, trabajo: { id: uuid(500 + index), titulo: `Trabajo disputa ${index}` } },
    visible: `Trabajo disputa ${index}`, href: `/admin/disputas?disputa=${uuid(400 + index)}`,
  })),
  { category: "solicitudesSinOferta", row: demandRows[0], visible: demandRows[0].titulo, href: `/admin/usuarios/${demandRows[0].cliente_id}` },
  ...["pagosSinCompletar", "entregasSinRevisar", "cancelacionesPendientes"].map((category, index) => ({ category,
    row: { id: uuid(600 + index), titulo: `Contrato pendiente ${index}`, estado: index === 0 ? "pendiente_pago" : index === 1 ? "entregado" : "en_progreso", cliente_id: uuid(101), profesional_id: uuid(102), precio_acordado: 100, created_at: oldDate, updated_at: oldDate, fecha_entrega: index === 1 ? oldDate : null, cancelacion_estado: index === 2 ? "pendiente" : null, cancelacion_solicitada_por: index === 2 ? uuid(101) : null, cancelacion_aceptada_por: null, pago_bloqueado: index === 2 },
    visible: `Contrato pendiente ${index}`, href: `/admin/pagos?trabajo=${uuid(600 + index)}`,
  })),
  ...["incidenciasCriticas", "incidenciasPendientes"].map((category, index) => ({ category,
    row: { id: uuid(700 + index), asunto: `Consulta de soporte ${index}`, categoria: "pago", prioridad: index ? "media" : "critica", estado: "abierta", reportado_por: uuid(101), trabajo_id: uuid(600), created_at: oldDate },
    visible: `Consulta de soporte ${index}`, href: `/admin/incidencias?incidencia=${uuid(700 + index)}`,
  })),
  { category: "verificacionesPendientes", row: { id: uuid(800), profesional_id: uuid(102), empresa_id: null, estado: "pendiente", solicitada_at: oldDate, actualizada_at: oldDate, profesional: { id: uuid(102), titulo: "Especialista de prueba" } }, visible: "Especialista de prueba", href: "/admin/verificaciones" },
]
assert.equal(controlFixtures.length, 16)
for (const [index, fixture] of controlFixtures.entries()) {
  await check(`readable signal ${index + 1}/16: ${fixture.category}`, async () => {
    const h = setup({ result: summary({ [fixture.category]: [fixture.row] }) }); await h.start()
    const area = section(h.tree, fixture.category)
    assert.ok(area)
    assert.ok(text(area).includes(fixture.visible), `Missing useful display for ${fixture.category}`)
    assert.equal(nodes(area).some(node => node.type === "pre"), false)
    assert.doesNotMatch(text(area), /"(?:trabajo_id|stripe_refund_status|cliente_id|created_at)"\s*:/)
    if (fixture.href) assert.ok(nodes(area).some(node => node.props?.href === fixture.href), `Missing exact admin link ${fixture.href}`)
    for (const node of nodes(area)) {
      const href = node.props?.href
      if (typeof href === "string" && href.startsWith("/")) assert.ok(href.startsWith("/admin/"), `Unexpected public destination ${href}`)
    }
    if (fixture.category === "cancelacionesPendientes") {
      assert.match(text(area), /Última actualización/)
      assert.doesNotMatch(text(area), /Fecha de solicitud/)
    }
    assert.equal(h.calls.resolve.length, 0)
    assert.equal(h.calls.deadlines.length, 0)
  })
}

await check("an older refresh cannot overwrite the latest response", async () => {
  const h = setup(); await h.start()
  const first = deferred(), second = deferred()
  let request = 0
  h.respond("summary", () => (++request === 1 ? first.promise : second.promise))
  // Both events can enter before React commits the disabled state.
  const refresh = button(h.tree, "Actualizar listas")
  const pendingA = refresh.props.onClick(), pendingB = refresh.props.onClick()
  await h.flush()
  second.resolve({ ok: true, data: summary({ eventos: [{ ...eventRows[0], mensaje: "Respuesta más reciente" }] }) }); await h.flush()
  first.resolve({ ok: true, data: summary({ eventos: [{ ...eventRows[0], mensaje: "Respuesta obsoleta" }] }) })
  await Promise.all([pendingA, pendingB]); await h.flush()
  assert.match(text(h.tree), /Respuesta más reciente/)
  assert.doesNotMatch(text(h.tree), /Respuesta obsoleta/)
})

await check("a delayed page cannot append stale rows after a newer refresh", async () => {
  const h = setup(); await h.start()
  const page = deferred()
  h.respond("page", () => page.promise)
  h.respond("summary", async () => ({ ok: true, data: summary({ eventos: [{ ...eventRows[0], mensaje: "Control actualizado" }] }) }))
  const next = button(section(h.tree, "eventos"), "Cargar más"), refresh = button(h.tree, "Actualizar listas")
  const pending = next.props.onClick()
  await refresh.props.onClick(); await h.flush()
  page.resolve({ ok: true, data: { total: 63, filas: eventRows.slice(25, 50) } }); await pending; await h.flush()
  assert.match(text(h.tree), /Control actualizado/)
  assert.equal(text(h.tree).includes(eventRows[25].mensaje), false)
  assert.equal(nodes(section(h.tree, "eventos")).some(node => normalizedText(node) === "Cargar más"), false)
})

await check("duplicate page events do not duplicate rows", async () => {
  const h = setup(); await h.start()
  const first = deferred(), second = deferred()
  let request = 0
  h.respond("page", () => (++request === 1 ? first.promise : second.promise))
  const next = button(section(h.tree, "eventos"), "Cargar más")
  const pendingA = next.props.onClick(), pendingB = next.props.onClick()
  await h.flush()
  second.resolve({ ok: true, data: { total: 63, filas: eventRows.slice(25, 50) } }); await h.flush()
  first.resolve({ ok: true, data: { total: 63, filas: eventRows.slice(25, 50) } })
  await Promise.all([pendingA, pendingB]); await h.flush()
  const rendered = articles(section(h.tree, "eventos"))
  assert.equal(rendered.filter(row => text(row).includes(eventRows[25].mensaje)).length, 1)
})

await check("reads and manual actions cannot update an unmounted screen", async () => {
  for (const operation of ["summary", "page", "resolve", "deadlines"]) {
    const pending = deferred(), h = setup(operation === "summary" ? { handlers: { summary: () => pending.promise } } : {})
    await h.start()
    let task
    if (operation !== "summary") {
      h.respond(operation, () => pending.promise)
      const control = operation === "page" ? button(section(h.tree, "eventos"), "Cargar más") : operation === "resolve" ? button(section(h.tree, "eventos"), "Marcar resuelto") : button(h.tree, "Procesar plazos vencidos")
      task = control.props.onClick(); await h.flush()
    }
    h.unmount()
    const beforeToasts = h.toasts.length, beforeReads = h.calls.summary.length
    pending.resolve(operation === "summary" ? { ok: true, data: summary() } : operation === "page" ? { ok: false, error: "Late failure" } : operation === "resolve" ? { success: true } : { data: { caducados: 1, recordatorios: 0, errores: [] } })
    await task; await h.flush()
    assert.equal(h.listeners.size, 0, "Hash listeners were removed on cleanup")
    assert.equal(h.lateWrites, 0, `${operation} wrote state after cleanup`)
    assert.equal(h.toasts.length, beforeToasts, `${operation} displayed a toast after cleanup`)
    assert.equal(h.calls.summary.length, beforeReads, `${operation} refreshed the screen after cleanup`)
  }
})

await check("event resolution is manual and failures keep the action retryable", async () => {
  const h = setup(); await h.start()
  assert.equal(h.calls.resolve.length, 0)
  for (const failure of [async () => ({ error: "No se pudo resolver el evento" }), async () => { throw Error("Transport failure") }]) {
    h.respond("resolve", failure)
    await h.click(button(section(h.tree, "eventos"), "Marcar resuelto"))
    assert.ok(h.toasts.some(item => item.title === "No se pudo resolver"))
    assert.equal(Boolean(button(section(h.tree, "eventos"), "Marcar resuelto").props.disabled), false)
  }
  h.respond("resolve", async () => ({ success: true }))
  const reads = h.calls.summary.length
  await h.click(button(section(h.tree, "eventos"), "Marcar resuelto"))
  assert.deepEqual(h.calls.resolve.at(-1), [eventRows[0].id])
  assert.ok(h.calls.summary.length > reads)
})

await check("deadline processing only runs on click and recovers after failure", async () => {
  const h = setup(); await h.start()
  assert.equal(h.calls.deadlines.length, 0)
  h.respond("deadlines", async () => { throw Error("Synthetic deadline failure") })
  await h.click(button(h.tree, "Procesar plazos vencidos"))
  assert.equal(h.calls.deadlines.length, 1)
  assert.equal(Boolean(button(h.tree, "Procesar plazos vencidos").props.disabled), false)
  assert.ok(h.toasts.some(item => item.variant === "destructive"))
  h.respond("deadlines", async () => ({ data: { revisados: 1, caducados: 0, recordatorios: 1, errores: [] } }))
  await h.click(button(h.tree, "Procesar plazos vencidos"))
  assert.equal(h.calls.deadlines.length, 2)
  assert.ok(h.toasts.some(item => item.title === "Plazos revisados"))
})

await check("authorization failures clear previous data instead of displaying stale privileged rows", async () => {
  for (const operation of ["summary", "page"]) {
    for (const codigo of ["NO_AUTENTICADO", "SIN_PERMISO"]) {
      const h = setup(); await h.start()
      h.respond(operation, async () => ({ ok: false, codigo, error: "No tienes permiso para acceder a operaciones." }))
      const control = operation === "summary" ? button(h.tree, "Actualizar listas") : button(section(h.tree, "eventos"), "Cargar más")
      await h.click(control)
      assert.equal(text(h.tree).includes(eventRows[0].mensaje), false, `${operation}/${codigo} retained private rows`)
      assert.match(errorMessage(h.tree), /No tienes permiso/)
      assert.doesNotMatch(text(h.tree), /Dato anterior|Sin señales detectadas/)
      for (const category of categories) assert.ok(section(h.tree, category))
    }
  }
})

await check("a language change during a manual action does not leave actions permanently locked", async () => {
  for (const operation of ["resolve", "deadlines"]) {
    const h = setup(); await h.start()
    const pending = deferred()
    h.respond(operation, () => pending.promise)
    const label = operation === "resolve" ? "Marcar resuelto" : "Procesar plazos vencidos"
    const control = button(operation === "resolve" ? section(h.tree, "eventos") : h.tree, label)
    control.props.onClick(); await h.flush()
    await h.language("en")
    pending.resolve({ error: "Revisión temporalmente indisponible" })
    await h.flush()
    const retry = button(operation === "resolve" ? section(h.tree, "eventos") : h.tree, label)
    assert.equal(Boolean(retry.props.disabled), false, `${operation} stayed locked after changing language`)
    h.respond(operation, async () => operation === "resolve" ? { success: true } : { data: { caducados: 0, recordatorios: 0, errores: [] } })
    await h.click(retry)
    assert.equal(h.calls[operation].length, 2)
  }
})

console.log(`${checks} operational UI regressions passed`)
