"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Users, Scale, CreditCard, LayoutDashboard, LogOut, ChevronRight, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/disputas", label: "Disputas", icon: Scale },
  { href: "/admin/incidencias", label: "Incidencias", icon: ShieldAlert },
  { href: "/admin/pagos", label: "Pagos", icon: CreditCard },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [adminName, setAdminName] = useState("")
  // Disputas e incidencias pendientes de revisar: badge rojo en el menú para
  // que una disputa nueva no pase desapercibida (el admin no ve el navbar
  // público ni su campana).
  const [pendientes, setPendientes] = useState<Record<string, number>>({})
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    checkAdminStatus()
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    let activo = true
    const cargar = async () => {
      const [disputas, incidencias] = await Promise.all([
        supabase.from("disputas").select("id", { count: "exact", head: true }).eq("estado", "abierta"),
        supabase.from("incidencias").select("id", { count: "exact", head: true }).eq("estado", "abierta"),
      ])
      if (!activo) return
      setPendientes({
        "/admin/disputas": disputas.count || 0,
        "/admin/incidencias": incidencias.count || 0,
      })
    }
    cargar()
    const id = setInterval(cargar, 30000)
    return () => {
      activo = false
      clearInterval(id)
    }
  }, [isAdmin])

  const checkAdminStatus = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth/login")
        return
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("es_admin, nombre, apellido")
        .eq("id", user.id)
        .single()

      if (error || !profile?.es_admin) {
        router.push("/")
        return
      }

      setAdminName(`${profile.nombre || ""} ${profile.apellido || ""}`.trim() || "Admin")
      setIsAdmin(true)
    } catch {
      router.push("/")
    }
  }

  const handleLogout = async () => {
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
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">D</span>
            </div>
            <span className="font-bold text-lg">Diime Admin</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/admin" && pathname?.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
                {(pendientes[item.href] || 0) > 0 && (
                  <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                    {pendientes[item.href] > 9 ? "9+" : pendientes[item.href]}
                  </span>
                )}
                {isActive && (pendientes[item.href] || 0) === 0 && <ChevronRight className="h-4 w-4 ml-auto" />}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-medium text-sm">
                {adminName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{adminName}</p>
              <p className="text-xs text-muted-foreground">Administrador</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
