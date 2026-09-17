"use client"

import { useT } from "@/components/idioma-provider"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function StripeConnectRetornoNativo({
  tipo,
  volverA,
}: {
  tipo: "return" | "refresh"
  volverA: string
}) {
  const t = useT()

  const enlaceApp = useMemo(() => {
    const parametros = new URLSearchParams({ volver: volverA })
    return `es.diime.app://auth/callback/stripe/${tipo}?${parametros.toString()}`
  }, [tipo, volverA])

  useEffect(() => {
    window.location.replace(enlaceApp)
  }, [enlaceApp])

  return (
    <main className="container mx-auto max-w-xl px-4 pb-16 pt-28">
      <Card>
        <CardHeader><CardTitle>{t("Volviendo a Diime…")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("Si la app no se abre automáticamente, pulsa el botón para continuar donde estabas.")}</p>
          <Button asChild><a href={enlaceApp}>{t("Abrir Diime")}{" "}<ExternalLink className="ml-2 h-4 w-4" /></a></Button>
          <Button asChild variant="ghost"><Link href={volverA}>{t("Continuar en la web")}</Link></Button>
        </CardContent>
      </Card>
    </main>
  )
}
