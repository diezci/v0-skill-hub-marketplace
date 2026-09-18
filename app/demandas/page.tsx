import { getT } from "@/lib/i18n-servidor"
import DemandasServicios from "@/components/demandas-servicios"
import { Suspense } from "react"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Demandas de Servicios | Diime"),
    description: t("Explora las demandas de servicios publicadas y envía tus presupuestos"),
  }
}

export default async function DemandasPage() {
  const { t } = await getT()

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t("Demandas de Servicios")}</h1>
        <p className="text-muted-foreground">
          {t("Explora las solicitudes de servicios publicadas por usuarios. Filtra por tu especialidad y ubicación para encontrar proyectos y enviar tus presupuestos.")}</p>
      </div>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted/50" />}>
        <DemandasServicios />
      </Suspense>
    </div>
  )
}
