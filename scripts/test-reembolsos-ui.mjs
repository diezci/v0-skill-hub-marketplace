import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import ts from "typescript"
import * as jsx from "react/jsx-runtime"

// Ejecuta los componentes reales con importes guardados simulados. No usa red,
// sesión, Stripe ni acciones reales de pago o cancelación.
const require = createRequire(import.meta.url)
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  module._compile(outputText, filename)
}
const comisiones = require("../lib/comisiones.ts")
const { traducir } = require("../lib/i18n.ts")
const ui = new Proxy({ __esModule: true }, { get: (target, key) => key in target ? target[key] : String(key) })
const texto = tree => Array.isArray(tree) ? tree.map(texto).join("") : tree && typeof tree === "object" ? texto(tree.props?.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : ""
const nodos = tree => Array.isArray(tree) ? tree.flatMap(nodos) : !tree?.props ? [] : [tree, ...nodos(tree.props.children)]
const dinero = (importe, idioma = "es") => new Intl.NumberFormat(idioma === "en" ? "en-GB" : "es-ES", { style: "currency", currency: "EUR" }).format(importe)
function cargar(ruta, dependencias) {
  const modulo = { exports: {} }
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  vm.runInNewContext(outputText, {
    module: modulo, exports: modulo.exports, console, Date, Intl, process: { env: {} },
    require(nombre) {
      if (nombre === "react/jsx-runtime") return jsx
      if (nombre === "@/lib/comisiones") return comisiones
      if (nombre in dependencias) return dependencias[nombre]
      if (nombre === "lucide-react" || nombre.startsWith("@/components/ui/") || ["@/components/boton-imprimir", "@/components/adjuntos-lista", "@/components/diime-logo"].includes(nombre)) return ui
      throw new Error(`Dependencia sin simular: ${nombre}`)
    },
  }, { filename: ruta })
  return modulo.exports
}
const original = {
  monto: 22, monto_base: 20, comision_cliente: 2, comision_cliente_retenida: 2,
  comision_proveedor: 0, pago_neto_proveedor: 0, monto_bruto_proveedor: 0,
  monto_reembolsado: 20, estado: "reembolsado", liquidacion_estado: "completada",
  fecha_retencion: "2026-09-17T12:00:00Z", fecha_reembolso: "2026-09-18T12:00:00Z",
  liquidacion_contexto: { tipo: "cancelacion" },
}
async function justificante(cambios = {}, { idioma = "es", esCliente = true, esAdmin = false, vista, sinPago = false } = {}) {
  const t = (clave, params) => traducir(idioma, clave, params)
  const datos = {
    trabajo: { id: "trabajo-fixture", titulo: "Servicio de prueba", precio_acordado: 20, estado: sinPago ? "pendiente_pago" : "cancelado", created_at: "2026-09-17T12:00:00Z" },
    cliente: { nombre: "Cliente" }, profesional: { nombre: "Profesional" }, oferta: null, solicitud: null,
    escrow: sinPago ? null : { ...original, ...cambios }, esCliente, esProfesional: !esCliente, esAdmin,
    contratado: !sinPago, facturacionCliente: null, facturacionProfesional: null,
  }
  const pagina = cargar("app/trabajos/[id]/factura/page.tsx", {
    "@/lib/i18n-servidor": { getT: async () => ({ t, idioma }) },
    "next/navigation": { notFound() { throw Error("No debe redirigir") } },
    "../datos": { obtenerDatosContratacion: async () => datos, formatearEuros: dinero, formatearFechaLarga: valor => valor || "—", etiquetaMateriales: () => "Según oferta" },
  })
  return await pagina.default({ params: Promise.resolve({ id: datos.trabajo.id }), searchParams: Promise.resolve({ vista }) })
}
let casos = 0
let tree = await justificante()
assert.match(texto(tree), /Reembolso registrado−20,00/)
assert.match(texto(tree), /Coste final tras la resolución2,00/)
assert.match(texto(tree), /Gastos de servicio del cliente retenidos por Diime: 2,00/)
assert.doesNotMatch(texto(tree), /Esta operación se reembolsó íntegramente/)
casos++

for (const tipo of ["cancelacion", "pago_tardio"]) {
  tree = await justificante({ monto_reembolsado: 22, comision_cliente: 2, comision_cliente_retenida: 0, liquidacion_contexto: { tipo } })
  assert.match(texto(tree), /Reembolso íntegro del pago−22,00/)
  assert.match(texto(tree), /Coste final tras la resolución0,00/)
  assert.ok(nodos(tree).some(n => texto(n).startsWith("Gastos de servicio Diime cobrados al pagar") && texto(n).endsWith("2,00 €")))
  assert.match(texto(tree), /Gastos de servicio Diime retenidos tras el reembolso0,00/)
  assert.match(texto(tree), /Esta operación se reembolsó íntegramente/)
  assert.match(texto(tree), /No se han retenido gastos de servicio al cliente/)
  assert.doesNotMatch(texto(tree), /Diime conserva los gastos de servicio|retenidos por Diime:/)
  casos++
}

// Ni la tarifa actual, ni la comisión original, ni el saldo prueban retención.
tree = await justificante({ comision_cliente_retenida: null })
assert.match(texto(tree), /Gastos de servicio Diime retenidos tras el reembolsoNo consta/)
assert.doesNotMatch(texto(tree), /retenidos por Diime:|No se han retenido/)
casos++
tree = await justificante({ monto: null, comision_cliente_retenida: null })
assert.match(texto(tree), /Total pagado por el clienteNo consta/)
assert.match(texto(tree), /Coste final tras la resoluciónNo consta/)
assert.doesNotMatch(texto(tree), /Reembolso íntegro del pago|retenidos por Diime:/)
casos++

// El importe persistido manda aunque sea distinto de la comisión original.
tree = await justificante({ comision_cliente_retenida: 1.25, monto_reembolsado: 20.75 })
assert.match(texto(tree), /retenidos por Diime: 1,25/)
assert.match(texto(tree), /Coste final tras la resolución1,25/)
assert.doesNotMatch(texto(tree), /retenidos por Diime: 2,00/)
casos++
tree = await justificante({ monto: 110, monto_base: 100, comision_cliente: 10, comision_cliente_retenida: 10, monto_reembolsado: 40, liquidacion_contexto: { tipo: "disputa" } })
assert.match(texto(tree), /Reembolso registrado−40,00/)
assert.match(texto(tree), /retenidos por Diime: 10,00/)
assert.doesNotMatch(texto(tree), /Reembolso íntegro del pago|Reembolso del precio del servicio/)
casos++

for (const config of [{ esCliente: false }, { esAdmin: true, vista: "proveedor" }]) {
  tree = await justificante({}, config)
  assert.doesNotMatch(texto(tree), /Total pagado por el cliente|retenidos por Diime:|Reembolsado al cliente:/)
  casos++
}
tree = await justificante({}, { sinPago: true })
assert.match(texto(tree), /Total pendiente de pago por el cliente22,00/)
assert.match(texto(tree), /Diime conserva los gastos de servicio del cliente cobrados al pagar/)
assert.doesNotMatch(texto(tree), /Reembolso registrado|Reembolso íntegro del pago/)
casos++
tree = await justificante({}, { idioma: "en" })
assert.match(texto(tree), /Client service fees retained by Diime: €2.00/)
assert.doesNotMatch(texto(tree), /Gastos de servicio del cliente retenidos/)
casos++

for (const idioma of ["es", "en"]) {
  const t = (clave, params) => traducir(idioma, clave, params)
  const estados = ["ready", null, "cs_secret_fixture", "cs_fixture", { precioBase: 20, comisionCliente: 2, totalCliente: 22 }]
  let cursor = 0
  const pagina = cargar("app/pago/[trabajoId]/page.tsx", {
    react: { useState: () => [estados[cursor++], () => {}], useEffect() {}, useCallback: fn => fn },
    "@/components/idioma-provider": { useT: () => t, useIdioma: () => ({ idioma }) },
    "next/navigation": { useParams: () => ({ trabajoId: "fixture" }), useRouter: () => ({}) },
    "@stripe/stripe-js": { loadStripe: () => null }, "@stripe/react-stripe-js": ui,
    "@/app/actions/escrow": { crearPagoEscrow() { throw Error("No debe crear pago") }, confirmarPagoEscrow() { throw Error("No debe confirmar pago") } },
  })
  tree = pagina.default()
  assert.ok(nodos(tree).some(n => n.type === "EmbeddedCheckoutProvider"), "El desglose se informa antes de pagar")
  assert.match(texto(tree), idioma === "es" ? /Diime conserva los gastos de servicio del cliente: 2\s*€/ : /Diime keeps the client service fees: €2/)
  assert.match(texto(tree), idioma === "es" ? /Los pagos tardíos que no activan la contratación se devuelven íntegramente/ : /Late payments that do not activate the contract are refunded in full/)
  casos++
}

// La confirmación solo conoce {ok}: no debe convertir un reintento histórico
// en una afirmación de comisión retenida ni de reembolso íntegro.
const avisos = [], llamadas = []
let cursor = 0
const estados = ["cliente", false, false, false, false, "", "", "", [], [], [], [], false]
const cancelacion = cargar("components/cancelacion-trabajo.tsx", {
  react: { useState: () => [estados[cursor++], () => {}], useEffect() {} },
  "@/components/idioma-provider": { useT: () => (clave, params) => traducir("es", clave, params), useIdioma: () => ({ idioma: "es" }) },
  "@/lib/i18n": { localeDe: () => "es-ES" },
  "next/navigation": { useRouter: () => ({ refresh() {} }) },
  "@/hooks/use-toast": { useToast: () => ({ toast: aviso => avisos.push(aviso) }) },
  "@/lib/supabase/client": { createClient() { throw Error("No debe consultar sesión") } },
  "@/lib/upload-helpers": { uploadFile() { throw Error("No debe subir archivos") } },
  "@/app/actions/trabajos": { responderCancelacion: async (...args) => { llamadas.push(args); return { data: { ok: true } } } },
})
tree = cancelacion.CancelacionTrabajo({ trabajo: { id: "fixture", estado: "en_progreso", cliente_id: "cliente", profesional_id: "profesional", cancelacion_estado: "pendiente", cancelacion_solicitada_por: "profesional" } })
assert.match(texto(tree), /Diime conserva los gastos de servicio del cliente cobrados al pagar/)
const aceptar = nodos(tree).find(n => n.type === "Button" && texto(n) === "Aceptar cancelación")
assert.ok(aceptar)
await aceptar.props.onClick()
assert.deepEqual(JSON.parse(JSON.stringify(llamadas)), [["fixture", true, "", []]])
assert.match(avisos[0].description, /Consulta el justificante/)
assert.doesNotMatch(avisos[0].description, /íntegramente|conserva|retenidos/)
casos++

console.log(`${casos} pruebas UI de reembolsos superadas: histórico íntegro, comisión guardada, importes ausentes, privacidad, checkout ES/EN y confirmación neutral. Sin red ni dinero real.`)
