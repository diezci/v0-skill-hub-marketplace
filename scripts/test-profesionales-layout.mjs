// Browser geometry regression for the real professional listing and its real CSS.
// No server, database, credentials or outbound requests are required.
// Run: node scripts/test-profesionales-layout.mjs (install Playwright Chromium first).
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { compileLayoutCss, createLayoutLoader } from "./fixtures/layout-renderer.mjs"

const picture = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#d1fae5"/></svg>')
const profiles = [
  ["Antonio", "García", "Fontanero · Reformas de baño y fugas", "Fontanero con más de 12 años de experiencia en reformas de baño y reparación de fugas.", "Madrid", 35, 5, 1],
  ["Juan", "Díez García", "Asset Manager", "Gestor de carteras inmobiliarias, proyectos de valor añadido y rehabilitación.", "Madrid", 50, 5, 2],
  ["Pedro", "Pistacho", "Constructor nuclear", "Cuento con años de experiencia en la gestión de residuos y proyectos industriales.", "Madrid", 100, 4.7, 3],
  ["Miguel", "Torres", "Reformas integrales y albañilería", "Reformas integrales y albañilería", "Valencia", 30, 0, 0],
  ["Lucía", "Fernández", "Electricista certificada · Boletines y domótica", "Electricista certificada. Instalaciones, cuadros eléctricos, boletines y domótica.", "Barcelona", 38, 0, 0],
  ["María del Carmen", "Fernández de los Ríos y García", "Reformas integrales, rehabilitación energética, fontanería y mantenimiento de edificios históricos", "Asesoramiento y ejecución de proyectos muy extensos. ".repeat(12), "Santa Cruz de Tenerife", 1000, 4.95, 9876],
  ["Ana", "", "Pintora", "", "", 0, 0, 0],
  ["Profesional".repeat(10), "", "Especialista".repeat(24), "Descripción".repeat(100), "Provincia".repeat(15), 999.99, 5, 1],
].map(([nombre, apellido, titulo, bio, ubicacion, tarifa, rating, reviews], index) => ({
  id: `layout-professional-${index}`,
  titulo,
  tarifa_por_hora: tarifa,
  rating_promedio: rating,
  total_reseñas: reviews,
  habilidades: [],
  categorias_interes: index % 2 ? ["Reformas y mantenimiento de edificios"] : [],
  perfil: { nombre, apellido, bio, ubicacion, verificado: index % 2 === 0, foto_perfil: picture, foto_portada: picture },
}))

let language = "es"
let hookCursor = 0
let effectsStarted = false
const states = [], effects = []
const hooks = {
  ...React,
  useState(initial) {
    const index = hookCursor++
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial
    return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value }]
  },
  useMemo: compute => compute(),
  useEffect(effect) { if (!effectsStarted) effects.push(effect) },
}
const noNetwork = () => { throw Error("This layout test must not contact a real service") }
const load = createLayoutLoader({
  language: () => language,
  sourceFor: relative => relative === "components/gig-listing.tsx" && process.env.DIIME_GIG_LISTING_SOURCE,
  dependency(name, relative) {
    if (name === "react" && relative === "components/gig-listing.tsx") return hooks
    if (name === "next/navigation") return { useRouter: () => ({ push: noNetwork }) }
    if (name === "@/app/actions/profiles") return { obtenerProfesionales: async () => ({ data: profiles }) }
    if (name === "@/app/actions/messages") return { crearConversacion: noNetwork }
    if (name === "@/lib/supabase/client") return { createClient: noNetwork }
    if (name === "@/hooks/use-toast") return { useToast: () => ({ toast() {} }) }
    if (name === "@/components/gig-filters") return { __esModule: true, default: () => React.createElement("aside", { "aria-label": "Filtros" }) }
  },
})
const listingModule = load("components/gig-listing.tsx")
const renderListing = listingModule.default
listingModule.default = props => { hookCursor = 0; return renderListing(props) }

const companies = [4.9, 0].map((rating, index) => ({
  empresa: {
    id: `layout-company-${index}`, slug: `layout-company-${index}`,
    nombre: index ? "Equipo local" : "Rehabilitación".repeat(22),
    descripcion: index ? "" : "Rehabilitación de inmuebles y mejora de la eficiencia energética. ".repeat(8),
    ubicacion: index ? "Madrid" : "Provincia".repeat(20),
    servicios: index ? [] : ["Electricidad", "Revestimientos".repeat(18), "Restauración"],
    estadoVerificacion: index ? "pendiente" : "verificada",
  },
  resenas: [], ratingPromedio: rating || null, totalResenas: index ? 0 : 19,
}))

function renderDirectory(viewMode = "grid") {
  // Sorting the combined directory by rating puts different provider types in the same row.
  const viewState = states.findIndex(value => value === "grid" || value === "list")
  const sortState = states.findIndex(value => value === "recommended" || value === "rating")
  assert.ok(viewState >= 0 && sortState >= 0, "Directory view and sort controls must be initialized")
  states[viewState] = viewMode
  states[sortState] = "rating"
  return React.createElement(Content, { empresas: companies })
}

function measureLayout() {
  const rect = element => {
    const { top, right, bottom, left, width, height } = element.getBoundingClientRect()
    return { top, right, bottom, left, width, height }
  }
  const entries = [...document.querySelectorAll('[data-slot="card"]')].filter(card =>
    card.querySelector('h3, a[href^="/empresa/"]'))
  const cards = []
  const directory = entries.map(card => {
    const title = card.querySelector("h3")
    const footer = card.querySelector('[data-slot="card-footer"]')
    const price = [...card.querySelectorAll("p")].find(p => p.textContent.startsWith("€"))
    const actions = [...card.querySelectorAll('[data-slot="button"]')].map(rect)
    if (title && footer) {
      const description = title.nextElementSibling
      const metadata = description.nextElementSibling
      const content = card.querySelector('[data-slot="card-content"]')
      cards.push({
        card: rect(card), title: rect(title), description: rect(description), metadata: rect(metadata),
        footer: rect(footer), button: actions[0], price: rect(price), image: rect(card.querySelector("img")),
        contentClient: content.clientWidth, contentScroll: content.scrollWidth,
        footerClient: footer.clientWidth, footerScroll: footer.scrollWidth,
        titleLines: rect(title).height / parseFloat(getComputedStyle(title).lineHeight),
        descriptionLines: rect(description).height / parseFloat(getComputedStyle(description).lineHeight),
      })
    }
    return {
      company: !title, card: rect(card), footer: footer && rect(footer), price: price && rect(price), actions,
      badges: [...card.querySelectorAll('[data-slot="badge"]')].map(rect),
      client: card.clientWidth, scroll: card.scrollWidth,
    }
  })
  return { cards, directory, pageWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }
}

function checkLayout(geometry, label, expectedCount, viewMode = "grid") {
  const check = (condition, message) => { if (!condition) throw Error(message) }
  const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1
  const { directory } = geometry
  check(directory.filter(item => item.company).length === 2, `${label}: both company fixtures must render`)
  check(directory.filter(item => !item.company).length === expectedCount, `${label}: all professionals must render`)
  check(geometry.scrollWidth <= geometry.pageWidth + 1, `${label}: page must not overflow horizontally`)
  for (const item of directory) {
    const { card, price, actions } = item
    check(item.scroll <= item.client + 1, `${label}: directory card content overflows`)
    check(actions.length === (item.company || viewMode === "grid" ? 1 : 2), `${label}: missing directory action`)
    for (const box of [...actions, ...item.badges]) {
      check(box.width > 0 && box.height > 0 && box.left >= card.left - 1 && box.right <= card.right + 1 &&
        box.top >= card.top - 1 && box.bottom <= card.bottom + 1, `${label}: a badge or action is outside its card`)
    }
    if (!item.company) {
      check(price && actions.every(action => !overlap(price, action)), `${label}: price and action overlap`)
      if (viewMode === "list") check(!overlap(actions[0], actions[1]), `${label}: list actions overlap`)
    }
  }
  if (viewMode === "list") return
  check(geometry.cards.length === expectedCount, `${label}: grid footer missing`)
  const sameRow = (a, b) => Math.abs(a.card.top - b.card.top) <= 1
  for (const company of directory.filter(item => item.company)) {
    for (const peer of directory.filter(item => !item.company && sameRow(item, company))) {
      check(Math.abs(company.footer.top - peer.footer.top) <= 1, `${label}: mixed directory footer dividers must align`)
      check(Math.abs(company.actions[0].top - peer.actions[0].top) <= 1, `${label}: mixed directory actions must align`)
    }
  }
  const rows = []
  for (const measured of geometry.cards) {
    let row = rows.find(items => Math.abs(items[0].card.top - measured.card.top) <= 1)
    if (!row) rows.push(row = [])
    row.push(measured)
    check(measured.titleLines <= 2.05, `${label}: long titles must stay within two lines`)
    check(measured.descriptionLines <= 2.05, `${label}: descriptions must stay within two lines`)
    check(measured.contentScroll <= measured.contentClient + 1, `${label}: content must not overflow its card`)
    check(measured.footerScroll <= measured.footerClient + 1, `${label}: price and action must fit the footer`)
    check(measured.button.left >= measured.footer.left && measured.button.right <= measured.footer.right + 1, `${label}: message action must stay visible`)
    check(measured.footer.top >= measured.metadata.bottom - 1, `${label}: footer must follow metadata without overlap`)
    check(measured.footer.bottom <= measured.card.bottom + 1, `${label}: footer must remain within the card`)
    check(measured.button.left >= measured.price.right - 1 || measured.button.top >= measured.price.bottom - 1,
      `${label}: price and message action must not overlap in horizontal or stacked footers`)
  }
  // Compare landmarks within rows, including partially filled final rows.
  for (const row of rows) for (const item of row.slice(1)) {
    for (const landmark of ["title", "description", "metadata", "footer", "button", "price"]) {
      check(Math.abs(item[landmark].top - row[0][landmark].top) <= 1, `${label}: ${landmark} must align across each row`)
    }
    check(Math.abs(item.card.height - row[0].card.height) <= 1, `${label}: cards in a row must have equal heights`)
    check(Math.abs(item.image.height - row[0].image.height) <= 1, `${label}: covers must keep equal heights`)
  }
  // One-column layouts must preserve the same space for variable text too.
  if (rows.every(row => row.length === 1)) {
    const first = geometry.cards[0]
    for (const item of geometry.cards.slice(1)) for (const landmark of ["title", "description", "metadata", "footer"]) {
      check(Math.abs((item[landmark].top - item.card.top) - (first[landmark].top - first.card.top)) <= 1, `${label}: ${landmark} spacing must remain stable in single-column layouts`)
    }
  }
}

const Listing = load("components/gig-listing.tsx").default
Listing({})
effectsStarted = true
effects.forEach(effect => effect())
await new Promise(resolve => setImmediate(resolve))
const Content = load("components/profesionales-content.tsx").default
const css = await compileLayoutCss()
function renderFixture(idioma, fontSize, includeChecks = false, viewMode = "grid", platform = "web") {
  language = idioma
  const markup = renderToStaticMarkup(React.createElement("main", { "data-app-main": "", className: "flex-1 pt-16" },
    React.createElement("div", { className: "container mx-auto px-4 py-8" }, renderDirectory(viewMode))))
  const nativeAttrs = platform === "web" ? "" : `data-native="true" data-native-platform="${platform}"`
  const safeArea = platform === "web" ? "" : "--diime-safe-top:24px;--diime-safe-bottom:20px;--diime-safe-left:8px;--diime-safe-right:8px;"
  const checks = includeChecks ? `<script>
    const measureLayout = ${measureLayout.toString()};
    const checkLayout = ${checkLayout.toString()};
    window.runLayoutChecks = () => {
      const geometry = measureLayout();
      const label = ${JSON.stringify(idioma)} + ", " + innerWidth + "px, text ${fontSize / 16 * 100}%";
      try { checkLayout(geometry, label, ${profiles.length}, ${JSON.stringify(viewMode)}); window.layoutCheck = { passed: true, label, geometry }; }
      catch (error) { window.layoutCheck = { passed: false, label, error: error.message, geometry }; }
      document.getElementById("layout-status").textContent = window.layoutCheck.passed ? "PASS " + label : "FAIL " + window.layoutCheck.error;
      return window.layoutCheck;
    };
    addEventListener("resize", () => requestAnimationFrame(window.runLayoutChecks));
    document.fonts.ready.then(window.runLayoutChecks);
  </script>` : ""
  const status = includeChecks ? '<output id="layout-status" style="position:fixed;bottom:8px;left:8px;max-width:90vw;z-index:1000;background:#fff;border:1px solid #333;padding:8px;font:12px monospace">Checking layout…</output>' : ""
  return `<!doctype html><html lang="${idioma}" ${nativeAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>html{font-size:${fontSize}px;${safeArea}}</style></head><body>${markup}${status}${checks}</body></html>`
}

// Useful when the host cannot launch Chromium: these self-checking pages run
// exactly the same geometry assertions in a managed browser, on every resize.
if (process.env.DIIME_LAYOUT_FIXTURE_DIR) {
  const directory = process.env.DIIME_LAYOUT_FIXTURE_DIR
  mkdirSync(directory, { recursive: true })
  for (const idioma of ["es", "en"]) for (const fontSize of [16, 20]) {
    const file = path.join(directory, `profesionales-${idioma}-${fontSize}.html`)
    writeFileSync(file, renderFixture(idioma, fontSize, true))
    console.log(`WROTE ${file}`)
  }
  process.exit(0)
}

// An alternate installed copy is useful in restricted local environments;
// normal development and CI use the project's declared Playwright dependency.
const playwright = await import(process.env.DIIME_PLAYWRIGHT_MODULE || "playwright")
const engine = process.env.DIIME_LAYOUT_ENGINE || "chromium"
assert.ok(["chromium", "webkit"].includes(engine), "Expected chromium or webkit")
const browser = await playwright[engine].launch(engine === "chromium" && process.env.DIIME_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.DIIME_CHROMIUM_EXECUTABLE_PATH } : {})
const screenshotDir = process.env.DIIME_LAYOUT_SCREENSHOT_DIR
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true })
const device = engine === "webkit" ? "iPhone 13" : "Pixel 7"
const scenarios = [
  { platform: "web", options: {}, widths: [320, 390, 768, 1024, 1280, 1440, 1920], height: 1000 },
  { platform: engine === "webkit" ? "ios" : "android", options: playwright.devices[device], widths: [320, 390, 412, 844], height: 844 },
]
let passed = 0
try {
  for (const { platform, options, widths, height } of scenarios) {
    const context = await browser.newContext({ ...options, serviceWorkers: "block" })
    const outbound = []
    await context.route(/^https?:/, route => { outbound.push(route.request().url()); return route.abort() })
    const page = await context.newPage()
    for (const viewMode of ["grid", "list"]) for (const idioma of ["es", "en"]) for (const fontSize of [16, 20]) {
      await page.setContent(renderFixture(idioma, fontSize, false, viewMode, platform))
      await page.evaluate(() => document.fonts.ready)
      for (const width of widths) {
        await page.setViewportSize({ width, height: platform !== "web" && width === 844 ? 390 : height })
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const label = `${engine} ${platform} ${viewMode}, ${idioma}, ${width}px, text ${fontSize / 16 * 100}%`
        const geometry = await page.evaluate(measureLayout)
        checkLayout(geometry, label, profiles.length, viewMode)
        if (screenshotDir && idioma === "es" && fontSize === 16 && [390, 1440].includes(width)) {
          await page.screenshot({ path: path.join(screenshotDir, `${engine}-${platform}-${viewMode}-${width}.png`) })
        }
        console.log(`PASS ${label}`)
        passed++
      }
    }
    assert.deepEqual(outbound, [], "The test must make no network requests")
    await context.close()
  }
} finally { await browser.close() }
console.log(`${passed} directory layout scenarios passed in ${engine}.`)
