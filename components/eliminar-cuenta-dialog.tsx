"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { AlertCircle, Loader2, Trash2 } from "lucide-react"
import { eliminarMiCuenta } from "@/app/actions/auth"
import { useToast } from "@/hooks/use-toast"

// La palabra que hay que teclear para confirmar. Es un borrado irreversible, y
// un solo clic de más no debería bastar para provocarlo.
const CONFIRMACION = "ELIMINAR"

export function EliminarCuentaDialog() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmar = async () => {
    setEnviando(true)
    setError(null)

    const res = await eliminarMiCuenta()

    if (res?.error) {
      // Aquí caen los avisos de "tienes trabajos en curso" o "tienes disputas
      // abiertas": no son un fallo, son la razón por la que aún no puede
      // borrarse, así que se muestran dentro del diálogo y no como error suelto.
      setError(res.error)
      setEnviando(false)
      return
    }

    toast({
      title: "Cuenta eliminada",
      description: "Hemos borrado tus datos personales y cerrado tu sesión.",
    })
    setOpen(false)
    // Recarga completa: la sesión ya no existe y hay que soltar todo lo que
    // quedara cacheado del usuario.
    window.location.href = "/"
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setTexto("")
          setError(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10 gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Eliminar mi cuenta
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-destructive">Eliminar mi cuenta</DialogTitle>
          <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="font-medium">Qué pasa cuando lo confirmes:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Se borran tu nombre, foto, correo, teléfono, documento y descripción.</li>
              <li>Dejas de aparecer en Profesionales y de recibir avisos de demandas.</li>
              <li>Pierdes el acceso: no podrás volver a entrar con esta cuenta.</li>
              <li>
                Se conservan los trabajos y facturas ya cerrados, sin tus datos personales: son el historial de la otra
                parte y la ley obliga a guardar los registros contables.
              </li>
            </ul>
          </div>

          <p className="text-muted-foreground">
            No podrás eliminarla si tienes trabajos en curso, dinero en custodia o disputas abiertas.
          </p>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="confirmar-borrado">
              Escribe <span className="font-mono font-semibold">{CONFIRMACION}</span> para confirmar
            </Label>
            <Input
              id="confirmar-borrado"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={CONFIRMACION}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={enviando || texto.trim() !== CONFIRMACION}>
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Eliminando...
              </>
            ) : (
              "Eliminar mi cuenta"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
