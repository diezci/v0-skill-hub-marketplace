"use client"

import { SelectorIdioma } from "@/components/selector-idioma"
import { useT } from "@/components/idioma-provider"


import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Menu,
  X,
  Search,
  Megaphone,
  Inbox,
  MessageSquare,
  FolderKanban,
  LogOut,
  Settings,
  UserCircle,
  FileText,
  ShieldAlert,
  WalletCards,
  Building2,
} from "lucide-react"
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
import { DiimeLogo } from "@/components/diime-logo"
import { createClient } from "@/lib/supabase/client"
import { desvincularPushActual, sincronizarBadgeApp } from "@/lib/push/client"
import { useResumenNotificaciones } from "@/hooks/use-notificaciones-seccion"
import { CampanaNotificaciones } from "@/components/campana-notificaciones"
import type { NotificacionContextual } from "@/lib/notificaciones-contexto"
import { CelebracionNotificacion } from "@/components/celebracion-notificacion"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { ResumenCobrosMenu } from "@/components/resumen-cobros-menu"
import type { ActorEmpresa } from "@/lib/empresas/types"

// Notificaciones que merecen un aviso destacado a pantalla completa: los hitos
// buenos (entrega recibida, cobro) y también la resolución de una disputa, que
// el overlay muestra en verde/rojo/ámbar según el desenlace.
const TIPOS_CELEBRABLES = [
  "trabajo_entregado",
  "pago_liberado",
  "pago_recibido",
  "disputa_ganada",
  "disputa_perdida",
  "disputa_resuelta",
]
const CELEBRADAS_KEY = "diime_notifs_celebradas"

const Navbar = ({ actorEmpresaLocal }: { actorEmpresaLocal?: ActorEmpresa | null } = {}) => {
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(!!actorEmpresaLocal)
  const [userEmail, setUserEmail] = useState<string | null>(actorEmpresaLocal?.email ?? null)
  const [userName, setUserName] = useState<string | null>(actorEmpresaLocal?.nombre ?? null)
  const [userPhoto, setUserPhoto] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isProfessional, setIsProfessional] = useState(false)
  const { resumen, usuarioId } = useResumenNotificaciones()
  const notificacionesNoLeidas = resumen.noLeidas
  const mensajesNoLeidos = resumen.mensajesNoLeidos
  const porSeccion = resumen.porSeccion
  const [celebracion, setCelebracion] = useState<{ usuarioId: string; notificacion: NotificacionContextual } | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Cualquier navegación debe cerrar el desplegable móvil, incluidas las
  // rutas de acceso y registro. Así la siguiente pantalla no aparece detrás
  // del menú que abrió el usuario.
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  useEffect(() => {
    if (actorEmpresaLocal) {
      setIsAuthenticated(true)
      setUserName(actorEmpresaLocal.nombre)
      setUserEmail(actorEmpresaLocal.email)
      setIsAdmin(false)
      setIsProfessional(false)
      return
    }
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
        setIsProfessional(false)
        setUserName(null)
        setUserPhoto(null)
        return
      }
      // Datos del perfil para el avatar + comprobación de admin.
      const [{ data: profile }, { data: professional }] = await Promise.all([
        supabase
          .from("profiles")
          .select("es_admin, nombre, apellido, foto_perfil")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("profesionales").select("id").eq("id", user.id).maybeSingle(),
      ])
      setIsAdmin(!!profile?.es_admin)
      setIsProfessional(!!professional)
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
  }, [actorEmpresaLocal])

  // Los admins solo deben ver el panel de administración. La única excepción
  // es la vista de un perfil abierta expresamente desde la bandeja de
  // verificaciones; sin esta excepción el perfil aparecía un instante y esta
  // redirección devolvía inmediatamente la pestaña a /admin.
  useEffect(() => {
    const esVistaPerfilDesdeAdmin =
      pathname?.startsWith("/profesional/") &&
      new URLSearchParams(window.location.search).get("vista_admin") === "1"
    if (
      isAdmin &&
      pathname &&
      !pathname.startsWith("/admin") &&
      !pathname.startsWith("/auth") &&
      !esVistaPerfilDesdeAdmin
    ) {
      router.replace("/admin")
    }
  }, [isAdmin, pathname, router])

  // Reading is explicit in the bell, section panel or work detail. Navigation
  // never clears an entire section before the person sees what changed.
  useEffect(() => { setCelebracion(null) }, [usuarioId])

  useEffect(() => {
    if (actorEmpresaLocal || !isAuthenticated || isAdmin || !usuarioId) return
    void sincronizarBadgeApp(resumen.noLeidas + resumen.mensajesNoLeidos)
    const um = resumen.ultimoMensajeNoLeido
    if (um && !pathname?.startsWith("/mensajes")) {
      try {
        if (sessionStorage.getItem("diime_ultimo_msg_avisado") !== um.id) {
          sessionStorage.setItem("diime_ultimo_msg_avisado", um.id)
          toast({ title: `💬 ${um.remitente}`, description: um.preview,
            action: <ToastAction altText={t("Abrir chat")} onClick={() => router.push(`/mensajes?c=${um.conversacion_id}`)}>{t("Abrir")}</ToastAction> })
        }
      } catch {}
    }
    const candidatas = resumen.notificaciones.filter(n => TIPOS_CELEBRABLES.includes(n.tipo) && Date.now() - new Date(n.created_at).getTime() < 48 * 60 * 60 * 1000)
    if (candidatas.length) {
      try {
        const almacenadas = JSON.parse(localStorage.getItem(CELEBRADAS_KEY) || "[]")
        const celebradas: string[] = Array.isArray(almacenadas) ? almacenadas : []
        const nueva = candidatas.find(n => !celebradas.includes(n.id))
        if (nueva) { localStorage.setItem(CELEBRADAS_KEY, JSON.stringify([...celebradas, nueva.id].slice(-50))); setCelebracion({ usuarioId, notificacion: nueva }) }
      } catch {}
    }
  }, [resumen, usuarioId, isAuthenticated, isAdmin, pathname, t, actorEmpresaLocal, toast, router])

  const handleLogout = async () => {
    if (actorEmpresaLocal) {
      toast({ title: t("Cuenta de prueba"), description: t("Puedes cambiar de cuenta desde la barra del entorno local.") })
      setIsOpen(false)
      return
    }
    try {
      await desvincularPushActual()
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
    setIsProfessional(false)
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
      name: "Solicitudes de terceros",
      path: "/demandas",
      icon: Megaphone,
      shortName: "Solicitudes de terceros",
    },
    { name: "Mis Solicitudes", path: "/mis-solicitudes", icon: Inbox, shortName: "Mis Solicitudes" },
    { name: "Mis pujas enviadas", path: "/mis-ofertas", icon: FileText, shortName: "Mis Pujas" },
    {
      name: "Gestión de proyectos",
      path: "/mis-trabajos",
      icon: FolderKanban,
      shortName: "Gestión de proyectos",
    },
    { name: "Mensajes", path: "/mensajes", icon: MessageSquare, shortName: "Mensajes" },
  ]
  if (actorEmpresaLocal) navLinks.push({ name: "Mi empresa", path: "/mi-empresa", icon: Building2, shortName: "Mi empresa" })

  // Badge de cada sección: sus notificaciones sin leer (en Mensajes, además,
  // los mensajes de chat sin leer).
  const badgeDe = (path: string) =>
    (porSeccion[path] || 0) + (path === "/mensajes" ? mensajesNoLeidos : 0)
  const totalPendiente = notificacionesNoLeidas + mensajesNoLeidos

  // Los perfiles admin no ven el navbar público (el panel /admin tiene su propia
  // navegación). Así su experiencia es exclusivamente la vista de administración.
  if (isAdmin) return null

  return (
    <>
    {celebracion && celebracion.usuarioId === usuarioId && isAuthenticated && !isAdmin && !actorEmpresaLocal && (
      <CelebracionNotificacion notificacion={celebracion.notificacion} onClose={() => setCelebracion(null)} />
    )}
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300",
        isScrolled
          ? "bg-background/95 backdrop-blur-md shadow-sm border-b border-border"
          : "bg-background/80 backdrop-blur-sm border-b border-border/40",
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between gap-3 h-16">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <DiimeLogo className="h-9 w-9" />
            <span className="font-bold text-xl hidden sm:block">Diime</span>
          </Link>

          <nav className="hidden xl:flex min-w-0 items-center gap-0.5 2xl:gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.path}
                  href={link.path}
                  title={t(link.name)}
                  className={cn(
                    "px-2 2xl:px-3 py-2 rounded-lg text-xs 2xl:text-sm font-medium transition-colors flex items-center gap-1.5 2xl:gap-2 whitespace-nowrap",
                    pathname === link.path
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="hidden 2xl:block h-4 w-4 shrink-0" />
                  <span>{t(link.shortName)}</span>
                  {badgeDe(link.path) > 0 && (
                    <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {badgeDe(link.path) > 9 ? "9+" : badgeDe(link.path)}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="hidden xl:flex shrink-0 items-center gap-1 2xl:gap-2">
            {isAuthenticated && !actorEmpresaLocal && <CampanaNotificaciones />}
            <SelectorIdioma compacto />
            <ThemeToggle />
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("Cuenta")}
                    className="rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                  >
                    <Avatar className="h-9 w-9 border border-border transition-opacity hover:opacity-90">
                      <AvatarImage src={userPhoto || undefined} alt={userName || t("Perfil")} />
                      <AvatarFallback className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                        {iniciales}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[22rem]">
                  <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={userPhoto || undefined} alt={userName || t("Perfil")} />
                      <AvatarFallback className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                        {iniciales}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{userName || t("Mi cuenta")}</p>
                      {userEmail && <p className="text-xs text-muted-foreground truncate">{userEmail}</p>}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isProfessional && (
                    <>
                      <ResumenCobrosMenu />
                      <DropdownMenuItem asChild>
                        <Link href="/cobros" className="cursor-pointer">
                          <WalletCards className="mr-2 h-4 w-4" />
                           {t("Gestionar cobros")} </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href="/mi-perfil" className="cursor-pointer">
                      <UserCircle className="mr-2 h-4 w-4" />
                       {t("Mi Perfil")}{porSeccion["/mi-perfil"] > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 text-xs text-white">{porSeccion["/mi-perfil"]}</span>} </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/incidencias" className="cursor-pointer">
                      <ShieldAlert className="mr-2 h-4 w-4" />
                       {t("Incidencias")}{porSeccion["/incidencias"] > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 text-xs text-white">{porSeccion["/incidencias"]}</span>} </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/mi-empresa" className="cursor-pointer">
                      <Building2 className="h-4 w-4 mr-2" />
                       {t("Mi empresa")} </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/mi-cuenta" className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                       {t("Configuración")} </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-red-600 focus:text-red-600"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                     {t("Cerrar sesión")} </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link href="/auth/login">
                  <Button variant="ghost" size="sm" className="rounded-lg">
                     {t("Entrar")} </Button>
                </Link>
                <Link href="/auth/registro">
                  <Button size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700">
                     {t("Registrarse")} </Button>
                </Link>
              </>
            )}
          </div>

          <div className="flex xl:hidden items-center gap-2">
            {isAuthenticated && !actorEmpresaLocal && <CampanaNotificaciones />}
            <SelectorIdioma compacto />
            <ThemeToggle />
            {isAuthenticated ? (
              <Link
                href="/mi-perfil"
                aria-label={t("Mi perfil")}
                title={t("Mi perfil")}
                className="native-account-link rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              >
                <Avatar className="h-9 w-9 border border-border">
                  <AvatarImage src={userPhoto || undefined} alt={userName || t("Mi perfil")} />
                  <AvatarFallback className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                    {iniciales}
                  </AvatarFallback>
                </Avatar>
              </Link>
            ) : (
              <Link
                href="/auth/login"
                aria-label={t("Entrar o acceder a mi perfil")}
                title={t("Mi perfil")}
                className="native-account-link h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground"
              >
                <UserCircle className="h-5 w-5" />
              </Link>
            )}
            <Button
              className="native-menu-toggle relative"
              variant="ghost"
              size="icon"
              aria-label={
                isOpen
                  ? t("Cerrar menú")
                  : totalPendiente > 0
                    ? t("Abrir menú, {count} avisos pendientes", { count: totalPendiente })
                    : t("Abrir menú")
              }
              aria-expanded={isOpen}
              aria-controls="mobile-navigation"
              onClick={() => setIsOpen((open) => !open)}
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              {totalPendiente > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {totalPendiente > 99 ? "99+" : totalPendiente}
                </span>
              )}
            </Button>
          </div>
        </div>

        {isOpen && (
          <div id="mobile-navigation" className="xl:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto py-4 border-t animate-in slide-in-from-top-2">
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
                    <span>{t(link.name)}</span>
                    {badgeDe(link.path) > 0 && (
                      <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                        {badgeDe(link.path) > 9 ? "9+" : badgeDe(link.path)}
                      </span>
                    )}
                  </Link>
                )
              })}
              {!isAuthenticated ? (
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Link href="/auth/login" className="flex-1" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full rounded-lg bg-transparent">
                       {t("Entrar")} </Button>
                  </Link>
                  <Link href="/auth/registro" className="flex-1" onClick={() => setIsOpen(false)}>
                    <Button className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700">{t("Registrarse")}</Button>
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
                     {t("Mi Perfil")}{porSeccion["/mi-perfil"] > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 text-xs text-white">{porSeccion["/mi-perfil"]}</span>} </Link>
                  {isProfessional && (
                    <Link
                      href="/cobros"
                      onClick={() => setIsOpen(false)}
                      className="px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-3"
                    >
                      <WalletCards className="h-5 w-5 shrink-0" />
                       {t("Cobros profesionales")} </Link>
                  )}
                  <Link
                    href="/incidencias"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-3"
                  >
                    <ShieldAlert className="h-5 w-5 shrink-0" />
                     {t("Incidencias")}{porSeccion["/incidencias"] > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 text-xs text-white">{porSeccion["/incidencias"]}</span>} </Link>
                  <Link
                    href="/mi-empresa"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-3"
                  >
                    <Building2 className="h-5 w-5 shrink-0" />
                     {t("Mi empresa")} </Link>
                  <Link
                    href="/mi-cuenta"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-3"
                  >
                    <Settings className="h-5 w-5 shrink-0" />
                     {t("Configuracion")} </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-500/10 flex items-center gap-3 text-left"
                  >
                    <LogOut className="h-5 w-5 shrink-0" />
                     {t("Cerrar Sesion")} </button>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
    </>
  )
}

export default Navbar
