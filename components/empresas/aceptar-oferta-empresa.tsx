"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { aceptarOferta } from "@/app/actions/ofertas"
import { useIdioma, useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { calcularTotalCliente, formatearPrecio } from "@/lib/comisiones"

export function AceptarOfertaEmpresa({ ofertaId, titulo, descripcion, precio, onAceptada }: {
  ofertaId: string; titulo: string; descripcion: string; precio: number; onAceptada: () => void
}) {
  const t = useT()
  const { idioma } = useIdioma()
  const importe = calcularTotalCliente(precio)
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState("")
  async function aceptar() {
    setOcupado(true); setError("")
    try {
      const resultado = await aceptarOferta(ofertaId)
      if (resultado.error || !resultado.data?.id) { setError(resultado.error || "No se pudo aceptar la oferta"); return }
      setAbierto(false); onAceptada()
    } catch { setError("No se pudo completar la acción. Vuelve a intentarlo.") }
    finally { setOcupado(false) }
  }
  return <>
    <Button size="sm" disabled={ocupado} onClick={() => { setError(""); setAbierto(true) }}>{t("Aceptar oferta")}</Button>
    <AlertDialog open={abierto} onOpenChange={(open) => { if (!ocupado) setAbierto(open) }}>
      <AlertDialogContent aria-busy={ocupado}>
        <AlertDialogHeader><AlertDialogTitle>{t("Crear contrato de la empresa")}</AlertDialogTitle><AlertDialogDescription>{t("La solicitud conserva su autor y tú quedas como responsable del contrato. El pago protegido se tramita después desde los trabajos de la empresa.")}</AlertDialogDescription></AlertDialogHeader>
        <div className="space-y-2 text-sm"><p className="font-medium">{titulo}</p><p className="whitespace-pre-wrap break-words">{descripcion}</p><p>{t("Precio del servicio:")} {formatearPrecio(precio, idioma)}</p><p>{t("Gastos de servicio Diime")} {formatearPrecio(importe.comisionCliente, idioma)}</p><p className="font-semibold">{t("Total a pagar")}: {formatearPrecio(importe.totalCliente, idioma)}</p></div>
        {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={ocupado}>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction disabled={ocupado} onClick={(event) => { event.preventDefault(); void aceptar() }}>{ocupado && <Loader2 className="mr-2 size-4 animate-spin" />}{t("Aceptar oferta")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
