"use client"

import { useEffect, useState, useTransition } from "react"
import { Capacitor } from "@capacitor/core"
import { PushNotifications } from "@capacitor/push-notifications"
import { Bell, BellRing, CheckCircle2, Loader2, TriangleAlert } from "lucide-react"
import { probarNotificacionPush, registrarDispositivoPush } from "@/app/actions/push"
import { guardarTokenPushActual } from "@/lib/push/client"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

type Estado = "cargando" | "web" | "prompt" | "denied" | "granted" | "registered" | "error"

export function PreferenciaPush() {
  const [estado, setEstado] = useState<Estado>("cargando")
  const [ocupado, startTransition] = useTransition()
  const { toast } = useToast()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setEstado("web")
      return
    }

    let activo = true
    PushNotifications.checkPermissions()
      .then(({ receive }) => {
        if (activo) setEstado(receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt")
      })
      .catch(() => activo && setEstado("error"))

    const alCambiar = (evento: Event) => {
      const detail = (evento as CustomEvent).detail as { permiso?: string; registrado?: boolean; error?: string }
      if (detail.registrado) setEstado("registered")
      else if (detail.error) setEstado("error")
      else if (detail.permiso === "denied") setEstado("denied")
      else if (detail.permiso === "granted") setEstado("granted")
    }
    window.addEventListener("diime:push-state", alCambiar)
    return () => {
      activo = false
      window.removeEventListener("diime:push-state", alCambiar)
    }
  }, [])

  const activar = () => {
    startTransition(async () => {
      try {
        let permiso = await PushNotifications.checkPermissions()
        if (permiso.receive === "prompt" || permiso.receive === "prompt-with-rationale") {
          permiso = await PushNotifications.requestPermissions()
        }
        if (permiso.receive !== "granted") {
          setEstado("denied")
          return
        }

        let resolverToken: (token: string) => void = () => {}
        let rechazarToken: (error: Error) => void = () => {}
        const tokenPendiente = new Promise<string>((resolve, reject) => {
          resolverToken = resolve
          rechazarToken = reject
        })
        const registro = await PushNotifications.addListener("registration", ({ value }) => resolverToken(value))
        const fallo = await PushNotifications.addListener("registrationError", (error) =>
          rechazarToken(new Error(error.error)),
        )
        const timeout = window.setTimeout(
          () => rechazarToken(new Error("El iPhone no devolvió el token de notificaciones")),
          10000,
        )
        const token = await (async () => {
          try {
            await PushNotifications.register()
            return await tokenPendiente
          } finally {
            window.clearTimeout(timeout)
            void registro.remove()
            void fallo.remove()
          }
        })()

        guardarTokenPushActual(token)
        const resultado = await registrarDispositivoPush(token, Capacitor.getPlatform() as "ios" | "android")
        if (resultado?.error) throw new Error(resultado.error)
        setEstado("registered")
        toast({ title: "Notificaciones activadas", description: "Este dispositivo ya puede recibir avisos de Diime." })
      } catch (error) {
        setEstado("error")
        toast({
          title: "No se pudieron activar",
          description: error instanceof Error ? error.message : "Vuelve a intentarlo.",
          variant: "destructive",
        })
      }
    })
  }

  const probar = () => {
    startTransition(async () => {
      const resultado = await probarNotificacionPush()
      if (resultado?.error) {
        toast({ title: "No se pudo enviar la prueba", description: resultado.error, variant: "destructive" })
        return
      }
      toast({ title: "Prueba enviada", description: "Deberías recibir el aviso en unos segundos." })
    })
  }

  if (estado === "web") {
    return <p className="mt-3 text-xs text-muted-foreground">Las notificaciones push se configuran desde la app de iPhone o Android.</p>
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        {estado === "registered" ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        ) : estado === "denied" || estado === "error" ? (
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        ) : (
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {estado === "registered"
              ? "Notificaciones activadas"
              : estado === "denied"
              ? "Notificaciones bloqueadas en el sistema"
                : estado === "error"
                  ? "No se pudo registrar este dispositivo"
                  : "Avisos en este dispositivo"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {estado === "denied"
              ? "Abre Ajustes → Diime → Notificaciones y activa Permitir notificaciones, Previsualizaciones y Sonidos."
              : "Los mensajes muestran el remitente y parte del texto, también con la app cerrada."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {estado !== "denied" && estado !== "registered" && (
              <Button size="sm" onClick={activar} disabled={ocupado}>
                {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Bell className="mr-1.5 h-4 w-4" />}
                Activar
              </Button>
            )}
            {(estado === "registered" || estado === "granted") && (
              <Button size="sm" variant="outline" onClick={probar} disabled={ocupado} className="bg-transparent">
                {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BellRing className="mr-1.5 h-4 w-4" />}
                Enviar prueba
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
