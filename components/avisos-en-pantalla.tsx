"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

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
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return

    let canal: ReturnType<typeof supabase.channel> | null = null
    let activo = true

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!activo || !user) return

      canal = supabase
        .channel(`avisos-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notificaciones",
            // Filtrar por usuario es imprescindible: sin esto llegarían (y se
            // mostrarían) los avisos dirigidos a otras personas.
            filter: `usuario_id=eq.${user.id}`,
          },
          (payload) => {
            const aviso = payload.new as { titulo?: string; mensaje?: string; link?: string }
            // El aviso también se enseña dentro de la app nativa. El banner del
            // sistema puede estar desactivado por el usuario, pero este preview
            // dentro de Diime debe seguir apareciendo siempre.
            toast({
              title: aviso.titulo || "Nuevo aviso",
              description: aviso.mensaje || undefined,
            })
            window.dispatchEvent(new CustomEvent("diime:notification"))
            // Si el aviso afecta a la pantalla en la que ya estás, se refresca
            // para que el contenido nuevo aparezca sin recargar a mano.
            if (aviso.link && window.location.pathname === aviso.link) router.refresh()
          },
        )
        .subscribe()
    })

    return () => {
      activo = false
      if (canal) supabase.removeChannel(canal)
    }
  }, [toast, router])

  return null
}
