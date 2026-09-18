"use client"

import type React from "react"
import { useEffect } from "react"
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

// El panel de administración (/admin) tiene su propio layout completo con barra
// lateral. Allí no mostramos el navbar/footer/chat público ni el padding del
// navbar, para que el admin tenga una experiencia exclusivamente de administración.
export function AppChrome({ children, actorEmpresaLocal }: { children: React.ReactNode; actorEmpresaLocal?: ActorEmpresa | null }) {
  const pathname = usePathname()
  const esMensajes = pathname?.startsWith("/mensajes") ?? false

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
      <main className={esMensajes ? "h-dvh min-h-0 flex-none overflow-hidden pt-16" : "flex-1 pt-16"}>
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
