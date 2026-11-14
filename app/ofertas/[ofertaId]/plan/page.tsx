"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Loader2, Pencil } from "lucide-react"
import { obtenerPlanOferta, proponerPlanOferta, responderPlanOferta } from "@/app/actions/hitos"
import { aceptarOferta } from "@/app/actions/ofertas"
import { useIdioma } from "@/components/idioma-provider"
import { ModalidadPagoSelector, PlanHitosEditor, nuevoHito } from "@/components/hitos/plan-hitos-editor"
import { ResumenPlanHitos } from "@/components/hitos/resumen-plan-hitos"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { calcularTotalCliente, calcularPagoProveedor, formatearPrecio } from "@/lib/comisiones"
import { validarPlanHitos, type HitoBorrador, type ModalidadPago } from "@/lib/hitos"

export default function PlanOfertaPage() {
  const { ofertaId } = useParams<{ ofertaId: string }>()
  const { t, idioma } = useIdioma()
  const router = useRouter()
  const [datos, setDatos] = useState<any>(null)
  const [error, setError] = useState("")
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(false)
  const [modalidad, setModalidad] = useState<ModalidadPago>("unico")
  const [hitos, setHitos] = useState<HitoBorrador[]>([])
  const [acepta, setAcepta] = useState(false)
  const cargar = useCallback(async () => {
    const resultado = await obtenerPlanOferta(ofertaId)
    if (resultado.error) setError(resultado.error)
    else { setDatos(resultado.data); setError(""); setAcepta(false) }
    setCargando(false)
  }, [ofertaId])
  useEffect(() => { void cargar().catch(() => { setError("No se pudo cargar el presupuesto."); setCargando(false) }) }, [cargar])
  const oferta = datos ? { ...datos, precio: Number(datos.precio_centimos) / 100 } : null
  const cliente = datos?.rol === "cliente"
  const total = Math.round(Number(oferta?.precio || 0) * 100)
  const errorPlan = modalidad === "hitos" ? validarPlanHitos(hitos, total) : null
  const contraparteAcepto = cliente ? oferta?.plan_aceptado_proveedor : oferta?.plan_aceptado_cliente
  const aceptadoPorMi = cliente ? oferta?.plan_aceptado_cliente : oferta?.plan_aceptado_proveedor
  const vigente = oferta && datos?.puede_editar === true
  const puedeEditar = vigente && datos?.puede_editar === true
  const puedeResponder = vigente && oferta.plan_estado !== "rechazado" && !aceptadoPorMi && contraparteAcepto && datos?.puede_editar === true

  async function ejecutar(accion: () => Promise<{ error?: string }>, cerrarEditor = false) {
    if (ocupado) return
    setOcupado(true); setError("")
    try {
      const result = await accion()
      if (result.error) setError(result.error)
      else { if (cerrarEditor) setEditando(false); await cargar() }
    } catch { setError("No se pudo guardar. Inténtalo de nuevo.") }
    finally { setOcupado(false) }
  }
  async function contratar() {
    if (ocupado || !acepta) return
    setOcupado(true); setError("")
    try {
      const result = await aceptarOferta(ofertaId, oferta.plan_version)
      if (result.error || !result.data?.id) { setError(result.error || "No se pudo aceptar el presupuesto."); return }
      router.push(oferta.modalidad_pago === "hitos" ? `/trabajos/${result.data.id}/hitos` : `/pago/${result.data.id}`)
    } catch { setError("No se pudo aceptar el presupuesto. Actualiza el plan antes de reintentar.") }
    finally { setOcupado(false) }
  }

  return <main className="mx-auto min-h-screen max-w-3xl space-y-5 px-4 pb-12 pt-24 sm:px-6">
    <Button variant="ghost" asChild><Link href={cliente ? "/mis-solicitudes" : "/mis-ofertas"}><ArrowLeft className="mr-2 h-4 w-4" />{t("Volver")}</Link></Button>
    {cargando ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t("Cargando presupuesto…")}</p> : oferta && <>
      <div className="space-y-2"><Badge variant="outline">{t("Presupuesto · versión {numero}", { numero: oferta.plan_version })}</Badge><h1 className="break-words text-2xl font-bold">{oferta.titulo || datos.titulo || t("Plan de pagos del presupuesto")}</h1><p className="text-sm text-muted-foreground">{t("Cliente y proveedor pueden proponer, añadir o quitar hitos antes de contratar. Los cambios deben aceptarse por ambas partes.")}</p></div>
      <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><CardTitle className="text-lg">{t(editando ? "Proponer cambios" : oferta.modalidad_pago === "hitos" ? "Pago por hitos" : "Pago único")}</CardTitle><strong>{formatearPrecio(Number(oferta.precio), idioma)}</strong></div></CardHeader><CardContent className="space-y-5">
        {editando ? <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!errorPlan) void ejecutar(() => proponerPlanOferta(ofertaId, { version: oferta.plan_version, modalidad, hitos: modalidad === "hitos" ? hitos : [] }), true) }}>
          <ModalidadPagoSelector value={modalidad} onChange={value => { setModalidad(value); if (value === "hitos" && !hitos.length) setHitos([nuevoHito(), nuevoHito()]) }} disabled={ocupado} />
          {modalidad === "hitos" && <PlanHitosEditor value={hitos} onChange={setHitos} totalCentimos={total} disabled={ocupado} error={errorPlan} />}
          <p className="text-xs text-muted-foreground">{t("El precio total se conserva. Si añades o quitas fases, redistribuye sus importes. Enviar la propuesta expresa tu aceptación y pide la conformidad de la otra parte.")}</p>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={ocupado || !!errorPlan}>{ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Enviar propuesta de plan")}</Button><Button type="button" variant="outline" disabled={ocupado} onClick={() => setEditando(false)}>{t("Cancelar")}</Button></div>
        </form> : <>
          {oferta.modalidad_pago === "hitos" ? <ResumenPlanHitos hitos={oferta.plan_hitos || []} /> : <p className="text-sm text-muted-foreground">{t("Se paga el servicio antes de comenzar. Al aprobar la entrega se autoriza la transferencia al proveedor.")}</p>}
          <div className="flex flex-wrap gap-3 rounded-lg bg-muted/40 p-3 text-sm"><span className={oferta.plan_aceptado_cliente ? "text-emerald-600" : "text-muted-foreground"}>{t("Cliente")}: {t(oferta.plan_aceptado_cliente ? "Conforme" : "Pendiente")}</span><span className={oferta.plan_aceptado_proveedor ? "text-emerald-600" : "text-muted-foreground"}>{t("Proveedor")}: {t(oferta.plan_aceptado_proveedor ? "Conforme" : "Pendiente")}</span></div>
          {puedeEditar && <Button variant="outline" disabled={ocupado} onClick={() => { setModalidad(oferta.modalidad_pago); setHitos(oferta.plan_hitos || []); setEditando(true); setError("") }}><Pencil className="mr-2 h-4 w-4" />{t("Añadir, quitar o cambiar hitos")}</Button>}
          {puedeResponder && <div className="space-y-3 border-t pt-4"><p className="text-sm">{t("La otra parte ha propuesto este plan. Revisa los importes y los criterios de cada hito.")}</p><div className="flex flex-wrap gap-2"><Button disabled={ocupado} onClick={() => ejecutar(() => responderPlanOferta(ofertaId, oferta.plan_version, true))}>{t("Aceptar este plan")}</Button><Button variant="outline" disabled={ocupado} onClick={() => ejecutar(() => responderPlanOferta(ofertaId, oferta.plan_version, false))}>{t("No aceptar el plan")}</Button></div></div>}
          {cliente && vigente && contraparteAcepto && oferta.plan_estado !== "rechazado" && <div className="space-y-4 border-t pt-4">
            <dl className="space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>{t("Precio del servicio")}</dt><dd>{formatearPrecio(Number(oferta.precio), idioma)}</dd></div><div className="flex justify-between gap-3"><dt>{t("Gastos de servicio Diime, IVA incluido")}</dt><dd>{formatearPrecio(calcularTotalCliente(Number(oferta.precio)).comisionCliente, idioma)}</dd></div><div className="flex justify-between gap-3 font-semibold"><dt>{t("Total del contrato")}</dt><dd>{formatearPrecio(calcularTotalCliente(Number(oferta.precio)).totalCliente, idioma)}</dd></div></dl>
            <label className="flex items-start gap-3 text-sm"><Checkbox checked={acepta} onCheckedChange={value => setAcepta(value === true)} disabled={ocupado} className="mt-0.5" /><span>{t("Acepto este presupuesto, su plan de pagos y los gastos de servicio de Diime.")}</span></label>
            <p className="text-xs text-muted-foreground">{t(oferta.modalidad_pago === "hitos" ? "Al contratar podrás pagar el primer hito. Los demás se pagarán por separado; no se cobra hoy el contrato completo." : "Al contratar continuarás al pago del servicio.")}</p>
            <Button className="min-h-11 w-full sm:w-auto" disabled={ocupado || !acepta} onClick={contratar}><CheckCircle2 className="mr-2 h-4 w-4" />{t("Contratar con este plan")}</Button>
          </div>}
          {!cliente && <p className="text-sm text-muted-foreground">{t("Importe neto previsto del contrato")}: {formatearPrecio(Number(oferta.pago_neto_proveedor_previsto ?? calcularPagoProveedor(Number(oferta.precio)).pagoNeto), idioma)}</p>}
        </>}
      </CardContent></Card>
    </>}
    {error && <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"><p>{t(error)}</p><Button variant="outline" disabled={ocupado} onClick={() => cargar()}>{t("Actualizar plan")}</Button></div>}
  </main>
}
