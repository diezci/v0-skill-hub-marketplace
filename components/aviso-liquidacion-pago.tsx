"use client"

import { useT } from "@/components/idioma-provider"

type EscrowVisible = { estado?: string; liquidacion_estado?: string | null; confirmacion_en_curso?: boolean } | null | undefined

/** Persists across reloads; provider errors stay in the admin-only diagnosis. */
export function AvisoLiquidacionPago({ escrow, parte }: { escrow: EscrowVisible; parte: "cliente" | "proveedor" }) {
  const t = useT()
  if (escrow?.estado !== "liquidando") return null
  const error = escrow.liquidacion_estado === "error"
  return <div role={error ? "alert" : "status"} className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
    <p className="font-medium">{t(error ? "La liquidación necesita atención" : "Liquidación en curso")}</p>
    <p className="mt-1">{t(parte === "cliente"
      ? "Tu pago ya se recibió. La liquidación aún no ha terminado y no tienes que volver a pagar."
      : "El cliente ya ha pagado. La liquidación aún no ha terminado; no se ha confirmado tu cobro.")}</p>
    {error && <p className="mt-1">{t(parte === "cliente" && escrow.confirmacion_en_curso
      ? "Puedes reintentar la misma liquidación cuando se haya resuelto la incidencia. Si persiste, contacta con Diime."
      : "Contacta con Diime para revisar la liquidación pendiente.")}</p>}
  </div>
}
