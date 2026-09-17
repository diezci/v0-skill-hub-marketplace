import { getT } from "@/lib/i18n-servidor"
import MisOfertas from "@/components/mis-ofertas"
import { AvisoSinCobertura } from "@/components/aviso-sin-cobertura"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Mis Pujas | Diime"),
    description: t("Gestiona las pujas que has enviado: edítalas o retíralas mientras no hayan sido aceptadas"),
  }
}

export default async function MisPujasPage() {
  const { t } = await getT()

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t("Mis Pujas")}</h1>
        <p className="text-muted-foreground">
          {t("Gestiona las pujas que has enviado a los clientes. Puedes editarlas o retirarlas mientras no hayan sido aceptadas.")}</p>
      </div>
      <AvisoSinCobertura />
      <MisOfertas />
    </div>
  )
}
