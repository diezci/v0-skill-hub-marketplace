import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"
import * as jsx from "react/jsx-runtime"

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const original = {
  id: uuid(1), trabajo_id: uuid(11), cliente_id: uuid(21), profesional_id: uuid(31),
  monto: 22, monto_base: 20, retencion_plataforma: 0, comision_cliente: 0, comision_proveedor: 0,
  pago_neto_proveedor: 0, monto_reembolsado: 22, estado: "reembolsado", liquidacion_estado: "completada",
  liquidacion_error: null, stripe_payment_intent_id: "pi_fixture_22", stripe_refund_id: "re_fixture_22",
  stripe_refund_status: "succeeded", fecha_reembolso: "2026-09-18T11:30:00.000Z", created_at: "2026-09-17T12:00:00.000Z",
  trabajo: { titulo: "Reparación aire acondicionado" }, cliente: { nombre: "Pedro", apellido: "Pistacho" },
  profesional: { nombre: "Técnico", apellido: "de prueba" },
}
const otra = { ...original, id: uuid(2), trabajo_id: uuid(12), cliente_id: uuid(22), trabajo: { titulo: "Otro servicio" }, cliente: { nombre: "Otra", apellido: "cuenta" } }
const exitoStripe = { id: "re_fixture_22", estado: "succeeded", importe: 22, moneda: "eur", creadoEn: "2026-09-18T11:30:00.000Z", referencia: "ARN-REFERENCIA-PRUEBA", referenciaTipo: "arn", referenciaEstado: "available", fallo: null, modoReal: true }

function harness({ parametros = "", respuesta = { data: exitoStripe }, pagos = [original, otra] } = {}) {
  let cursor = 0
  const estados = [], llamadas = []
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in estados)) estados[index] = typeof initial === "function" ? initial() : initial
      return [estados[index], valor => { estados[index] = typeof valor === "function" ? valor(estados[index]) : valor }]
    },
    useRef(initial) { const index = cursor++; if (!(index in estados)) estados[index] = { current: initial }; return estados[index] },
    useEffect() { cursor++ },
  }
  const ui = new Proxy({ __esModule: true }, { get: (target, key) => key in target ? target[key] : String(key) })
  const module = { exports: {} }
  const codigo = ts.transpileModule(readFileSync(new URL("../app/admin/pagos/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(codigo, {
    module, exports: module.exports, console, URLSearchParams, Date, Intl,
    require(nombre) {
      if (nombre === "react") return hooks
      if (nombre === "react/jsx-runtime") return jsx
      if (nombre === "next/navigation") return { useSearchParams: () => new URLSearchParams(parametros), useRouter: () => ({ replace() {} }) }
      if (nombre === "@/components/idioma-provider") return { useIdioma: () => ({ idioma: "es", t: clave => clave }) }
      if (nombre === "@/lib/i18n") return { localeDe: idioma => idioma === "en" ? "en-GB" : "es-ES" }
      if (nombre === "@/lib/utils") return { formatearFecha: fecha => fecha }
      if (nombre === "@/lib/supabase/client") return { createClient: () => ({ from() { throw Error("La prueba no debe consultar datos reales") } }) }
      if (nombre === "@/app/actions/admin-pagos") return { comprobarReembolsoAdmin: async id => { llamadas.push(id); return respuesta } }
      return ui
    },
  })
  estados[0] = pagos
  estados[1] = false
  return { render() { cursor = 0; return module.exports.default() }, llamadas }
}

const nodos = tree => Array.isArray(tree) ? tree.flatMap(nodos) : !tree || typeof tree !== "object" || !tree.props ? [] : [tree, ...nodos(tree.props.children)]
const texto = node => Array.isArray(node) ? node.map(texto).join("") : node && typeof node === "object" ? texto(node.props?.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""
const boton = (tree, titulo) => nodos(tree).find(n => n.type === "Button" && texto(n).trim() === titulo)
const tick = () => new Promise(resolve => setImmediate(resolve))

const h = harness({ parametros: `usuario=${original.cliente_id}` })
let tree = h.render()
assert.match(texto(tree), /Pedro Pistacho/)
assert.doesNotMatch(texto(tree), /Otro servicio|Otra cuenta/)
assert.equal(h.llamadas.length, 0, "Abrir la lista no ejecuta la consulta de Stripe")
boton(tree, "Ver detalle").props.onClick()
tree = h.render()
const dialog = nodos(tree).find(n => n.type === "Dialog")
assert.equal(dialog.props.open, true)
assert.match(texto(dialog), /Reparación aire acondicionado/)
assert.match(texto(dialog), /Reembolso registrado22,00/)
assert.match(texto(dialog), /13:30/)
assert.match(texto(dialog), /Reembolso procesado por Stripe/)
assert.match(texto(dialog), /re_fixture_22/)
assert.match(texto(dialog), /no confirma su abono bancario/)
assert.equal(nodos(dialog).find(n => n.type === "a")?.props.href, "https://dashboard.stripe.com/payments/pi_fixture_22")
assert.ok(nodos(dialog).some(n => n.props.href === `/admin/incidencias?usuario=${original.cliente_id}`))
assert.equal(h.llamadas.length, 0, "Abrir el detalle no mueve fondos ni consulta Stripe sin pulsar")
boton(tree, "Comprobar reembolso en Stripe").props.onClick()
await tick()
assert.deepEqual(h.llamadas, [original.id])
tree = h.render()
assert.match(texto(tree), /Última comprobación en Stripe/)
assert.match(texto(tree), /ARN-REFERENCIA-PRUEBA/)
assert.doesNotMatch(texto(tree), /Modo de pruebas de Stripe/)
console.log("PASS Detalle reembolso 22 EUR, fecha Madrid, enlaces precisos y comprobación explícita sin abono bancario inferido")

for (const respuesta of [{ error: "No se pudo consultar el reembolso" }, { data: { ...exitoStripe, estado: "pending", referencia: null, modoReal: null } }]) {
  const h = harness({ respuesta })
  let tree = h.render()
  boton(tree, "Ver detalle").props.onClick()
  tree = h.render()
  boton(tree, "Comprobar reembolso en Stripe").props.onClick()
  await tick()
  tree = h.render()
  if (respuesta.error) assert.ok(nodos(tree).some(n => n.props.role === "alert" && texto(n).includes(respuesta.error)))
  else {
    assert.match(texto(tree), /Reembolso pendiente en Stripe/)
    assert.match(texto(tree), /todavía no facilita una referencia bancaria/)
    assert.doesNotMatch(texto(tree), /Modo de pruebas de Stripe/)
  }
}
console.log("PASS Errores y reembolsos pendientes visibles; un modo desconocido no se presenta como prueba")

const filtro = harness()
let filtrado = filtro.render()
nodos(filtrado).find(n => n.type === "Input").props.onChange({ target: { value: "Pedro Pistacho" } })
filtrado = filtro.render()
assert.match(texto(filtrado), /Reparación aire acondicionado/)
assert.doesNotMatch(texto(filtrado), /Otro servicio/)
console.log("PASS Búsqueda por nombre completo encuentra el pago de Pedro sin mezclar otras cuentas")
console.log("3 pruebas UI de pagos completadas, con fixtures y sin red ni movimientos de dinero.")

// La consulta autorizada puede descubrir un fallo posterior al cierre local.
for (const estado of ["failed", "canceled", "succeeded", "pending"]) {
  const h = harness({ respuesta: { data: { ...exitoStripe, estado } } })
  let tree = h.render()
  boton(tree, "Ver detalle").props.onClick()
  tree = h.render()
  boton(tree, "Comprobar reembolso en Stripe").props.onClick()
  await tick()
  tree = h.render()
  assert.equal(Boolean(boton(tree, "Autorizar un nuevo intento de reembolso")), ["failed", "canceled"].includes(estado))
}
console.log("PASS Fallo tardío en Stripe permite recuperación explícita aunque el estado local estuviera completado")

// The captured UI showed 240 EUR refunded despite a failed 100 EUR attempt.
// Count actual succeeded refunds (including partial ones), not planned splits.
const pagos = [
  { ...original, monto_reembolsado: 100 },
  { ...original, id: uuid(3), estado: "liquidando", liquidacion_estado: "error", monto_reembolsado: 40 },
  { ...original, id: uuid(4), estado: "liquidando", liquidacion_estado: "error", stripe_refund_status: "failed", monto_reembolsado: 100, fecha_reembolso: null },
  { ...original, id: uuid(5), estado: "liquidando", stripe_refund_status: "pending", monto_reembolsado: 20 },
  { ...original, id: uuid(6), stripe_refund_status: null, stripe_refund_id: null, monto_reembolsado: 30 },
]
const resumen = harness({ pagos }).render()
const tarjeta = nodos(resumen).find(n => n.type === "Card" && texto(n).startsWith("Reembolsos procesados por Stripe"))
assert.match(texto(tarjeta), /140,00/)
assert.match(texto(tarjeta), /2\s+reembolsos/)
assert.doesNotMatch(texto(tarjeta), /240,00|290,00/)
assert.match(texto(resumen), /La liquidación necesita atención/)
const fallo = harness({ pagos: [pagos[2]] })
boton(fallo.render(), "Ver detalle").props.onClick()
const detalleFallido = nodos(fallo.render()).find(n => n.type === "Dialog")
assert.match(texto(detalleFallido), /Reembolso previsto100,00/)
assert.doesNotMatch(texto(detalleFallido), /Reembolso registrado100,00|Moviendo fondos/)
console.log("PASS Totales excluyen fallidos/pendientes/sin evidencia e incluyen reembolso parcial confirmado; detalle fallido muestra importe previsto")
