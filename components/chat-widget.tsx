"use client"

// Botón flotante de mensajes: acceso directo a /mensajes (la sección real de
// chat). Antes había aquí un mini-chat duplicado que usaba un backend legacy
// y no funcionaba; se sustituye por esta vía única.

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { MessageCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export function useChatWidget() {
  // Los argumentos se aceptan por compatibilidad con los usos existentes.
  const openChat = (_userId?: string, _userName?: string) => {
    if (typeof window !== "undefined") window.location.href = "/mensajes"
  }
  return { openChat }
}

export function ChatWidget() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    try {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }) => setIsAuthenticated(!!data.user))
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_e, session) => setIsAuthenticated(!!session?.user))
      return () => subscription.unsubscribe()
    } catch {
      setIsAuthenticated(false)
    }
  }, [])

  // En la propia sección de mensajes el botón sobra.
  if (!isAuthenticated || pathname?.startsWith("/mensajes")) return null

  return (
    <Button
      onClick={() => router.push("/mensajes")}
      className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-emerald-500 hover:bg-emerald-600"
      size="icon"
      aria-label="Abrir mensajes"
    >
      <MessageCircle className="h-6 w-6" />
    </Button>
  )
}
