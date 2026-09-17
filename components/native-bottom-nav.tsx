"use client"

import { useT } from "@/components/idioma-provider"


import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileText, FolderKanban, Inbox, Megaphone, MessageSquare, Plus, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const enlaces = [
  { href: "/profesionales", label: "Profesionales", icon: Search },
  { href: "/demandas", label: "Solicitudes de terceros", icon: Megaphone },
  { href: "/mis-solicitudes", label: "Mis Solicitudes", icon: Inbox },
  { href: "/#publicar-demanda", label: "Publicar demanda", icon: Plus, principal: true },
  { href: "/mis-ofertas", label: "Mis pujas", icon: FileText },
  { href: "/mis-trabajos", label: "Gestión de proyectos", icon: FolderKanban },
  { href: "/mensajes", label: "Mensajes", icon: MessageSquare },
]

export function NativeBottomNav() {
  const t = useT()
  const pathname = usePathname()

  return (
    <nav className="native-only" aria-label={t("Navegación principal de la app")}>
      {enlaces.map(({ href, label, icon: Icon, principal }) => {
        const ruta = href.split("#")[0]
        const activa = !principal && (pathname === ruta || pathname?.startsWith(`${ruta}/`))
        return (
          <Link
            key={label}
            href={href}
            title={t(label)}
            data-native-haptic
            aria-current={activa ? "page" : undefined}
            className={cn("native-nav-item", activa && "is-active", principal && "is-primary")}
          >
            <span className="native-nav-icon"><Icon aria-hidden="true" /></span>
            <span className="native-nav-label">{t(label)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
