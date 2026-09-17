"use client"

import { useIdioma } from "@/components/idioma-provider"

import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

// Imprimir / guardar como PDF el documento actual.
export function BotonImprimir() {
  const { t } = useIdioma()

  return (
    <Button variant="outline" className="no-print bg-transparent" onClick={() => window.print()}>
      <Printer className="h-4 w-4 mr-2" />
      {t("Imprimir / Guardar PDF")}</Button>
  )
}
