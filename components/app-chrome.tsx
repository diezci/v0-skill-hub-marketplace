"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import { ChatWidget } from "@/components/chat-widget"
import { BienvenidaPrimeraVisita } from "@/components/bienvenida-primera-visita"
import { BannerCookies } from "@/components/banner-cookies"
import { AvisosEnPantalla } from "@/components/avisos-en-pantalla"
import { NativeBottomNav } from "@/components/native-bottom-nav"
import { NativeShareAction } from "@/components/native-share-action"
import { ConfirmarMayoriaEdad } from "@/components/confirmar-mayoria-edad"

// El panel de administración (/admin) tiene su propio layout completo con barra
// lateral. Allí no mostramos el navbar/footer/chat público ni el padding del
// navbar, para que el admin tenga una experiencia exclusivamente de administración.
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

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
      <main className="flex-1 pt-16">{children}</main>
      <div className="web-only-chrome"><Footer /></div>
      <div className="web-only-chrome"><ChatWidget /></div>
      <NativeShareAction />
      <NativeBottomNav />
      <BannerCookies />
      <AvisosEnPantalla />
      <ConfirmarMayoriaEdad />
    </>
  )
}
