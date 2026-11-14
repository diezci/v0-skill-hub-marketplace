import { notFound } from "next/navigation"
import { EmpresaWorkspaceReal } from "@/components/empresas/empresa-workspace-real"
import { esEmpresasLocal, obtenerEspacioEmpresa, obtenerEmpresaPublica } from "@/lib/empresas/service"

export const dynamic = "force-dynamic"
export default async function VistaLocal({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  if (!esEmpresasLocal()) notFound()
  const espacio = await obtenerEspacioEmpresa()
  if (!espacio.data) notFound()
  const perfil = await obtenerEmpresaPublica(espacio.data.empresa.id)
  const { estado } = await searchParams
  if (estado === "borrador") { espacio.data.empresa.estadoVerificacion = "borrador"; espacio.data.verificacion = null }
  return <EmpresaWorkspaceReal espacio={espacio.data} perfilPublico={perfil} />
}
