"use client"

import { useEffect, useRef } from "react"
import { Capacitor } from "@capacitor/core"
import { useIdioma } from "@/components/idioma-provider"

// Registra el service worker que hace instalable la app.
//
// Solo en producción: en desarrollo, un service worker cacheando navegaciones
// pelea con el recargado en caliente de Next y da fallos difíciles de rastrear.
export function RegistrarSW() {
  const { idioma } = useIdioma()
  const idiomaActual = useRef(idioma)
  useEffect(() => { idiomaActual.current = idioma }, [idioma])

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return

    // Capacitor ya tiene una pantalla local de error. La caché de navegación
    // de la PWA puede mostrar HTML antiguo sin sus scripts al quedarse sin red.
    // Retirar solo nuestro registro heredado; no borrar datos de la sesión.
    if (Capacitor.isNativePlatform() || navigator.userAgent.includes("DiimeNative/")) {
      void navigator.serviceWorker.getRegistration("/").then((registration) => {
        const worker = registration?.active || registration?.waiting || registration?.installing
        if (worker && new URL(worker.scriptURL).pathname === "/sw.js") return registration?.unregister()
      }).catch((error) => console.error("[native] no se pudo retirar el service worker:", error))
      return
    }

    // Tras la carga, para no competir por ancho de banda con la primera pintura.
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        // Registration may happen after a language change while the page loads.
        const mensaje = { type: "DIIME_IDIOMA", idioma: idiomaActual.current }
        registration.active?.postMessage(mensaje)
        registration.waiting?.postMessage(mensaje)
        registration.installing?.postMessage(mensaje)
      }).catch((e) => {
        console.error("[pwa] no se pudo registrar el service worker:", e)
      })
    }

    if (document.readyState === "complete") registrar()
    else window.addEventListener("load", registrar, { once: true })
    return () => window.removeEventListener("load", registrar)
  }, [])

  return null
}
