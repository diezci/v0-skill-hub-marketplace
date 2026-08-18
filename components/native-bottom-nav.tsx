"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileText, FolderKanban, Inbox, Megaphone, MessageSquare, Plus, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const enlaces = [
  { href: "/profesionales", label: "Profesionales", icon: Search },
  { href: "/demandas", label: "Demandas de terceros", icon: Megaphone },
  { href: "/mis-solicitudes", label: "Mis demandas", icon: Inbox },
  { href: "/mis-ofertas", label: "Mis pujas", icon: FileText },
  { href: "/mis-trabajos", label: "Gestión de proyectos", icon: FolderKanban },
  { href: "/mensajes", label: "Mensajes", icon: MessageSquare },
]

export function NativeBottomNav() {
  const pathname = usePathname()

  return (
    <>
      <Link href="/#publicar-demanda" className="native-only native-publish-action" data-native-haptic>
        <Plus aria-hidden="true" />
        <span>Publicar demanda</span>
      </Link>
      <nav className="native-only" aria-label="Navegación principal de la app">
        {enlaces.map(({ href, label, icon: Icon }) => {
          const activa = pathname === href || pathname?.startsWith(`${href}/`)
          return (
            <Link
              key={label}
              href={href}
              title={label}
              data-native-haptic
              aria-current={activa ? "page" : undefined}
              className={cn("native-nav-item", activa && "is-active")}
            >
              <span className="native-nav-icon"><Icon aria-hidden="true" /></span>
              <span className="native-nav-label">{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
