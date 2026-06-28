"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Loader2, XCircle, Check, Ban } from "lucide-react"
import { solicitarCancelacion, responderCancelacion } from "@/app/actions/trabajos"
import { AbrirDisputaDialog } from "@/components/abrir-disputa-dialog"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface CancelacionTrabajoProps {
  trabajo: {
    id: string
    estado?: string
    cliente_id?: string
    profesional_id?: string
    cancelacion_estado?: string | null
    cancelacion_solicitada_por?: string | null
    cancelacion_razon?: string | null
  }
  onChange?: () => void
}

export function CancelacionTrabajo({ trabajo, onChange }: CancelacionTrabajoProps) {
  const [userId, setUserId] = useState<string | null>(null)
  const [openSolicitar, setOpenSolicitar] = useState(false)
  const [razon, setRazon] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    try {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    } catch {
      // sin sesión: no se muestra nada
    }
  }, [])

  const refrescar = () => {
    onChange?.()
    router.refresh()
  }

  const handleSolicitar = async () => {
    setSubmitting(true)
    const res = await solicitarCancelacion(trabajo.id, razon)
    if (res.error) {
      toast({ title: "No se pudo solicitar", description: res.error, variant: "destructive" })
    } else {
      toast({
        title: "Cancelación solicitada",
        description: "La otra parte recibirá el aviso para aceptarla o rechazarla.",
      })
      setOpenSolicitar(false)
      setRazon("")
      refrescar()
    }
    setSubmitting(false)
  }

  const handleResponder = async (aceptar: boolean) => {
    setSubmitting(true)
    const res = await responderCancelacion(trabajo.id, aceptar)
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" })
    } else {
      toast({
        title: aceptar ? "Cancelación aceptada" : "Cancelación rechazada",
        description: aceptar
          ? "El trabajo ha quedado cancelado."
          : "La otra parte podrá abrir una disputa si no hay acuerdo.",
      })
      refrescar()
    }
    setSubmitting(false)
  }

  if (!userId || trabajo.estado !== "pendiente_pago") return null

  const soyElSolicitante = trabajo.cancelacion_solicitada_por === userId
  const estadoCanc = trabajo.cancelacion_estado

  // 1) Solicitud pendiente: el que NO la pidió debe aceptar/rechazar.
  if (estadoCanc === "pendiente" && !soyElSolicitante) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Ban className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              La otra parte quiere cancelar este trabajo
            </p>
            {trabajo.cancelacion_razon && (
              <p className="text-sm text-muted-foreground mt-0.5">Motivo: {trabajo.cancelacion_razon}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Si aceptas, el trabajo se cancela. Si rechazas, la otra parte podrá abrir una disputa.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={submitting}
            onClick={() => handleResponder(true)}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            Aceptar cancelación
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-transparent"
            disabled={submitting}
            onClick={() => handleResponder(false)}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Rechazar
          </Button>
        </div>
      </div>
    )
  }

  // 2) Solicitud pendiente: el que la pidió espera respuesta.
  if (estadoCanc === "pendiente" && soyElSolicitante) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
        Has solicitado cancelar este trabajo. Esperando que la otra parte lo acepte o lo rechace.
      </div>
    )
  }

  // 3) Cancelación rechazada: el solicitante puede abrir disputa.
  if (estadoCanc === "rechazada" && soyElSolicitante) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 space-y-3">
        <p className="text-sm">
          Tu solicitud de cancelación fue <span className="font-medium">rechazada</span>. Si no llegáis a un acuerdo,
          puedes abrir una disputa para que el equipo de Diime medie.
        </p>
        <AbrirDisputaDialog trabajoId={trabajo.id} onCreated={refrescar} />
      </div>
    )
  }

  // 4) Cancelación rechazada: la otra parte solo ve el estado.
  if (estadoCanc === "rechazada" && !soyElSolicitante) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        Rechazaste la solicitud de cancelación. La otra parte podría abrir una disputa.
      </div>
    )
  }

  // 5) Sin cancelación en curso: botón para solicitarla.
  return (
    <Dialog open={openSolicitar} onOpenChange={setOpenSolicitar}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10"
        >
          <XCircle className="h-4 w-4 mr-1" />
          Solicitar cancelación
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar cancelación</DialogTitle>
          <DialogDescription>
            La cancelación debe ser de mutuo acuerdo: la otra parte recibirá un aviso y deberá aceptarla o rechazarla.
            Si la rechaza, podrás abrir una disputa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-1">
          <label className="text-sm font-medium">Motivo (opcional)</label>
          <Textarea
            placeholder="Explica brevemente por qué quieres cancelar..."
            value={razon}
            onChange={(e) => setRazon(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="bg-transparent" onClick={() => setOpenSolicitar(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            disabled={submitting}
            onClick={handleSolicitar}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
