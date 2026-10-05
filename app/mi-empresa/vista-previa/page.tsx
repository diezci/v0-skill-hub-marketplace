import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Eye } from "lucide-react"
import { VistaPreviaEmpresa } from "@/components/empresas/vista-previa-empresa"
import { Button } from "@/components/ui/button"
import { vistaPreviaEmpresaReal } from "@/lib/empresas/production-store"
import { getT } from "@/lib/i18n-servidor"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t("Vista previa de empresa | Diime"), robots: { index: false, follow: false } }
}

export default async function VistaPreviaEmpresaPage() {
  const [resultado, { t }] = await Promise.all([vistaPreviaEmpresaReal(), getT()])
  if (resultado.codigo === "NO_AUTENTICADO") redirect("/auth/login?next=%2Fmi-empresa%2Fvista-previa")
  if (resultado.codigo === "SIN_EMPRESA") redirect("/mi-empresa")
  if (resultado.error || !resultado.data) return <div className="mx-auto max-w-xl px-4 py-16 text-center">
    <Eye className="mx-auto mb-5 size-10 text-muted-foreground" />
    <h1 className="text-2xl font-semibold">{t("Vista previa no disponible")}</h1>
    <p className="mt-3 text-sm text-muted-foreground">{t(resultado.error || "No se pudo cargar la vista previa de la empresa.")}</p>
    <Button asChild variant="outline" className="mt-6"><Link href="/mi-empresa">{t("Volver a Mi empresa")}</Link></Button>
  </div>
  return <VistaPreviaEmpresa datos={resultado.data} />
}
