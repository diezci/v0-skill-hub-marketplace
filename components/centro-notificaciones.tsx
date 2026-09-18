"use client"

import { useEffect, useState } from "react"
import { useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { FilaAviso } from "@/components/avisos-seccion"
import { useResumenNotificaciones } from "@/hooks/use-notificaciones-seccion"
import { obtenerHistorialNotificaciones } from "@/app/actions/notificaciones"
import type { NotificacionContextual } from "@/lib/notificaciones-contexto"
import { AvisoMensajesPendientes } from "@/components/aviso-mensajes-pendientes"

export function CentroNotificaciones({ enPanelAdmin = false }: { enPanelAdmin?: boolean }) {
  const { usuarioId } = useResumenNotificaciones()
  // Key the local history to its owner: switching accounts removes old rows
  // immediately and runs the in-flight request cleanup before loading another.
  return <CentroNotificacionesUsuario key={usuarioId || "sin-sesion"} usuarioId={usuarioId} enPanelAdmin={enPanelAdmin} />
}

function CentroNotificacionesUsuario({ usuarioId, enPanelAdmin }: { usuarioId: string | null; enPanelAdmin: boolean }) {
  const t = useT()
  const { resumen, cargando, error, marcarLeidas } = useResumenNotificaciones()
  const [historial, setHistorial] = useState(false)
  const [filas, setFilas] = useState<NotificacionContextual[]>([])
  const [pagina, setPagina] = useState(0)
  const [hayMas, setHayMas] = useState(false)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [errorHistorial, setErrorHistorial] = useState("")
  useEffect(() => {
    if (!historial || !usuarioId) return
    let activo = true
    setCargandoHistorial(true)
    obtenerHistorialNotificaciones(pagina).then(r => {
      if (!activo) return
      setErrorHistorial(r.error || "")
      if (!r.error) { setFilas(prev => pagina === 0 ? r.data : [...prev, ...r.data.filter(n => !prev.some(p => p.id === n.id))]); setHayMas(r.hayMas) }
    }).catch(() => { if (activo) setErrorHistorial("No se pudieron cargar las notificaciones") })
      .finally(() => { if (activo) setCargandoHistorial(false) })
    return () => { activo = false }
  }, [historial, pagina, usuarioId])
  const pendientes = enPanelAdmin ? resumen.notificaciones.filter(n => n.seccion.startsWith("/admin/")) : resumen.notificaciones
  const mostradas = (historial ? filas : pendientes).filter(n => !enPanelAdmin || n.seccion.startsWith("/admin/"))
  const numeroPendientes = pendientes.length + (enPanelAdmin ? resumen.mensajesNoLeidos : 0)
  return <div className="container mx-auto max-w-3xl px-4 py-8">
    <h1 className="text-3xl font-bold">{t("Notificaciones")}</h1>
    <p className="mt-2 text-sm text-muted-foreground">{t(enPanelAdmin ? "Revisa los mensajes de soporte y los avisos de administración con su contexto." : "Consulta el trabajo y el motivo de cada aviso, incluidos los de tu perfil e incidencias.")}</p>
    <div className="my-5 flex gap-2"><Button variant={!historial ? "default" : "outline"} onClick={() => setHistorial(false)}>{t("Pendientes")} ({numeroPendientes})</Button><Button variant={historial ? "default" : "outline"} onClick={() => { setPagina(0); setHistorial(true) }}>{t("Historial")}</Button></div>
    {(error || errorHistorial) && <p role="alert" className="mb-3 text-sm text-destructive">{t(error || errorHistorial)}</p>}
    <div className="space-y-3">{enPanelAdmin && !historial && <AvisoMensajesPendientes enPanelAdmin />}{mostradas.map(n => <FilaAviso key={n.id} aviso={n} onMarcar={async ids => {
      const ok = await marcarLeidas(ids)
      if (ok) setFilas(prev => prev.map(f => ids.includes(f.id) ? { ...f, leida: true } : f))
      return ok
    }} />)}</div>
    {!mostradas.length && (historial || !enPanelAdmin || !resumen.mensajesNoLeidos) && <p className="py-10 text-center text-muted-foreground">{t(cargando || cargandoHistorial ? "Cargando..." : historial ? "No hay notificaciones en el historial" : "No tienes notificaciones pendientes")}</p>}
    {historial && hayMas && <Button variant="outline" className="mt-4" disabled={cargandoHistorial} onClick={() => setPagina(p => p + 1)}>{t("Cargar más")}</Button>}
  </div>
}
