"use client"

import { useCallback, useEffect, useId, useState, useTransition } from "react"
import Link from "next/link"
import { obtenerRevisionCuenta, decidirSuspensionCuenta, solicitarRevisionCuenta } from "@/app/actions/cuenta-revision"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useIdioma } from "@/components/idioma-provider"

const acciones: Record<string, string> = { suspender: "Suspensión aplicada", levantar: "Suspensión levantada", solicitar_revision: "Revisión solicitada", mantener_suspension: "Suspensión mantenida" }

type Revision = {
  estado: { suspendida: boolean; motivo: string; revision: number } | null
  historial: Array<{ id: string; accion: string; motivo: string; created_at: string; revision: number }>
  revisiones: Array<{ id: string; estado: string; motivo: string; respuesta: string | null }>
  incidencias: Array<{ id: string; asunto: string; descripcion: string; estado: string; trabajo_id: string | null }>
}

export function CuentaRevisionPanel({ usuarioId, administracion = false }: { usuarioId: string; administracion?: boolean }) {
  const { t, idioma } = useIdioma()
  const id = useId()
  const [cargado, setCargado] = useState<{ usuarioId: string; datos: Revision } | null>(null)
  const datos = cargado?.usuarioId === usuarioId ? cargado.datos : null
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [motivo, setMotivo] = useState("")
  const [confirmado, setConfirmado] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const cargar = useCallback(async () => {
    const r = await obtenerRevisionCuenta(usuarioId)
    if (r.error) { setError(r.error); return }
    setCargado({ usuarioId, datos: r.data as Revision })
  }, [usuarioId])
  useEffect(() => {
    let activo = true
    obtenerRevisionCuenta(usuarioId).then(r => {
      if (!activo) return
      if (r.error) setError(r.error)
      else setCargado({ usuarioId, datos: r.data as Revision })
    }).catch(() => { if (activo) setError("No se pudo cargar la revisión.") })
    return () => { activo = false }
  }, [usuarioId])
  const solicitud = datos?.revisiones.find(r => r.estado === "pendiente")
  const suspendida = datos?.estado?.suspendida === true
  const valido = motivo.trim().length >= 8 && motivo.trim().length <= 2000
  function enviar(suspender?: boolean) {
    if (!datos || !valido || (administracion && !confirmado)) return
    iniciar(async () => {
      setError(""); setMensaje("")
      try {
        const r = administracion
          ? await decidirSuspensionCuenta({ usuarioId, suspender: suspender === true, motivo, revision: datos.estado?.revision ?? 0, solicitudId: solicitud?.id, incidencias: datos.incidencias.map(i => i.id) })
          : await solicitarRevisionCuenta({ motivo, revision: datos.estado?.revision ?? 0 })
        if (r.error) { setError(r.error); return }
        setMotivo(""); setConfirmado(false)
        setMensaje(administracion ? "Decisión registrada y comunicada a la cuenta." : "Solicitud de revisión enviada.")
        await cargar()
      } catch { setError("No se pudo guardar la revisión. Actualiza la página antes de reintentar.") }
    })
  }
  if (!administracion && datos && !datos.estado) return null
  return <Card id="revision-cuenta"><CardHeader><CardTitle>{t(administracion ? "Restricciones y revisión de cuenta" : "Revisión de cuenta")}</CardTitle></CardHeader>
    <CardContent className="space-y-4 text-sm">
      {error && <p role="alert" className="text-destructive">{t(error)}</p>}
      {mensaje && <p role="status">{t(mensaje)}</p>}
      {!datos ? <p>{t("Cargando...")}</p> : <>
        <p className="font-medium">{t(suspendida ? "Nuevas contrataciones suspendidas" : "Sin suspensión de nuevas contrataciones")}</p>
        <p>{t("Conservas acceso a contratos y pagos existentes para completar entregas, cancelaciones, disputas y liquidaciones.")}</p>
        {datos.estado && <p className="whitespace-pre-wrap break-words">{datos.estado.motivo}</p>}
        {administracion && datos.incidencias.length > 0 && <div className="space-y-2"><h3 className="font-medium">{t("Incidencias de esta cuenta")}</h3>{datos.incidencias.map(i => <div key={i.id} className="rounded border p-3"><p className="font-medium">{i.asunto}</p><p className="whitespace-pre-wrap break-words">{i.descripcion}</p><Link className="underline" href={`/admin/incidencias?usuario=${usuarioId}`}>{t("Revisar incidencia")}</Link>{i.trabajo_id && <> · <Link className="underline" href={`/trabajos/${i.trabajo_id}/factura`}>{t("Consultar contrato")}</Link></>}</div>)}</div>}
        {solicitud && <div className="rounded border p-3"><p className="font-medium">{t("Revisión pendiente")}</p><p className="whitespace-pre-wrap break-words">{solicitud.motivo}</p></div>}
        {(administracion || (suspendida && !solicitud)) && <div className="space-y-3">
          <Label htmlFor={id}>{t(administracion ? "Motivo de la decisión" : "Motivo de la solicitud de revisión")}</Label>
          <Textarea id={id} value={motivo} onChange={e => setMotivo(e.target.value)} minLength={8} maxLength={2000} disabled={pendiente} />
          {administracion && <label className="flex items-start gap-2"><input type="checkbox" checked={confirmado} disabled={pendiente} onChange={e => setConfirmado(e.target.checked)} />{t("He revisado el historial y las evidencias de esta cuenta y confirmo esta decisión.")}</label>}
          <div className="flex flex-wrap gap-2">{administracion ? <>
            {(!suspendida || solicitud) && <Button variant="destructive" disabled={pendiente || !valido || !confirmado} onClick={() => enviar(true)}>{t(suspendida ? "Mantener suspensión y resolver revisión" : "Suspender nuevas contrataciones")}</Button>}
            {suspendida && <Button disabled={pendiente || !valido || !confirmado} onClick={() => enviar(false)}>{t("Levantar suspensión")}</Button>}
          </> : <Button disabled={pendiente || !valido} onClick={() => enviar()}>{t("Solicitar revisión")}</Button>}</div>
        </div>}
        {datos.historial.length > 0 && <details><summary className="cursor-pointer">{t("Historial de decisiones y revisiones")}</summary><ol className="mt-3 space-y-3">{datos.historial.map(h => <li key={h.id} className="rounded border p-3"><p className="font-medium">{t(acciones[h.accion] || h.accion)}</p><p className="whitespace-pre-wrap break-words">{h.motivo}</p><time dateTime={h.created_at}>{new Intl.DateTimeFormat(idioma === "en" ? "en-GB" : "es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(h.created_at))}</time></li>)}</ol></details>}
      </>}
    </CardContent>
  </Card>
}
