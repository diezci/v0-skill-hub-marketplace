"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageCircle } from "lucide-react"
import { crearConversacionSoporte } from "@/app/actions/messages"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

export function SupportChatButton() {
  const [abriendo, setAbriendo] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const abrirSoporte = async () => {
    setAbriendo(true)
    const resultado = await crearConversacionSoporte()

    if (resultado.error === "No autenticado") {
      router.push("/auth/login")
      return
    }

    if (resultado.error || !resultado.data?.id) {
      toast({
        title: "No se pudo abrir el chat",
        description: resultado.error || "Inténtalo de nuevo en unos segundos.",
        variant: "destructive",
      })
      setAbriendo(false)
      return
    }

    router.push(`/mensajes?c=${resultado.data.id}`)
  }

  return (
    <Button type="button" onClick={abrirSoporte} disabled={abriendo}>
      {abriendo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
      {abriendo ? "Abriendo soporte…" : "Abrir chat de soporte"}
    </Button>
  )
}
