"use server"

import { textoServidor } from "@/lib/i18n-servidor"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { obtenerResumenOperativo } from "@/lib/operaciones"

export type ResumenOperativo = Awaited<ReturnType<typeof obtenerResumenOperativo>>

async function exigirAdmin() {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: await textoServidor("Supabase no está configurado.") }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", ok: false as const, error: await textoServidor("No autenticado") }
  const { data: perfil } = await supabase.from("profiles").select("es_admin").eq("id", user.id).maybeSingle()
  if (!perfil?.es_admin) return { ok: false as const, error: await textoServidor("No tienes permiso para acceder a operaciones.") }
  return { ok: true as const, user }
}

export async function obtenerEstadoOperativo(): Promise<
  { ok: true; data: ResumenOperativo } | { ok: false; error: string }
> {
  const permiso = await exigirAdmin()
  if (!permiso.ok) return { ok: false, error: await textoServidor(permiso.error) }
  try {
    return { ok: true, data: await obtenerResumenOperativo() }
  } catch (error) {
    return { ok: false, error: await textoServidor(error instanceof Error ? error.message : "No se pudo obtener el estado operativo.") }
  }
}

export async function resolverEventoOperativo(eventoId: string) {
  const permiso = await exigirAdmin()
  if (!permiso.ok) return { error: await textoServidor(permiso.error) }
  const admin = createAdminClient()
  if (!admin) return { error: await textoServidor("Supabase service role no está configurado.") }
  const { error } = await admin
    .from("eventos_operativos")
    .update({ estado: "resuelto", resuelto_at: new Date().toISOString() })
    .eq("id", eventoId)
    .eq("estado", "abierto")
  if (error) return { error: await textoServidor(error.message) }
  revalidatePath("/admin/operaciones")
  return { success: true }
}
