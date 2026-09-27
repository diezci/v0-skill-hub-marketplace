import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import ts from "typescript"
import * as jsx from "react/jsx-runtime"

// Render only the server-page trees with isolated account fixtures. No network,
// email client, browser navigation or live Supabase access is used by this test.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const translations = new Map()

function loadTranslations(file) {
  const absolute = path.resolve(root, file)
  if (translations.has(absolute)) return translations.get(absolute)
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function("require", "module", "exports", code)((name) => {
    assert.ok(name.startsWith("."), `Unexpected translation dependency: ${name}`)
    const resolved = path.resolve(path.dirname(absolute), name)
    return loadTranslations(resolved.endsWith(".ts") ? resolved : `${resolved}.ts`)
  }, module, module.exports)
  translations.set(absolute, module.exports)
  return module.exports
}

const { traducir } = loadTranslations("lib/i18n.ts")
const ui = new Proxy({ __esModule: true }, { get: (target, name) => name in target ? target[name] : String(name) })

async function renderPage(file, idioma, authenticated = true) {
  const queries = []
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: "fixture-user", email: "private@example.com" } : null } }) },
    from(table) {
      queries.push(table)
      return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: null }) }
    },
  }
  new Function("require", "module", "exports", code)((name) => {
    if (name === "react/jsx-runtime") return jsx
    if (name === "@/lib/i18n-servidor") return { getT: async () => ({ idioma, t: (key, params) => traducir(idioma, key, params) }) }
    if (name === "next/link") return { __esModule: true, default: "Link" }
    if (name === "next/navigation") return { redirect: (url) => { throw new Error(`REDIRECT:${url}`) } }
    if (name === "@/lib/supabase/server") return { createClient: async () => client }
    if (name === "@/lib/preferencias-notificaciones") return { preferenciasEmailDesdeFila: () => ({}) }
    if (name === "@/lib/utils") return { formatearFecha: (value) => value }
    if (name === "lucide-react" || name.startsWith("@/components/")) return ui
    throw new Error(`Unexpected page dependency: ${name}`)
  }, module, module.exports)
  return { tree: await module.exports.default(), queries }
}

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : !tree || typeof tree !== "object" || !tree.props ? [] : [tree, ...nodes(tree.props.children)]
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree && typeof tree === "object" ? text(tree.props?.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : ""
const link = (tree, href) => nodes(tree).find((node) => node.props.href === href)

for (const idioma of ["es", "en"]) {
  test(`account support exposes help and suggestions without extra personal data (${idioma})`, async () => {
    const { tree, queries } = await renderPage("app/mi-cuenta/page.tsx", idioma)
    assert.equal(text(link(tree, "/ayuda")), idioma === "en" ? "Help centre" : "Centro de ayuda")
    const suggestion = link(tree, "mailto:contacto@diime.es?subject=Sugerencia%20sobre%20Diime")
    assert.ok(suggestion)
    assert.equal(text(suggestion), idioma === "en" ? "Send a suggestion" : "Enviar sugerencia")
    assert.doesNotMatch(suggestion.props.href, /body=|private@example|fixture-user/)
    assert.deepEqual(queries, ["profiles", "profesionales", "preferencias_notificaciones"])
    assert.ok(nodes(tree).some((node) => node.type === "ReportarIncidenciaDialog" && node.props.triggerLabel === "Reportar un problema"))
  })

  test(`help explains privacy and links to existing user controls (${idioma})`, async () => {
    const { tree, queries } = await renderPage("app/ayuda/page.tsx", idioma)
    assert.deepEqual(queries, [])
    const section = nodes(tree).find((node) => node.type === "section" && node.props["aria-labelledby"] === "ayuda-seguridad")
    assert.ok(section)
    const heading = nodes(section).find((node) => node.type === "h2" && node.props.id === "ayuda-seguridad")
    assert.equal(text(heading), idioma === "en" ? "Your security and privacy" : "Tu seguridad y privacidad")
    assert.match(text(section), idioma === "en" ? /what data Diime uses, how to report content/ : /qué datos utiliza Diime, cómo reportar contenido/)
    for (const [href, label] of [["/legal/privacidad", "Política de privacidad"], ["/legal/normas-comunidad", "Normas de la comunidad"], ["/eliminar-cuenta", "Eliminar mi cuenta"]]) {
      assert.equal(text(link(section, href)), traducir(idioma, label))
    }
    assert.doesNotMatch(text(section), /100%|certificad|certified|garantiza|guarantee/i)
    assert.ok(link(tree, "mailto:contacto@diime.es"))
    assert.ok(nodes(tree).some((node) => node.type === "SupportChatButton"))
    assert.equal(nodes(tree).filter((node) => node.type === "Card").length, 6, "Business FAQs remain present")
  })
}

test("account still requires authentication", async () => {
  await assert.rejects(renderPage("app/mi-cuenta/page.tsx", "es", false), /REDIRECT:\/auth\/login/)
})
