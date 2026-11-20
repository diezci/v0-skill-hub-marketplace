// Measures the actual home cards with variable profile text and both real translations.
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { compileLayoutCss, createLayoutLoader } from "./fixtures/layout-renderer.mjs"

const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'/%3E"
const professionals = ["Ana", "María del Carmen Fernández de los Ríos", "José", "M".repeat(90)].map((name, i) => ({
  id: i + 1, nombre_completo: name, titulo_profesional: i % 2 ? "Rehabilitación y construcción de viviendas" : "Pintura",
  descripcion: i % 2 ? "Reformas integrales, mantenimiento y rehabilitación de edificios antiguos. ".repeat(4) : "Reformas.",
  categoria: i % 2 ? "Reformas integrales" : "Pintura", ubicacion: i === 3 ? "Ubicación".repeat(12) : "Madrid",
  foto_portada: image, foto_perfil: image, tarifa_hora: [0, 1000, 45, 999.99][i],
  total_reviews: i * 156, rating_promedio: 4.6, verificado: i % 2 === 1,
}))
let lang = "es", stateIndex = 0
const effects = [], states = []
const load = createLayoutLoader({
  language: () => lang,
  dependency(name, relative) {
    if (name === "@/app/actions/profiles") return { obtenerProfesionalesDestacados: async () => professionals }
    if (name === "react" && relative === "components/featured-gigs.tsx") return {
      ...React,
      useState(initial) {
        const i = stateIndex++
        if (!(i in states)) states[i] = initial
        return [states[i], next => { states[i] = next }]
      },
      useEffect: effect => { effects.push(effect) },
    }
  },
})
const categories = load("components/categories.tsx").default
const steps = load("components/how-it-works.tsx").default
const featured = load("components/featured-gigs.tsx").default
featured()
effects.splice(0).forEach(effect => effect())
await new Promise(resolve => setImmediate(resolve))
const css = await compileLayoutCss()
function fixture(locale, size, native) {
  lang = locale
  stateIndex = 0
  const section = (id, component) => React.createElement("div", { id }, React.createElement(component))
  const markup = renderToStaticMarkup(React.createElement("main", { "data-app-main": true },
    section("categories", categories), section("steps", steps), section("featured", featured)))
  return `<!DOCTYPE html><html lang="${locale}" data-native="${native}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style><style>html{font-size:${size}px}</style></head><body>${markup}</body></html>`
}

function checkHomeCards() {
  const errors = []
  const checkRows = (section, cards, landmarks) => {
    const rows = new Map()
    for (const card of cards) {
      const bounds = card.getBoundingClientRect()
      const row = Math.round(bounds.top)
      const top = landmarks(card).map(node => node.getBoundingClientRect().top)
      if (rows.has(row) && top.some((value, i) => Math.abs(value - rows.get(row)[i]) > 1)) errors.push(`${section}: misaligned sections in row ${row}`)
      rows.set(row, top)
      if (card.scrollWidth > card.clientWidth + 1 || bounds.right > document.documentElement.clientWidth + 1) errors.push(`${section}: card overflows`)
    }
  }
  const findCards = selector => Array.from(document.querySelectorAll(selector))
  const categoryCards = findCards('#categories [data-slot="card"]')
  const stepCards = findCards("#steps .grid > div").filter(card => card.querySelector("h3"))
  const featuredCards = findCards('#featured [data-slot="card"]')
  if (categoryCards.length !== 8 || stepCards.length !== 4 || featuredCards.length !== 4) errors.push("Expected home card fixtures missing")
  checkRows("categories", categoryCards, card => [card.querySelector("h3"), ...card.querySelectorAll("p")])
  checkRows("steps", stepCards, card => [card.querySelector("h3"), card.querySelector("p")])
  checkRows("featured", featuredCards, card => {
    const title = card.querySelector("h3"), info = title.nextElementSibling.nextElementSibling
    return [title, title.nextElementSibling, info, info.lastElementChild]
  })
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) errors.push("Horizontal page overflow")
  return errors
}

if (process.env.DIIME_LAYOUT_FIXTURE_DIR) {
  const dir = process.env.DIIME_LAYOUT_FIXTURE_DIR
  mkdirSync(dir, { recursive: true })
  for (const locale of ["es", "en"]) for (const size of [16, 20]) {
    const html = fixture(locale, size, false)
    assert.equal((html.match(/href="\/profesional\/\d"/g) || []).length, 4)
    writeFileSync(path.join(dir, `home-${locale}-${size}.html`), html)
  }
  console.log("Rendered 4 home fixtures with the real translated components and styles")
} else {
  const engine = process.env.DIIME_LAYOUT_ENGINE || "chromium"
  const playwright = await import(process.env.DIIME_PLAYWRIGHT_MODULE || "playwright")
  const executablePath = engine === "chromium" ? process.env.DIIME_CHROMIUM_EXECUTABLE_PATH : undefined
  const browser = await playwright[engine].launch({ executablePath })
  try {
    const page = await browser.newPage()
    await page.route(/^https?:/, route => route.abort())
    for (const locale of ["es", "en"]) for (const size of [16, 20]) for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.setContent(fixture(locale, size, width < 768))
      await page.evaluate(() => document.fonts.ready)
      const errors = await page.evaluate(checkHomeCards)
      assert.deepEqual(errors, [], `${engine}, ${locale}, ${width}px, font ${size}px: ${errors.join(", ")}`)
    }
    console.log(`PASS: 20 home card layouts (${engine}), featured professionals, categories and project steps`)
  } finally { await browser.close() }
}
