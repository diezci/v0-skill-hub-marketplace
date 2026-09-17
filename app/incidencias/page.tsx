import { getT } from "@/lib/i18n-servidor"
import MisIncidencias from "@/components/mis-incidencias"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Incidencias | Diime"),
    description: t("Reporta problemas y sigue el estado de tus incidencias con el equipo de Diime"),
  }
}

export default async function IncidenciasPage() {
  const { t } = await getT()

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t("Incidencias")}</h1>
        <p className="text-muted-foreground">
          {t("Reporta problemas con pagos, trabajos u otros usuarios y sigue aquí el estado de cada incidencia. Nuestro equipo las revisa y responde.")}</p>
      </div>
      <MisIncidencias />
    </div>
  )
}
