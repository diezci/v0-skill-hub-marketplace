"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageSquare } from "lucide-react"
import { crearConversacionAdmin } from "@/app/actions/messages"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface AdminChatUsuarioButtonProps {
  usuarioId: string
  nombre?: string
  compacto?: boolean
  className?: string
}

export function AdminChatUsuarioButton({
  usuarioId,
  nombre,
  compacto = false,
  className,
}: AdminChatUsuarioButtonProps) {
  const [abriendo, setAbriendo] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const abrirChat = async () => {
    setAbriendo(true)
    try {
      const resultado = await crearConversacionAdmin(usuarioId)
      if (resultado.error || !resultado.data?.id) {
        toast({
          title: "No se pudo abrir el chat",
          description: resultado.error || "Inténtalo de nuevo en unos segundos.",
          variant: "destructive",
        })
        return
      }

      router.push(`/admin/mensajes?c=${resultado.data.id}`)
    } catch {
      toast({
        title: "No se pudo abrir el chat",
        description: "Ha ocurrido un error inesperado. Inténtalo de nuevo.",
        variant: "destructive",
      })
    } finally {
      setAbriendo(false)
    }
  }

  return (
    <Button
      type="button"
      size={compacto ? "sm" : "default"}
      variant={compacto ? "outline" : "default"}
      className={cn("gap-2", className)}
      disabled={abriendo}
      onClick={abrirChat}
      aria-label={nombre ? `Chatear con ${nombre}` : "Chatear con el usuario"}
    >
      {abriendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
      {compacto ? "Chat" : "Chatear con usuario"}
    </Button>
  )
}
