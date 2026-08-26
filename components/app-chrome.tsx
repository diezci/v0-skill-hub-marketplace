"use client"

import type React from "react"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import { ChatWidget } from "@/components/chat-widget"
import { BienvenidaPrimeraVisita } from "@/components/bienvenida-primera-visita"
import { BannerCookies } from "@/components/banner-cookies"
import { AvisosEnPantalla } from "@/components/avisos-en-pantalla"
import { ConfirmarMayoriaEdad } from "@/components/confirmar-mayoria-edad"

// El panel de administración (/admin) tiene su propio layout completo con barra
// lateral. Allí no mostramos el navbar/footer/chat público ni el padding del
// navbar, para que el admin tenga una experiencia exclusivamente de administración.
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const esMensajes = pathname?.startsWith("/mensajes") ?? false

  // El chat es una vista de aplicación, no una página larga. Marcamos el
  // documento para bloquear el scroll exterior y dejar que solo se desplacen
  // la lista de conversaciones, los mensajes y el panel de archivos.
  useEffect(() => {
    if (!esMensajes) return
    document.documentElement.dataset.messagesView = "true"
    return () => {
      delete document.documentElement.dataset.messagesView
    }
  }, [esMensajes])

  if (pathname?.startsWith("/admin")) {
    return <main className="min-h-screen">{children}</main>
  }

  return (
    <>
      {/* Explicación breve para quien llega por primera vez. Va aquí, y no en el
          homepage, para que también la vea quien entra por un enlace directo a
          /demandas o a un perfil. */}
      <BienvenidaPrimeraVisita />
      <Navbar />
      <main className={esMensajes ? "h-dvh min-h-0 flex-none overflow-hidden pt-16" : "flex-1 pt-16"}>
        {children}
      </main>
      {!esMensajes && <Footer />}
      <ChatWidget />
      <BannerCookies />
      <AvisosEnPantalla />
      <ConfirmarMayoriaEdad />
    </>
  )
}
