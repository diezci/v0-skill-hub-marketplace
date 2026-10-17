import { redirect } from "next/navigation"
import { Building2 } from "lucide-react"
import { EmpresaWorkspace } from "@/components/empresas/empresa-workspace"
import RegistroEmpresaLegacy from "@/components/empresas/registro-empresa-legacy"
import { obtenerEspacioEmpresa } from "@/lib/empresas/service"
import { getT } from "@/lib/i18n-servidor"
import { idNotificacionValido } from "@/lib/notificaciones-contexto"
import type { OperacionInicialEmpresa } from "@/lib/empresas/types"

export const dynamic = "force-dynamic"

export default async function MiEmpresaPage({ searchParams }: { searchParams: Promise<{ stripe_connect?: string | string[]; trabajo?: string | string[]; oferta?: string | string[]; solicitud?: string | string[] }> }) {
  const params = await searchParams
  const resultado = await obtenerEspacioEmpresa()
  if (resultado.codigo === "NO_AUTENTICADO") {
    const query = new URLSearchParams()
    for (const clave of ["trabajo", "oferta", "solicitud"] as const) if (idNotificacionValido(params[clave])) query.set(clave, params[clave])
    if (params.stripe_connect === "return" || params.stripe_connect === "refresh") query.set("stripe_connect", params.stripe_connect)
    const next = `/mi-empresa${query.size ? `?${query}` : ""}`
    redirect(`/auth/login?next=${encodeURIComponent(next)}`)
  }
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
  const mostrarCobrosIniciales = params.stripe_connect === "return" || params.stripe_connect === "refresh"
  const operacionInicial: OperacionInicialEmpresa | undefined = idNotificacionValido(params.trabajo)
    ? { tipo: "trabajos", id: params.trabajo }
    : idNotificacionValido(params.oferta) ? { tipo: "ofertas", id: params.oferta }
    : idNotificacionValido(params.solicitud) ? { tipo: "solicitudes", id: params.solicitud } : undefined
  return <EmpresaWorkspace key={`${resultado.data.empresa.id}-${resultado.data.actor.id}-${operacionInicial?.tipo || ""}-${operacionInicial?.id || ""}`} espacio={resultado.data} mostrarCobrosIniciales={mostrarCobrosIniciales} operacionInicial={operacionInicial} />
}
