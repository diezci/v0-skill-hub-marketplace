"use server"

import { textoServidor } from "@/lib/i18n-servidor"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type IncidenciaCategoria = "fraude" | "abuso" | "pago" | "tecnico" | "perfil" | "otro"
export type IncidenciaPrioridad = "baja" | "media" | "alta" | "critica"
export type IncidenciaEstado = "abierta" | "en_revision" | "resuelta" | "cerrada" | "retirada"

// Trabajos del usuario (como cliente o proveedor) para asociar la incidencia.
// La otra parte del trabajo se sugiere como usuario reportado.
export async function obtenerTrabajosParaIncidencia() {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos"), data: [] }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado"), data: [] }

  const { data, error } = await supabase.rpc("trabajos_para_incidencia")
  if (error) return { error: await textoServidor(error.message), data: [] }
  return { data: data || [] }
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
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

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
      return { error: await textoServidor("La tabla de incidencias aún no está creada. Ejecuta el script 027.") }
    }
    return { error: await textoServidor(error.message) }
  }

  revalidatePath("/admin/incidencias")
  revalidatePath("/incidencias")
  return { data: incidencia }
}

// Incidencias del usuario actual (las que ha reportado), con datos básicos del
// trabajo relacionado. Para el panel de incidencias de cliente/proveedor.
export async function obtenerMisIncidencias() {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos"), data: [] }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado"), data: [] }

  const { data, error } = await supabase
    .from("incidencias")
    .select(
      "id, asunto, descripcion, categoria, prioridad, estado, trabajo_id, notas_admin, fecha_resolucion, created_at, updated_at",
    )
    .eq("reportado_por", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    if (error.code === "42P01") return { data: [] }
    return { error: await textoServidor(error.message), data: [] }
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

// Retirar una incidencia que reportó el propio usuario, mientras un admin no la
// haya resuelto o cerrado. La validación (autor + estado) la hace la función
// SECURITY DEFINER retirar_incidencia, porque las incidencias solo las puede
// actualizar un admin por RLS.
export async function retirarIncidencia(incidenciaId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar") }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  const { data: resultado, error } = await supabase.rpc("retirar_incidencia", {
    p_incidencia_id: incidenciaId,
  })
  if (error) return { error: await textoServidor(error.message) }
  if (resultado !== "ok") {
    const motivos: Record<string, string> = {
      no_encontrada: "La incidencia no existe.",
      no_autorizado: "Solo quien reportó la incidencia puede retirarla.",
      no_retirable: "Esta incidencia ya la ha gestionado el equipo: no se puede retirar.",
    }
    return { error: await textoServidor(motivos[resultado as string] || "No se ha podido retirar la incidencia.") }
  }

  revalidatePath("/incidencias")
  revalidatePath("/admin/incidencias")
  return { success: true }
}

// Comprueba si el usuario actual es admin de la plataforma (columna es_admin).
async function esAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("es_admin").eq("id", userId).maybeSingle()
  return !!data?.es_admin
}

export async function obtenerIncidencias() {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  if (!(await esAdmin(supabase, user.id))) {
    return { error: await textoServidor("No tienes permiso para ver incidencias") }
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
    return { error: await textoServidor(error.message) }
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
      .select("id, nombre, apellido")
      .in("id", ids)
    // El correo va por RPC: aquí quien mira es un admin, y la función se lo da.
    const { data: contactos } = await supabase.rpc("contacto_perfiles", { p_ids: ids })
    for (const p of perfiles || []) {
      mapa[p.id] = {
        ...p,
        email: (contactos as any[] | null)?.find((c: any) => c.id === p.id)?.email ?? null,
      }
    }
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
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  if (!(await esAdmin(supabase, user.id))) {
    return { error: await textoServidor("No tienes permiso") }
  }

  const { data: resultado, error } = await supabase.rpc("gestionar_incidencia", {
    p_id: id,
    p_cambios: cambios,
  })
  if (error) return { error: await textoServidor(error.message) }

  // La RPC guarda resolución y aviso juntos. Solo el cierre que realmente
  // cambió el estado devuelve un aviso nuevo para correo y push.
  if (resultado?.aviso_id) {
    const { enviarNotificacionGuardada } = await import("@/lib/notificaciones")
    await enviarNotificacionGuardada(resultado.aviso_id)
  }

  revalidatePath("/admin/incidencias")
  revalidatePath("/incidencias")
  return { success: true }
}
