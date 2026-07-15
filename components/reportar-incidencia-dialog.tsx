"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, ShieldAlert } from "lucide-react"
import {
  crearIncidencia,
  obtenerTrabajosParaIncidencia,
  type IncidenciaCategoria,
  type IncidenciaPrioridad,
} from "@/app/actions/incidencias"
import { useToast } from "@/hooks/use-toast"

interface ReportarIncidenciaDialogProps {
  trabajoId?: string
  usuarioReportadoId?: string
  trigger?: React.ReactNode
  asuntoInicial?: string
  categoriaInicial?: IncidenciaCategoria
  descripcionPlaceholder?: string
}

export function ReportarIncidenciaDialog({
  trabajoId,
  usuarioReportadoId,
  trigger,
  asuntoInicial = "",
  categoriaInicial = "otro",
  descripcionPlaceholder = "Cuéntanos qué ha ocurrido, cuándo y con qué usuarios o trabajo está relacionado...",
}: ReportarIncidenciaDialogProps) {
  const [open, setOpen] = useState(false)
  const [asunto, setAsunto] = useState(asuntoInicial)
  const [descripcion, setDescripcion] = useState("")
  const [categoria, setCategoria] = useState<IncidenciaCategoria>(categoriaInicial)
  const [prioridad, setPrioridad] = useState<IncidenciaPrioridad>("media")
  const [submitting, setSubmitting] = useState(false)
  // Toda incidencia se vincula a un trabajo concreto. Si el diálogo se abre
  // desde la ficha de un trabajo, viene fijado; si no, el usuario lo elige.
  const [trabajos, setTrabajos] = useState<any[]>([])
  const [trabajoSel, setTrabajoSel] = useState<string>(trabajoId || "")
  const { toast } = useToast()

  // Cargar los trabajos del usuario solo cuando no venga un trabajo fijado.
  useEffect(() => {
    if (!open || trabajoId) return
    obtenerTrabajosParaIncidencia().then((r) => setTrabajos(r.data || []))
  }, [open, trabajoId])

  const handleSubmit = async () => {
    if (!asunto.trim() || !descripcion.trim()) {
      toast({ title: "Faltan datos", description: "Completa asunto y descripción", variant: "destructive" })
      return
    }
    const trabajoElegido = trabajoId || trabajoSel
    if (!trabajoElegido) {
      toast({
        title: "Selecciona un trabajo",
        description: "Cada incidencia debe estar vinculada a un trabajo concreto.",
        variant: "destructive",
      })
      return
    }
    // Reportar automáticamente a la otra parte del trabajo (si no viene dada).
    const otraParte =
      usuarioReportadoId || trabajos.find((t) => t.id === trabajoElegido)?.otra_parte_id || null
    setSubmitting(true)
    const res = await crearIncidencia({
      asunto: asunto.trim(),
      descripcion: descripcion.trim(),
      categoria,
      prioridad,
      trabajo_id: trabajoElegido,
      usuario_reportado: otraParte,
    })
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" })
    } else {
      toast({
        title: "Incidencia reportada",
        description: "Nuestro equipo la revisará lo antes posible.",
      })
      setOpen(false)
      setAsunto(asuntoInicial)
      setDescripcion("")
      setCategoria(categoriaInicial)
      setPrioridad("media")
      setTrabajoSel(trabajoId || "")
    }
    setSubmitting(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            Reportar incidencia
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Reportar una incidencia
          </DialogTitle>
          <DialogDescription>
            Describe el problema. Nuestro equipo de soporte lo revisará y te contactará si es necesario.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Selector de trabajo: solo cuando el diálogo no viene ya asociado a
              uno. Cada incidencia debe vincularse a un trabajo concreto. */}
          {!trabajoId && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Trabajo relacionado</label>
              {trabajos.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                  No tienes trabajos todavía. Las incidencias se vinculan a un trabajo contratado; cuando tengas uno
                  activo podrás reportar aquí cualquier problema.
                </p>
              ) : (
                <Select value={trabajoSel} onValueChange={setTrabajoSel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona el trabajo" />
                  </SelectTrigger>
                  <SelectContent>
                    {trabajos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Asunto</label>
            <Input
              placeholder="Resumen breve del problema"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Categoría</label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as IncidenciaCategoria)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fraude">Fraude o estafa</SelectItem>
                  <SelectItem value="abuso">Abuso o conducta</SelectItem>
                  <SelectItem value="pago">Problema de pago</SelectItem>
                  <SelectItem value="tecnico">Problema técnico</SelectItem>
                  <SelectItem value="perfil">Perfil / verificación</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Prioridad</label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as IncidenciaPrioridad)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Descripción</label>
            <Textarea
              placeholder={descripcionPlaceholder}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={5}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || (!trabajoId && trabajos.length === 0)}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar reporte"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
