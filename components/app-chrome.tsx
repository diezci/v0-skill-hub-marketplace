"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { NotificacionesProvider } from "@/hooks/use-notificaciones-seccion"
import { AvisosSeccion } from "@/components/avisos-seccion"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import { ChatWidget } from "@/components/chat-widget"
import { BienvenidaPrimeraVisita } from "@/components/bienvenida-primera-visita"
import { BannerCookies } from "@/components/banner-cookies"
import { AvisosEnPantalla } from "@/components/avisos-en-pantalla"
import { ConfirmarMayoriaEdad } from "@/components/confirmar-mayoria-edad"
import { EntornoEmpresasLocal } from "@/components/empresas/entorno-local"
import type { ActorEmpresa } from "@/lib/empresas/types"
import { useViewportAdaptable } from "@/hooks/use-viewport-adaptable"
import { createClient } from "@/lib/supabase/client"
import { cierreSesionSolicitado } from "@/lib/auth-logout"
import { destinoAuthSeguro, EVENTO_REAUTENTICACION } from "@/lib/auth-redirect"
import { useT } from "@/components/idioma-provider"

// El panel de administración (/admin) tiene su propio layout completo con barra
// lateral. Allí no mostramos el navbar/footer/chat público ni el padding del
// navbar, para que el admin tenga una experiencia exclusivamente de administración.
export function AppChrome({ children, actorEmpresaLocal }: { children: React.ReactNode; actorEmpresaLocal?: ActorEmpresa | null }) {
  useViewportAdaptable()
  const t = useT()
  const pathname = usePathname()
  const esMensajes = pathname?.startsWith("/mensajes") ?? false
  const [sesionCerrada, setSesionCerrada] = useState<string | null>(null)

  useEffect(() => {
    if (actorEmpresaLocal) return
    const solicitar = (ruta: unknown) => {
      if (cierreSesionSolicitado()) return
      const destino = `/auth/login?next=${encodeURIComponent(destinoAuthSeguro(ruta))}`
      // Auth and the submitting form may detect the same expiry. Keep the
      // first precise destination so the login page cannot reload mid-entry.
      setSesionCerrada(actual => actual ?? destino)
    }
    const reautenticar = (evento: Event) => solicitar((evento as CustomEvent<{ ruta?: unknown }>).detail?.ruta)
    window.addEventListener(EVENTO_REAUTENTICACION, reautenticar)
    let unsubscribe: (() => void) | undefined
    try {
      const { data } = createClient().auth.onAuthStateChange((evento) => {
        // SIGNED_OUT se emite cuando el SDK ha eliminado la sesión. Un fallo
        // de logout no lo emite: en ese caso se conserva la vista para reintentar.
        // Invalid/expired links also emit SIGNED_OUT during SDK initialization.
        // Keep their public recovery screen; private views still unmount first.
        if (evento === "SIGNED_OUT" && !window.location.pathname.startsWith("/auth/")) {
          if (cierreSesionSolicitado()) { setSesionCerrada("/"); return }
          const destino = { ruta: `${window.location.pathname}${window.location.search}${window.location.hash}` }
          // Forms save their actor-scoped drafts synchronously before this
          // private tree unmounts, and may retain a precise resume destination.
          window.dispatchEvent(new CustomEvent("diime:sesion-caducada", { detail: destino }))
          solicitar(destino.ruta)
        }
      })
      unsubscribe = () => data.subscription.unsubscribe()
    } catch { /* Una página pública puede funcionar sin Supabase configurado. */ }
    return () => {
      window.removeEventListener(EVENTO_REAUTENTICACION, reautenticar)
      unsubscribe?.()
    }
  }, [actorEmpresaLocal])

  useEffect(() => {
    // El cierre explícito desmonta los datos privados aquí, pero su botón
    // navega al inicio cuando cerrarSesionActual confirma que terminó. Una
    // segunda navegación puede cancelar la primera en la WebView de iOS.
    if (sesionCerrada && sesionCerrada !== "/") window.location.replace(sesionCerrada)
  }, [sesionCerrada])

  // El chat es una vista de aplicación, no una página larga. Marcamos el
  // documento para bloquear el scroll exterior y dejar que solo se desplacen
  // la lista de conversaciones, los mensajes y el panel de archivos.
  useEffect(() => {
    if (!esMensajes) return
    // Si se entra desde una página larga, iOS/WKWebView puede conservar el
    // scroll del documento. Al bloquearlo en esa posición, la cabecera de la
    // lista queda escondida bajo el navbar. Volvemos al origen antes y una vez
    // más en el siguiente frame para cubrir la restauración de scroll de Next.
    window.scrollTo(0, 0)
    document.documentElement.dataset.messagesView = "true"
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0))
    return () => {
      window.cancelAnimationFrame(frame)
      delete document.documentElement.dataset.messagesView
    }
  }, [esMensajes])

  // Desmontar primero impide que una respuesta tardía o la caché de navegación
  // mantengan tarjetas privadas mientras se carga la página pública.
  if (sesionCerrada) return <main role="status" className="flex min-h-screen items-center justify-center">{t("Sesión cerrada")}</main>

  if (pathname?.startsWith("/admin")) {
    return <main className="min-h-screen">{children}</main>
  }

  return (
    <NotificacionesProvider desactivado={!!actorEmpresaLocal}>
      {/* Explicación breve para quien llega por primera vez. Va aquí, y no en el
          homepage, para que también la vea quien entra por un enlace directo a
          /demandas o a un perfil. */}
      {!actorEmpresaLocal && <BienvenidaPrimeraVisita />}
      <Navbar actorEmpresaLocal={actorEmpresaLocal} />
      <main data-app-main className={esMensajes ? "h-dvh min-h-0 flex-none overflow-hidden pt-16" : "flex-1 pt-16"}>
        {actorEmpresaLocal && <EntornoEmpresasLocal actor={actorEmpresaLocal} />}
        {!actorEmpresaLocal && pathname && <AvisosSeccion key={pathname} seccion={pathname} />}
        {children}
      </main>
      {!esMensajes && (
        <div data-app-footer data-home={pathname === "/" ? "true" : "false"}>
          <Footer />
        </div>
      )}
      {!actorEmpresaLocal && <>
        <ChatWidget />
        <BannerCookies />
        <AvisosEnPantalla />
        <ConfirmarMayoriaEdad />
      </>}
    </NotificacionesProvider>
  )
}
