"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function obtenerConversaciones() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "No autenticado", data: [] }
  }

  // Get conversations where user is a participant
  const { data: conversaciones, error } = await supabase
    .from("conversaciones")
    .select(`
      id,
      participante_1,
      participante_2,
      ultimo_mensaje,
      fecha_ultimo_mensaje,
      solicitud_id,
      trabajo_id,
      created_at
    `)
    .or(`participante_1.eq.${user.id},participante_2.eq.${user.id}`)
    .order("fecha_ultimo_mensaje", { ascending: false, nullsFirst: false })

  if (error) {
    console.error("[v0] Error fetching conversations:", error)
    return { error: error.message, data: [] }
  }

  // Enrich conversations with participant info and project details
  const enrichedConversations = await Promise.all(
    (conversaciones || []).map(async (conv) => {
      const otherParticipantId = conv.participante_1 === user.id ? conv.participante_2 : conv.participante_1
      
      // Get other participant's profile
      const { data: otherProfile } = await supabase
        .from("profiles")
        .select("nombre, apellido, foto_perfil")
        .eq("id", otherParticipantId)
        .single()

      // Get solicitud info if linked
      let solicitud = null
      let miRol: "cliente" | "proveedor" | null = null
      let rolOtro: "cliente" | "proveedor" | null = null
      
      if (conv.solicitud_id) {
        const { data: solicitudData } = await supabase
          .from("solicitudes")
          .select("id, titulo, estado, user_id")
          .eq("id", conv.solicitud_id)
          .single()
        
        if (solicitudData) {
          solicitud = { titulo: solicitudData.titulo, estado: solicitudData.estado }
          miRol = solicitudData.user_id === user.id ? "cliente" : "proveedor"
          rolOtro = solicitudData.user_id === user.id ? "proveedor" : "cliente"
        }
      }

      // Get trabajo info if linked (overrides solicitud info)
      let trabajo = null
      if (conv.trabajo_id) {
        const { data: trabajoData } = await supabase
          .from("trabajos")
          .select("id, titulo, estado, cliente_id, profesional_id, progreso")
          .eq("id", conv.trabajo_id)
          .single()
        
        if (trabajoData) {
          trabajo = { 
            titulo: trabajoData.titulo, 
            estado: trabajoData.estado,
            progreso: trabajoData.progreso
          }
          miRol = trabajoData.cliente_id === user.id ? "cliente" : "proveedor"
          rolOtro = trabajoData.cliente_id === user.id ? "proveedor" : "cliente"
        }
      }

      // Count unread messages
      const { count: unreadCount } = await supabase
        .from("mensajes")
        .select("*", { count: "exact", head: true })
        .eq("conversacion_id", conv.id)
        .eq("leido", false)
        .neq("emisor_id", user.id)

      return {
        ...conv,
        participante_otro: otherProfile,
        proyecto: trabajo || solicitud,
        mi_rol: miRol,
        rol_otro: rolOtro,
        unread_count: unreadCount || 0,
      }
    })
  )

  return { data: enrichedConversations }
}

export async function obtenerMensajes(conversacionId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "No autenticado", data: [] }
  }

  // Verify user is part of this conversation
  const { data: conv } = await supabase
    .from("conversaciones")
    .select("participante_1, participante_2")
    .eq("id", conversacionId)
    .single()

  if (!conv || (conv.participante_1 !== user.id && conv.participante_2 !== user.id)) {
    return { error: "No tienes acceso a esta conversación", data: [] }
  }

  const { data: mensajes, error } = await supabase
    .from("mensajes")
    .select("*")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[v0] Error fetching messages:", error)
    return { error: error.message, data: [] }
  }

  // Mark messages as read
  await supabase
    .from("mensajes")
    .update({ leido: true })
    .eq("conversacion_id", conversacionId)
    .neq("emisor_id", user.id)

  return { data: mensajes }
}

export async function enviarMensaje(conversacionId: string, contenido: string, archivo?: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "No autenticado" }
  }

  // Verify user is part of this conversation
  const { data: conv } = await supabase
    .from("conversaciones")
    .select("participante_1, participante_2")
    .eq("id", conversacionId)
    .single()

  if (!conv || (conv.participante_1 !== user.id && conv.participante_2 !== user.id)) {
    return { error: "No tienes acceso a esta conversación" }
  }

  const { data: mensaje, error } = await supabase
    .from("mensajes")
    .insert({
      conversacion_id: conversacionId,
      emisor_id: user.id,
      receptor_id: conv.participante_1 === user.id ? conv.participante_2 : conv.participante_1,
      contenido,
      archivo,
      leido: false,
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] Error sending message:", error)
    return { error: error.message }
  }

  // Update conversation's last message
  await supabase
    .from("conversaciones")
    .update({
      ultimo_mensaje: contenido,
      fecha_ultimo_mensaje: new Date().toISOString(),
    })
    .eq("id", conversacionId)

  revalidatePath("/mensajes")
  return { data: mensaje }
}

export async function crearConversacion(params: {
  otroUsuarioId: string
  solicitudId?: string
  trabajoId?: string
  mensajeInicial?: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "No autenticado" }
  }

  // Check if conversation already exists for this project
  let existingConv = null
  
  if (params.trabajoId) {
    const { data } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("trabajo_id", params.trabajoId)
      .single()
    existingConv = data
  } else if (params.solicitudId) {
    const { data } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("solicitud_id", params.solicitudId)
      .or(`and(participante_1.eq.${user.id},participante_2.eq.${params.otroUsuarioId}),and(participante_1.eq.${params.otroUsuarioId},participante_2.eq.${user.id})`)
      .single()
    existingConv = data
  }

  if (existingConv) {
    return { data: existingConv }
  }

  // Create new conversation
  const { data: conv, error } = await supabase
    .from("conversaciones")
    .insert({
      participante_1: user.id,
      participante_2: params.otroUsuarioId,
      solicitud_id: params.solicitudId,
      trabajo_id: params.trabajoId,
      ultimo_mensaje: params.mensajeInicial,
      fecha_ultimo_mensaje: params.mensajeInicial ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] Error creating conversation:", error)
    return { error: error.message }
  }

  // Send initial message if provided
  if (params.mensajeInicial) {
    await supabase.from("mensajes").insert({
      conversacion_id: conv.id,
      emisor_id: user.id,
      receptor_id: params.otroUsuarioId,
      contenido: params.mensajeInicial,
      leido: false,
    })
  }

  revalidatePath("/mensajes")
  return { data: conv }
}

export async function vincularConversacionATrabajo(conversacionId: string, trabajoId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "No autenticado" }
  }

  const { error } = await supabase
    .from("conversaciones")
    .update({ trabajo_id: trabajoId })
    .eq("id", conversacionId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/mensajes")
  return { success: true }
}
