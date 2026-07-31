"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Mail, MailX, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { actualizarPreferenciaEmails } from "@/app/actions/notificaciones"

// Baja de los avisos por correo. El RGPD exige que darse de baja sea tan fácil
// como el alta, así que está aquí y también enlazado al pie de cada correo.
export function PreferenciaEmails({ inicial }: { inicial: boolean }) {
  const [activo, setActivo] = useState(inicial)
  const [guardando, startTransition] = useTransition()
  const { toast } = useToast()

  const alternar = () => {
    const nuevo = !activo
    // Optimista: se pinta ya y se revierte si el guardado falla.
    setActivo(nuevo)
    startTransition(async () => {
      const res = await actualizarPreferenciaEmails(nuevo)
      if (res?.error) {
        setActivo(!nuevo)
        toast({ title: "No se pudo guardar", description: res.error, variant: "destructive" })
        return
      }
      toast({
        title: nuevo ? "Avisos por correo activados" : "Avisos por correo desactivados",
        description: nuevo
          ? "Te escribiremos cuando pase algo importante en tus proyectos."
          : "Seguirás viendo los avisos dentro de Diime.",
      })
    })
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-medium mb-1">Avisos por correo</h3>
        <p className="text-sm text-muted-foreground">
          {activo
            ? "Recibes un correo cuando te hacen una oferta, cobras o se abre una disputa."
            : "No recibes correos. Los avisos siguen apareciendo dentro de Diime."}
        </p>
      </div>
      <Button variant={activo ? "outline" : "default"} size="sm" onClick={alternar} disabled={guardando}>
        {guardando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : activo ? (
          <>
            <MailX className="h-4 w-4 mr-1.5" />
            Desactivar
          </>
        ) : (
          <>
            <Mail className="h-4 w-4 mr-1.5" />
            Activar
          </>
        )}
      </Button>
    </div>
  )
}
