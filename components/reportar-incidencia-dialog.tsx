"use client"

import { useState } from "react"
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
import { crearIncidencia, type IncidenciaCategoria, type IncidenciaPrioridad } from "@/app/actions/incidencias"
import { useToast } from "@/hooks/use-toast"

interface ReportarIncidenciaDialogProps {
  trabajoId?: string
  usuarioReportadoId?: string
  trigger?: React.ReactNode
}

export function ReportarIncidenciaDialog({ trabajoId, usuarioReportadoId, trigger }: ReportarIncidenciaDialogProps) {
  const [open, setOpen] = useState(false)
  const [asunto, setAsunto] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [categoria, setCategoria] = useState<IncidenciaCategoria>("otro")
  const [prioridad, setPrioridad] = useState<IncidenciaPrioridad>("media")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async () => {
    if (!asunto.trim() || !descripcion.trim()) {
      toast({ title: "Faltan datos", description: "Completa asunto y descripción", variant: "destructive" })
      return
    }
    setSubmitting(true)
    const res = await crearIncidencia({
      asunto: asunto.trim(),
      descripcion: descripcion.trim(),
      categoria,
      prioridad,
      trabajo_id: trabajoId || null,
      usuario_reportado: usuarioReportadoId || null,
    })
    if (res.error) {
      toast({ title: "Error", description: res.error, variant: "destructive" })
    } else {
      toast({
        title: "Incidencia reportada",
        description: "Nuestro equipo la revisará lo antes posible.",
      })
      setOpen(false)
      setAsunto("")
      setDescripcion("")
      setCategoria("otro")
      setPrioridad("media")
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
              placeholder="Cuéntanos qué ha ocurrido, cuándo y con qué usuarios o trabajo está relacionado..."
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
          <Button onClick={handleSubmit} disabled={submitting}>
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
