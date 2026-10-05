import { redirect } from "next/navigation"
import { Building2 } from "lucide-react"
import { EmpresaWorkspace } from "@/components/empresas/empresa-workspace"
import RegistroEmpresaLegacy from "@/components/empresas/registro-empresa-legacy"
import { obtenerEspacioEmpresa } from "@/lib/empresas/service"
import { getT } from "@/lib/i18n-servidor"

export const dynamic = "force-dynamic"

export default async function MiEmpresaPage() {
  const resultado = await obtenerEspacioEmpresa()
  if (resultado.codigo === "NO_AUTENTICADO") redirect("/auth/login?next=%2Fmi-empresa")
  if (resultado.codigo === "SIN_EMPRESA") return <RegistroEmpresaLegacy />
  const { t } = await getT()
  if (resultado.error || !resultado.data) {
    return <div className="container mx-auto max-w-xl px-4 py-16 text-center">
      <Building2 className="mx-auto mb-5 size-12 text-primary" />
      <h1 className="text-2xl font-semibold">{t("Tu espacio de empresa")}</h1>
      <p className="mt-3 text-muted-foreground">{t(resultado.error || "No se pudo cargar la empresa.")}</p>
      <p className="mt-3 text-sm text-muted-foreground">{t("Si has recibido una invitación, abre su enlace desde la cuenta a la que está dirigida.")}</p>
    </div>
  }
  return <EmpresaWorkspace key={`${resultado.data.empresa.id}-${resultado.data.actor.id}`} espacio={resultado.data} />
}
