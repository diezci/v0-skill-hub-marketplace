import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"
import * as jsx from "react/jsx-runtime"

const aviso = "Tu perfil está vinculado a una empresa, pero esta cuenta de Stripe es personal. Puedes consultar tu saldo y tus ingresos anteriores. Contacta con soporte para regularizar la titularidad antes de aceptar nuevos cobros de empresa."
const anterior = {
  conectado: true, onboardingCompletado: false, transferenciasHabilitadas: false, payoutsHabilitados: false,
  requisitosPendientes: [], cuentaPersonalAnterior: true, avisoTitularidad: aviso, saldoError: null,
  saldo: {
    saldos: [{ moneda: "eur", disponible: 2210, pendiente: 400 }], proximoIngreso: null, proximaDisponibilidad: null,
    calendario: { intervalo: "manual", diasSemana: [], diasMes: [], demoraDias: null }, modoReal: true,
    actualizadoEn: "2026-09-18T12:00:00.000Z",
  },
}

function compilar(ruta, require) {
  const module = { exports: {} }
  const codigo = ts.transpileModule(readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  return { module, codigo, require }
}
function moduloSimple(ruta, require) {
  const m = compilar(ruta, require)
  vm.runInNewContext(m.codigo, { module: m.module, exports: m.module.exports, require, Intl, Date })
  return m.module.exports
}
const { EN_COBROS } = moduloSimple("lib/traducciones/cobros.ts", () => { throw Error("Dependencia no prevista") })
const presentacion = moduloSimple("lib/stripe-connect-presentacion.ts", nombre => {
  assert.equal(nombre, "@/lib/i18n")
  return { localeDe: idioma => idioma === "en" ? "en-GB" : "es-ES" }
})

function harness({ menu = false, estado = anterior, idioma = "es", rechazarConsulta = false, rechazarDashboard = false } = {}) {
  let cursor = 0
  const estados = [], efectos = [], llamadas = [], avisos = [], navegaciones = []
  const t = (clave, valores = {}) => Object.entries(valores).reduce((texto, [key, value]) => texto.replaceAll(`{${key}}`, value), idioma === "en" ? EN_COBROS[clave] || clave : clave)
  const toast = aviso => avisos.push(aviso)
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in estados)) estados[index] = typeof initial === "function" ? initial() : initial
      return [estados[index], valor => { estados[index] = typeof valor === "function" ? valor(estados[index]) : valor }]
    },
    useCallback(fn) { return fn },
    useEffect(fn) { efectos.push(fn) },
  }
  const ui = new Proxy({ __esModule: true }, { get: (target, key) => key in target ? target[key] : String(key) })
  const actions = {
    obtenerEstadoStripeConnect: async () => { llamadas.push("consultar"); if (rechazarConsulta) throw Error("red fixture"); return { data: estado } },
    crearEnlaceDashboardStripe: async () => { llamadas.push("dashboard"); if (rechazarDashboard) throw Error("red fixture"); return { data: { url: "https://connect.stripe.com/express/fixture" } } },
    crearEnlaceOnboardingStripe: async () => { llamadas.push("onboarding"); throw Error("No debe activarse una cuenta personal anterior") },
  }
  const require = nombre => {
    if (nombre === "react") return hooks
    if (nombre === "react/jsx-runtime") return jsx
    if (nombre === "next/link") return { __esModule: true, default: "Link" }
    if (nombre === "@/components/idioma-provider") return { useT: () => t, useIdioma: () => ({ idioma }) }
    if (nombre === "@/app/actions/stripe-connect") return actions
    if (nombre === "@/lib/stripe-connect-presentacion") return presentacion
    if (nombre === "@/hooks/use-toast") return { useToast: () => ({ toast }) }
    if (nombre === "@capacitor/core") return { Capacitor: { isNativePlatform: () => false } }
    if (nombre.startsWith("@/components/ui/") || nombre === "lucide-react" || nombre === "@/components/support-chat-button") return ui
    throw Error(`Dependencia no prevista: ${nombre}`)
  }
  const m = compilar(menu ? "components/resumen-cobros-menu.tsx" : "components/stripe-connect-card.tsx", require)
  vm.runInNewContext(m.codigo, {
    module: m.module, exports: m.module.exports, require, Intl, Date, URL,
    window: { location: { href: "https://diime.es/cobros", assign: url => navegaciones.push(url) }, addEventListener() {}, removeEventListener() {} },
    document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
  })
  return {
    render() { cursor = 0; return menu ? m.module.exports.ResumenCobrosMenu() : m.module.exports.StripeConnectCard({ estadoInicial: estado }) },
    async efectos() { const iniciales = efectos.splice(0); iniciales.forEach(fn => fn()); await tick() },
    llamadas, avisos, navegaciones,
  }
}
const nodos = tree => Array.isArray(tree) ? tree.flatMap(nodos) : !tree || typeof tree !== "object" || !tree.props ? [] : [tree, ...nodos(tree.props.children)]
const texto = node => Array.isArray(node) ? node.map(texto).join("") : node && typeof node === "object" ? texto(node.props?.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""
const boton = (tree, titulo) => nodos(tree).find(n => n.type === "Button" && texto(n).trim() === titulo)
const tick = () => new Promise(resolve => setImmediate(resolve))

const principal = harness()
let tree = principal.render()
assert.match(texto(tree), /Cuenta personal anterior/)
assert.match(texto(tree), /Saldo de tu cuenta personal26,10/)
assert.match(texto(tree), /regularizar la titularidad antes de aceptar nuevos cobros de empresa/)
assert.doesNotMatch(texto(tree), /Cuenta de cobros activa|Completar datos en Stripe|Activar cobros con Stripe/)
assert.ok(nodos(tree).some(n => n.type === "SupportChatButton"))
assert.ok(boton(tree, "Abrir mi cuenta personal en Stripe"))
boton(tree, "Abrir mi cuenta personal en Stripe").props.onClick()
await tick()
assert.deepEqual(principal.llamadas, ["dashboard"])
assert.deepEqual(principal.navegaciones, ["https://connect.stripe.com/express/fixture"])
assert.equal(boton(principal.render(), "Abrir mi cuenta personal en Stripe").props.disabled, false)
console.log("PASS Saldo personal anterior visible con aviso, soporte y Dashboard; ninguna activación empresarial")

const sinSaldo = { ...anterior, saldo: null, saldoError: "Stripe no ha facilitado el saldo en este momento." }
for (const menu of [false, true]) {
  const h = harness({ menu, estado: sinSaldo })
  let actual = h.render()
  if (menu) { await h.efectos(); actual = h.render() }
  assert.match(texto(actual), /Cuenta personal anterior/)
  assert.match(texto(actual), /Stripe no ha facilitado el saldo/)
  assert.doesNotMatch(texto(actual), /0,00|Cuenta de cobros activa|Activar cobros|Completar datos/)
  if (menu) assert.ok(nodos(actual).some(n => n.props.href === "/cobros"))
  else assert.ok(boton(actual, "Abrir mi cuenta personal en Stripe"))
}
console.log("PASS Saldo ausente no se convierte en cero ni borra el aviso o el acceso histórico")

const menu = harness({ menu: true })
menu.render()
await menu.efectos()
tree = menu.render()
assert.match(texto(tree), /Saldo de tu cuenta personal26,10/)
assert.match(texto(tree), /Los nuevos cobros de empresa requieren revisar la titularidad/)
assert.ok(nodos(tree).some(n => n.type === "Link" && n.props.href === "/cobros"))
console.log("PASS Menú identifica saldo personal y enlaza el aviso a Cobros")

const activa = { ...anterior, cuentaPersonalAnterior: false, avisoTitularidad: null, onboardingCompletado: true, transferenciasHabilitadas: true, payoutsHabilitados: true }
tree = harness({ estado: activa }).render()
assert.match(texto(tree), /Cuenta de cobros activa/)
assert.ok(boton(tree, "Abrir panel de Stripe"))
assert.doesNotMatch(texto(tree), /Cuenta personal anterior|Saldo de tu cuenta personal/)
tree = harness({ estado: { ...activa, onboardingCompletado: false } }).render()
assert.ok(boton(tree, "Completar datos en Stripe"))
tree = harness({ estado: { ...anterior, onboardingCompletado: true, transferenciasHabilitadas: true, payoutsHabilitados: true } }).render()
assert.doesNotMatch(texto(tree), /Cuenta de cobros activa|Completar datos en Stripe/)
console.log("PASS Cuenta normal conserva el flujo y una cuenta anterior nunca se presenta activa")

for (const menu of [false, true]) {
  const h = harness({ menu, estado: null, rechazarConsulta: true })
  h.render()
  await h.efectos()
  const actual = h.render()
  assert.match(texto(actual), /Comprueba tu conexión y vuelve a intentarlo/)
  assert.doesNotMatch(texto(actual), /Comprobando|Consultando saldo de Stripe/)
  if (!menu) assert.equal(boton(actual, "Actualizar").props.disabled, false)
}
const falloPanel = harness({ rechazarDashboard: true })
boton(falloPanel.render(), "Abrir mi cuenta personal en Stripe").props.onClick()
await tick()
assert.equal(falloPanel.avisos[0]?.title, "No se pudo abrir Stripe")
assert.equal(boton(falloPanel.render(), "Abrir mi cuenta personal en Stripe").props.disabled, false)
assert.deepEqual(falloPanel.navegaciones, [])
console.log("PASS Fallos de red en consulta o Dashboard liberan el indicador de carga y permiten reintentar")

tree = harness({ idioma: "en" }).render()
assert.match(texto(tree), /Previous personal account/)
assert.match(texto(tree), /Personal account balance/)
assert.match(texto(tree), /Contact support to resolve account ownership/)
assert.ok(boton(tree, "Open my personal Stripe account"))
assert.doesNotMatch(texto(tree), /Cuenta personal anterior|Saldo de tu cuenta personal|regularizar la titularidad/)
console.log("PASS Traducciones nuevas del flujo histórico en inglés")
console.log("6 pruebas UI de cobros completadas con fixtures, sin red ni movimientos de dinero.")
