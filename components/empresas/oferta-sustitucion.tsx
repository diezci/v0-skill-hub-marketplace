"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { crearOferta } from "@/app/actions/ofertas"
import { useIdioma, useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { calcularPagoProveedor, formatearPrecio } from "@/lib/comisiones"

type Contexto = { oferta_origen_id: string; solicitud_id: string; empresa_id: string; empresa_nombre: string; titulo: string }

export function OfertaSustitucion({ contexto }: { contexto: Contexto }) {
  const t = useT(), { idioma } = useIdioma()
  const [precio, setPrecio] = useState("")
  const [plazo, setPlazo] = useState("")
  const [unidad, setUnidad] = useState("dias")
  const [descripcion, setDescripcion] = useState("")
  const [acepta, setAcepta] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [creada, setCreada] = useState<string | null>(null)
  const enviando = useRef(false)
  const importe = calcularPagoProveedor(Number(precio) || 0)
  async function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enviando.current || creada) return
    enviando.current = true
    setPending(true); setError("")
    try {
      const result = await crearOferta({ solicitud_id: contexto.solicitud_id, empresa_id: contexto.empresa_id,
        oferta_origen_id: contexto.oferta_origen_id, precio: Number(precio), tiempo_estimado: Number(plazo),
        unidad_tiempo: unidad, descripcion, acepta_gastos: acepta })
      if (result.error || !result.data?.id) { setError(result.error || "No se pudo enviar la oferta. Vuelve a intentarlo."); return }
      setCreada(result.data.id)
    } catch { setError("No se pudo enviar la oferta. Vuelve a intentarlo.") }
    finally { enviando.current = false; setPending(false) }
  }
  return <div className="space-y-5">
    <div><h2 className="font-semibold">{contexto.titulo}</h2><p className="text-sm text-muted-foreground">{contexto.empresa_nombre}</p></div>
    <p className="text-sm">{t("La oferta anterior conserva su autor, condiciones y conversación. Esta propuesta tiene un nuevo profesional y necesita una nueva aceptación del cliente.")}</p>
    <p className="text-xs text-muted-foreground">{t("Oferta original")}: <span className="break-all">{contexto.oferta_origen_id}</span></p>
    {creada ? <div className="space-y-3"><p role="status">{t("Oferta vinculada enviada. El cliente debe aceptar esta nueva propuesta.")}</p><Link className="underline" href={`/mis-ofertas?oferta=${encodeURIComponent(creada)}`}>{t("Ver mi oferta")}</Link></div> :
      <form onSubmit={enviar} className="space-y-4" aria-busy={pending}>
        <div className="space-y-2"><Label htmlFor="sustitucion-precio">{t("Precio propuesto (€)")}</Label><Input id="sustitucion-precio" type="number" min="0.01" step="0.01" required value={precio} onChange={e=>setPrecio(e.target.value)} disabled={pending} /></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="sustitucion-plazo">{t("Tiempo estimado")}</Label><Input id="sustitucion-plazo" type="number" min="1" step="1" required value={plazo} onChange={e=>setPlazo(e.target.value)} disabled={pending} /></div><div className="space-y-2"><Label htmlFor="sustitucion-unidad">{t("Unidad")}</Label><select id="sustitucion-unidad" className="h-10 w-full rounded-md border bg-background px-3" value={unidad} onChange={e=>setUnidad(e.target.value)} disabled={pending}><option value="horas">{t("Horas")}</option><option value="dias">{t("Días")}</option><option value="semanas">{t("Semanas")}</option><option value="meses">{t("Meses")}</option></select></div></div>
        <div className="space-y-2"><Label htmlFor="sustitucion-descripcion">{t("Descripción de la nueva oferta")}</Label><Textarea id="sustitucion-descripcion" required value={descripcion} onChange={e=>setDescripcion(e.target.value)} disabled={pending} /></div>
        <p className="text-sm">{t("Gastos de servicio Diime")}: {formatearPrecio(importe.comisionProveedor, idioma)} · {t("Importe neto estimado")}: {formatearPrecio(importe.pagoNeto, idioma)}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={acepta} onChange={e=>setAcepta(e.target.checked)} disabled={pending} />{t("Acepto los gastos de servicio de esta nueva oferta.")}</label>
        {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
        <Button type="submit" disabled={pending}>{t(pending ? "Enviando..." : "Enviar nueva oferta")}</Button>
      </form>}
  </div>
}
