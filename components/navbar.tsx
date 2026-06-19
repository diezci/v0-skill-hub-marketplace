"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Menu, X, User, Search, Megaphone, Inbox, MessageSquare, FolderKanban, LogOut, Settings, UserCircle, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
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

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
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

    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setIsAuthenticated(!!session?.user)
      setUserEmail(session?.user?.email ?? null)
    }
    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user)
      setUserEmail(session?.user?.email ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: "local" })
    } catch (e) {
      console.error("[navbar] Error al cerrar sesión:", e)
    }
    setIsAuthenticated(false)
    setUserEmail(null)
    setIsOpen(false)
    router.push("/")
    router.refresh()
  }

  const navLinks = [
    { name: "Profesionales", path: "/profesionales", icon: Search, shortName: "Profesionales" },
    {
      name: "Demandas publicadas por los usuarios",
      path: "/demandas",
      icon: Megaphone,
      shortName: "Demandas",
    },
    { name: "Mis Solicitudes", path: "/mis-solicitudes", icon: Inbox, shortName: "Mis Solicitudes" },
    {
      name: "Gestión de proyectos",
      path: "/mis-trabajos",
      icon: FolderKanban,
      shortName: "Gestión de proyectos",
    },
    { name: "Mensajes", path: "/mensajes", icon: MessageSquare, shortName: "Mensajes" },
  ]

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
                </Link>
              )
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <DropdownMenu>
                <div className="flex items-center rounded-lg border border-border hover:bg-muted transition-colors">
                  {/* Botón "Mi Perfil": acceso directo al perfil */}
                  <Link
                    href="/mi-perfil"
                    title="Ir a Mi Perfil"
                    className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-l-lg"
                  >
                    <span className="h-7 w-7 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-semibold uppercase">
                      {userEmail?.charAt(0) ?? <User className="h-4 w-4" />}
                    </span>
                    <span className="text-sm font-medium">Mi Perfil</span>
                  </Link>
                  {/* Desplegable con Cerrar sesión debajo del botón */}
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-l-none border-l border-border"
                      aria-label="Más opciones de cuenta"
                    >
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                </div>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">Mi Cuenta</p>
                      {userEmail && (
                        <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                      )}
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
