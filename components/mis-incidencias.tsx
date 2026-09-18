"use client"

import { useT, useIdioma } from "@/components/idioma-provider"
import { localeDe } from "@/lib/i18n"

import { useEffect, useState, Suspense } from "react"
import { useNotificacionesSeccion } from "@/hooks/use-notificaciones-seccion"
import { useDestinoNotificacion } from "@/hooks/use-destino-notificacion"
import { AvisosTarjeta } from "@/components/avisos-tarjeta"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldAlert, Briefcase, Clock, CheckCircle2, Scale, XCircle } from "lucide-react"
import { obtenerMisIncidencias, retirarIncidencia } from "@/app/actions/incidencias"
import { ReportarIncidenciaDialog } from "@/components/reportar-incidencia-dialog"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const ESTADO_CONFIG: Record<string, { label: string; cls: string; icon: any }> = {
  abierta: { label: "Abierta", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: Clock },
  en_revision: { label: "En revisión", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: Scale },
  resuelta: { label: "Resuelta", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  cerrada: { label: "Cerrada", cls: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 },
  retirada: { label: "Retirada", cls: "bg-muted text-muted-foreground border-border", icon: XCircle },
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
  return <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>}><MisIncidenciasContenido /></Suspense>
}

function MisIncidenciasContenido() {
  const t = useT()
  const { idioma } = useIdioma()

  const { pendientes, marcarLeidas } = useNotificacionesSeccion("/incidencias")
  const [incidencias, setIncidencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [aRetirar, setARetirar] = useState<any>(null)
  const [retirando, setRetirando] = useState(false)
  const { toast } = useToast()

  async function cargar() {
    setLoading(true)
    const res = await obtenerMisIncidencias()
    setIncidencias(res.data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const handleRetirar = async () => {
    if (!aRetirar) return
    setRetirando(true)
    const res = await retirarIncidencia(aRetirar.id)
    setRetirando(false)
    setARetirar(null)
    if (res.error) {
      toast({ title: t("No se pudo retirar"), description: t(res.error), variant: "destructive" })
    } else {
      toast({ title: t("Incidencia retirada"), description: t("Se ha retirado del equipo de Diime.") })
      await cargar()
    }
  }

  const formatFecha = (f: string) =>
    new Date(f).toLocaleDateString(localeDe(idioma), { day: "numeric", month: "short", year: "numeric" })

  const destino = useDestinoNotificacion({
    cargando: loading,
    resolver: (params) => {
      const incidencia = incidencias.find((item) => item.id === params.get("incidencia"))
      return incidencia ? { id: `incidencia-${incidencia.id}` } : null
    },
  })
  const avisosIncidencia = (id: string) => pendientes.filter((aviso) =>
    aviso.metadata?.incidencia_id === id || (aviso.link && new URL(aviso.link, "https://www.diime.es").searchParams.get("incidencia") === id),
  )

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
              <ShieldAlert className="h-4 w-4 mr-2" />{t("Reportar incidencia")}</Button>
          }
        />
      </div>

      {incidencias.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">{t("No tienes incidencias")}</p>
            <p className="text-muted-foreground mt-1 max-w-md">{t("Si tienes un problema con un pago, un trabajo o con otro usuario, repórtalo y nuestro equipo lo revisará. Aquí verás el estado de cada incidencia.")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {incidencias.map((inc) => {
            const estado = ESTADO_CONFIG[inc.estado] || ESTADO_CONFIG.abierta
            const EstadoIcon = estado.icon
            return (
              <Card key={inc.id} id={`incidencia-${inc.id}`} tabIndex={-1} className={`scroll-mt-24 ${avisosIncidencia(inc.id).length || destino === `incidencia-${inc.id}` ? "ring-2 ring-primary/50 border-primary/40" : ""}`}>
                <CardContent className="pt-6 space-y-3">
                  <AvisosTarjeta avisos={avisosIncidencia(inc.id)} onMarcarLeidas={marcarLeidas} titulo="Novedades de esta incidencia" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{inc.asunto}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(CATEGORIA_LABEL[inc.categoria] || inc.categoria)}{" "}{t("· Reportada el")}{" "}{formatFecha(inc.created_at)}
                        {" · "}
                        <span className={PRIORIDAD_CLS[inc.prioridad] || ""}>{t("Prioridad")}{" "}{t(inc.prioridad)}</span>
                      </p>
                    </div>
                    <Badge variant="outline" className={`gap-1 shrink-0 ${estado.cls}`}>
                      <EstadoIcon className="h-3.5 w-3.5" />
                      {t(estado.label)}
                    </Badge>
                  </div>

                  {inc.trabajo_titulo && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Briefcase className="h-4 w-4" />{" "}{t("Trabajo relacionado:")}{" "}{inc.trabajo_titulo}
                    </p>
                  )}

                  <p className="text-sm text-muted-foreground">{inc.descripcion}</p>

                  {inc.notas_admin && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-0.5">{t("Respuesta del equipo de Diime")}</p>
                      <p className="text-sm text-muted-foreground">{inc.notas_admin}</p>
                    </div>
                  )}

                  {inc.fecha_resolucion && (
                    <p className="text-xs text-muted-foreground">{t("Resuelta el")}{" "}{formatFecha(inc.fecha_resolucion)}</p>
                  )}

                  {/* Se puede retirar mientras el equipo no la haya resuelto ni cerrado. */}
                  {(inc.estado === "abierta" || inc.estado === "en_revision") && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setARetirar(inc)}
                        className="text-xs text-destructive hover:underline inline-flex items-center gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" />{" "}{t("Retirar incidencia")}</button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!aRetirar} onOpenChange={(o) => !o && setARetirar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("¿Retirar la incidencia?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("El equipo de Diime dejará de revisarla. Podrás reportarla de nuevo más adelante si lo necesitas.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retirando}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRetirar}
              disabled={retirando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >{t("Retirar incidencia")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
