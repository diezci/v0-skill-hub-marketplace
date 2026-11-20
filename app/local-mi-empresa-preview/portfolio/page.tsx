import { notFound } from "next/navigation"
import PortfolioAdminPage from "@/app/admin/portfolio/page"
import { esEmpresasLocal, obtenerActorEmpresaLocal } from "@/lib/empresas/service"

export const dynamic = "force-dynamic"

export default async function RevisionPortfolioLocal() {
  if (!esEmpresasLocal() || !(await obtenerActorEmpresaLocal()).plataformaAdmin) notFound()
  return <div className="container mx-auto px-4 py-8"><PortfolioAdminPage /></div>
}
