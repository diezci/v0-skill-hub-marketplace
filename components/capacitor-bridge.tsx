"use client"

import { useEffect } from "react"
import { Capacitor } from "@capacitor/core"
import { App } from "@capacitor/app"
import { Browser } from "@capacitor/browser"
import { Haptics, ImpactStyle } from "@capacitor/haptics"
import { Keyboard, KeyboardResize } from "@capacitor/keyboard"
import { Network } from "@capacitor/network"
import { SplashScreen } from "@capacitor/splash-screen"
import { StatusBar, Style } from "@capacitor/status-bar"
import { createClient } from "@/lib/supabase/client"

const DEEP_LINK = "es.diime.app://auth/callback"

export function CapacitorBridge() {
  useEffect(() => {
    const esNativa = Capacitor.isNativePlatform()
    const previewSolicitada = new URLSearchParams(window.location.search).has("native-preview")
    if (process.env.NODE_ENV !== "production" && previewSolicitada) sessionStorage.setItem("diime_native_preview", "1")
    const esPreview = process.env.NODE_ENV !== "production" && (previewSolicitada || sessionStorage.getItem("diime_native_preview") === "1")
    if (!esNativa && !esPreview) return

    const root = document.documentElement
    root.dataset.native = "true"
    root.dataset.nativePlatform = esPreview ? "preview" : Capacitor.getPlatform()

    if (esPreview) {
      return () => {
        delete root.dataset.native
        delete root.dataset.nativePlatform
      }
    }

    let mounted = true
    const cleanups: Array<() => void> = []

    const actualizarBarras = async () => {
      const modoOscuro = root.classList.contains("dark")
      await StatusBar.setStyle({ style: modoOscuro ? Style.Dark : Style.Light }).catch(() => {})
      await StatusBar.setBackgroundColor({ color: modoOscuro ? "#0a0a0a" : "#ffffff" }).catch(() => {})
    }

    const preparar = async () => {
      await Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => {})
      await actualizarBarras()
      const estado = await Network.getStatus().catch(() => null)
      if (estado && mounted) root.dataset.network = estado.connected ? "online" : "offline"
      await SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {})
    }
    preparar()

    const observer = new MutationObserver(actualizarBarras)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    cleanups.push(() => observer.disconnect())

    Network.addListener("networkStatusChange", ({ connected }) => {
      root.dataset.network = connected ? "online" : "offline"
    }).then((handle) => cleanups.push(() => void handle.remove()))

    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back()
      else App.minimizeApp().catch(() => {})
    }).then((handle) => cleanups.push(() => void handle.remove()))

    App.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith(DEEP_LINK)) return
      await Browser.close().catch(() => {})
      const code = new URL(url).searchParams.get("code")
      if (!code) {
        window.location.assign("/auth/login?error=oauth")
        return
      }
      const { error } = await createClient().auth.exchangeCodeForSession(code)
      window.location.assign(error ? "/auth/login?error=oauth" : "/")
    }).then((handle) => cleanups.push(() => void handle.remove()))

    const manejarClick = (event: MouseEvent) => {
      const objetivo = event.target as HTMLElement | null
      const vibrable = objetivo?.closest<HTMLElement>("[data-native-haptic]")
      if (vibrable) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})

      const enlace = objetivo?.closest<HTMLAnchorElement>("a[href]")
      if (!enlace || enlace.target === "_self") return
      const destino = new URL(enlace.href, window.location.href)
      if (!destino.protocol.startsWith("http") || destino.origin === window.location.origin) return
      event.preventDefault()
      Browser.open({ url: destino.href }).catch(() => window.open(destino.href, "_blank", "noopener,noreferrer"))
    }
    document.addEventListener("click", manejarClick)
    cleanups.push(() => document.removeEventListener("click", manejarClick))

    return () => {
      mounted = false
      cleanups.forEach((cleanup) => cleanup())
      delete root.dataset.native
      delete root.dataset.nativePlatform
      delete root.dataset.network
    }
  }, [])

  return null
}
