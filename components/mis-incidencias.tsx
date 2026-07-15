"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldAlert, Briefcase, Clock, CheckCircle2, Scale } from "lucide-react"
import { obtenerMisIncidencias } from "@/app/actions/incidencias"
import { ReportarIncidenciaDialog } from "@/components/reportar-incidencia-dialog"

const ESTADO_CONFIG: Record<string, { label: string; cls: string; icon: any }> = {
  abierta: { label: "Abierta", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: Clock },
  en_revision: { label: "En revisión", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: Scale },
  resuelta: { label: "Resuelta", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  cerrada: { label: "Cerrada", cls: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 },
}

const CATEGORIA_LABEL: Record<string, string> = {
  fraude: "Fraude o estafa",
  abuso: "Abuso o conducta",
  pago: "Problema de pago",
  tecnico: "Problema técnico",
  perfil: "Perfil / verificación",
  otro: "Otro",
}

const PRIORIDAD_CLS: Record<string, string> = {
  baja: "text-emerald-600",
  media: "text-amber-600",
  alta: "text-orange-600",
  critica: "text-red-600",
}

export default function MisIncidencias() {
  const [incidencias, setIncidencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function cargar() {
    setLoading(true)
    const res = await obtenerMisIncidencias()
    setIncidencias(res.data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const formatFecha = (f: string) =>
    new Date(f).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ReportarIncidenciaDialog
          trigger={
            <Button>
              <ShieldAlert className="h-4 w-4 mr-2" />
              Reportar incidencia
            </Button>
          }
        />
      </div>

      {incidencias.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">No tienes incidencias</p>
            <p className="text-muted-foreground mt-1 max-w-md">
              Si tienes un problema con un pago, un trabajo o con otro usuario, repórtalo y nuestro equipo lo
              revisará. Aquí verás el estado de cada incidencia.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {incidencias.map((inc) => {
            const estado = ESTADO_CONFIG[inc.estado] || ESTADO_CONFIG.abierta
            const EstadoIcon = estado.icon
            return (
              <Card key={inc.id}>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{inc.asunto}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {CATEGORIA_LABEL[inc.categoria] || inc.categoria} · Reportada el {formatFecha(inc.created_at)}
                        {" · "}
                        <span className={PRIORIDAD_CLS[inc.prioridad] || ""}>Prioridad {inc.prioridad}</span>
                      </p>
                    </div>
                    <Badge variant="outline" className={`gap-1 shrink-0 ${estado.cls}`}>
                      <EstadoIcon className="h-3.5 w-3.5" />
                      {estado.label}
                    </Badge>
                  </div>

                  {inc.trabajo_titulo && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Briefcase className="h-4 w-4" /> Trabajo relacionado: {inc.trabajo_titulo}
                    </p>
                  )}

                  <p className="text-sm text-muted-foreground">{inc.descripcion}</p>

                  {inc.notas_admin && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-0.5">
                        Respuesta del equipo de Diime
                      </p>
                      <p className="text-sm text-muted-foreground">{inc.notas_admin}</p>
                    </div>
                  )}

                  {inc.fecha_resolucion && (
                    <p className="text-xs text-muted-foreground">Resuelta el {formatFecha(inc.fecha_resolucion)}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
