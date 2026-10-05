"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Loader2 } from "lucide-react"
import { rechazarEntrega } from "@/app/actions/disputes"
import { responderCancelacion, solicitarCancelacion } from "@/app/actions/trabajos"
import { AbrirDisputaDialog } from "@/components/abrir-disputa-dialog"
import { useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export interface IncidenciasTrabajoEmpresaProps {
  trabajoId: string
  titulo: string
  estado: string
  parte: "cliente" | "proveedor"
  puedeGestionar: boolean
  puedeAceptarCancelacion: boolean
  cancelacionEstado?: string | null
  cancelacionParteSolicitante?: "cliente" | "proveedor" | null
  cancelacionRazon?: string | null
}

type AccionIncidencia = "solicitar" | "rechazar_entrega" | "aceptar_cancelacion" | "rechazar_cancelacion"
const TITULOS: Record<AccionIncidencia, string> = {
  solicitar: "Solicitar cancelación",
  rechazar_entrega: "Rechazar entrega",
  aceptar_cancelacion: "Aceptar cancelación",
  rechazar_cancelacion: "Rechazar cancelación",
}
const DESCRIPCIONES: Record<AccionIncidencia, string> = {
  solicitar: "Explica por qué quieres cancelar el servicio. La otra parte deberá aceptar o rechazar la solicitud.",
  rechazar_entrega: "Explica qué no cumple lo acordado. Se abrirá una disputa y el pago quedará retenido mientras Diime la revisa.",
  aceptar_cancelacion: "El trabajo quedará cancelado. Si hubo un pago, se tramitará el reembolso y se conservarán los gastos de servicio que correspondan según las condiciones del contrato.",
  rechazar_cancelacion: "Explica por qué te opones. Se abrirá una disputa para que Diime revise los argumentos de ambas partes.",
}

export function IncidenciasTrabajoEmpresa({ trabajoId, titulo, estado, parte, puedeGestionar, puedeAceptarCancelacion, cancelacionEstado, cancelacionParteSolicitante, cancelacionRazon }: IncidenciasTrabajoEmpresaProps) {
  const t = useT()
  const router = useRouter()
  const [accion, setAccion] = useState<AccionIncidencia | null>(null)
  const [razon, setRazon] = useState("")
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [pending, startTransition] = useTransition()
  if (!puedeGestionar || !["pendiente_pago", "en_progreso", "entregado"].includes(estado)) return null
  const pendiente = cancelacionEstado === "pendiente"
  const contraparte = !!cancelacionParteSolicitante && cancelacionParteSolicitante !== parte
  const puedeSolicitar = !pendiente && ["pendiente_pago", "en_progreso"].includes(estado)

  function abrir(siguiente: AccionIncidencia) { setAccion(siguiente); setRazon(""); setError(""); setMensaje("") }
  function enviar(event: FormEvent) {
    event.preventDefault()
    if (!accion || (accion !== "aceptar_cancelacion" && !razon.trim())) return
    if (accion === "aceptar_cancelacion" && !puedeAceptarCancelacion) return
    setError("")
    startTransition(async () => {
      try {
        const result = accion === "solicitar" ? await solicitarCancelacion(trabajoId, razon.trim())
          : accion === "rechazar_entrega" ? await rechazarEntrega(trabajoId, razon.trim())
          : await responderCancelacion(trabajoId, accion === "aceptar_cancelacion", razon.trim())
        if (result.error) { setError(result.error); return }
        setMensaje(accion === "solicitar" ? "Cancelación solicitada. La otra parte podrá responder."
          : accion === "aceptar_cancelacion" ? "Cancelación aceptada. El estado del trabajo se ha actualizado."
          : "Disputa abierta. Diime revisará los argumentos y el pago permanecerá retenido.")
        setAccion(null); router.refresh()
      } catch { setError("No se pudo completar la acción. Vuelve a intentarlo.") }
    })
  }

  return <div className="space-y-3 border-t pt-3">
    {pendiente ? <div className="space-y-3 rounded-lg border bg-muted/30 p-3"><p className="flex items-center gap-2 text-sm font-medium"><AlertCircle className="size-4 shrink-0" />{t("Cancelación pendiente")}</p>{cancelacionRazon && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{cancelacionRazon}</p>}{contraparte ? <><div className="flex flex-wrap gap-2">{puedeAceptarCancelacion && <Button variant="outline" size="sm" disabled={pending} onClick={() => abrir("aceptar_cancelacion")}>{t("Aceptar cancelación")}</Button>}<Button variant="outline" size="sm" disabled={pending} onClick={() => abrir("rechazar_cancelacion")}>{t("Rechazar cancelación")}</Button></div>{!puedeAceptarCancelacion && <p className="text-xs text-muted-foreground">{t("Aceptar la cancelación requiere permiso para gestionar cobros.")}</p>}</> : <p className="text-xs text-muted-foreground">{t(cancelacionParteSolicitante ? "La empresa solicitó la cancelación. Está pendiente la respuesta de la otra parte." : "La parte solicitante requiere revisión antes de responder a esta cancelación.")}</p>}</div> : <div className="flex flex-wrap gap-2">{puedeSolicitar && <Button variant="outline" size="sm" disabled={pending} onClick={() => abrir("solicitar")}>{t("Solicitar cancelación")}</Button>}{parte === "cliente" && estado === "entregado" && <Button variant="outline" size="sm" disabled={pending} onClick={() => abrir("rechazar_entrega")}>{t("Rechazar entrega")}</Button>}{(estado === "en_progreso" || (parte === "proveedor" && estado === "entregado")) && <AbrirDisputaDialog trabajoId={trabajoId} rol={parte} onCreated={() => router.refresh()} />}</div>}
    {mensaje && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{t(mensaje)}</p>}
    <Dialog open={!!accion} onOpenChange={(open) => { if (!open && !pending) setAccion(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{accion ? t(TITULOS[accion]) : ""}</DialogTitle><DialogDescription>{titulo}</DialogDescription></DialogHeader><form onSubmit={enviar} className="space-y-4"><p className="text-sm leading-relaxed text-muted-foreground">{accion ? t(DESCRIPCIONES[accion]) : ""}</p>{accion !== "aceptar_cancelacion" && <div className="space-y-2"><Label htmlFor={`incidencia-razon-${trabajoId}`}>{t("Motivo")}</Label><Textarea id={`incidencia-razon-${trabajoId}`} value={razon} onChange={(e) => setRazon(e.target.value)} disabled={pending} required maxLength={5000} rows={5} /></div>}{error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}<DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setAccion(null)}>{t("Volver")}</Button><Button type="submit" disabled={pending || (accion !== "aceptar_cancelacion" && !razon.trim())}>{pending && <Loader2 className="size-4 animate-spin" />}{accion ? t(TITULOS[accion]) : ""}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>
}
