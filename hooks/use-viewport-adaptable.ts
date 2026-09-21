"use client"

import { useEffect } from "react"

/** Sigue el área visible al girar, redimensionar o abrir el teclado sin remontar la página. */
export function useViewportAdaptable() {
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    let frame: number | null = null
    let layoutAnterior: { ancho: number; alto: number } | null = null

    const actualizar = () => {
      frame = null
      const layout = { ancho: window.innerWidth, alto: window.innerHeight }
      const conZoom = !!viewport && Math.abs(viewport.scale - 1) > 0.01
      const cambiaLayout = !layoutAnterior || layout.ancho !== layoutAnterior.ancho || layout.alto !== layoutAnterior.alto
      // El pinch y su desplazamiento no deben encoger el diseño. Sin embargo,
      // girar o plegar con zoom activo sí cambia el espacio de la ventana.
      if (conZoom && !cambiaLayout) return
      // Con zoom, window.resize puede llegar un frame antes de que cambie
      // VisualViewport. Su altura anterior (aunque se multiplique por la
      // escala) no describe la ventana nueva. Usamos el viewport de diseño y
      // dejamos al navegador desplazar el contenido ampliado.
      const alturaVisible = viewport && !conZoom ? viewport.height : layout.alto
      const altura = Math.min(layout.alto, alturaVisible)
      if (!Number.isFinite(altura) || altura <= 0) return
      layoutAnterior = layout
      root.style.setProperty("--diime-viewport-height", `${Math.round(altura)}px`)
      root.style.setProperty("--diime-viewport-top", `${conZoom ? 0 : Math.max(0, Math.round(viewport?.offsetTop || 0))}px`)
    }
    const programar = () => {
      if (frame === null) frame = window.requestAnimationFrame(actualizar)
    }

    actualizar()
    window.addEventListener("resize", programar)
    window.addEventListener("orientationchange", programar)
    window.addEventListener("pageshow", programar)
    viewport?.addEventListener("resize", programar)
    viewport?.addEventListener("scroll", programar)
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", programar)
      window.removeEventListener("orientationchange", programar)
      window.removeEventListener("pageshow", programar)
      viewport?.removeEventListener("resize", programar)
      viewport?.removeEventListener("scroll", programar)
      root.style.removeProperty("--diime-viewport-height")
      root.style.removeProperty("--diime-viewport-top")
    }
  }, [])
}
