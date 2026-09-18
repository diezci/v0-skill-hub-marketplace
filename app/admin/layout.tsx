"use client"

import { useIdioma } from "@/components/idioma-provider"

import { useEffect, useMemo, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { desvincularPushActual } from "@/lib/push/client"
import { Loader2, Users, Scale, CreditCard, LayoutDashboard, LogOut, ChevronRight, ShieldAlert, MessageSquare, Briefcase, Bell, BellRing, BadgeCheck, ExternalLink, WalletCards } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SelectorIdioma } from "@/components/selector-idioma"
import { DiimeLogo } from "@/components/diime-logo"
import { NotificacionesProvider, useResumenNotificaciones } from "@/hooks/use-notificaciones-seccion"
import { CampanaNotificaciones } from "@/components/campana-notificaciones"
import { AvisosSeccion } from "@/components/avisos-seccion"

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/operaciones", label: "Operaciones", icon: BellRing },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/verificaciones", label: "Verificaciones", icon: BadgeCheck },
  { href: "/admin/trabajos", label: "Trabajos y justificantes", icon: Briefcase },
  { href: "/admin/disputas", label: "Disputas", icon: Scale },
  { href: "/admin/incidencias", label: "Incidencias", icon: ShieldAlert },
  { href: "/admin/mensajes", label: "Soporte", icon: MessageSquare },
  { href: "/admin/notificaciones", label: "Notificaciones", icon: Bell },
  { href: "/admin/pagos", label: "Pagos", icon: CreditCard },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // AppChrome deliberately omits the public chrome on /admin. Administration
  // needs its own shared provider for the bell, section panels and support badge.
  return <NotificacionesProvider><AdminLayoutContenido>{children}</AdminLayoutContenido></NotificacionesProvider>
}

function AdminLayoutContenido({ children }: { children: React.ReactNode }) {
  const { t } = useIdioma()
  const { resumen } = useResumenNotificaciones()

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [adminName, setAdminName] = useState("")
  // Pendientes de revisión visibles desde cualquier sección de administración.
  const [pendientes, setPendientes] = useState<Record<string, number>>({})
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let activo = true
    let revision = 0
    let ultimoUsuario: string | null = null
    const comprobar = async () => {
      const actual = ++revision
      setIsAdmin(null)
      setAdminName("")
      setPendientes({})
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!activo || actual !== revision) return
        if (!user) { setIsAdmin(false); router.replace("/auth/login"); return }
        ultimoUsuario = user.id
        const { data: profile, error } = await supabase.from("profiles")
          .select("es_admin, nombre, apellido").eq("id", user.id).single()
        if (!activo || actual !== revision) return
        if (error || !profile?.es_admin) { setIsAdmin(false); router.replace("/"); return }
        setAdminName(`${profile.nombre || ""} ${profile.apellido || ""}`.trim())
        setIsAdmin(true)
      } catch { if (activo && actual === revision) { setIsAdmin(false); router.replace("/") } }
    }
    void comprobar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, session) => {
      if (!activo) return
      if (evento === "SIGNED_OUT") {
        revision++; ultimoUsuario = null
        setIsAdmin(false); setAdminName(""); setPendientes({})
        router.replace("/auth/login")
      } else if (session?.user.id && session.user.id !== ultimoUsuario) {
        revision++; ultimoUsuario = session.user.id
        setIsAdmin(null); setAdminName(""); setPendientes({})
        queueMicrotask(() => { if (activo) void comprobar() })
      }
    })
    return () => { activo = false; revision++; subscription.unsubscribe() }
  }, [router, supabase])

  useEffect(() => {
    if (!isAdmin) return
    let activo = true
    const cargar = async () => {
      const [disputas, incidencias, verificaciones] = await Promise.all([
        supabase.from("disputas").select("id", { count: "exact", head: true }).eq("estado", "abierta"),
        supabase.from("incidencias").select("id", { count: "exact", head: true }).eq("estado", "abierta"),
        supabase.from("solicitudes_verificacion_profesional").select("id", { count: "exact", head: true }).in("estado", ["pendiente", "en_revision"]),
      ])
      if (!activo) return
      setPendientes({
        "/admin/disputas": disputas.count || 0,
        "/admin/incidencias": incidencias.count || 0,
        "/admin/verificaciones": verificaciones.count || 0,
      })
    }
    cargar()
    const id = setInterval(cargar, 30000)
    return () => {
      activo = false
      clearInterval(id)
    }
  }, [isAdmin, pathname, supabase])

  const handleLogout = async () => {
    await desvincularPushActual()
    await supabase.auth.signOut()
    router.push("/")
  }

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 md:shrink-0 bg-card border-b md:border-b-0 md:border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-4 md:p-6 border-b border-border">
          <Link href="/admin" className="flex items-center gap-2">
            <DiimeLogo className="h-8 w-8" />
            <span className="font-bold text-lg">{t("Diime Admin")}</span>
          </Link>
          <div className="mt-3 flex items-center justify-between gap-2"><SelectorIdioma /><CampanaNotificaciones enPanelAdmin /></div>
        </div>

        {/* Navigation */}
        <nav aria-label={t("Administración")} className="flex gap-1 overflow-x-auto p-3 md:flex-col md:flex-1 md:p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/admin" && pathname?.startsWith(item.href))
            const avisos = resumen.porSeccion[item.href] || 0
            const numeroPendientes = item.href === "/admin/mensajes"
              ? resumen.mensajesNoLeidos + avisos
              : item.href === "/admin/notificaciones"
                ? resumen.notificaciones.filter(n => n.seccion.startsWith("/admin/")).length + resumen.mensajesNoLeidos
                : Math.max(pendientes[item.href] || 0, avisos)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 whitespace-nowrap px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {t(item.label)}
                {numeroPendientes > 0 && (
                  <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                    {numeroPendientes > 99 ? "99+" : numeroPendientes}
                  </span>
                )}
                {isActive && numeroPendientes === 0 && <ChevronRight className="h-4 w-4 ml-auto" />}
              </Link>
            )
          })}
          <a
            href="https://dashboard.stripe.com/balance/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <WalletCards className="h-5 w-5" />
            {t("Stripe")}<ExternalLink className="ml-auto h-4 w-4" />
            <span className="sr-only">{t("Abrir saldo y movimientos de Diime en una pestaña nueva")}</span>
          </a>
        </nav>

        {/* User section */}
        <div className="flex items-center gap-3 p-3 md:block md:p-4 border-t border-border">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:mb-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-medium text-sm">
                {(adminName || t("Admin")).charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{adminName || t("Admin")}</p>
              <p className="text-xs text-muted-foreground">{t("Administrador")}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 md:w-full justify-start gap-2"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            {t("Cerrar sesión")}</Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1 overflow-auto">
        {pathname && <AvisosSeccion key={pathname} seccion={pathname} />}
        {children}
      </main>
    </div>
  )
}
