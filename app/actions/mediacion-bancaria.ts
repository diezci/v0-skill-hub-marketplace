"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { idNotificacionValido } from "@/lib/notificaciones-contexto"
import { textoServidor } from "@/lib/i18n-servidor"

/** Records an administrative closure after the bank returned the entire charge; never moves money. */
export async function cerrarMediacionTrasContracargo(disputaId: string, contracargoId: string, motivo: string) {
  if (!idNotificacionValido(disputaId) || !idNotificacionValido(contracargoId) ||
      typeof motivo !== "string" || !motivo.trim() || motivo.trim().length > 2000) {
    return { error: await textoServidor("Indica el expediente y un motivo de cierre de hasta 2000 caracteres.") }
  }
  const supabase = await createClient()
  const admin = createAdminClient()
  if (!supabase || !admin) return { error: await textoServidor("Base de datos no disponible") }
  const { data: { user } } = await supabase.auth.getUser()
  const claims = await supabase.auth.getClaims()
  const session = claims.data?.claims?.session_id
  if (!user || claims.error || claims.data?.claims?.sub !== user.id ||
      typeof session !== "string" || !idNotificacionValido(session)) return { error: await textoServidor("No autenticado") }
  const { data: perfil, error } = await supabase.from("profiles")
    .select("es_admin,cuenta_eliminada").eq("id", user.id).maybeSingle()
  if (error || !perfil?.es_admin || perfil.cuenta_eliminada) return { error: await textoServidor("No tienes permiso") }
  try {
    // The service-only RPC rechecks the current administrator/session under the financial lock.
    const result = await admin.rpc("diime_cerrar_mediacion_tras_contracargo", {
      p_disputa: disputaId, p_contracargo: contracargoId, p_actor: user.id, p_sesion: session, p_motivo: motivo.trim(),
    })
    if (result.error) return { error: await textoServidor("Solo se puede cerrar una mediación con el cargo íntegro devuelto por el banco y la conciliación completada. Actualiza el expediente.") }
    for (const route of ["/admin/disputas", "/mis-trabajos", "/mis-solicitudes", "/mi-empresa"]) revalidatePath(route)
    return { success: true }
  } catch {
    return { error: await textoServidor("No se pudo cerrar la mediación. Actualiza el expediente y vuelve a intentarlo.") }
  }
}
