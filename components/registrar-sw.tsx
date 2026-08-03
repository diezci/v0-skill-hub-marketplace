"use client"

import { useEffect } from "react"

// Registra el service worker que hace instalable la app.
//
// Solo en producción: en desarrollo, un service worker cacheando navegaciones
// pelea con el recargado en caliente de Next y da fallos difíciles de rastrear.
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return

    // Tras la carga, para no competir por ancho de banda con la primera pintura.
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.error("[pwa] no se pudo registrar el service worker:", e)
      })
    }

    if (document.readyState === "complete") registrar()
    else window.addEventListener("load", registrar, { once: true })
  }, [])

  return null
}
