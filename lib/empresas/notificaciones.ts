import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

// Solo para eventos ya autorizados. No avisar a un operador empresarial que
// perdió acceso; mientras se reasigna, sus administradores pueden supervisarlo.
export async function destinatariosOperacionEmpresa(
  supabase: SupabaseClient,
  empresaId: string | null | undefined,
  operadorId: string | null | undefined,
  permiso: "encargos" | "ver_cobros" = "encargos",
): Promise<string[]> {
  if (!empresaId) return operadorId ? [operadorId] : []
  const { data: miembros, error } = await supabase.from("empresa_miembros")
    .select("usuario_id, rol, permisos").eq("empresa_id", empresaId).eq("estado", "activo")
  if (error || !miembros) return []
  const { data: empresa, error: empresaError } = await supabase.from("empresas")
    .select("propietario_id").eq("id", empresaId).maybeSingle()
  if (empresaError || !empresa?.propietario_id) return []
  const { data: perfiles, error: perfilesError } = await supabase.from("profiles")
    .select("id").in("id", [...new Set([empresa.propietario_id, ...miembros.map((m) => m.usuario_id)])])
    .is("cuenta_eliminada", null)
  if (perfilesError || !perfiles) return []
  const activos = new Set(perfiles.map((p) => p.id))
  if (!activos.has(empresa.propietario_id)) return []
  const vigentes = miembros.filter((m) => activos.has(m.usuario_id))
  const esAdministrador = (m: { rol: string }) => m.rol === "principal" || m.rol === "administrador"
  const puedeRecibir = (m: { rol: string; permisos: Record<string, unknown> }) =>
    m.permisos?.[permiso] === true || (permiso === "encargos" && esAdministrador(m))
  const operador = vigentes.find((m) => m.usuario_id === operadorId && puedeRecibir(m))
  return operador ? [operador.usuario_id] : vigentes.filter((m) => esAdministrador(m) && puedeRecibir(m)).map((m) => m.usuario_id)
}
