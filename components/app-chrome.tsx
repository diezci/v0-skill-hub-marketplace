"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import { ChatWidget } from "@/components/chat-widget"

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
      <Navbar />
      <main className="flex-1 pt-16">{children}</main>
      <Footer />
      <ChatWidget />
    </>
  )
}
