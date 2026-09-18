import { getT } from "@/lib/i18n-servidor"
import ProfesionalesContent from "@/components/profesionales-content"
import { esEmpresasLocal, obtenerEmpresaPublica } from "@/lib/empresas/service"
import TarjetaEmpresa from "@/components/empresas/tarjeta-empresa"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Profesionales - Diime"),
    description: t("Encuentra profesionales para tus proyectos de construcción y reformas"),
  }
}

export default async function ProfesionalesPage() {
  const { t } = await getT()
  const empresaLocal = esEmpresasLocal() ? await obtenerEmpresaPublica("reformas-garcia") : null

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col space-y-4 mb-8">
        <h1 className="text-3xl font-bold">{t("Profesionales")}</h1>
        <p className="text-muted-foreground">
          {t("Encuentra y contacta directamente con profesionales para tu proyecto.")}</p>
      </div>

      {empresaLocal ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"><TarjetaEmpresa datos={empresaLocal} /></div>
      ) : <ProfesionalesContent />}
    </div>
  )
}
