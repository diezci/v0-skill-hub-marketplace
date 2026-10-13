"use client"

import Link from "next/link"
import { LockKeyhole } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const siguiente = encodeURIComponent("/#publicar-demanda")

export function SolicitudServicioAcceso({ embedded = false }: { embedded?: boolean }) {
  const t = useT()
  const contenido = (
    <Card
      id="publicar-demanda"
      className="max-w-3xl mx-auto shadow-xl border-0 bg-card/80 backdrop-blur scroll-mt-24"
    >
      <CardContent className="p-6 md:p-8 text-center space-y-5">
        <LockKeyhole className="mx-auto h-8 w-8 text-emerald-500" aria-hidden="true" />
        <h2 className="text-2xl font-semibold">{t("Crea tu cuenta para publicar una solicitud")}</h2>
        <p className="text-muted-foreground">
          {t("Regístrate o inicia sesión antes de completar el cuestionario de tu proyecto.")}
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <Button asChild size="lg" className="bg-emerald-600 hover:bg-emerald-700">
            <Link href={`/auth/registro?next=${siguiente}`}>{t("Regístrate gratis")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/auth/login?next=${siguiente}`}>{t("nav.entrar")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
  return embedded ? contenido : <section className="container mx-auto px-4 py-16">{contenido}</section>
}
