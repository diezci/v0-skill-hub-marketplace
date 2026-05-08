"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, User, Search, ClipboardList, FileText, MessageSquare, Briefcase, Calendar, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { GlobalSearch } from "@/components/global-search"
import { NotificationsBell } from "@/components/notifications-bell"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setIsAuthenticated(!!user)
    }
    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user)
    })

    return () => subscription.unsubscribe()
  }, [])

  const navLinks = [
    { name: "Profesionales", path: "/profesionales", icon: Search },
    { name: "Demandas", path: "/demandas", icon: ClipboardList },
    { name: "Proyectos", path: "/mis-solicitudes", icon: FileText },
    { name: "Trabajos", path: "/mis-trabajos", icon: Briefcase },
    { name: "Calendario", path: "/mi-calendario", icon: Calendar },
    { name: "Mensajes", path: "/mensajes", icon: MessageSquare },
  ]

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        isScrolled ? "bg-background/95 backdrop-blur-md shadow-sm border-b" : "bg-background/50 backdrop-blur-sm",
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">D</span>
            </div>
            <span className="font-bold text-xl hidden sm:block">Diime</span>
          </Link>

          <nav className="hidden lg:flex items-center gap-0.5">
            {navLinks.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.path}
                  href={link.path}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                    pathname === link.path
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.name}
                </Link>
              )
            })}
          </nav>

          <div className="hidden md:flex items-center gap-1.5 ml-auto">
            <GlobalSearch />
            {isAuthenticated && (
              <>
                <Link href="/favoritos">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "rounded-lg",
                      pathname === "/favoritos" && "text-rose-500",
                    )}
                    aria-label="Favoritos"
                  >
                    <Heart className="h-5 w-5" />
                  </Button>
                </Link>
                <NotificationsBell />
              </>
            )}
            <ThemeToggle />
            {isAuthenticated ? (
              <Link href="/mi-perfil">
                <Button variant="ghost" size="icon" className="rounded-lg">
                  <User className="h-5 w-5" />
                </Button>
              </Link>
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

          <div className="flex md:hidden items-center gap-1 ml-auto">
            <GlobalSearch />
            {isAuthenticated && <NotificationsBell />}
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {isOpen && (
          <div className="md:hidden lg:hidden py-4 border-t animate-in slide-in-from-top-2">
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
                    <Icon className="h-5 w-5" />
                    {link.name}
                  </Link>
                )
              })}
              {isAuthenticated && (
                <Link
                  href="/favoritos"
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-3",
                    pathname === "/favoritos"
                      ? "bg-rose-500/10 text-rose-600"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <Heart className="h-5 w-5" />
                  Favoritos
                </Link>
              )}
              {!isAuthenticated && (
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
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}

export default Navbar
