"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, KeyRound } from "lucide-react"
import { updatePassword } from "@/app/actions/auth"
import { useToast } from "@/hooks/use-toast"

export function CambiarContrasenaForm() {
  const [nueva, setNueva] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (nueva.length < 6) {
      toast({ title: "Contraseña demasiado corta", description: "Usa al menos 6 caracteres.", variant: "destructive" })
      return
    }
    if (nueva !== confirmar) {
      toast({ title: "Las contraseñas no coinciden", variant: "destructive" })
      return
    }
    setSubmitting(true)
    const result = await updatePassword(nueva)
    if (result.error) {
      toast({ title: "No se pudo cambiar la contraseña", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Contraseña actualizada", description: "Ya puedes usarla en tu próximo inicio de sesión." })
      setNueva("")
      setConfirmar("")
    }
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="nueva-contrasena">
            Nueva contraseña
          </label>
          <Input
            id="nueva-contrasena"
            type="password"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Mínimo 6 caracteres"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="confirmar-contrasena">
            Confirmar contraseña
          </label>
          <Input
            id="confirmar-contrasena"
            type="password"
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            placeholder="Repite la contraseña"
          />
        </div>
      </div>
      <Button type="submit" disabled={submitting || !nueva || !confirmar} className="gap-2">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Actualizar contraseña
      </Button>
    </form>
  )
}
