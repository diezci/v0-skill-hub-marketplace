"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type IncidenciaCategoria = "fraude" | "abuso" | "pago" | "tecnico" | "perfil" | "otro"
export type IncidenciaPrioridad = "baja" | "media" | "alta" | "critica"
export type IncidenciaEstado = "abierta" | "en_revision" | "resuelta" | "cerrada"

// Trabajos del usuario (como cliente o proveedor) para asociar la incidencia.
// La otra parte del trabajo se sugiere como usuario reportado.
export async function obtenerTrabajosParaIncidencia() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado", data: [] }

  const { data, error } = await supabase
    .from("trabajos")
    .select("id, titulo, estado, cliente_id, profesional_id, created_at")
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .order("created_at", { ascending: false })

  if (error) return { error: error.message, data: [] }

  const trabajos = (data || []).map((t: any) => ({
    id: t.id,
    titulo: t.titulo,
    estado: t.estado,
    // El otro participante del trabajo, para reportarlo si procede.
    otra_parte_id: t.cliente_id === user.id ? t.profesional_id : t.cliente_id,
  }))
  return { data: trabajos }
}

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
  revalidatePath("/incidencias")
  return { data: incidencia }
}

// Incidencias del usuario actual (las que ha reportado), con datos básicos del
// trabajo relacionado. Para el panel de incidencias de cliente/proveedor.
export async function obtenerMisIncidencias() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado", data: [] }

  const { data, error } = await supabase
    .from("incidencias")
    .select(
      "id, asunto, descripcion, categoria, prioridad, estado, trabajo_id, notas_admin, fecha_resolucion, created_at, updated_at",
    )
    .eq("reportado_por", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    if (error.code === "42P01") return { data: [] }
    return { error: error.message, data: [] }
  }

  // Adjuntar el título del trabajo relacionado (si lo hay).
  const conTrabajo = await Promise.all(
    (data || []).map(async (inc: any) => {
      if (!inc.trabajo_id) return inc
      const { data: trabajo } = await supabase
        .from("trabajos")
        .select("titulo")
        .eq("id", inc.trabajo_id)
        .maybeSingle()
      return { ...inc, trabajo_titulo: trabajo?.titulo ?? null }
    }),
  )

  return { data: conTrabajo }
}

// Comprueba si el usuario actual es admin de la plataforma (columna es_admin).
async function esAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("es_admin").eq("id", userId).maybeSingle()
  return !!data?.es_admin
}

export async function obtenerIncidencias() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  if (!(await esAdmin(supabase, user.id))) {
    return { error: "No tienes permiso para ver incidencias" }
  }

  const { data, error } = await supabase
    .from("incidencias")
    .select(
      `id, asunto, descripcion, categoria, prioridad, estado,
       trabajo_id, usuario_reportado, reportado_por, notas_admin,
       resuelto_por, fecha_resolucion, created_at, updated_at`,
    )
    .order("created_at", { ascending: false })

  if (error) {
    if (error.code === "42P01") return { data: [] }
    return { error: error.message }
  }

  // La FK de incidencias apunta a auth.users, así que los perfiles se obtienen
  // aparte (los embeds de PostgREST hacia profiles no resuelven).
  const ids = [
    ...new Set(
      (data || []).flatMap((i: any) => [i.reportado_por, i.usuario_reportado]).filter((x): x is string => !!x),
    ),
  ]
  const mapa: Record<string, any> = {}
  if (ids.length > 0) {
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, nombre, apellido, email")
      .in("id", ids)
    for (const p of perfiles || []) mapa[p.id] = p
  }

  const enriquecidas = (data || []).map((i: any) => ({
    ...i,
    reportador: i.reportado_por ? mapa[i.reportado_por] || null : null,
    reportado: i.usuario_reportado ? mapa[i.usuario_reportado] || null : null,
  }))

  return { data: enriquecidas }
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

  if (!(await esAdmin(supabase, user.id))) {
    return { error: "No tienes permiso" }
  }

  const cierra = cambios.estado === "resuelta" || cambios.estado === "cerrada"

  const update: Record<string, any> = { ...cambios }
  if (cierra) {
    update.resuelto_por = user.id
    update.fecha_resolucion = new Date().toISOString()
  }

  const { data: incidencia, error } = await supabase
    .from("incidencias")
    .update(update)
    .eq("id", id)
    .select("id, asunto, estado, reportado_por, notas_admin")
    .maybeSingle()
  if (error) return { error: error.message }

  // Solo se avisa a quien la reportó: el usuario reportado nunca supo de la
  // incidencia y `obtenerMisIncidencias` filtra por `reportado_por`, así que un
  // aviso le llevaría a un panel donde no aparece.
  if (cierra && incidencia?.reportado_por) {
    const resuelta = cambios.estado === "resuelta"
    const nota = incidencia.notas_admin?.trim()
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: incidencia.reportado_por,
      tipo: "incidencia_resuelta",
      titulo: resuelta ? "Incidencia resuelta" : "Incidencia cerrada",
      mensaje: `Tu incidencia "${incidencia.asunto}" se ha marcado como ${
        resuelta ? "resuelta" : "cerrada"
      }.${nota ? ` Respuesta del equipo: ${nota}` : ""}`,
      link: "/incidencias",
    })
  }

  revalidatePath("/admin/incidencias")
  revalidatePath("/incidencias")
  return { success: true }
}
