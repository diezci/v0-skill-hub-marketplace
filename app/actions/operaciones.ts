"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { obtenerResumenOperativo } from "@/lib/operaciones"

export type ResumenOperativo = Awaited<ReturnType<typeof obtenerResumenOperativo>>

async function exigirAdmin() {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: "Supabase no está configurado." }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "No autenticado" }
  const { data: perfil } = await supabase.from("profiles").select("es_admin").eq("id", user.id).maybeSingle()
  if (!perfil?.es_admin) return { ok: false as const, error: "No tienes permiso para acceder a operaciones." }
  return { ok: true as const, user }
}

export async function obtenerEstadoOperativo(): Promise<
  { ok: true; data: ResumenOperativo } | { ok: false; error: string }
> {
  const permiso = await exigirAdmin()
  if (!permiso.ok) return { ok: false, error: permiso.error }
  try {
    return { ok: true, data: await obtenerResumenOperativo() }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo obtener el estado operativo." }
  }
}

export async function resolverEventoOperativo(eventoId: string) {
  const permiso = await exigirAdmin()
  if (!permiso.ok) return { error: permiso.error }
  const admin = createAdminClient()
  if (!admin) return { error: "Supabase service role no está configurado." }
  const { error } = await admin
    .from("eventos_operativos")
    .update({ estado: "resuelto", resuelto_at: new Date().toISOString() })
    .eq("id", eventoId)
    .eq("estado", "abierto")
  if (error) return { error: error.message }
  revalidatePath("/admin/operaciones")
  return { success: true }
}
