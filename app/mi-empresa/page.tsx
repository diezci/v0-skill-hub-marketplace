import Link from "next/link"
import { Building2 } from "lucide-react"
import { EmpresaWorkspace } from "@/components/empresas/empresa-workspace"
import RegistroEmpresaLegacy from "@/components/empresas/registro-empresa-legacy"
import { Button } from "@/components/ui/button"
import { esEmpresasLocal, obtenerEspacioEmpresa } from "@/lib/empresas/service"

export default async function MiEmpresaPage() {
  if (!esEmpresasLocal()) return <RegistroEmpresaLegacy />
  const resultado = await obtenerEspacioEmpresa()
  if (resultado.error || !resultado.data) {
    return <div className="container mx-auto max-w-xl px-4 py-16 text-center">
      <Building2 className="mx-auto mb-5 h-12 w-12 text-primary" />
      <h1 className="text-2xl font-semibold">Tu espacio de empresa</h1>
      <p className="mt-3 text-muted-foreground">{resultado.error || "No se pudo cargar la empresa."}</p>
      <p className="mt-3 text-sm text-muted-foreground">Si has recibido una invitación, abre su enlace desde la cuenta a la que está dirigida.</p>
      <Button className="mt-6" asChild><Link href="/empresa/reformas-garcia">Ver perfil de empresa</Link></Button>
    </div>
  }
  return <EmpresaWorkspace key={`${resultado.data.empresa.id}-${resultado.data.actor.id}`} espacio={resultado.data} />
}
