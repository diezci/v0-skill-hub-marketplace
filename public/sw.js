// Service worker de Diime.
//
// Deliberadamente CONSERVADOR. Un service worker agresivo en una web con sesión
// y dinero de por medio es peligroso: puede servir el saldo, una oferta o una
// disputa desde una copia vieja, o dejar la sesión en un estado incoherente.
// Por eso aquí:
//
//   * Solo se tocan peticiones GET de navegación (abrir una página).
//   * Nunca se tocan API, autenticación, Supabase ni Stripe.
//   * La red SIEMPRE manda; la caché solo entra si no hay conexión.
//
// Su único cometido es que la app instalada abra y muestre algo con sentido sin
// cobertura, no acelerar la navegación.

const VERSION = "diime-logo-fit-2"
const OFFLINE_URL = "/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png?v=logo-fit-2"])),
  )
  // Activar esta versión sin esperar a que se cierren las pestañas antiguas.
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  )
})

// Rutas que NUNCA deben pasar por caché: datos, sesión y pagos.
function esSensible(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("stripe")
  )
}

self.addEventListener("fetch", (event) => {
  const { request } = event

  if (request.method !== "GET") return
  // Solo navegaciones: el resto (datos, imágenes, JS) va directo a la red.
  if (request.mode !== "navigate") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (esSensible(url)) return

  event.respondWith(
    fetch(request)
      .then((respuesta) => {
        // Guardamos una copia solo para poder responder sin conexión.
        const copia = respuesta.clone()
        caches.open(VERSION).then((cache) => cache.put(request, copia)).catch(() => {})
        return respuesta
      })
      .catch(async () => {
        const enCache = await caches.match(request)
        return enCache || caches.match(OFFLINE_URL)
      }),
  )
})
