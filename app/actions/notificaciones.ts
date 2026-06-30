"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Crea una notificación para un usuario (puede ser distinto del actual: p. ej. el
// profesional que oferta notifica al cliente). La RLS permite INSERT a cualquier
// autenticado.
export async function crearNotificacion(params: {
  usuarioId: string
  tipo: string
  titulo: string
  mensaje?: string
  link?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  // No notificarse a uno mismo.
  if (params.usuarioId === user.id) return

  await supabase.from("notificaciones").insert({
    usuario_id: params.usuarioId,
    tipo: params.tipo,
    titulo: params.titulo,
    mensaje: params.mensaje ?? null,
    link: params.link ?? null,
    leida: false,
  })
}

// Resumen para el navbar: últimas notificaciones, cuántas sin leer y cuántos
// mensajes de chat sin leer.
export async function obtenerResumenNotificaciones() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { notificaciones: [], noLeidas: 0, mensajesNoLeidos: 0 }

  const { data: notificaciones } = await supabase
    .from("notificaciones")
    .select("id, tipo, titulo, mensaje, link, leida, created_at")
    .eq("usuario_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20)

  const noLeidas = (notificaciones || []).filter((n: any) => !n.leida).length

  // Mensajes de chat sin leer (en conversaciones donde participo, no enviados por mí).
  const { data: convs } = await supabase
    .from("conversaciones")
    .select("id")
    .or(`participante_1.eq.${user.id},participante_2.eq.${user.id}`)
  const convIds = (convs || []).map((c: any) => c.id)

  let mensajesNoLeidos = 0
  if (convIds.length > 0) {
    const { count } = await supabase
      .from("mensajes")
      .select("*", { count: "exact", head: true })
      .in("conversacion_id", convIds)
      .eq("leido", false)
      .neq("remitente_id", user.id)
    mensajesNoLeidos = count || 0
  }

  return { notificaciones: notificaciones || [], noLeidas, mensajesNoLeidos }
}

// Marca todas mis notificaciones como leídas (al abrir la campana).
export async function marcarNotificacionesLeidas() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { error } = await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("usuario_id", user.id)
    .eq("leida", false)
  if (error) return { error: error.message }
  return { success: true }
}
