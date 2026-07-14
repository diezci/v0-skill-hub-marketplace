"use client"

import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

// Imprimir / guardar como PDF el documento actual (contrato o factura).
export function BotonImprimir() {
  return (
    <Button variant="outline" className="no-print bg-transparent" onClick={() => window.print()}>
      <Printer className="h-4 w-4 mr-2" />
      Imprimir / Guardar PDF
    </Button>
  )
}
