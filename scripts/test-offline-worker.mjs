import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

const workerSource = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8")
const origin = "https://www.diime.es"
const staticPaths = ["/offline-es.html", "/offline-en.html", "/icons/icon-192.png?v=logo-safe-3"]
const html = Object.fromEntries(["es", "en"].map((idioma) => [idioma, fs.readFileSync(new URL(`../public/offline-${idioma}.html`, import.meta.url), "utf8")]))

function entorno({ almacen = new Map(), preferencias = new Map(), sinAlmacenamiento = false } = {}) {
  const listeners = {}
  let online = true
  let claims = 0
  let writes = 0
  let respuestaRed = new Response("private account and payment details")
  const cacheApi = {
    async keys() { return [...almacen.keys()] },
    async delete(key) { return almacen.delete(key) },
    async open(key) {
      if (!almacen.has(key)) almacen.set(key, new Map())
      const cache = almacen.get(key)
      return {
        async addAll(paths) {
          assert.deepEqual(Array.from(paths), staticPaths)
          for (const ruta of paths) {
            const idioma = ruta.includes("-en.") ? "en" : "es"
            cache.set(ruta, new Response(ruta.endsWith(".html") ? html[idioma] : "icon"))
            writes++
          }
        },
        async match(key) { return cache.get(typeof key === "string" ? key : key.url)?.clone() },
        async put() { throw new Error("Navigation responses must never be cached") },
      }
    },
  }
  const indexedDB = {
    open(name, version) {
      assert.equal(name, "diime-offline-preferences")
      assert.equal(version, 1)
      if (sinAlmacenamiento) throw new Error("Storage blocked")
      const result = {
        objectStoreNames: { contains: () => true },
        close() {},
        transaction(store, mode) {
          assert.equal(store, "preferences")
          const transaction = {
            objectStore() {
              return {
                put(value, key) {
                  assert.equal(mode, "readwrite")
                  assert.equal(key, "language")
                  assert.ok(value === "es" || value === "en")
                  preferencias.set(key, value)
                  queueMicrotask(() => transaction.oncomplete?.())
                },
                get(key) {
                  assert.equal(mode, "readonly")
                  const request = { result: preferencias.get(key) }
                  queueMicrotask(() => request.onsuccess?.())
                  return request
                },
              }
            },
          }
          return transaction
        },
      }
      const request = { result }
      queueMicrotask(() => request.onsuccess?.())
      return request
    },
  }
  const self = {
    location: { origin },
    addEventListener(type, listener) { listeners[type] = listener },
    skipWaiting() {},
    clients: { async claim() { claims++ } },
  }
  vm.runInNewContext(workerSource, {
    self, caches: cacheApi, indexedDB, URL, Response, Promise,
    fetch: async () => {
      if (!online) throw new Error("Offline")
      return respuestaRed.clone()
    },
  })
  return {
    almacen, preferencias,
    setOnline(value) { online = value },
    setResponse(response) { respuestaRed = response },
    get writes() { return writes },
    get claims() { return claims },
    async lifecycle(type) {
      const promises = []
      listeners[type]({ waitUntil: (promise) => promises.push(promise) })
      await Promise.all(promises)
    },
    async message(idioma, source = `${origin}/mi-cuenta`, type = "DIIME_IDIOMA") {
      const promises = []
      listeners.message({ data: { type, idioma }, source: { url: source }, waitUntil: (promise) => promises.push(promise) })
      await Promise.all(promises)
    },
    async navigate(ruta, { method = "GET", mode = "navigate", language = "es-ES,en;q=0.8" } = {}) {
      let response
      const request = { url: new URL(ruta, origin).href, method, mode, headers: new Headers({ "accept-language": language }) }
      listeners.fetch({ request, respondWith: (promise) => { response = promise } })
      return response
    },
  }
}

const estado = entorno()
estado.almacen.set("diime-logo-safe-3", new Map([["/cobros", new Response("old private balance")]]))
estado.almacen.set("another-app-cache", new Map())
await estado.lifecycle("install")
await estado.lifecycle("activate")
assert.equal(estado.claims, 1)
assert.ok(!estado.almacen.has("diime-logo-safe-3"), "Old private page caches must be removed")
assert.ok(estado.almacen.has("another-app-cache"), "Do not delete unrelated cache storage")
assert.equal(estado.writes, 3)

for (const route of ["/mi-cuenta", "/cobros", "/trabajos/123/factura", "/admin/pagos", "/mensajes"]) {
  assert.equal(await (await estado.navigate(route)).text(), "private account and payment details")
}
assert.equal(estado.writes, 3, "Successful navigations never add cache entries")
estado.setResponse(new Response("server failure", { status: 500 }))
assert.equal((await estado.navigate("/cobros")).status, 500, "Do not mask HTTP errors with an offline shell")
estado.setOnline(false)
await estado.message("en")
const englishShell = await estado.navigate("/cobros")
assert.equal(englishShell.status, 503)
assert.equal(englishShell.headers.get("cache-control"), "no-store")
assert.equal(englishShell.headers.get("content-language"), "en")
assert.equal(await englishShell.text(), html.en)
assert.equal(await (await estado.navigate("/mensajes")).text(), html.en)
await estado.message("es")
assert.equal(await (await estado.navigate("/cobros")).text(), html.es)
assert.equal(estado.preferencias.get("language"), "es")
await estado.message("en", "https://unrelated.example/page")
await estado.message("fr")
await estado.message("en", `${origin}/`, "UNRELATED_MESSAGE")
assert.equal(await (await estado.navigate("/cobros")).text(), html.es, "Invalid preference messages are ignored")

const reiniciado = entorno({ almacen: estado.almacen, preferencias: estado.preferencias })
reiniciado.setOnline(false)
assert.equal(await (await reiniciado.navigate("/cobros", { language: "en-GB" })).text(), html.es, "Selected language survives worker restart")
await reiniciado.message("en")
assert.equal(await (await reiniciado.navigate("/trabajos/123/factura")).text(), html.en)
for (const ruta of ["/api/payments", "/auth/callback?code=secret", "/stripe/connect/return", "https://api.stripe.com/test"]) {
  assert.equal(await reiniciado.navigate(ruta), undefined, `Sensitive route must bypass worker: ${ruta}`)
}
assert.equal(await reiniciado.navigate("/cobros", { method: "POST" }), undefined)
assert.equal(await reiniciado.navigate("/_next/data/test", { mode: "cors" }), undefined)
assert.equal(await (await reiniciado.navigate(staticPaths[2], { mode: "cors" })).text(), "icon")

const privado = entorno({ almacen: estado.almacen, sinAlmacenamiento: true })
privado.setOnline(false)
assert.equal(await (await privado.navigate("/", { language: "en-GB,es;q=0.8" })).text(), html.en)
assert.equal(await (await privado.navigate("/", { language: "es;q=0,en;q=0.9" })).text(), html.en)
await privado.message("es")
assert.equal(await (await privado.navigate("/", { language: "en" })).text(), html.es, "Language selection works when persistent storage is denied")

const sinCache = entorno({ sinAlmacenamiento: true })
sinCache.setOnline(false)
const respuestaMinima = await sinCache.navigate("/cobros", { language: "en" })
assert.equal(respuestaMinima.status, 503)
assert.equal(respuestaMinima.headers.get("content-language"), "en")
assert.equal(respuestaMinima.headers.get("cache-control"), "no-store")
assert.match(await respuestaMinima.text(), /offline/)
for (const idioma of ["es", "en"]) {
  assert.match(html[idioma], new RegExp(`<html lang="${idioma}">`))
  assert.ok(!html[idioma].includes("https://"), "Offline documents must not depend on remote assets")
}
console.log("PASS: offline EN/ES, language persistence, legacy cleanup, network-only private pages, sensitive-route bypass, cache eviction and blocked storage")
