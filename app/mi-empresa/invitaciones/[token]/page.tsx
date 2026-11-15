import { redirect } from "next/navigation"
import { obtenerInvitacionEmpresa } from "@/lib/empresas/service"
import { AceptarInvitacionEmpresa } from "@/components/empresas/aceptar-invitacion-empresa"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getT } from "@/lib/i18n-servidor"
import { EMPRESA_ESPECIALIZADA_HABILITADA, MENSAJE_ALTA_EMPRESA_PAUSADA } from "@/lib/producto"

export const dynamic = "force-dynamic"

export default async function InvitacionEmpresaPage({ params }: { params: Promise<{ token: string }> }) {
  if (!EMPRESA_ESPECIALIZADA_HABILITADA) {
    const { t } = await getT()
    return <div className="container mx-auto max-w-xl space-y-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">{t("Invitaciones de empresa pausadas")}</h1>
      <p className="text-muted-foreground">{t(MENSAJE_ALTA_EMPRESA_PAUSADA)}</p>
      <Button asChild><Link href="/mi-perfil">{t("Ir a Mi perfil")}</Link></Button>
    </div>
  }
  const { token } = await params
  const resultado = await obtenerInvitacionEmpresa(token)
  if (resultado.codigo === "NO_AUTENTICADO") redirect(`/auth/login?next=${encodeURIComponent(`/mi-empresa/invitaciones/${encodeURIComponent(token)}`)}`)
  return <AceptarInvitacionEmpresa token={token} resultado={resultado} />
}
