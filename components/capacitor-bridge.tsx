"use client"

import { useEffect } from "react"
import { Capacitor } from "@capacitor/core"
import { App } from "@capacitor/app"
import { Browser } from "@capacitor/browser"
import { Haptics, ImpactStyle } from "@capacitor/haptics"
import { Keyboard, KeyboardResize } from "@capacitor/keyboard"
import { Network } from "@capacitor/network"
import { PushNotifications } from "@capacitor/push-notifications"
import { SplashScreen } from "@capacitor/splash-screen"
import { StatusBar, Style } from "@capacitor/status-bar"
import { registrarDispositivoPush } from "@/app/actions/push"
import { guardarTokenPushActual } from "@/lib/push/client"
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
    const supabase = createClient()
    let registrandoPush = false

    const publicarEstadoPush = (detail: Record<string, unknown>) => {
      if (mounted) window.dispatchEvent(new CustomEvent("diime:push-state", { detail }))
    }

    const guardarRegistroPush = async (token: string) => {
      guardarTokenPushActual(token)
      let ultimoError: string | undefined
      for (let intento = 0; intento < 3; intento += 1) {
        const resultado = await registrarDispositivoPush(token, Capacitor.getPlatform() as "ios" | "android")
        if (!resultado?.error) {
          publicarEstadoPush({ permiso: "granted", registrado: true })
          return true
        }
        ultimoError = resultado.error
        if (intento < 2) await new Promise((resolve) => window.setTimeout(resolve, 800 * (intento + 1)))
      }
      publicarEstadoPush({ permiso: "granted", registrado: false, error: ultimoError })
      return false
    }

    const actualizarBarras = async () => {
      const modoOscuro = root.classList.contains("dark")
      // Capacitor nombra el estilo por el fondo recomendado: `Style.Dark`
      // produce iconos claros para fondos oscuros y `Style.Light`, iconos
      // oscuros para fondos claros.
      await StatusBar.setStyle({ style: modoOscuro ? Style.Dark : Style.Light }).catch(() => {})
      await StatusBar.setBackgroundColor({ color: modoOscuro ? "#080c10" : "#ffffff" }).catch(() => {})
    }

    const registrarPush = async () => {
      if (registrandoPush) return
      registrandoPush = true
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        if (Capacitor.getPlatform() === "android") {
          await PushNotifications.createChannel({
            id: "diime_messages",
            name: "Mensajes y avisos",
            description: "Mensajes, ofertas y novedades importantes de Diime",
            importance: 5,
            visibility: 1,
            vibration: true,
            lights: true,
            lightColor: "#10B981",
          }).catch(() => {})
        }

        let permiso = await PushNotifications.checkPermissions()
        if (permiso.receive === "prompt" || permiso.receive === "prompt-with-rationale") {
          permiso = await PushNotifications.requestPermissions()
        }
        publicarEstadoPush({ permiso: permiso.receive, registrado: false })
        if (permiso.receive === "granted") await PushNotifications.register()
      } finally {
        registrandoPush = false
      }
    }

    const preparar = async () => {
      await Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => {})
      await actualizarBarras()
      const estado = await Network.getStatus().catch(() => null)
      if (estado && mounted) root.dataset.network = estado.connected ? "online" : "offline"
      await SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {})
    }

    const configurarPush = async () => {
      const registration = await PushNotifications.addListener("registration", async ({ value }) => {
        await guardarRegistroPush(value)
      })
      if (!mounted) await registration.remove()
      else cleanups.push(() => void registration.remove())

      const registrationError = await PushNotifications.addListener("registrationError", (error) => {
        console.error("[push] No se pudo registrar el dispositivo:", error)
        publicarEstadoPush({ permiso: "granted", registrado: false, error: error.error })
      })
      if (!mounted) await registrationError.remove()
      else cleanups.push(() => void registrationError.remove())

      const received = await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        // La configuración nativa muestra banner, sonido y preview también en
        // primer plano. Este evento avisa a la web para refrescar contadores.
        window.dispatchEvent(new CustomEvent("diime:push", { detail: notification }))
      })
      if (!mounted) await received.remove()
      else cleanups.push(() => void received.remove())

      const action = await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const link = typeof notification.data?.link === "string" ? notification.data.link : "/"
        window.location.assign(link.startsWith("/") ? link : "/")
      })
      if (!mounted) await action.remove()
      else cleanups.push(() => void action.remove())

      if (mounted) await registrarPush().catch(() => {})
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "TOKEN_REFRESHED") {
        window.setTimeout(() => registrarPush().catch(() => {}), 0)
      }
    })
    cleanups.push(() => authListener.subscription.unsubscribe())

    void configurarPush().finally(() => preparar())

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

    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) registrarPush().catch(() => {})
    }).then((handle) => cleanups.push(() => void handle.remove()))

    App.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith(DEEP_LINK)) return
      await Browser.close().catch(() => {})
      const callbackUrl = new URL(url)
      const code = callbackUrl.searchParams.get("code")
      if (!code) {
        window.location.assign("/auth/login?error=oauth")
        return
      }
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error && data.user && callbackUrl.searchParams.get("age") === "1") {
        const aceptacionLegal = new Date().toISOString()
        await supabase.auth.updateUser({
          data: {
            terms_accepted_at: aceptacionLegal,
            terms_version: "2026-08",
            mayor_edad_confirmada_at: aceptacionLegal,
            mayor_edad_version: "18-plus-2026-08",
          },
        })
        await supabase
          .from("profiles")
          .update({
            mayor_edad_confirmada_at: aceptacionLegal,
            mayor_edad_version: "18-plus-2026-08",
          })
          .eq("id", data.user.id)
      }
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
