import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
const jsx = require("react/jsx-runtime")

function cargar(file, dependencias, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const module = { exports: {} }
  vm.runInNewContext(outputText, {
    module, exports: module.exports, URL, URLSearchParams, ...globals,
    require(nombre) {
      if (nombre === "react/jsx-runtime") return jsx
      if (nombre in dependencias) return dependencias[nombre]
      throw new Error(`Dependencia sin simular: ${nombre}`)
    },
  }, { filename: file })
  return module.exports
}

// Exercise actual navigation effects: merely entering a section must not erase
// pending activity; the correct tab mounts before focus and scrolling happen.
let cursor = 0
const refs = [], states = [], effects = [], previousEffects = []
const hooks = {
  useRef(initial) { const i = cursor++; return refs[i] ||= { current: initial } },
  useState(initial) {
    const i = cursor++
    if (!(i in states)) states[i] = initial
    return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value }]
  },
  useEffect(fn, deps) {
    const i = cursor++
    if (!previousEffects[i] || deps.some((dep, j) => dep !== previousEffects[i].deps[j])) {
      effects.push(() => {
        previousEffects[i]?.cleanup?.()
        previousEffects[i] = { deps, cleanup: fn() }
      })
    }
  },
}
const listeners = new Map(), frames = new Map(), seen = []
let frameId = 0, mounted = false, tab = "activos"
const element = {
  dataset: {},
  focus: () => seen.push("focus"),
  scrollIntoView: () => seen.push("scroll"),
}
const query = "trabajo=job-cancelado&notificacion=notice-1"
class ClickTarget { closest() { return { href: `https://www.diime.es/mis-trabajos?${query}` } } }
const { useDestinoNotificacion } = cargar("hooks/use-destino-notificacion.ts", {
  react: hooks, "next/navigation": { useSearchParams: () => new URLSearchParams(query) },
}, {
  Element: ClickTarget,
  window: { location: { origin: "https://www.diime.es", pathname: "/mis-trabajos", href: `https://www.diime.es/mis-trabajos?${query}` } },
  document: {
    getElementById: id => mounted && id === "trabajo-job-cancelado" ? element : null,
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name, handler) => { if (listeners.get(name) === handler) listeners.delete(name) },
  },
  requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId },
  cancelAnimationFrame: id => frames.delete(id),
})
const select = value => { tab = value }
function render(cargando) {
  cursor = 0
  useDestinoNotificacion({ cargando, seleccionar: select, resolver: params => ({ id: `trabajo-${params.get("trabajo")}`, tab: "cancelados" }) })
  effects.splice(0).forEach(fn => fn())
}
function frame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()) }
render(true)
assert.equal(tab, "activos")
assert.equal(frames.size, 0)
render(false)
assert.equal(tab, "cancelados")
frame()
assert.equal(seen.length, 0, "Wait until the tab content actually mounts")
mounted = true
frame()
assert.equal(seen.join(","), "scroll,focus")
render(false)
frame()
assert.equal(seen.length, 2, "Background refresh must not steal focus")
tab = "activos"
listeners.get("click")({ button: 0, target: new ClickTarget() })
render(false)
frame()
assert.equal(tab, "cancelados", "Opening the same notification twice must restore its tab")
assert.equal(seen.length, 4)

let idsMarcados = null
const { AvisosTarjeta } = cargar("components/avisos-tarjeta.tsx", {
  react: { useState: initial => [initial, () => {}] },
  "lucide-react": { Bell: "Bell", CheckCheck: "CheckCheck", Loader2: "Loader2" },
  "@/components/ui/button": { Button: "Button" },
  "@/components/idioma-provider": { useIdioma: () => ({ idioma: "es", t: x => x }) },
  "@/lib/i18n-notificaciones": { traducirTextoNotificacion: (_idioma, text) => text },
})
const avisos = [{ id: "notice-a", tipo: "progreso_trabajo", titulo: "Progreso actualizado: 40%", mensaje: "Fachada norte" }]
const walk = node => Array.isArray(node) ? node.flatMap(walk) : !node || typeof node !== "object" ? [] : [node, ...[].concat(node.props?.children || []).flatMap(walk)]
const tree = AvisosTarjeta({ avisos, onMarcarLeidas: async ids => { idsMarcados = ids } })
assert.equal(idsMarcados, null, "Showing the card does not mark it read")
await walk(tree).find(node => node.type === "Button").props.onClick()
assert.equal(idsMarcados.join(","), "notice-a", "Mark only notifications belonging to this card")
assert.equal(walk(AvisosTarjeta({ avisos })).filter(node => node.type === "Button").length, 0, "A read snapshot keeps the explanation without a read action")
assert.equal(AvisosTarjeta({ avisos: [] }), null)

// A replacement dispute must not claim notifications from an earlier withdrawn
// case on the same job, nor mark that earlier case as read from its own card.
const disputas = [
  { id: "case-b", trabajo_id: "job-1", estado: "abierta", created_at: "2026-09-18" },
  { id: "case-a", trabajo_id: "job-1", estado: "retirada", created_at: "2026-09-17" },
  { id: "case-c", trabajo_id: "job-2", estado: "abierta", created_at: "2026-09-18" },
]
const avisosDisputas = [
  { id: "notice-case-a", trabajo_id: "job-1", metadata: { disputa_id: "case-a" } },
  { id: "notice-case-b", trabajo_id: "job-1", link: "/mis-trabajos?trabajo=job-1&disputa=case-b" },
  { id: "legacy-ambiguous", trabajo_id: "job-1" },
  { id: "legacy-unique", trabajo_id: "job-2" },
]
let resolverDisputa
const nombres = values => Object.fromEntries(values.split(" ").map(name => [name, name]))
const { default: MisDisputas } = cargar("components/mis-disputas.tsx", {
  react: { useState: initial => [Array.isArray(initial) ? disputas : initial === true ? false : initial, () => {}], useEffect: () => {} },
  "@/components/idioma-provider": { useT: () => text => text, useIdioma: () => ({ idioma: "es" }) },
  "@/lib/i18n": { localeDe: () => "es-ES" },
  "@/hooks/use-notificaciones-seccion": { useNotificacionesSeccion: () => ({
    paraEntidad: ({ trabajoId }) => avisosDisputas.filter(aviso => aviso.trabajo_id === trabajoId),
    marcarLeidas: async ids => { idsMarcados = ids },
  }) },
  "@/hooks/use-destino-notificacion": { useDestinoNotificacion: ({ resolver }) => { resolverDisputa = resolver } },
  "@/components/avisos-tarjeta": { AvisosTarjeta: "AvisosTarjeta" },
  "next/link": { default: "Link" },
  "@/components/ui/card": nombres("Card CardContent"),
  "@/components/ui/badge": nombres("Badge"),
  "lucide-react": nombres("Loader2 Scale Briefcase Clock CheckCircle2 XCircle FileText ArrowRight"),
  "@/app/actions/disputes": { obtenerMisDisputas: () => { throw new Error("Unexpected load") }, retirarDisputa: () => { throw new Error("Unexpected mutation") } },
  "@/hooks/use-toast": { useToast: () => ({ toast: () => {} }) },
  "@/components/adjuntos-lista": nombres("AdjuntosLista"),
  "@/components/ui/alert-dialog": nombres("AlertDialog AlertDialogAction AlertDialogCancel AlertDialogContent AlertDialogDescription AlertDialogFooter AlertDialogHeader AlertDialogTitle"),
})
const casos = walk(MisDisputas({ rol: "proveedor" })).filter(node => node.type === "Card")
const avisosCaso = id => walk(casos.find(node => node.props.id === `disputa-${id}`)).find(node => node.type === "AvisosTarjeta").props
assert.equal(avisosCaso("case-a").avisos.map(aviso => aviso.id).join(","), "notice-case-a")
assert.equal(avisosCaso("case-b").avisos.map(aviso => aviso.id).join(","), "notice-case-b")
assert.equal(avisosCaso("case-c").avisos.map(aviso => aviso.id).join(","), "legacy-unique")
await walk(AvisosTarjeta(avisosCaso("case-b"))).find(node => node.type === "Button").props.onClick()
assert.equal(idsMarcados.join(","), "notice-case-b", "Reading replacement B must not mark earlier A or ambiguous legacy notices")
assert.equal(resolverDisputa(new URLSearchParams("trabajo=job-1&disputa=case-a")).id, "disputa-case-a", "Exact old case wins over newer case on the same job")
assert.equal(resolverDisputa(new URLSearchParams("trabajo=job-1&disputa=missing")), null, "An unavailable exact case must not focus a different one")
assert.equal(resolverDisputa(new URLSearchParams("trabajo=job-1")), null, "Ambiguous legacy links stay at the section")
assert.equal(resolverDisputa(new URLSearchParams("trabajo=job-2")).id, "disputa-case-c", "Unique legacy case stays navigable")
console.log("Activity UI OK: navigation, reopening, scoped reading, snapshots and exact dispute targeting after reopening a case.")
