"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Menu, X, Search, Megaphone, Inbox, MessageSquare, FolderKanban, LogOut, Settings, UserCircle, Bell, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { obtenerResumenNotificaciones, marcarNotificacionesLeidas } from "@/app/actions/notificaciones"

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [userPhoto, setUserPhoto] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0)
  const [notifs, setNotifs] = useState<any[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    let supabase
    try {
      supabase = createClient()
    } catch (e) {
      // Si faltan las variables de entorno de Supabase, no bloqueamos la navbar.
      console.error("[navbar] No se pudo inicializar Supabase:", e)
      return
    }

    const aplicarSesion = async (user: { id: string; email?: string } | null) => {
      setIsAuthenticated(!!user)
      setUserEmail(user?.email ?? null)
      if (!user) {
        setIsAdmin(false)
        setUserName(null)
        setUserPhoto(null)
        return
      }
      // Datos del perfil para el avatar + comprobación de admin.
      const { data: profile } = await supabase
        .from("profiles")
        .select("es_admin, nombre, apellido, foto_perfil")
        .eq("id", user.id)
        .maybeSingle()
      setIsAdmin(!!profile?.es_admin)
      const nombreCompleto = `${profile?.nombre ?? ""} ${profile?.apellido ?? ""}`.trim()
      setUserName(nombreCompleto || null)
      setUserPhoto(profile?.foto_perfil ?? null)
    }

    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      aplicarSesion(session?.user ?? null)
    }
    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      aplicarSesion(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Los admins solo deben ver el panel de administración: si están autenticados
  // como admin y navegan a una página de usuario, se les lleva a /admin.
  useEffect(() => {
    if (isAdmin && pathname && !pathname.startsWith("/admin") && !pathname.startsWith("/auth")) {
      router.replace("/admin")
    }
  }, [isAdmin, pathname, router])

  // Cargar contadores de notificaciones y mensajes sin leer para los badges del navbar.
  useEffect(() => {
    if (!isAuthenticated || isAdmin) {
      setMensajesNoLeidos(0)
      setNotifs([])
      setNoLeidas(0)
      return
    }
    let activo = true
    const cargar = async () => {
      try {
        const r = await obtenerResumenNotificaciones()
        if (!activo) return
        setNotifs(r.notificaciones || [])
        setNoLeidas(r.noLeidas || 0)
        setMensajesNoLeidos(r.mensajesNoLeidos || 0)
      } catch {
        // silencioso: los badges son secundarios
      }
    }
    cargar()
    const id = setInterval(cargar, 45000)
    return () => {
      activo = false
      clearInterval(id)
    }
  }, [isAuthenticated, isAdmin, pathname])

  // Al abrir la campana, marcar como leídas.
  const handleAbrirNotifs = async (open: boolean) => {
    if (open && noLeidas > 0) {
      setNoLeidas(0)
      setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })))
      await marcarNotificacionesLeidas()
    }
  }

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: "local" })
    } catch (e) {
      console.error("[navbar] Error al cerrar sesión:", e)
    }
    setIsAuthenticated(false)
    setUserEmail(null)
    setUserName(null)
    setUserPhoto(null)
    setIsAdmin(false)
    setIsOpen(false)
    router.push("/")
    router.refresh()
  }

  // Iniciales para el avatar: del nombre si existe, si no del email.
  const iniciales = (
    userName
      ? userName
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")
      : userEmail?.[0] ?? "U"
  ).toUpperCase()

  const navLinks = [
    { name: "Profesionales", path: "/profesionales", icon: Search, shortName: "Profesionales" },
    {
      name: "Demandas publicadas por los usuarios",
      path: "/demandas",
      icon: Megaphone,
      shortName: "Demandas",
    },
    { name: "Mis Solicitudes", path: "/mis-solicitudes", icon: Inbox, shortName: "Mis Solicitudes" },
    { name: "Mis ofertas enviadas", path: "/mis-ofertas", icon: FileText, shortName: "Mis Ofertas" },
    {
      name: "Gestión de proyectos",
      path: "/mis-trabajos",
      icon: FolderKanban,
      shortName: "Gestión de proyectos",
    },
    { name: "Mensajes", path: "/mensajes", icon: MessageSquare, shortName: "Mensajes" },
  ]

  // Los perfiles admin no ven el navbar público (el panel /admin tiene su propia
  // navegación). Así su experiencia es exclusivamente la vista de administración.
  if (isAdmin) return null

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300",
        isScrolled
          ? "bg-background/95 backdrop-blur-md shadow-sm border-b border-border"
          : "bg-background/80 backdrop-blur-sm border-b border-border/40",
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">D</span>
            </div>
            <span className="font-bold text-xl hidden sm:block">Diime</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.path}
                  href={link.path}
                  title={link.name}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap",
                    pathname === link.path
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{link.shortName}</span>
                  {link.path === "/mensajes" && mensajesNoLeidos > 0 && (
                    <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {mensajesNoLeidos > 9 ? "9+" : mensajesNoLeidos}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated && (
              <DropdownMenu onOpenChange={handleAbrirNotifs}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
                    <Bell className="h-5 w-5" />
                    {noLeidas > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {noLeidas > 9 ? "9+" : noLeidas}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifs.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No tienes notificaciones
                    </div>
                  ) : (
                    notifs.slice(0, 10).map((n) => (
                      <DropdownMenuItem key={n.id} asChild>
                        <Link href={n.link || "#"} className="cursor-pointer flex flex-col items-start gap-0.5 py-2">
                          <span className="text-sm font-medium">{n.titulo}</span>
                          {n.mensaje && (
                            <span className="text-xs text-muted-foreground whitespace-normal">{n.mensaje}</span>
                          )}
                        </Link>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Cuenta"
                    className="rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                  >
                    <Avatar className="h-9 w-9 border border-border transition-opacity hover:opacity-90">
                      <AvatarImage src={userPhoto || undefined} alt={userName || "Perfil"} />
                      <AvatarFallback className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                        {iniciales}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={userPhoto || undefined} alt={userName || "Perfil"} />
                      <AvatarFallback className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                        {iniciales}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{userName || "Mi cuenta"}</p>
                      {userEmail && <p className="text-xs text-muted-foreground truncate">{userEmail}</p>}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/mi-perfil" className="cursor-pointer">
                      <UserCircle className="mr-2 h-4 w-4" />
                      Mi Perfil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/mi-cuenta" className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      Configuración
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-red-600 focus:text-red-600"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link href="/auth/login">
                  <Button variant="ghost" size="sm" className="rounded-lg">
                    Entrar
                  </Button>
                </Link>
                <Link href="/auth/registro">
                  <Button size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700">
                    Registrarse
                  </Button>
                </Link>
              </>
            )}
          </div>

          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {isOpen && (
          <div className="md:hidden py-4 border-t animate-in slide-in-from-top-2">
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.path}
                    href={link.path}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-3",
                      pathname === link.path
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{link.name}</span>
                    {link.path === "/mensajes" && mensajesNoLeidos > 0 && (
                      <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                        {mensajesNoLeidos > 9 ? "9+" : mensajesNoLeidos}
                      </span>
                    )}
                  </Link>
                )
              })}
              {!isAuthenticated ? (
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Link href="/auth/login" className="flex-1">
                    <Button variant="outline" className="w-full rounded-lg bg-transparent">
                      Entrar
                    </Button>
                  </Link>
                  <Link href="/auth/registro" className="flex-1">
                    <Button className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700">Registrarse</Button>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-1 mt-4 pt-4 border-t">
                  {userEmail && (
                    <p className="px-4 pb-2 text-xs text-muted-foreground truncate">
                      {userEmail}
                    </p>
                  )}
                  <Link
                    href="/mi-perfil"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-3"
                  >
                    <UserCircle className="h-5 w-5 shrink-0" />
                    Mi Perfil
                  </Link>
                  <Link
                    href="/mi-cuenta"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-3"
                  >
                    <Settings className="h-5 w-5 shrink-0" />
                    Configuracion
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-500/10 flex items-center gap-3 text-left"
                  >
                    <LogOut className="h-5 w-5 shrink-0" />
                    Cerrar Sesion
                  </button>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}

export default Navbar
