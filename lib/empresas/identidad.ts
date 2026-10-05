import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

export type IdentidadEmpresa = { id: string; nombre: string; logo?: string | null }

export async function identidadesEmpresas(supabase: SupabaseClient, ids: (string | null | undefined)[]) {
  const unicos = [...new Set(ids.filter((id): id is string => !!id))]
  if (!unicos.length) return {} as Record<string, IdentidadEmpresa>
  const lotes = Array.from({ length: Math.ceil(unicos.length / 200) }, (_, i) => unicos.slice(i * 200, (i + 1) * 200))
  const resultados = await Promise.all(lotes.map((p_ids) => supabase.rpc("empresa_identidades_publicas", { p_ids })))
  if (resultados.some((r) => r.error)) throw new Error("No se pudo comprobar la identidad de las empresas.")
  const mapa = Object.fromEntries(resultados.flatMap((r) => ((r.data || []) as IdentidadEmpresa[]).map((empresa) => [empresa.id, empresa])))
  if (unicos.some((id) => !mapa[id])) throw new Error("No se pudo comprobar la identidad de las empresas.")
  return mapa as Record<string, IdentidadEmpresa>
}

export async function validarEmpresaOperacion(supabase: SupabaseClient, empresaId?: string | null) {
  if (!empresaId) return
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empresaId)) {
    return "La empresa seleccionada no es válida."
  }
  const { data, error } = await supabase.rpc("empresa_contexto_actual")
  if (error || data?.id !== empresaId) return "Ya no tienes acceso para actuar en nombre de esta empresa."
}

// Also guard actions which subsequently use a privileged client for money or
// disputes: being the original actor is insufficient after team revocation.
export async function validarActorTrabajoEmpresa(
  supabase: SupabaseClient, trabajoId: string, usuarioId: string,
  permiso = "encargos", parte?: "cliente" | "proveedor",
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== usuarioId) return "No tienes permiso sobre este trabajo"
  const { data, error } = await supabase.rpc("empresa_puede_operar_trabajo", {
    p_trabajo_id: trabajoId, p_permiso: permiso, p_parte: parte || null,
  })
  if (error || data !== true) return "No tienes permiso sobre este trabajo"
}
