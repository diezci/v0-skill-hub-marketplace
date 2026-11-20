import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import vm from "node:vm"
import ts from "typescript"

const jsx = (type, props) => ({ type, props })
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === "object" && node.props ? [node, ...walk(node.props.children)] : []
const text = node => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : typeof node === "boolean" ? "" : String(node ?? "")
const t = (key, params = {}) => key.replace(/\{([^}]+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
const ui = new Proxy({ __esModule: true, default: "Link" }, { get: (obj, name) => name in obj ? obj[name] : String(name) })

function compile(file, dependency) {
  const module = { exports: {} }
  const compiled = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true,
  })
  assert.equal(compiled.diagnostics.length, 0)
  vm.runInNewContext(compiled.outputText, { module, exports: module.exports, console, Date, Intl, Set, crypto: { randomUUID }, require: dependency })
  return module.exports
}
const domain = compile("lib/hitos.ts", name => { throw Error(name) })
const baseHitos = () => [
  { id: "10000000-0000-4000-8000-000000000001", titulo: "Preparación", descripcion: "", criterio_aceptacion: "Material recibido", fecha_limite: "2027-01-01", importe_centimos: 3000 },
  { id: "10000000-0000-4000-8000-000000000002", titulo: "Entrega", descripcion: "", criterio_aceptacion: "Entrega revisada", fecha_limite: "2027-01-02", importe_centimos: 7000 },
]
function harness(file, named = "default", actions = {}) {
  const states = []
  let cursor = 0
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], next => { states[i] = typeof next === "function" ? next(states[i]) : next }] },
    useEffect() {}, useId() { return "hitos-test" }, useCallback(fn) { return fn },
  }
  const exported = compile(file, name => {
    if (name === "react") return hooks
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }
    if (name === "@/components/idioma-provider") return { useIdioma: () => ({ t, idioma: "es" }) }
    if (name === "@/lib/hitos") return domain
    if (name === "@/lib/utils") return { cn: (...args) => args.filter(Boolean).join(" ") }
    if (name === "@/lib/comisiones") return { formatearPrecio: n => `${n} €`, calcularTotalCliente: n => ({ comisionCliente: n / 10, totalCliente: n * 1.1 }), calcularPagoProveedor: n => ({ pagoNeto: n * .9 }) }
    if (name === "next/navigation") return { useParams: () => ({ ofertaId: "offer-id" }), useRouter: () => ({ push() {} }) }
    if (name.startsWith("@/app/actions/")) return actions
    return ui
  })
  return { render(props = {}) { cursor = 0; return exported[named](props) }, state(index, value) { states[index] = value } }
}
const button = (tree, label) => walk(tree).find(node => node.type === "Button" && text(node).trim() === label)

test("both parties can add and remove draft milestones without altering the remaining IDs", () => {
  for (const parte of ["cliente", "proveedor"]) {
    const editor = harness("components/hitos/plan-hitos-editor.tsx", "PlanHitosEditor")
    let hitos = baseHitos()
    const render = () => editor.render({ value: hitos, onChange: value => { hitos = value }, totalCentimos: 10000 })
    button(render(), "Añadir hito").props.onClick()
    assert.equal(hitos.length, 3, parte)
    assert.notEqual(hitos[2].id, hitos[1].id)
    const quitar = walk(render()).find(node => node.props?.["aria-label"] === "Quitar hito 2")
    quitar.props.onClick()
    assert.equal(hitos.length, 2)
    assert.equal(hitos[0].id, baseHitos()[0].id)
    assert.equal(domain.validarPlanHitos(hitos, 10000), "Escribe un título de hasta 160 caracteres para cada hito.")
  }
})

test("paid milestones cannot be edited, deleted or crossed by reordering; plan totals must balance", () => {
  const editor = harness("components/hitos/plan-hitos-editor.tsx", "PlanHitosEditor")
  const hitos = baseHitos()
  const tree = editor.render({ value: hitos, onChange() {}, totalCentimos: 10000, bloqueados: [hitos[0].id] })
  const nodes = walk(tree)
  for (const label of ["Quitar hito 1", "Bajar hito 1", "Subir hito 2"]) assert.equal(nodes.find(node => node.props?.["aria-label"] === label)?.props.disabled, true, label)
  assert.equal(nodes.find(node => node.type === "Input" && node.props.value === "Preparación")?.props.disabled, true)
  assert.equal(nodes.find(node => node.type === "Textarea" && node.props.value === "Material recibido")?.props.disabled, true)
  assert.match(text(tree), /100,00/)
  assert.equal(domain.validarPlanHitos(hitos, 10000), null)
  assert.match(domain.validarPlanHitos([{ ...hitos[0], importe_centimos: 3001 }, hitos[1]], 10000), /suma/)
})

test("one-time and milestone modes are explicit choices with no automatic charge", () => {
  const selector = harness("components/hitos/plan-hitos-editor.tsx", "ModalidadPagoSelector")
  let modalidad = "unico"
  let tree = selector.render({ value: modalidad, onChange: value => { modalidad = value }, sugerencia: true })
  assert.equal(walk(tree).find(node => node.type === "input" && node.props.value === "unico").props.checked, true)
  walk(tree).find(node => node.type === "input" && node.props.value === "hitos").props.onChange()
  tree = selector.render({ value: modalidad, onChange() {}, sugerencia: true })
  assert.equal(walk(tree).find(node => node.type === "input" && node.props.value === "hitos").props.checked, true)
  assert.match(text(tree), /Publicar no realiza ningún cobro/)
})

test("contracting requires explicit consent and uses the exact reviewed plan version", async () => {
  const calls = []
  const page = harness("app/ofertas/[ofertaId]/plan/page.tsx", "default", {
    aceptarOferta: async (...args) => { calls.push(args); return { error: "El plan ha cambiado." } },
  })
  page.state(0, { oferta_id: "offer-id", rol: "cliente", modalidad_pago: "hitos", precio_centimos: 10000, plan_hitos: baseHitos(), plan_version: 7, plan_estado: "propuesto", plan_aceptado_cliente: false, plan_aceptado_proveedor: true, puede_editar: true })
  page.state(2, false)
  let tree = page.render()
  const contratar = button(tree, "Contratar con este plan")
  assert.equal(contratar.props.disabled, true)
  await contratar.props.onClick()
  assert.equal(calls.length, 0)
  walk(tree).find(node => node.type === "Checkbox").props.onCheckedChange(true)
  tree = page.render()
  await button(tree, "Contratar con este plan").props.onClick()
  assert.deepEqual(calls, [["offer-id", 7]])
  assert.match(text(page.render()), /El plan ha cambiado/)
})

test("provider can accept client changes; rejected plans cannot be accepted without a new proposal", () => {
  const page = harness("app/ofertas/[ofertaId]/plan/page.tsx")
  const plan = { rol: "proveedor", modalidad_pago: "hitos", precio_centimos: 10000, plan_hitos: baseHitos(), plan_version: 3, plan_estado: "propuesto", plan_aceptado_cliente: true, plan_aceptado_proveedor: false, puede_editar: true }
  page.state(0, plan); page.state(2, false)
  assert.ok(button(page.render(), "Aceptar este plan"))
  page.state(0, { ...plan, plan_estado: "rechazado" })
  assert.equal(button(page.render(), "Aceptar este plan"), undefined)
})

test("only the next funded stage can be approved, and certification is required", async () => {
  const calls = []
  const plan = { trabajo_id: "work", titulo: "Reforma", rol: "cliente", modalidad_pago: "hitos", estado: "en_progreso", plan_version: 2, precio_centimos: 10000, propuesta: null,
    puede_editar: true, puede_pagar: true, puede_entregar: false, puede_aprobar: true,
    hitos: baseHitos().map((hito, i) => ({ ...hito, estado: i ? "pendiente" : "entregado", bloqueado: !i, comision_cliente_centimos: hito.importe_centimos / 10 })),
  }
  const page = harness("components/hitos/trabajo-hitos.tsx", "PanelHitosTrabajo", { aprobarHito: async (...args) => { calls.push(args); return { error: "Reintenta la liquidación." } } })
  page.state(0, plan); page.state(1, false)
  let tree = page.render({ trabajoId: "work" })
  assert.equal(walk(tree).some(node => node.props.href?.includes("?hito=")), false, "future stage cannot be charged")
  button(tree, "Aprobar y liberar pago").props.onClick()
  tree = page.render({ trabajoId: "work" })
  assert.equal(button(tree, "Confirmar y liberar").props.disabled, true)
  button(tree, "Confirmar y liberar").props.onClick()
  assert.equal(calls.length, 0)
  walk(tree).find(node => node.type === "Checkbox").props.onCheckedChange(true)
  tree = page.render({ trabajoId: "work" })
  button(tree, "Confirmar y liberar").props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls, [["work", baseHitos()[0].id]])
  assert.match(text(page.render({ trabajoId: "work" })), /Reintenta la liquidación/)
})

test("both participants can open the contract receipt from the plan, outside the preview", () => {
  for (const rol of ["cliente", "proveedor"]) {
    const page = harness("components/hitos/trabajo-hitos.tsx", "PanelHitosTrabajo")
    const plan = { rol, modalidad_pago: "hitos", precio_centimos: 10000, hitos: [], propuesta: null }
    page.state(0, plan)
    page.state(1, false)
    const receipt = props => walk(page.render(props)).find(node => node.type === "EnlaceJustificante")
    assert.equal(receipt({ trabajoId: "work" }).props.trabajoId, "work")
    assert.equal(receipt({ trabajoId: "work", vistaPrevia: plan }), undefined)
  }
})

test("a partial refund shows the settled service amount rather than the entire milestone", () => {
  const page = harness("components/hitos/trabajo-hitos.tsx", "PanelHitosTrabajo")
  const plan = { trabajo_id: "work", titulo: "Reforma", rol: "cliente", modalidad_pago: "hitos", estado: "en_progreso", plan_version: 2, precio_centimos: 10000, propuesta: null,
    puede_editar: true, puede_pagar: true, puede_entregar: false, puede_aprobar: true,
    hitos: baseHitos().map((hito, i) => ({ ...hito, estado: i ? "pendiente" : "completado", bloqueado: !i, escrow: i ? null : { estado: "completado", base_liquidada_centimos: 1000, reembolso_servicio_centimos: 2000 } })),
  }
  page.state(0, plan); page.state(1, false)
  const tree = page.render({ trabajoId: "work" })
  const resumen = walk(tree).find(node => node.type === "Card" && text(node).startsWith("Servicio aprobado"))
  assert.match(text(resumen), /10,00/)
  assert.doesNotMatch(text(resumen), /30,00/)
  assert.match(text(tree), /Servicio reembolsado: 20,00/)
  assert.match(text(tree), /Liquidado con reembolso/)
})

test("closing an unpaid checkout is scoped to its milestone and cancellation permissions are preserved", async () => {
  const calls = []
  const page = harness("components/hitos/trabajo-hitos.tsx", "PanelHitosTrabajo", { cerrarPagoHito: async (...args) => { calls.push(args); return { error: "El pago se está procesando." } } })
  const plan = { trabajo_id: "work", titulo: "Reforma", rol: "cliente", modalidad_pago: "hitos", estado: "en_progreso", plan_version: 2, precio_centimos: 10000, propuesta: null,
    puede_editar: true, puede_pagar: true, puede_entregar: false, puede_aprobar: true,
    puede_gestionar_cancelacion: true, puede_aceptar_cancelacion: false, cancelacion_estado: "pendiente", cancelacion_parte_solicitante: "proveedor", cancelacion_revision: "revision-7",
    hitos: baseHitos().map((hito, i) => ({ ...hito, estado: "pendiente", bloqueado: !i, escrow: i ? null : { estado: "pendiente" } })),
  }
  page.state(0, plan); page.state(1, false)
  const tree = page.render({ trabajoId: "work" })
  assert.equal(walk(tree).filter(node => node.props.href?.includes("?hito=")).length, 1)
  button(tree, "Cerrar intento de pago").props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls, [["work", baseHitos()[0].id]])
  const cancelacion = walk(tree).find(node => node.type === "IncidenciasTrabajoEmpresa")
  assert.equal(cancelacion.props.porHitos, true)
  assert.equal(cancelacion.props.puedeAceptarCancelacion, false)
  assert.equal(cancelacion.props.cancelacionRevision, "revision-7")
})
