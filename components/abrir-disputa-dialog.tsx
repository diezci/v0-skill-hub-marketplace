"use client"

import { useState } from "react"
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
import { Loader2, Scale } from "lucide-react"
import { crearDisputa } from "@/app/actions/disputes"
import { useToast } from "@/hooks/use-toast"

interface AbrirDisputaDialogProps {
  trabajoId: string
  // Quién abre la disputa, para adaptar el texto de ayuda.
  rol?: "cliente" | "proveedor"
  trigger?: React.ReactNode
  onCreated?: () => void
}

export function AbrirDisputaDialog({ trabajoId, rol, trigger, onCreated }: AbrirDisputaDialogProps) {
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const placeholder =
    rol === "proveedor"
      ? "Ej.: entregué el trabajo acordado y el cliente no confirma la recepción para liberar el pago..."
      : "Ej.: el servicio no se ha realizado / no cumple lo acordado. Explica qué falló y qué solución pides..."

  const handleSubmit = async () => {
    if (!motivo.trim()) {
      toast({ title: "Falta el motivo", description: "Describe qué ha ocurrido.", variant: "destructive" })
      return
    }
    setSubmitting(true)
    const res = await crearDisputa({ trabajo_id: trabajoId, motivo: motivo.trim() })
    if (res.error) {
      toast({ title: "No se pudo abrir la disputa", description: res.error, variant: "destructive" })
    } else {
      toast({
        title: "Disputa abierta",
        description: "El pago queda retenido y el equipo de Diime la revisará para resolverla.",
      })
      setOpen(false)
      setMotivo("")
      onCreated?.()
      router.refresh()
    }
    setSubmitting(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2 text-amber-600 hover:text-amber-700 bg-transparent">
            <Scale className="h-4 w-4" />
            Abrir disputa
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-600" />
            Abrir una disputa
          </DialogTitle>
          <DialogDescription>
            Úsala si hay un problema con este trabajo y no llegáis a un acuerdo. Al abrirla, el pago en custodia
            queda <strong>congelado</strong> y el equipo de Diime revisará la conversación y las pruebas para decidir
            si se reembolsa al cliente o se libera al proveedor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <label className="text-sm font-medium">Motivo de la disputa</label>
          <Textarea
            placeholder={placeholder}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={5}
          />
          <p className="text-xs text-muted-foreground">
            Aporta el máximo detalle. Las fotos y mensajes del trabajo se incluyen automáticamente como pruebas.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Abriendo...
              </>
            ) : (
              "Abrir disputa"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
