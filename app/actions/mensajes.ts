"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function obtenerConversaciones() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("conversaciones")
    .select(`
      *,
      participante1:profiles!conversaciones_participante_1_fkey(nombre, apellido, foto_perfil),
      participante2:profiles!conversaciones_participante_2_fkey(nombre, apellido, foto_perfil)
    `)
    .or(`participante_1.eq.${user.id},participante_2.eq.${user.id}`)
    .order("fecha_ultimo_mensaje", { ascending: false, nullsFirst: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function obtenerMensajes(conversacionId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("mensajes")
    .select(`
      *,
      remitente:profiles(nombre, apellido, foto_perfil)
    `)
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function enviarMensaje(conversacionId: string, contenido: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("mensajes")
    .insert({
      conversacion_id: conversacionId,
      remitente_id: user.id,
      contenido,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Actualizar último mensaje de conversación
  await supabase
    .from("conversaciones")
    .update({
      ultimo_mensaje: contenido,
      fecha_ultimo_mensaje: new Date().toISOString(),
    })
    .eq("id", conversacionId)

  revalidatePath("/")
  return { data }
}

export async function crearConversacion(otroUsuarioId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Verificar si ya existe
  const { data: existente } = await supabase
    .from("conversaciones")
    .select("id")
    .or(
      `and(participante_1.eq.${user.id},participante_2.eq.${otroUsuarioId}),and(participante_1.eq.${otroUsuarioId},participante_2.eq.${user.id})`,
    )
    .single()

  if (existente) {
    return { data: existente }
  }

  const { data, error } = await supabase
    .from("conversaciones")
    .insert({
      participante_1: user.id,
      participante_2: otroUsuarioId,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}
