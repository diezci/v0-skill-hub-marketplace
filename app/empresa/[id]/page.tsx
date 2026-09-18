import type { Metadata } from "next"
import { notFound } from "next/navigation"
import PerfilEmpresa from "@/components/empresas/perfil-empresa"
import { obtenerEmpresaPublica } from "@/lib/empresas/service"
import { getT } from "@/lib/i18n-servidor"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const datos = await obtenerEmpresaPublica(id)
  const { t } = await getT()
  return datos ? { title: `${datos.empresa.nombre} | Diime`, description: datos.empresa.descripcion, ...(datos.local ? { robots: { index: false, follow: false } } : {}) } : { title: t("Empresa no encontrada | Diime") }
}

export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const datos = await obtenerEmpresaPublica(id)
  if (!datos) notFound()
  return <PerfilEmpresa datos={datos} />
}
