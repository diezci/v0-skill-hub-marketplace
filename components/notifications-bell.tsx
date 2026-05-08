"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, MessageSquare, Briefcase, Star, FileText, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { createClient } from "@/lib/supabase/client"
import { marcarNotificacionLeida, marcarTodasLeidas } from "@/app/actions/notificaciones"
import { cn } from "@/lib/utils"

interface Notification {
  id: string
  tipo: string
  titulo: string
  mensaje: string
  link: string | null
  leida: boolean
  created_at: string
}

const tipoIconos: Record<string, typeof Bell> = {
  nuevo_mensaje: MessageSquare,
  nueva_oferta: FileText,
  oferta_aceptada: CheckCircle2,
  oferta_rechazada: AlertCircle,
  trabajo_iniciado: Briefcase,
  trabajo_completado: CheckCircle2,
  pago_recibido: CheckCircle2,
  nueva_resena: Star,
  disputa_abierta: AlertCircle,
  disputa_resuelta: CheckCircle2,
  general: Bell,
}

const tipoColores: Record<string, string> = {
  nuevo_mensaje: "text-blue-600 bg-blue-100 dark:bg-blue-950/40",
  nueva_oferta: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40",
  oferta_aceptada: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40",
  oferta_rechazada: "text-rose-600 bg-rose-100 dark:bg-rose-950/40",
  trabajo_iniciado: "text-indigo-600 bg-indigo-100 dark:bg-indigo-950/40",
  trabajo_completado: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40",
  pago_recibido: "text-amber-600 bg-amber-100 dark:bg-amber-950/40",
  nueva_resena: "text-amber-600 bg-amber-100 dark:bg-amber-950/40",
  disputa_abierta: "text-rose-600 bg-rose-100 dark:bg-rose-950/40",
  disputa_resuelta: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40",
  general: "text-muted-foreground bg-muted",
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = (now.getTime() - date.getTime()) / 1000

  if (diff < 60) return "Hace un momento"
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} d`
  return date.toLocaleDateString("es-ES")
}

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setAuthenticated(false)
        return
      }
      setAuthenticated(true)

      const { data, error } = await supabase
        .from("notificaciones")
        .select("*")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20)

      if (error) return

      setNotifications((data || []) as Notification[])
      setUnreadCount(((data || []) as Notification[]).filter((n) => !n.leida).length)

      channel = supabase
        .channel(`notificaciones-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notificaciones",
            filter: `usuario_id=eq.${user.id}`,
          },
          (payload) => {
            const newNotif = payload.new as Notification
            setNotifications((prev) => [newNotif, ...prev].slice(0, 20))
            setUnreadCount((prev) => prev + 1)
          },
        )
        .subscribe()
    }

    init()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  if (!authenticated) return null

  const handleClick = async (notification: Notification) => {
    if (!notification.leida) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, leida: true } : n)),
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
      await marcarNotificacionLeida(notification.id)
    }
    if (notification.link) {
      router.push(notification.link)
      setOpen(false)
    }
  }

  const handleMarkAll = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, leida: true })))
    setUnreadCount(0)
    await marcarTodasLeidas()
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-primary animate-pulse" />
          )}
          {unreadCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] font-semibold"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="font-semibold">Notificaciones</h3>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} sin leer` : "Estas al dia"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAll}>
              Marcar todas
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[440px]">
          {notifications.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <Bell className="size-10 text-muted-foreground/40 mx-auto" />
                <EmptyTitle className="text-base">Sin notificaciones</EmptyTitle>
                <EmptyDescription>Te avisaremos cuando haya novedades</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="py-1">
              {notifications.map((n) => {
                const Icon = tipoIconos[n.tipo] || Bell
                const colorCls = tipoColores[n.tipo] || tipoColores.general
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 hover:bg-muted/50 w-full text-left transition-colors",
                      !n.leida && "bg-muted/30",
                    )}
                  >
                    <div className={cn("size-9 rounded-full flex items-center justify-center shrink-0", colorCls)}>
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-tight", !n.leida && "font-semibold")}>
                        {n.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.mensaje}</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1">{formatTime(n.created_at)}</p>
                    </div>
                    {!n.leida && (
                      <div className="size-2 rounded-full bg-primary mt-2 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <div className="border-t px-4 py-2">
          <Button variant="ghost" size="sm" asChild className="w-full">
            <Link href="/mensajes" onClick={() => setOpen(false)}>
              Ver todos los mensajes
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
