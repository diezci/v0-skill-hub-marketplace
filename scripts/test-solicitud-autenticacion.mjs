import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import ts from "typescript"
import * as jsx from "react/jsx-runtime"
import * as z from "zod"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
function load(path, dependencies) {
  const result = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  })
  assert.equal(result.diagnostics.length, 0, path)
  const exports = {}
  new Function("require", "exports", result.outputText)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}
const walk = (node) => Array.isArray(node) ? node.flatMap(walk)
  : !node || typeof node !== "object" ? [] : [node, ...walk(node.props?.children)]
const user = { id: "synthetic-registered", is_anonymous: false }
const drafts = load("lib/borrador-solicitud.ts", { zod: z, "@/lib/precios": { PRECIO_MAX: 100000 } })

test("server excludes the questionnaire for visitors, anonymous users and invalid sessions", async () => {
  for (const result of [
    { data: { user: null }, error: null },
    { data: { user: { id: "anonymous", is_anonymous: true } }, error: null },
    { data: { user }, error: { message: "expired" } },
    new Error("authentication unavailable"),
    null,
  ]) {
    const { default: PublicarSolicitud } = load("components/publicar-solicitud.tsx", {
      "react/jsx-runtime": jsx,
      "@/lib/supabase/server": { createClient: async () => result === null ? null : {
        auth: { getUser: async () => { if (result instanceof Error) throw result; return result } },
      } },
      "@/components/solicitud-servicio-form": { default: "Questionnaire" },
      "@/components/solicitud-servicio-acceso": { SolicitudServicioAcceso: "AuthPrompt" },
    })
    assert.equal((await PublicarSolicitud()).type, "AuthPrompt")
  }
})

test("a verified registered session receives a questionnaire scoped to that account", async () => {
  const { default: PublicarSolicitud } = load("components/publicar-solicitud.tsx", {
    "react/jsx-runtime": jsx,
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) },
    "@/components/solicitud-servicio-form": { default: "Questionnaire" },
    "@/components/solicitud-servicio-acceso": { SolicitudServicioAcceso: "AuthPrompt" },
  })
  const element = await PublicarSolicitud()
  assert.equal(element.type, "Questionnaire")
  assert.equal(element.key, user.id, "Changing account must create an empty form")
  assert.equal(element.props.usuarioId, user.id)
})

test("access prompt has no fields and both auth options return to the questionnaire", () => {
  const { SolicitudServicioAcceso } = load("components/solicitud-servicio-acceso.tsx", {
    "react/jsx-runtime": jsx, "next/link": { default: "Link" },
    "lucide-react": { LockKeyhole: "Icon" },
    "@/components/idioma-provider": { useT: () => (key) => key },
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/card": { Card: "Card", CardContent: "CardContent" },
  })
  const elements = walk(SolicitudServicioAcceso({ embedded: true }))
  assert.equal(elements.some((element) => ["form", "input", "textarea", "select"].includes(element.type)), false)
  assert.equal(elements.filter((element) => element.props.id === "publicar-demanda").length, 1)
  const links = elements.filter((element) => element.type === "Link").map((element) => new URL(element.props.href, "https://diime.invalid"))
  assert.deepEqual(links.map((link) => link.pathname), ["/auth/registro", "/auth/login"])
  for (const link of links) assert.equal(link.searchParams.get("next"), "/#publicar-demanda")
})

function fixture() {
  const states = [], effects = [], cleanups = [], calls = { uploads: [], writes: [], refreshes: 0, pushes: [] }
  let cursor = 0, mounted = false, callback, authResult = { data: { user }, error: null }
  const hooks = {
    useRef(initial) { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index] },
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
    },
    useEffect(effect) { if (!mounted) effects.push(effect) },
  }
  const supabase = { auth: {
    getUser: async () => authResult,
    onAuthStateChange: (fn) => { callback = fn; return { data: { subscription: { unsubscribe: () => { callback = null } } } } },
  } }
  const controls = (names) => Object.fromEntries(names.map((name) => [name, name]))
  let formValues = { category: "", title: "", description: "", location: "", budget: [0, 100000], urgency: "", neededDate: "" }
  const form = { handleSubmit: (fn) => fn, control: {}, reset: (value) => { if (value) formValues = value }, getValues: () => formValues, watch: () => ({ unsubscribe() {} }) }
  const { default: Component } = load("components/solicitud-servicio-form.tsx", {
    react: hooks, "react/jsx-runtime": jsx, zod: z,
    "@/components/selector-identidad-empresa": { SelectorIdentidadEmpresa: "Identity" },
    "@/components/idioma-provider": { useT: () => (key) => key },
    "@hookform/resolvers/zod": { zodResolver: () => ({}) },
    "react-hook-form": { useForm: () => form },
    "@/lib/borrador-solicitud": drafts,
    "@/components/ui/button": controls(["Button"]),
    "@/components/ui/form": controls(["Form", "FormControl", "FormField", "FormItem", "FormLabel", "FormMessage"]),
    "@/components/ui/input": controls(["Input"]), "@/components/ui/textarea": controls(["Textarea"]),
    "@/components/ui/select": controls(["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"]),
    "@/components/ui/card": controls(["Card", "CardContent"]),
    "@/hooks/use-toast": { toast: () => {} },
    "lucide-react": controls(["Send", "Paperclip", "X", "MapPin", "Euro", "Clock"]),
    "@/lib/upload-helpers": { uploadFile: async (file) => { calls.uploads.push(file); return { url: "https://files.invalid/synthetic" } } },
    "@/app/actions/solicitudes": { crearSolicitud: async (data) => { calls.writes.push(data); return { data: {} } } },
    "next/navigation": { useRouter: () => ({ refresh: () => { calls.refreshes++ }, push: (href) => calls.pushes.push(href) }) },
    "@/components/select-categoria-jerarquico": controls(["SelectCategoriaJerarquico"]),
    "@/components/rango-precio": controls(["RangoPrecio"]),
    "@/lib/precios": { PRECIO_MAX: 100000 },
    "@/lib/urgencias": { esFechaISOValida: () => true, fechaHoyEnEspana: () => "2026-10-12", OPCION_FECHA_EXACTA: "exacta", urgenciaParaFecha: () => "flexible", URGENCIAS: [] },
    "@/lib/provincias": { PROVINCIAS_ES: [] },
    "@/lib/supabase/client": { createClient: () => supabase },
    "@/components/solicitud-servicio-acceso": { SolicitudServicioAcceso: "AuthPrompt" },
  })
  return {
    calls,
    render() { cursor = 0; let element = Component({ embedded: true, usuarioId: user.id }); effects.splice(0).forEach((effect) => cleanups.push(effect())); const wasMounted = mounted; mounted = true; if (!wasMounted) { cursor = 0; element = Component({ embedded: true, usuarioId: user.id }) }; return element },
    emit(session) { callback("SIGNED_IN", session) },
    setAuth(result) { authResult = result },
    cleanup() { cleanups.forEach((cleanup) => cleanup?.()); assert.equal(callback, null) },
  }
}

test("logout, anonymous sessions and account changes remove all editable fields immediately", () => {
  for (const session of [null, { user: { ...user, is_anonymous: true } }, { user: { ...user, id: "another-account" } }]) {
    const f = fixture()
    assert.ok(walk(f.render()).some((element) => element.type === "form"))
    f.emit(session)
    assert.equal(f.render().type, "AuthPrompt")
    assert.equal(f.calls.refreshes, 1)
    f.cleanup()
  }
})

test("refreshing the same session keeps the questionnaire available", () => {
  const f = fixture()
  f.render()
  f.emit({ user })
  assert.ok(walk(f.render()).some((element) => element.type === "form"))
  assert.equal(f.calls.refreshes, 0)
  f.cleanup()
})

const values = { category: "synthetic", title: "Synthetic request", description: "Synthetic test description", location: "Madrid", budget: [50, 100], urgency: "flexible", neededDate: "" }
test("expired or switched sessions cannot upload attachments or publish a filled form", async () => {
  for (const result of [
    { data: { user: null }, error: null },
    { data: { user }, error: { message: "expired" } },
    { data: { user: { ...user, id: "another-account" } }, error: null },
    { data: { user: { ...user, is_anonymous: true } }, error: null },
  ]) {
    const f = fixture()
    const input = walk(f.render()).find((element) => element.type === "input" && element.props.type === "file")
    input.props.onChange({ target: { files: [{ name: "synthetic.png" }] } })
    f.setAuth(result)
    await walk(f.render()).find((element) => element.type === "form").props.onSubmit(values)
    assert.deepEqual(f.calls.uploads, [])
    assert.deepEqual(f.calls.writes, [])
    assert.equal(f.render().type, "AuthPrompt")
    f.cleanup()
  }
})

test("registered user can still publish and reaches their requests", async () => {
  const f = fixture()
  await walk(f.render()).find((element) => element.type === "form").props.onSubmit(values)
  assert.equal(f.calls.writes.length, 1)
  assert.deepEqual(f.calls.pushes, ["/mis-solicitudes"])
  f.cleanup()
})

test("direct server action rejects both absent and anonymous users before querying data", async () => {
  for (const usuario of [null, { id: "anonymous", is_anonymous: true }]) {
    const { crearSolicitud } = load("app/actions/solicitudes.ts", {
      "@/lib/notificaciones-contexto": {}, "@/lib/i18n-servidor": { textoServidor: async (text) => text },
      "@/lib/supabase/admin": {},
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: usuario } }) }, from: () => assert.fail("Must not query user data") }) },
      "next/cache": {}, "@/lib/empresas/identidad": {}, "next/server": {}, "./invitaciones": {},
      "@/lib/moderacion": {}, "@/lib/categorias": { CATEGORIAS_SERVICIO_NOMBRES: [] },
      "@/lib/urgencias": {}, "@/lib/precios": {},
    })
    assert.match((await crearSolicitud({})).error, /No autenticado/)
  }
})
