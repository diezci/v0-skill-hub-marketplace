// Anonymous, read-only smoke check against the public rollout.
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"

const { chromium } = await import(process.env.DIIME_PLAYWRIGHT_MODULE || "playwright")
const url = "https://www.diime.es/profesionales"
const cardSelector = 'a[href^="/profesional/"] > [data-slot="card"]'
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ locale: "es-ES", serviceWorkers: "block" })
  const ready = page.locator(cardSelector).filter({ has: page.locator('h3.min-h-14') }).first()
  const deadline = Date.now() + 5 * 60_000
  let live = false
  while (!live && Date.now() < deadline) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 })
      if (response?.ok() && new URL(page.url()).origin === new URL(url).origin) {
        await ready.waitFor({ state: "visible", timeout: 7_000 })
        live = true
      }
    } catch {
      // A deployment can change while Next.js fetches its chunks. Retry a fresh navigation.
    }
    if (!live) await delay(8_000)
  }
  assert.ok(live, "Production did not serve the updated public directory within five minutes")

  for (const width of [390, 844, 1440]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 900 })
    await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    const { count, sharedRows, errors } = await page.locator(cardSelector).evaluateAll(cards => {
      const errors = new Set(), rows = new Map()
      let sharedRows = 0
      for (const card of cards) {
        const rect = card.getBoundingClientRect()
        const title = card.querySelector("h3")
        const summary = title?.nextElementSibling
        const metadata = summary?.nextElementSibling
        const footer = card.querySelector('[data-slot="card-footer"]')
        const price = footer?.querySelector("p:last-child")
        const action = footer?.querySelector("button")
        if (![title, summary, metadata, footer, price, action].every(Boolean)) {
          errors.add("Missing title, description, rating, price or action")
          continue
        }
        const button = action.getBoundingClientRect()
        if (button.width < 1 || button.height < 1 || button.left < rect.left - 1 ||
            button.right > rect.right + 1 || button.bottom > rect.bottom + 1 ||
            getComputedStyle(action).visibility !== "visible") errors.add("Message action clipped or hidden")
        if (card.scrollWidth > card.clientWidth + 1 || rect.right > document.documentElement.clientWidth + 1) {
          errors.add("Card overflows horizontally")
        }
        const row = Math.round(rect.top)
        const landmarks = [title, summary, metadata, footer, price, action].map(el => el.getBoundingClientRect().top)
        const peer = rows.get(row)
        if (peer) {
          sharedRows++
          if (landmarks.some((top, i) => Math.abs(top - peer[i]) > 1)) errors.add("Misaligned cards in the same row")
        } else rows.set(row, landmarks)
      }
      return { count: cards.length, sharedRows, errors: [...errors] }
    })
    assert.ok(count > 0, "No public profiles rendered")
    assert.deepEqual(errors, [], `Production layout at ${width}px: ${errors.join(", ")}`)
    console.log(`PASS www.diime.es/profesionales — ${width}px, ${count} profile cards, ${sharedRows} adjacent comparisons`)
  }
} finally {
  await browser.close()
}
