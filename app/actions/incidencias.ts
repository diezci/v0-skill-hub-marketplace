"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type IncidenciaCategoria = "fraude" | "abuso" | "pago" | "tecnico" | "perfil" | "otro"
export type IncidenciaPrioridad = "baja" | "media" | "alta" | "critica"
export type IncidenciaEstado = "abierta" | "en_revision" | "resuelta" | "cerrada"

export async function crearIncidencia(data: {
  asunto: string
  descripcion: string
  categoria: IncidenciaCategoria
  prioridad?: IncidenciaPrioridad
  trabajo_id?: string | null
  usuario_reportado?: string | null
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: incidencia, error } = await supabase
    .from("incidencias")
    .insert({
      reportado_por: user.id,
      asunto: data.asunto,
      descripcion: data.descripcion,
      categoria: data.categoria,
      prioridad: data.prioridad || "media",
      trabajo_id: data.trabajo_id || null,
      usuario_reportado: data.usuario_reportado || null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "42P01") {
      return { error: "La tabla de incidencias aún no está creada. Ejecuta el script 027." }
    }
    return { error: error.message }
  }

  revalidatePath("/admin/incidencias")
  return { data: incidencia }
}

export async function obtenerIncidencias() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (profile?.rol !== "admin") {
    return { error: "No tienes permiso para ver incidencias" }
  }

  const { data, error } = await supabase
    .from("incidencias")
    .select(
      `
      id, asunto, descripcion, categoria, prioridad, estado,
      trabajo_id, usuario_reportado, notas_admin,
      resuelto_por, fecha_resolucion, created_at, updated_at,
      reportador:profiles!incidencias_reportado_por_fkey(id, nombre, apellido, email),
      reportado:profiles!incidencias_usuario_reportado_fkey(id, nombre, apellido, email)
    `,
    )
    .order("created_at", { ascending: false })

  if (error) {
    if (error.code === "42P01") return { data: [] }
    return { error: error.message }
  }

  return { data: data || [] }
}

export async function actualizarIncidencia(
  id: string,
  cambios: Partial<{
    estado: IncidenciaEstado
    prioridad: IncidenciaPrioridad
    notas_admin: string
  }>,
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (profile?.rol !== "admin") {
    return { error: "No tienes permiso" }
  }

  const update: Record<string, any> = { ...cambios }
  if (cambios.estado === "resuelta" || cambios.estado === "cerrada") {
    update.resuelto_por = user.id
    update.fecha_resolucion = new Date().toISOString()
  }

  const { error } = await supabase.from("incidencias").update(update).eq("id", id)
  if (error) return { error: error.message }

  revalidatePath("/admin/incidencias")
  return { success: true }
}
