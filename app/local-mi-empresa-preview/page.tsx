import { notFound } from "next/navigation"
import { EmpresaWorkspaceReal } from "@/components/empresas/empresa-workspace-real"
import { esEmpresasLocal, obtenerEspacioEmpresa, perfilParaEditorLocal } from "@/lib/empresas/service"

export const dynamic = "force-dynamic"
export default async function VistaLocal({ searchParams }: { searchParams: Promise<{ estado?: string; seccion?: string }> }) {
  if (!esEmpresasLocal()) notFound()
  const espacio = await obtenerEspacioEmpresa()
  if (!espacio.data) notFound()
  const perfil = await perfilParaEditorLocal(espacio.data)
  const { estado, seccion } = await searchParams
  if (estado === "borrador") { espacio.data.empresa.estadoVerificacion = "borrador"; espacio.data.verificacion = null; if (perfil) perfil.empresa.estadoVerificacion = "borrador" }
  return <EmpresaWorkspaceReal espacio={espacio.data} perfilPublico={perfil} seccion={seccion} />
}
