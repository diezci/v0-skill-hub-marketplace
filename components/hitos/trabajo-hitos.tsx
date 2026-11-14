"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, CheckCircle2, Clock, CreditCard, FileCheck2, Loader2, LockKeyhole, Pencil, Send } from "lucide-react"
import { obtenerPlanHitos, cerrarPagoHito, proponerPlanHitos, responderPlanHitos, entregarHito, aprobarHito, solicitarCambiosHito } from "@/app/actions/hitos"
import { useIdioma } from "@/components/idioma-provider"
import { PlanHitosEditor } from "@/components/hitos/plan-hitos-editor"
import { ResumenPlanHitos } from "@/components/hitos/resumen-plan-hitos"
import { AbrirDisputaDialog } from "@/components/abrir-disputa-dialog"
import { IncidenciasTrabajoEmpresa } from "@/components/empresas/incidencias-trabajo-empresa"
import { EntregaAdjuntos } from "@/components/entrega-adjuntos"
import { AdjuntosLista } from "@/components/adjuntos-lista"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { validarPlanHitos, type HitoBorrador, type EstadoHito } from "@/lib/hitos"

type HitoTrabajo = HitoBorrador & {
  orden: number; estado: EstadoHito; activo: boolean; bloqueado: boolean
  comision_cliente_centimos?: number; comision_proveedor_centimos?: number
  mensaje_entrega?: string; archivos_entrega?: string[]; observaciones_revision?: string
  escrow?: { id: string; estado: string; liquidacion_estado?: string; liquidacion_error?: string; base_liquidada_centimos?: number | null; reembolso_servicio_centimos?: number | null; neto_proveedor_centimos?: number | null } | null
}
export type PlanTrabajo = {
  trabajo_id: string; titulo: string; estado: string; rol: "cliente" | "proveedor"; modalidad_pago: "hitos" | "unico"
  plan_version: number; precio_centimos: number; hitos: HitoTrabajo[]
  propuesta: { version: number; base_version: number; plan_hitos: HitoBorrador[]; propuesto_parte: "cliente" | "proveedor"; estado: string } | null
  cancelacion_estado?: string | null; cancelacion_parte_solicitante?: "cliente" | "proveedor" | null; cancelacion_razon?: string | null; cancelacion_revision?: string | null
  puede_gestionar_cancelacion?: boolean; puede_aceptar_cancelacion?: boolean
  puede_editar: boolean; puede_pagar: boolean; puede_entregar: boolean; puede_aprobar: boolean
}
const ETIQUETAS: Record<EstadoHito, string> = {
  pendiente: "Pendiente de pago", financiado: "Pagado · en curso", entregado: "Por revisar", cambios_solicitados: "Cambios solicitados",
  aprobado: "Aprobado · liquidación pendiente", completado: "Transferencia realizada", cancelado: "Cancelado", en_disputa: "En disputa",
}

export function PanelHitosTrabajo({ trabajoId, vistaPrevia }: { trabajoId: string; vistaPrevia?: PlanTrabajo }) {
  const { t, idioma } = useIdioma()
  const [datos, setDatos] = useState<PlanTrabajo | null>(vistaPrevia ?? null)
  const [cargando, setCargando] = useState(!vistaPrevia)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(false)
  const [hitos, setHitos] = useState<HitoBorrador[]>([])
  const [accion, setAccion] = useState<{ tipo: "entregar" | "aprobar" | "corregir"; hito: HitoTrabajo } | null>(null)
  const [texto, setTexto] = useState("")
  const [archivos, setArchivos] = useState<string[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [conforme, setConforme] = useState(false)
  const cargar = useCallback(async () => {
    if (vistaPrevia) { setDatos(vistaPrevia); setCargando(false); return }
    const result = await obtenerPlanHitos(trabajoId)
    if (result.error) setError(result.error)
    else { setDatos(result.data as PlanTrabajo); setError("") }
    setCargando(false)
  }, [trabajoId, vistaPrevia])
  useEffect(() => { void cargar().catch(() => { setError("No se pudo cargar el trabajo."); setCargando(false) }) }, [cargar])
  const moneda = (centimos: number) => new Intl.NumberFormat(idioma === "en" ? "en-IE" : "es-ES", { style: "currency", currency: "EUR" }).format(centimos / 100)
  const pendienteCambio = datos?.propuesta?.estado === "pendiente"
  const errorPlan = datos ? validarPlanHitos(hitos, datos.precio_centimos) : null
  const filas = datos?.hitos || []
  const sumas = filas.reduce((totales, hito) => {
    if (hito.estado === "completado") totales.liberado += hito.escrow?.base_liquidada_centimos ?? 0
    else if (hito.estado !== "pendiente" && hito.estado !== "cancelado") totales.retenido += hito.importe_centimos
    else if (hito.estado === "pendiente") totales.pendiente += hito.importe_centimos
    totales.reembolsado += hito.escrow?.reembolso_servicio_centimos ?? 0
    return totales
  }, { pendiente: 0, retenido: 0, liberado: 0, reembolsado: 0 })
  const siguiente = filas.find(hito => !["completado", "cancelado"].includes(hito.estado))?.id
  async function ejecutar(funcion: () => Promise<{ error?: string }>, exito: string, cerrar = false) {
    if (ocupado || subiendo) return
    if (vistaPrevia) { setMensaje("Vista previa: no se envía ningún cambio ni se mueve dinero."); setAccion(null); setEditando(false); return }
    setOcupado(true); setError(""); setMensaje("")
    try {
      const result = await funcion()
      if (result.error) setError(result.error)
      else { if (cerrar) { setAccion(null); setEditando(false) }; await cargar(); setMensaje(exito) }
    } catch { setError("No se pudo completar la operación. Actualiza el trabajo antes de reintentar.") }
    finally { setOcupado(false) }
  }
  function abrir(tipo: "entregar" | "aprobar" | "corregir", hito: HitoTrabajo) {
    setAccion({ tipo, hito }); setTexto(""); setArchivos([]); setConforme(false); setError("")
  }
  function enviarAccion() {
    if (!accion || (accion.tipo === "aprobar" ? !conforme : !texto.trim())) return
    if (accion.tipo === "aprobar") void ejecutar(() => aprobarHito(trabajoId, accion.hito.id), "La aprobación del hito se ha registrado.", true)
    else if (accion.tipo === "entregar") void ejecutar(() => entregarHito(trabajoId, accion.hito.id, { mensaje: texto, archivos }), "Hito entregado. El cliente ya puede revisar las evidencias.", true)
    else void ejecutar(() => solicitarCambiosHito(trabajoId, accion.hito.id, texto, archivos), "Cambios enviados al proveedor. El pago sigue pendiente de aprobación.", true)
  }
  return <main className={cn("mx-auto min-h-screen max-w-4xl space-y-5 px-4 pb-12 sm:px-6", vistaPrevia ? "pt-6" : "pt-24")}>
    <Button asChild variant="ghost"><Link href={datos?.rol === "proveedor" ? "/mis-trabajos" : "/mis-solicitudes"}><ArrowLeft className="mr-2 h-4 w-4" />{t("Volver")}</Link></Button>
    {cargando ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t("Cargando hitos…")}</p> : datos && <>
      <header className="space-y-2"><Badge variant="outline">{t("Un trabajo · {count} hitos", { count: filas.length })}</Badge><h1 className="break-words text-2xl font-bold">{datos.titulo || t("Hitos del trabajo")}</h1><p className="text-sm text-muted-foreground">{t("Cada fase pertenece a este contrato. Se paga antes de comenzar y se libera al aprobar su entrega.")}</p></header>
      {datos.modalidad_pago !== "hitos" ? <Card><CardContent className="space-y-3 pt-6"><p>{t("Este contrato mantiene la modalidad de pago único.")}</p><Button asChild><Link href={`/pago/${trabajoId}`}>{t("Continuar al pago")}</Link></Button></CardContent></Card> : <>
        <div className="grid gap-3 sm:grid-cols-3">{[{ titulo: "Pendiente de pagar", valor: sumas.pendiente }, { titulo: "Pagado pendiente de liberación", valor: sumas.retenido }, { titulo: "Servicio aprobado", valor: sumas.liberado }].map(item => <Card key={item.titulo}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t(item.titulo)}</p><p className="mt-1 text-xl font-semibold">{moneda(item.valor)}</p></CardContent></Card>)}</div>
        <p className="text-xs text-muted-foreground">{t("El resumen muestra importes del servicio, sin gastos de Diime. El servicio aprobado refleja la parte adjudicada al proveedor tras la liquidación; no confirma su ingreso en el banco.")}</p>
        {sumas.reembolsado > 0 && <p className="rounded-lg border p-3 text-sm">{t("Servicio reembolsado")}: <strong>{moneda(sumas.reembolsado)}</strong></p>}
        {pendienteCambio && datos.propuesta && <Card className="border-amber-500/40"><CardHeader><CardTitle className="text-lg">{t("Propuesta de cambio pendiente")}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{t(datos.propuesta.propuesto_parte === datos.rol ? "Has propuesto este cambio. La otra parte debe aceptarlo antes de aplicarlo." : "La otra parte propone reorganizar estos hitos. El plan actual se conserva hasta que lo aceptes.")}</p><ResumenPlanHitos hitos={datos.propuesta.plan_hitos} />{datos.propuesta.propuesto_parte !== datos.rol && datos.puede_editar && <div className="flex flex-wrap gap-2"><Button disabled={ocupado} onClick={() => ejecutar(() => responderPlanHitos(trabajoId, datos.propuesta!.version, true), "Nuevo plan acordado.")}>{t("Aceptar cambios")}</Button><Button variant="outline" disabled={ocupado} onClick={() => ejecutar(() => responderPlanHitos(trabajoId, datos.propuesta!.version, false), "Se conserva el plan anterior.")}>{t("Rechazar cambios")}</Button></div>}</CardContent></Card>}
        <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-lg">{t("Plan acordado")}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{t("Versión {numero}", { numero: datos.plan_version })} · {moneda(datos.precio_centimos)}</p></div>{datos.puede_editar && !editando && <Button variant="outline" disabled={ocupado} onClick={() => { setHitos(filas.map(hito => ({ id: hito.id, titulo: hito.titulo, descripcion: hito.descripcion, criterio_aceptacion: hito.criterio_aceptacion, fecha_limite: hito.fecha_limite, importe_centimos: hito.importe_centimos }))); setEditando(true); setError("") }}><Pencil className="mr-2 h-4 w-4" />{t("Añadir o quitar hitos")}</Button>}</div></CardHeader><CardContent className="space-y-5">
          {editando ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!errorPlan) void ejecutar(() => proponerPlanHitos(trabajoId, { version: datos.plan_version, modalidad: "hitos", hitos }), "Propuesta enviada. Se aplicará cuando la otra parte la acepte.", true) }}><PlanHitosEditor value={hitos} onChange={setHitos} totalCentimos={datos.precio_centimos} bloqueados={filas.filter(hito => hito.bloqueado).map(hito => hito.id)} disabled={ocupado} error={errorPlan} /><p className="text-xs text-muted-foreground">{t("Puedes redistribuir el importe de los hitos sin pago. Los hitos con un pago asociado y el total del contrato se conservan. La otra parte debe aceptar el cambio.")}</p><div className="flex flex-wrap gap-2"><Button type="submit" disabled={ocupado || !!errorPlan}>{t("Enviar propuesta")}</Button><Button type="button" variant="outline" disabled={ocupado} onClick={() => setEditando(false)}>{t("Cancelar")}</Button></div></form> : <ol>
            {filas.map((hito, indice) => {
              const terminado = hito.estado === "completado"
              const revisar = hito.estado === "entregado"
              const actual = hito.id === siguiente
              return <li key={hito.id} className="relative min-w-0 pb-6 pl-8 last:pb-0 sm:pl-10">
                {indice < filas.length - 1 && <span aria-hidden="true" className={cn("absolute bottom-0 left-3 top-7 w-0.5", terminado ? "bg-emerald-500" : "bg-border")} />}
                <span aria-hidden="true" className={cn("absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-background text-xs font-semibold", terminado ? "border-emerald-500 bg-emerald-500 text-white" : revisar ? "border-purple-500 text-purple-600" : actual ? "border-primary text-primary" : "border-border text-muted-foreground")}>{terminado ? <Check className="h-4 w-4" /> : indice + 1}</span>
                <article className={cn("min-w-0 space-y-4 rounded-xl border p-3 sm:p-4", revisar && "border-purple-500/40 bg-purple-500/5", terminado && "border-emerald-500/30")}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{hito.titulo}</h2><p className="mt-1 text-xs text-muted-foreground">{t("Entrega prevista")}: {new Date(`${hito.fecha_limite}T12:00:00`).toLocaleDateString(idioma === "en" ? "en-GB" : "es-ES")}</p></div><strong className="shrink-0">{moneda(hito.importe_centimos)}</strong></div>
                  <Badge variant="outline" className={cn("whitespace-normal", terminado && "text-emerald-600", revisar && "text-purple-600")}>{t((hito.estado === "completado" && (hito.escrow?.reembolso_servicio_centimos ?? 0) > 0) ? "Liquidado con reembolso" : ETIQUETAS[hito.estado])}</Badge>
                  <div><p className="text-xs font-medium">{t("Criterio de aceptación")}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{hito.criterio_aceptacion}</p></div>
                  {(hito.escrow?.reembolso_servicio_centimos ?? 0) > 0 && <p className="text-sm text-muted-foreground">{t("Servicio reembolsado")}: {moneda(hito.escrow!.reembolso_servicio_centimos!)} · {t("Servicio aprobado")}: {moneda(hito.escrow?.base_liquidada_centimos ?? 0)}</p>}
                  {hito.mensaje_entrega && <div className="space-y-2 border-t pt-3"><p className="flex items-center gap-2 text-sm font-medium"><FileCheck2 className="h-4 w-4" />{t("Entrega del proveedor")}</p><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{hito.mensaje_entrega}</p>{!!hito.archivos_entrega?.length && <AdjuntosLista archivos={hito.archivos_entrega} />}</div>}
                  {hito.observaciones_revision && <p className="whitespace-pre-wrap break-words rounded-lg bg-amber-500/10 p-3 text-sm">{t("Cambios solicitados")}: {hito.observaciones_revision}</p>}
                  {datos.rol === "proveedor" && hito.comision_proveedor_centimos !== undefined && <p className="text-xs text-muted-foreground">{t(hito.escrow?.neto_proveedor_centimos != null ? "Neto liquidado de este hito" : "Neto previsto de este hito")}: {moneda(hito.escrow?.neto_proveedor_centimos ?? hito.importe_centimos - hito.comision_proveedor_centimos)}</p>}
                  {hito.escrow?.liquidacion_error && <p className="text-sm text-amber-700 dark:text-amber-400">{t("La liquidación requiere un reintento. Se conservarán los mismos importes; no se realizará un nuevo cobro.")}</p>}
                  <div className="flex flex-wrap gap-2">
                    {!vistaPrevia && hito.estado === "pendiente" && actual && datos.puede_pagar && <Button asChild className="min-h-11"><Link href={`/pago/${trabajoId}?hito=${hito.id}`}><CreditCard className="mr-2 h-4 w-4" />{t("Pagar este hito")}{hito.comision_cliente_centimos !== undefined && ` · ${moneda(hito.importe_centimos + hito.comision_cliente_centimos)}`}</Link></Button>}
                    {!vistaPrevia && datos.puede_pagar && hito.estado === "pendiente" && hito.escrow?.estado === "pendiente" && <Button variant="outline" disabled={ocupado} onClick={() => ejecutar(() => cerrarPagoHito(trabajoId, hito.id), "Intento de pago cerrado. Ya puedes proponer cambios en este hito.")}>{t("Cerrar intento de pago")}</Button>}
                    {datos.puede_entregar && ["financiado", "cambios_solicitados"].includes(hito.estado) && <Button className="min-h-11" disabled={ocupado} onClick={() => abrir("entregar", hito)}><Send className="mr-2 h-4 w-4" />{t("Entregar hito")}</Button>}
                    {datos.puede_aprobar && ["entregado", "aprobado"].includes(hito.estado) && <><Button className="min-h-11" disabled={ocupado} onClick={() => abrir("aprobar", hito)}><CheckCircle2 className="mr-2 h-4 w-4" />{t(hito.estado === "aprobado" ? "Reintentar liquidación" : "Aprobar y liberar pago")}</Button>{revisar && <Button className="min-h-11" variant="outline" disabled={ocupado} onClick={() => abrir("corregir", hito)}>{t("Pedir cambios")}</Button>}</>}
                    {!vistaPrevia && ["financiado", "entregado", "cambios_solicitados"].includes(hito.estado) && (datos.puede_entregar || datos.puede_aprobar) && <AbrirDisputaDialog trabajoId={trabajoId} hitoId={hito.id} rol={datos.rol} onCreated={() => { void cargar() }} />}
                  </div>
                  {hito.estado === "pendiente" && hito.escrow?.estado === "pendiente" && <p className="text-xs text-muted-foreground">{t(datos.rol === "cliente" ? "Cierra el pago abierto para poder cambiar el plan." : "El cliente tiene un pago abierto. Debe cerrarlo antes de que podáis cambiar este hito.")}</p>}
                  {hito.estado === "pendiente" && !actual && <p className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5 shrink-0" />{t("Se podrá pagar al completar los hitos anteriores. Todavía no se ha cobrado.")}</p>}
                  {hito.estado === "pendiente" && actual && datos.rol === "proveedor" && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />{t("Espera a la confirmación del pago antes de empezar esta fase.")}</p>}
                </article>
              </li>
            })}
          </ol>}
        </CardContent></Card>
      </>}
      {!vistaPrevia && <IncidenciasTrabajoEmpresa porHitos trabajoId={trabajoId} titulo={datos.titulo} estado={datos.estado} parte={datos.rol} puedeGestionar={datos.puede_gestionar_cancelacion === true} puedeAceptarCancelacion={datos.puede_aceptar_cancelacion === true} cancelacionEstado={datos.cancelacion_estado} cancelacionParteSolicitante={datos.cancelacion_parte_solicitante} cancelacionRazon={datos.cancelacion_razon} cancelacionRevision={datos.cancelacion_revision} onActualizado={() => { void cargar() }} />}
      <Button variant="ghost" disabled={ocupado || subiendo} onClick={() => cargar()}>{t("Actualizar estado")}</Button>
    </>}
    {mensaje && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{t(mensaje)}</p>}
    {error && !accion && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{t(error)}</p>}
    <Dialog open={!!accion} onOpenChange={open => { if (!open && !ocupado && !subiendo) setAccion(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t(accion?.tipo === "aprobar" ? "Aprobar este hito" : accion?.tipo === "corregir" ? "Solicitar cambios en el hito" : "Entregar este hito")}</DialogTitle><DialogDescription>{accion?.hito.titulo}</DialogDescription></DialogHeader>
      {accion?.tipo === "aprobar" ? <div className="space-y-4"><p className="text-sm">{t("Al confirmar autorizas la liquidación de este hito. No se realiza un nuevo cargo ni se pagan los hitos siguientes.")}</p><p className="text-sm font-semibold">{t("Importe del servicio")}: {moneda(accion.hito.importe_centimos)}</p><p className="rounded-lg bg-muted p-3 text-sm">{accion.hito.criterio_aceptacion}</p><label className="flex items-start gap-3 text-sm"><Checkbox className="mt-0.5" checked={conforme} onCheckedChange={value => setConforme(value === true)} disabled={ocupado} /><span>{t("He revisado la entrega y certifico que cumple el criterio de aceptación acordado.")}</span></label></div> : <div className="space-y-4"><div className="space-y-2"><Label htmlFor="hito-mensaje">{t(accion?.tipo === "corregir" ? "¿Qué debe corregirse?" : "Describe la entrega y cómo cumple lo acordado")}</Label><Textarea id="hito-mensaje" value={texto} onChange={event => setTexto(event.target.value)} rows={4} maxLength={5000} disabled={ocupado} /></div><EntregaAdjuntos archivos={archivos} onChange={setArchivos} onUploadingChange={setSubiendo} disabled={ocupado} context={accion?.tipo === "corregir" ? "rechazo" : "entrega"} /></div>}
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <DialogFooter className="gap-2"><Button variant="outline" disabled={ocupado || subiendo} onClick={() => setAccion(null)}>{t("Volver")}</Button><Button disabled={ocupado || subiendo || (accion?.tipo === "aprobar" ? !conforme : !texto.trim())} onClick={enviarAccion}>{ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(accion?.tipo === "aprobar" ? "Confirmar y liberar" : accion?.tipo === "corregir" ? "Enviar cambios" : "Enviar entrega")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </main>
}
