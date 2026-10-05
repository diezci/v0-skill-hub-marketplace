import { redirect } from "next/navigation"
import { obtenerInvitacionEmpresa } from "@/lib/empresas/service"
import { AceptarInvitacionEmpresa } from "@/components/empresas/aceptar-invitacion-empresa"

export const dynamic = "force-dynamic"

export default async function InvitacionEmpresaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resultado = await obtenerInvitacionEmpresa(token)
  if (resultado.codigo === "NO_AUTENTICADO") redirect(`/auth/login?next=${encodeURIComponent(`/mi-empresa/invitaciones/${encodeURIComponent(token)}`)}`)
  return <AceptarInvitacionEmpresa token={token} resultado={resultado} />
}
