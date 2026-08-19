"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { confirmarMayoriaEdad } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

export function ConfirmarMayoriaEdad() {
  const [abierto, setAbierto] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    const supabase = createClient()

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!activo || !user) return
      if (user.user_metadata?.mayor_edad_confirmada_at) return

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("mayor_edad_confirmada_at")
        .eq("id", user.id)
        .maybeSingle()

      if (!activo || profileError) return
      if (!data?.mayor_edad_confirmada_at) setAbierto(true)
    })

    return () => {
      activo = false
    }
  }, [])

  const guardar = async () => {
    if (!confirmado) return
    setGuardando(true)
    setError(null)
    const resultado = await confirmarMayoriaEdad()
    if (resultado.error) {
      setError(resultado.error)
      setGuardando(false)
      return
    }
    setAbierto(false)
  }

  const salir = async () => {
    setGuardando(true)
    await createClient().auth.signOut({ scope: "local" })
    window.location.assign("/")
  }

  return (
    <Dialog open={abierto}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            Confirma que eres mayor de edad
          </DialogTitle>
          <DialogDescription>
            Diime permite contratar, cobrar y asumir obligaciones económicas. Por eso la cuenta solo puede utilizarla
            una persona de 18 años o más con capacidad legal para contratar.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <Checkbox
            checked={confirmado}
            onCheckedChange={(value) => setConfirmado(value === true)}
            className="mt-0.5"
          />
          <span>
            Confirmo que tengo 18 años o más y acepto esta condición de los{" "}
            <Link href="/legal/terminos" target="_blank" className="text-primary underline underline-offset-4">
              Términos de Diime
            </Link>
            .
          </span>
        </label>

        <p className="text-xs text-muted-foreground">
          Guardamos la fecha de esta confirmación, no tu fecha de nacimiento. Consulta la{" "}
          <Link href="/legal/privacidad" target="_blank" className="text-primary underline underline-offset-4">
            Política de privacidad
          </Link>
          .
        </p>

        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={salir} disabled={guardando}>
            Cerrar sesión
          </Button>
          <Button onClick={guardar} disabled={!confirmado || guardando}>
            {guardando ? "Guardando..." : "Confirmar y continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
