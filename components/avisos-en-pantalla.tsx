"use client"

import { useIdioma } from "@/components/idioma-provider"
import { traducirTextoNotificacion } from "@/lib/i18n-notificaciones"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { seccionDeNotificacion } from "@/lib/notificaciones-contexto"
import { useToast } from "@/hooks/use-toast"
import { useResumenNotificaciones } from "@/hooks/use-notificaciones-seccion"

// Muestra un aviso emergente cuando llega una notificación nueva.
//
// Sin esto, un aviso solo encendía el contador del menú: si ya estabas DENTRO
// de la sección a la que apunta, no se encendía nada y no te enterabas.
//
// No pinta interfaz propia (la campana ya está en la barra): solo escucha y
// avisa. Es un componente aparte y no el `realtime-notifications` que había
// suelto en el repo porque aquel se suscribía a las notificaciones de TODOS los
// usuarios, sin filtrar, y además duplicaba la campana.
export function AvisosEnPantalla() {
  const { idioma } = useIdioma()
  const { usuarioId } = useResumenNotificaciones()
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    if (!supabase || !usuarioId) return

    let canal: ReturnType<typeof supabase.channel> | null = null
    let activo = true

    canal = supabase
      .channel(`avisos-${usuarioId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificaciones",
          // Filtrar por usuario es imprescindible: sin esto llegarían (y se
          // mostrarían) los avisos dirigidos a otras personas.
          filter: `usuario_id=eq.${usuarioId}`,
        },
        (payload) => {
          if (!activo) return
          const aviso = payload.new as { tipo?: string; titulo?: string; mensaje?: string; link?: string }
          // El aviso también se enseña dentro de la app nativa. El banner del
          // sistema puede estar desactivado por el usuario, pero este preview
          // dentro de Diime debe seguir apareciendo siempre.
          toast({
            title: traducirTextoNotificacion(idioma, aviso.titulo || "Nuevo aviso", aviso.tipo),
            description: aviso.mensaje ? traducirTextoNotificacion(idioma, aviso.mensaje, aviso.tipo) : undefined,
          })
          window.dispatchEvent(new CustomEvent("diime:notification"))
          // Si el aviso afecta a la pantalla en la que ya estás, se refresca
          // para que el contenido nuevo aparezca sin recargar a mano.
          if (aviso.link && window.location.pathname === seccionDeNotificacion(aviso.link)) router.refresh()
        },
      )
      .subscribe()

    return () => {
      activo = false
      if (canal) supabase.removeChannel(canal)
    }
  }, [toast, router, idioma, usuarioId])

  return null
}
