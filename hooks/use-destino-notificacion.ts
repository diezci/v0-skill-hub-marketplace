"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"

/** Abre la pestaña que contiene la entidad antes de desplazarla bajo el navbar. */
export function useDestinoNotificacion({ cargando, resolver, seleccionar }: {
  cargando: boolean
  resolver: (params: URLSearchParams) => { id: string; tab?: string } | null
  seleccionar?: (tab: string) => void
}) {
  const params = useSearchParams()
  const query = params.toString()
  const aplicado = useRef("")
  const [reapertura, setReapertura] = useState(0)
  const destino = resolver(new URLSearchParams(query))
  const destinoId = destino?.id
  const destinoTab = destino?.tab

  useEffect(() => {
    // Volver a pulsar el mismo aviso debe abrir su pestaña aunque la URL no
    // cambie después de que el usuario haya navegado entre pestañas locales.
    const reabrir = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest("a") : null
      if (!anchor) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.searchParams.toString() !== query) return
      if (!url.searchParams.has("notificacion")) return
      aplicado.current = ""
      setReapertura((valor) => valor + 1)
    }
    document.addEventListener("click", reabrir)
    return () => document.removeEventListener("click", reabrir)
  }, [query])

  useEffect(() => {
    if (cargando || !destinoId || aplicado.current === query) return
    if (destinoTab) seleccionar?.(destinoTab)
    // Las pestañas de Radix montan su contenido tras el cambio de estado.
    let frame = 0
    let intentos = 0
    const mostrar = () => {
      const elemento = document.getElementById(destinoId)
      if (!elemento && intentos++ < 10) { frame = requestAnimationFrame(mostrar); return }
      if (!elemento) return
      aplicado.current = query
      elemento.scrollIntoView({ behavior: "smooth", block: "start" })
      elemento.focus({ preventScroll: true })
      elemento.dataset.notificacionDestino = "true"
    }
    frame = requestAnimationFrame(mostrar)
    return () => cancelAnimationFrame(frame)
  }, [cargando, destinoId, destinoTab, query, seleccionar, reapertura])

  return destinoId
}
