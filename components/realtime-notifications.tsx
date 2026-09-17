"use client"

import { useT, useIdioma } from "@/components/idioma-provider"
import { traducirTextoNotificacion } from "@/lib/i18n-notificaciones"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { localeDe } from "@/lib/i18n"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"

interface Notification {
  id: string
  tipo: string
  titulo: string
  mensaje: string
  leida: boolean
  created_at: string
}

export function RealtimeNotifications() {
  const t = useT()
  const { idioma } = useIdioma()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isTableAvailable, setIsTableAvailable] = useState(true)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    let activo = true
    let channel: ReturnType<typeof supabase.channel> | null = null
    const initializeNotifications = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!activo) return
      if (!user) {
        setIsAuthenticated(false)
        return
      }

      setCurrentUserId(user.id)
      setIsAuthenticated(true)

      const { data, error } = await supabase
        .from("notificaciones")
        .select("*")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20)

      if (!activo) return
      if (error) {
        // Table doesn't exist or other error
        setIsTableAvailable(false)
        return
      }

      if (data) {
        setNotifications(data)
        setUnreadCount(data.filter((n) => !n.leida).length)
      }

      channel = supabase
        .channel("notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notificaciones",
            filter: `usuario_id=eq.${user.id}`,
          },
          (payload) => {
            const newNotification = payload.new as Notification
            setNotifications((prev) => [newNotification, ...prev])
            setUnreadCount((prev) => prev + 1)

            // Show toast notification
            toast({
              title: traducirTextoNotificacion(idioma, newNotification.titulo, newNotification.tipo),
              description: traducirTextoNotificacion(idioma, newNotification.mensaje, newNotification.tipo),
            })
          },
        )
        .subscribe()


    }

    void initializeNotifications()
    return () => {
      activo = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [idioma, supabase, toast])

  const markAsRead = async (id: string) => {
    if (!currentUserId) return
    await supabase.from("notificaciones").update({ leida: true }).eq("usuario_id", currentUserId).eq("id", id)

    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const markAllAsRead = async () => {
    if (!currentUserId) return
    await supabase.from("notificaciones").update({ leida: true }).eq("usuario_id", currentUserId).eq("leida", false)

    setNotifications((prev) => prev.map((n) => ({ ...n, leida: true })))
    setUnreadCount(0)
  }

  if (!isAuthenticated || !isTableAvailable) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">{t("Notificaciones")}</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
               {t("Marcar todas como leídas")} </Button>
          )}
        </div>
        <ScrollArea className="h-96">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">{t("No tienes notificaciones")}</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="p-4 cursor-pointer"
                onClick={() => !notification.leida && markAsRead(notification.id)}
              >
                <div className={`flex-1 ${!notification.leida ? "font-semibold" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">{traducirTextoNotificacion(idioma, notification.titulo, notification.tipo)}</p>
                    {!notification.leida && <Badge variant="default" className="h-2 w-2 rounded-full p-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{traducirTextoNotificacion(idioma, notification.mensaje, notification.tipo)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(notification.created_at).toLocaleString(localeDe(idioma))}
                  </p>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
