"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { EscrowPaymentDialog } from "@/components/escrow-payment-dialog"
import { liberarFondosEscrow } from "@/app/actions/escrow"
import { useIdioma, useT } from "@/components/idioma-provider"
import { formatearPrecio } from "@/lib/comisiones"

export function AccionesPagoTrabajoEmpresa({ trabajoId, estado, precio, titulo, proveedorNombre, onActualizado }: {
  trabajoId: string; estado: string; precio: number; titulo?: string; proveedorNombre?: string; onActualizado?: () => void
}) {
  const t = useT()
  const { idioma } = useIdioma()
  const [pagoAbierto, setPagoAbierto] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function liberar() {
    setOcupado(true); setError(null)
    try {
      const result = await liberarFondosEscrow(trabajoId)
      if (result.error) setError(result.error)
      else { setConfirmar(false); onActualizado?.() }
    } catch { setError("No se pudo confirmar la entrega. Vuelve a intentarlo.") }
    finally { setOcupado(false) }
  }
  if (estado !== "pendiente_pago" && estado !== "entregado") return null
  return <div className="space-y-2">
    {estado === "pendiente_pago" && <>
      <Button size="sm" onClick={() => setPagoAbierto(true)}>{t("Realizar pago protegido")}</Button>
      <EscrowPaymentDialog key={trabajoId} open={pagoAbierto} onOpenChange={setPagoAbierto} trabajoId={trabajoId}
        titulo={titulo || t("Servicio contratado")} precioAcordado={precio}
        profesionalNombre={proveedorNombre || t("Proveedor del contrato")} onSuccess={onActualizado} />
    </>}
    {estado === "entregado" && <>
      <Button size="sm" disabled={ocupado} onClick={() => setConfirmar(true)}>{t("Confirmar entrega")}</Button>
      <AlertDialog open={confirmar} onOpenChange={(open) => { if (!ocupado) setConfirmar(open) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Confirmar entrega y liberar el pago")}</AlertDialogTitle>
            <AlertDialogDescription>{t("Confirma que el servicio está terminado y conforme. El pago retenido se liquidará al proveedor según los importes acordados.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm">{t("Precio del servicio:")} {formatearPrecio(precio, idioma)}</p>
          {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>{t("Volver")}</AlertDialogCancel>
            <AlertDialogAction disabled={ocupado} onClick={(event) => { event.preventDefault(); void liberar() }}>
              {ocupado && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Confirmar y liberar pago")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>}
  </div>
}
