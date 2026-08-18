"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, MessageCircle, Plus, Search, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"

const enlaces = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/demandas", label: "Buscar", icon: Search },
  { href: "/#publicar-demanda", label: "Publicar", icon: Plus, principal: true },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle },
  { href: "/mi-perfil", label: "Perfil", icon: UserRound },
]

export function NativeBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="native-only" aria-label="Navegación principal de la app">
      {enlaces.map(({ href, label, icon: Icon, principal }) => {
        const ruta = href.split("#")[0]
        const activa = ruta === "/" ? pathname === "/" && !principal : pathname === ruta || pathname?.startsWith(`${ruta}/`)
        return (
          <Link
            key={label}
            href={href}
            data-native-haptic
            aria-current={activa ? "page" : undefined}
            className={cn("native-nav-item", activa && "is-active", principal && "is-primary")}
          >
            <span className="native-nav-icon"><Icon aria-hidden="true" /></span>
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
