// Offline shell only: never store navigation HTML, sessions or financial data.
const VERSION = "diime-offline-bilingual-4"
const OFFLINE_URLS = { es: "/offline-es.html", en: "/offline-en.html" }
const ICON_URL = "/icons/icon-192.png?v=logo-safe-3"
const STATIC_URLS = [...Object.values(OFFLINE_URLS), ICON_URL]
let idiomaSeleccionado
let guardandoIdioma = Promise.resolve()

function esIdiomaValido(idioma) {
  return idioma === "es" || idioma === "en"
}

// Persist only the language preference. This database contains no user data.
function basePreferencias() {
  return new Promise((resolve, reject) => {
    const apertura = indexedDB.open("diime-offline-preferences", 1)
    apertura.onupgradeneeded = () => {
      if (!apertura.result.objectStoreNames.contains("preferences")) {
        apertura.result.createObjectStore("preferences")
      }
    }
    apertura.onsuccess = () => resolve(apertura.result)
    apertura.onerror = () => reject(apertura.error)
    apertura.onblocked = () => reject(new Error("Offline preferences unavailable"))
  })
}

async function guardarIdioma(idioma) {
  const base = await basePreferencias()
  try {
    await new Promise((resolve, reject) => {
      const transaccion = base.transaction("preferences", "readwrite")
      transaccion.objectStore("preferences").put(idioma, "language")
      transaccion.oncomplete = resolve
      transaccion.onerror = () => reject(transaccion.error)
      transaccion.onabort = () => reject(transaccion.error)
    })
  } finally {
    base.close()
  }
}

async function idiomaPara(request) {
  if (esIdiomaValido(idiomaSeleccionado)) return idiomaSeleccionado
  try {
    const base = await basePreferencias()
    try {
      const guardado = await new Promise((resolve, reject) => {
        const lectura = base.transaction("preferences", "readonly").objectStore("preferences").get("language")
        lectura.onsuccess = () => resolve(lectura.result)
        lectura.onerror = () => reject(lectura.error)
      })
      // A newer message takes precedence over a read already in progress.
      if (!esIdiomaValido(idiomaSeleccionado) && esIdiomaValido(guardado)) idiomaSeleccionado = guardado
    } finally {
      base.close()
    }
  } catch { /* Private browsing can deny storage; the shell still works. */ }
  if (esIdiomaValido(idiomaSeleccionado)) return idiomaSeleccionado
  const preferencias = (request.headers.get("accept-language") || "").split(",").map((preferencia) => {
    const [etiqueta, calidad] = preferencia.trim().split(";")
    return { idioma: etiqueta.split("-")[0].toLowerCase(), peso: calidad ? Number(calidad.trim().replace(/^q=/, "")) : 1 }
  }).filter(({ peso }) => Number.isFinite(peso) && peso > 0).sort((a, b) => b.peso - a.peso)
  for (const { idioma } of preferencias) {
    if (esIdiomaValido(idioma)) return idioma
  }
  return "es"
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(STATIC_URLS)))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      // Remove old Diime caches, including previously stored private HTML.
      .then((claves) => Promise.all(claves.filter((clave) => clave.startsWith("diime-") && clave !== VERSION).map((clave) => caches.delete(clave))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type !== "DIIME_IDIOMA" || !esIdiomaValido(event.data.idioma)) return
  // Only a page controlled by this origin may set the local preference.
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return
  idiomaSeleccionado = event.data.idioma
  const idioma = idiomaSeleccionado
  guardandoIdioma = guardandoIdioma.catch(() => {}).then(() => guardarIdioma(idioma))
  event.waitUntil(guardandoIdioma.catch(() => {}))
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // This is the only subresource served from cache; no app scripts or data.
  if (`${url.pathname}${url.search}` === ICON_URL) {
    event.respondWith(caches.open(VERSION).then(async (cache) => (await cache.match(ICON_URL)) || fetch(request)))
    return
  }
  if (request.mode !== "navigate") return
  if (/^\/(api|auth|stripe)(\/|$)/.test(url.pathname)) return

  event.respondWith(
    fetch(request).catch(async () => {
      const idioma = await idiomaPara(request)
      const cache = await caches.open(VERSION)
      const offline = await cache.match(OFFLINE_URLS[idioma])
      if (offline) return new Response(offline.body, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Language": idioma },
      })
      // Also work if the browser has evicted the static shell cache.
      return new Response(idioma === "en" ? "Diime is offline. Check your connection and reload." : "Diime está sin conexión. Comprueba tu conexión y recarga.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Content-Language": idioma },
      })
    }),
  )
})
