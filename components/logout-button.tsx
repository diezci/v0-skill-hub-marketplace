"use client"

import { useT } from "@/components/idioma-provider"


import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cerrarSesionActual } from "@/lib/auth-logout"
import { useToast } from "@/hooks/use-toast"

export default function LogoutButton() {
  const t = useT()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const cierrePendiente = useRef(false)
  const { toast } = useToast()

  const handleLogout = async () => {
    if (cierrePendiente.current) return
    cierrePendiente.current = true
    setIsLoading(true)
    try {
      await cerrarSesionActual("global")
      router.push("/")
      router.refresh()
    } catch {
      toast({ title: t("No se pudo cerrar la sesión"), description: t("Tu sesión sigue abierta. Comprueba la conexión y vuelve a intentarlo."), variant: "destructive" })
    } finally {
      cierrePendiente.current = false
      setIsLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="destructive"
      onClick={handleLogout}
      disabled={isLoading} aria-busy={isLoading}
      className="gap-2"
    >
      <LogOut className="h-4 w-4" />
      {isLoading ? t("Cerrando sesion...") : t("Cerrar sesion")}
    </Button>
  )
}
