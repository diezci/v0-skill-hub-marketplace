import { notFound } from "next/navigation"
import { esEmpresasLocal, obtenerInvitacionEmpresa } from "@/lib/empresas/service"
import { AceptarInvitacionEmpresa } from "@/components/empresas/aceptar-invitacion-empresa"

export default async function InvitacionEmpresaPage({ params }: { params: Promise<{ token: string }> }) {
  if (!esEmpresasLocal()) notFound()
  const { token } = await params
  const resultado = await obtenerInvitacionEmpresa(token)
  return <AceptarInvitacionEmpresa token={token} resultado={resultado} />
}
