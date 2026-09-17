import { getT } from "@/lib/i18n-servidor"
import MisSolicitudes from "@/components/mis-solicitudes"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Mis Solicitudes | Diime"),
    description: t("Gestiona tus solicitudes de servicios publicadas y revisa las ofertas recibidas"),
  }
}

export default async function MisSolicitudesPage() {
  const { t } = await getT()

  return (
    <div className="container mx-auto px-4 pb-28 pt-6 sm:py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t("Mis Solicitudes")}</h1>
        <p className="text-muted-foreground">
          {t("Gestiona las solicitudes de servicios que has publicado. Revisa las ofertas recibidas, el estado de cada solicitud y el progreso de los trabajos contratados.")}</p>
      </div>
      <MisSolicitudes />
    </div>
  )
}
