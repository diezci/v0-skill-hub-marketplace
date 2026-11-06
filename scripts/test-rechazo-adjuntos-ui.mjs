import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import vm from "node:vm"
import ts from "typescript"

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
const jsx = (type, props) => ({ type, props })
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === "object" ? [node, ...walk(node.props?.children)] : []
const text = node => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : String(node ?? "")
const ui = new Proxy({ __esModule: true }, { get: (target, name) => name in target ? target[name] : String(name) })
const t = (key, vars = {}) => key.replace(/\{(\w+)\}/g, (_, key) => vars[key])

function load(source, dependencies) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module, exports: module.exports, URL, Date, Intl, URLSearchParams,
    window: { dispatchEvent() {} }, CustomEvent: class {},
    require(name) { return dependencies[name] || ui },
  })
  return module.exports
}

function formFixture(file, name, { initial = {}, props = {}, result = { success: true }, throws = false } = {}) {
  const source = read(file)
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const stateNames = []
  function collectStates(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)
      && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useState") {
      stateNames.push(node.name.elements[0].name.getText(ast))
    }
    ts.forEachChild(node, collectStates)
  }
  collectStates(ast)
  const states = { ...initial }, calls = [], toasts = [], transitions = []
  let index = 0, transitionPending = false
  const hooks = {
    useState(value) {
      const key = stateNames[index++]
      assert.ok(key, "Every stateful hook must have a named state")
      if (!(key in states)) states[key] = typeof value === "function" ? value() : value
      return [states[key], next => { states[key] = typeof next === "function" ? next(states[key]) : next }]
    },
    useRef: value => ({ current: value }), useEffect() {}, useMemo: fn => fn(),
    useTransition: () => [transitionPending, callback => {
      transitionPending = true
      transitions.push(Promise.resolve().then(callback).finally(() => { transitionPending = false }))
    }],
  }
  const deps = {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/components/idioma-provider": { useIdioma: () => ({ t, idioma: "es" }), useT: () => t },
    "@/lib/i18n": { localeDe: () => "es-ES" },
    "@/hooks/use-toast": { useToast: () => ({ toast: message => toasts.push(message) }) },
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "@/hooks/use-notificaciones-seccion": { useNotificacionesSeccion: () => ({ paraEntidad: () => [], marcarLeidas() {} }) },
    "@/hooks/use-destino-notificacion": { useDestinoNotificacion() {} },
    "@/lib/urgencias": { URGENCIAS: [], fechaHoyEnEspana: () => "2026-11-06" },
    "@/lib/comisiones": { PLATFORM_CONFIG: {}, calcularTotalCliente: () => ({}) },
    "@/lib/utils": { formatearPrecioEuros: value => String(value || 0), formatearRangoPresupuesto: () => "" },
    "@/app/actions/disputes": { rechazarEntrega: async (...args) => { calls.push(args); if (throws) throw Error("synthetic network interruption"); return result } },
    "@/app/actions/trabajos": { obtenerMisTrabajos: async () => ({ data: [] }) },
    "@/app/actions/solicitudes": { obtenerSolicitudesPorUsuario: async () => ({ data: [] }) },
  }
  const exports = load(`${source}\nexport { ${name} as TestedComponent }`, deps)
  return {
    states, calls, toasts,
    render() { index = 0; const root = exports.TestedComponent(props); return { root, nodes: walk(root) } },
    async settle() { await Promise.all(transitions) },
  }
}

const fileUrl = "https://diime.example/api/archivos/12345678-1234-1234-1234-123456789abc?nombre=Defectos%20observados.pdf"
function personal(options = {}) {
  return formFixture("components/mis-solicitudes.tsx", "MisSolicitudesContenido", {
    ...options,
    initial: { loading: false, selectedTrabajo: { id: "job" }, showRejectDialog: true, rejectReason: "Las paredes siguen sin terminar", rejectFiles: [fileUrl], ...options.initial },
  })
}
const rejectionButton = f => f.render().nodes.find(node => node.type === "Button" && text(node) === "Rechazar y abrir disputa")

test("personal rejection sends attached file URLs with the reason and clears the draft after success", async () => {
  const f = personal()
  await rejectionButton(f).props.onClick()
  assert.deepEqual(f.calls, [["job", "Las paredes siguen sin terminar", [fileUrl]]])
  assert.equal(f.states.showRejectDialog, false)
  assert.equal(f.states.selectedTrabajo, null)
  assert.equal(f.states.rejectReason, "")
  assert.equal(f.states.rejectFiles.length, 0)
  assert.equal(f.states.actionLoading, false)
})

test("personal rejection preserves reason/files when the action returns or throws an error", async () => {
  for (const options of [{ result: { error: "La entrega ya cambió" } }, { throws: true }]) {
    const f = personal(options)
    await rejectionButton(f).props.onClick()
    assert.equal(f.states.showRejectDialog, true)
    assert.equal(f.states.rejectReason, "Las paredes siguen sin terminar")
    assert.deepEqual([...f.states.rejectFiles], [fileUrl])
    assert.equal(f.states.actionLoading, false)
    assert.ok(f.toasts.some(item => item.variant === "destructive"))
  }
})

test("personal rejection blocks submission and dialog close while attachments are uploading", async () => {
  const f = personal({ initial: { uploadingRejectFiles: true } })
  const button = rejectionButton(f)
  assert.equal(button.props.disabled, true)
  await button.props.onClick()
  assert.equal(f.calls.length, 0)
  const dialog = f.render().nodes.find(node => node.type === "Dialog" && text(node).includes("Rechazar la entrega"))
  dialog.props.onOpenChange(false)
  assert.equal(f.states.showRejectDialog, true)
})

test("personal rejection requires a reason but permits submission without attachments", async () => {
  const blank = personal({ initial: { rejectReason: " " } })
  await rejectionButton(blank).props.onClick()
  assert.equal(blank.calls.length, 0)
  const optional = personal({ initial: { rejectFiles: [] } })
  await rejectionButton(optional).props.onClick()
  assert.deepEqual(optional.calls[0], ["job", "Las paredes siguen sin terminar", []])
})

function enterprise(options = {}) {
  return formFixture("components/empresas/incidencias-trabajo-empresa.tsx", "IncidenciasTrabajoEmpresa", {
    ...options,
    props: { trabajoId: "company-job", titulo: "Pintura", estado: "entregado", parte: "cliente", puedeGestionar: true, puedeAceptarCancelacion: true },
    initial: { accion: "rechazar_entrega", razon: " Defectos en el acabado ", archivosRechazo: [fileUrl], ...options.initial },
  })
}

test("company rejection forwards its evidence and resets the draft when opening a new action", async () => {
  const f = enterprise()
  f.render().nodes.find(node => node.type === "form").props.onSubmit({ preventDefault() {} })
  await f.settle()
  assert.deepEqual(f.calls, [["company-job", "Defectos en el acabado", [fileUrl]]])
  assert.equal(f.states.accion, null)
  f.render().nodes.find(node => node.type === "Button" && text(node) === "Rechazar entrega" && node.props.type !== "submit").props.onClick()
  assert.equal(f.states.razon, "")
  assert.equal(f.states.archivosRechazo.length, 0)
})

test("company rejection preserves its draft on error and blocks uploading submissions", async () => {
  const failed = enterprise({ result: { error: "Fallo de validación" } })
  failed.render().nodes.find(node => node.type === "form").props.onSubmit({ preventDefault() {} })
  await failed.settle()
  assert.equal(failed.states.accion, "rechazar_entrega")
  assert.deepEqual([...failed.states.archivosRechazo], [fileUrl])
  assert.equal(failed.states.error, "Fallo de validación")
  const busy = enterprise({ initial: { subiendoRechazo: true } })
  const tree = busy.render()
  assert.equal(tree.nodes.find(node => node.props?.type === "submit").props.disabled, true)
  tree.nodes.find(node => node.type === "form").props.onSubmit({ preventDefault() {} })
  tree.nodes.find(node => node.type === "Dialog").props.onOpenChange(false)
  await busy.settle()
  assert.equal(busy.calls.length, 0)
  assert.equal(busy.states.accion, "rechazar_entrega")
})

const shared = { "react/jsx-runtime": { jsx, jsxs: jsx }, "@/components/idioma-provider": { useIdioma: () => ({ t, idioma: "es" }) }, "@/lib/i18n": { localeDe: () => "es-ES" } }
const { AdjuntosLista } = load(read("components/adjuntos-lista.tsx"), shared)
const { PruebasEntrega } = load(read("components/admin/pruebas-entrega.tsx"), { ...shared, "@/components/adjuntos-lista": { AdjuntosLista } })
const expand = node => Array.isArray(node) ? node.map(expand) : node && typeof node === "object"
  ? typeof node.type === "function" ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props?.children) } } : node

test("admin labels provider delivery and client rejection independently of company operator IDs", () => {
  const providerUrl = "https://diime.example/api/archivos/22345678-1234-1234-1234-123456789abc?nombre=Entrega.pdf"
  const otherUrl = "https://diime.example/progreso.txt"
  const events = [
    { id: "delivery", usuario_id: "company-provider-operator", tipo: "entrega", mensaje: "Trabajo terminado", archivos: [providerUrl], created_at: "2026-11-06T10:00:00Z" },
    { id: "rejection", usuario_id: "different-client-operator", tipo: "rechazo_entrega", mensaje: "Falta terminar las paredes", archivos: [fileUrl], created_at: "2026-11-06T12:00:00Z" },
    { id: "progress", usuario_id: "provider", tipo: "progreso", mensaje: "Other work history", archivos: [otherUrl], created_at: "2026-11-06T09:00:00Z" },
  ]
  const tree = expand(PruebasEntrega({ actualizaciones: events }))
  const sections = walk(tree).filter(node => node.type === "section")
  const provider = sections.find(node => node.props["aria-label"] === "Entrega del proveedor")
  const client = sections.find(node => node.props["aria-label"] === "Rechazo del cliente")
  assert.match(text(provider), /Trabajo terminado/)
  assert.doesNotMatch(text(provider), /Falta terminar/)
  assert.match(text(client), /Falta terminar las paredes/)
  assert.deepEqual(walk(provider).filter(node => node.type === "a").map(node => node.props.href), [providerUrl])
  assert.deepEqual(walk(client).filter(node => node.type === "a").map(node => node.props.href), [fileUrl])
  assert.deepEqual(walk(tree).filter(node => node.type === "time").map(node => node.props.dateTime), [events[0].created_at, events[1].created_at])
  assert.doesNotMatch(text(tree), /Other work history/)
})

test("admin shows missing evidence explicitly and omits the card for unrelated activity", () => {
  const tree = PruebasEntrega({ actualizaciones: [{ id: "1", tipo: "entrega", mensaje: null, archivos: null, created_at: "2026-11-06T10:00:00Z" }] })
  assert.match(text(tree), /No adjuntó archivos\./)
  assert.match(text(tree), /Sin registro de esta acción\./)
  assert.equal(PruebasEntrega({ actualizaciones: [{ id: "1", tipo: "progreso", mensaje: "Working", archivos: [], created_at: "2026-11-06T10:00:00Z" }] }), null)
})
