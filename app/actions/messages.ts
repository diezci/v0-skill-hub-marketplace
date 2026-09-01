"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { errorContenidoProhibido } from "@/lib/moderacion"
import { enviarPushAUsuario } from "@/lib/push/enviar"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function obtenerConversaciones() {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible", data: [] }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "No autenticado", data: [] }
  }

  const { data: incompatibles } = await supabase.rpc("usuarios_incompatibles")
  const idsIncompatibles = new Set((incompatibles || []) as string[])

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
    return { error: error.message, data: [] }
  }

  // Enrich conversations with participant info and project details
  const enrichedConversations = await Promise.all(
    (conversaciones || []).filter((conv) => {
      const otro = conv.participante_1 === user.id ? conv.participante_2 : conv.participante_1
      return !idsIncompatibles.has(otro)
    }).map(async (conv) => {
      const otherParticipantId = conv.participante_1 === user.id ? conv.participante_2 : conv.participante_1

      // Get both participants' profiles (the chat UI uses participante1/2).
      const { data: p1 } = await supabase
        .from("profiles")
        .select("nombre, apellido, foto_perfil, ubicacion, created_at")
        .eq("id", conv.participante_1)
        .maybeSingle()
      const { data: p2 } = await supabase
        .from("profiles")
        .select("nombre, apellido, foto_perfil, ubicacion, created_at")
        .eq("id", conv.participante_2)
        .maybeSingle()
      const otherProfile = conv.participante_1 === user.id ? p2 : p1

      // Ficha profesional del otro participante (si la tiene), para mostrar
      // rating/reseñas/idiomas reales en el panel lateral del chat.
      const { data: otroProfesional } = await supabase
        .from("profesionales")
        .select("rating_promedio, total_reseñas, idiomas")
        .eq("id", otherParticipantId)
        .maybeSingle()

      // Get solicitud info if linked
      let solicitud = null
      let miRol: "cliente" | "proveedor" | null = null
      let rolOtro: "cliente" | "proveedor" | null = null

      if (conv.solicitud_id) {
        const { data: solicitudData } = await supabase
          .from("solicitudes")
          .select("id, titulo, estado, cliente_id")
          .eq("id", conv.solicitud_id)
          .maybeSingle()

        if (solicitudData) {
          solicitud = { titulo: solicitudData.titulo, estado: solicitudData.estado }
          miRol = solicitudData.cliente_id === user.id ? "cliente" : "proveedor"
          rolOtro = solicitudData.cliente_id === user.id ? "proveedor" : "cliente"
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
        .neq("remitente_id", user.id)

      // Último mensaje real, para el preview de la lista (el campo denormalizado
      // de la conversación puede no estar actualizado).
      const { data: ultimoMsg } = await supabase
        .from("mensajes")
        .select("contenido, tipo, created_at")
        .eq("conversacion_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      const previewMsg = ultimoMsg
        ? ultimoMsg.tipo === "imagen"
          ? "📷 Imagen"
          : ultimoMsg.tipo === "archivo"
            ? "📎 Archivo"
            : ultimoMsg.contenido
        : conv.ultimo_mensaje

      return {
        ...conv,
        ultimo_mensaje: previewMsg ?? conv.ultimo_mensaje,
        fecha_ultimo_mensaje: ultimoMsg?.created_at ?? conv.fecha_ultimo_mensaje,
        participante1: p1,
        participante2: p2,
        participante_otro: otherProfile,
        otro_profesional: otroProfesional || null,
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
  if (!supabase) return { error: "Base de datos no disponible", data: [] }

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

  const otroUsuarioId = conv.participante_1 === user.id ? conv.participante_2 : conv.participante_1
  const { data: bloqueada } = await supabase.rpc("interaccion_bloqueada_con", { p_otro: otroUsuarioId })
  if (bloqueada) return { error: "La conversación está bloqueada.", data: [] }

  const { data: mensajes, error } = await supabase
    .from("mensajes")
    .select("*")
    .eq("conversacion_id", conversacionId)
    .order("created_at", { ascending: true })

  if (error) {
    return { error: error.message, data: [] }
  }

  // Mark messages as read
  await supabase
    .from("mensajes")
    .update({ leido: true })
    .eq("conversacion_id", conversacionId)
    .neq("remitente_id", user.id)

  return { data: mensajes }
}

export async function enviarMensaje(
  conversacionId: string,
  contenido: string,
  adjunto?: { tipo: "imagen" | "archivo"; url: string; nombre: string },
) {
  console.info(`[push] message_action_started conversation=${conversacionId.slice(0, 8)}`)
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "No autenticado" }
  }

  const errorModeracion = errorContenidoProhibido(contenido, adjunto?.nombre)
  if (errorModeracion) return { error: errorModeracion }

  // Verify user is part of this conversation
  const { data: conv } = await supabase
    .from("conversaciones")
    .select("participante_1, participante_2")
    .eq("id", conversacionId)
    .single()

  if (!conv || (conv.participante_1 !== user.id && conv.participante_2 !== user.id)) {
    return { error: "No tienes acceso a esta conversación" }
  }

  const otroUsuarioId = conv.participante_1 === user.id ? conv.participante_2 : conv.participante_1
  const { data: bloqueada } = await supabase.rpc("interaccion_bloqueada_con", { p_otro: otroUsuarioId })
  if (bloqueada) return { error: "No puedes enviar mensajes a este usuario." }

  const { data: mensaje, error } = await supabase
    .from("mensajes")
    .insert({
      conversacion_id: conversacionId,
      remitente_id: user.id,
      contenido,
      leido: false,
      tipo: adjunto ? adjunto.tipo : "texto",
      archivo_url: adjunto?.url ?? null,
      archivo_nombre: adjunto?.nombre ?? null,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update conversation's last message
  const preview = adjunto ? (adjunto.tipo === "imagen" ? "📷 Imagen" : "📎 Archivo") : contenido
  await supabase
    .from("conversaciones")
    .update({
      ultimo_mensaje: preview,
      fecha_ultimo_mensaje: new Date().toISOString(),
    })
    .eq("id", conversacionId)

  const { data: remitente } = await supabase
    .from("profiles")
    .select("nombre, apellido")
    .eq("id", user.id)
    .maybeSingle()
  const { data: destinatario } = await supabase
    .from("profiles")
    .select("es_admin")
    .eq("id", otroUsuarioId)
    .maybeSingle()
  const nombreRemitente = `${remitente?.nombre ?? ""} ${remitente?.apellido ?? ""}`.trim() || "Nuevo mensaje"
  const resultadoPush = await enviarPushAUsuario(otroUsuarioId, {
    titulo: nombreRemitente,
    cuerpo: preview.slice(0, 160),
    link: destinatario?.es_admin ? `/admin/mensajes?c=${conversacionId}` : `/mensajes?c=${conversacionId}`,
    conversacionId,
    tipo: "mensaje",
  })
  console.info(
    `[push] message_action_finished conversation=${conversacionId.slice(0, 8)} devices=${resultadoPush?.encontrados ?? 0} delivered=${resultadoPush?.enviados ?? 0}`,
  )

  revalidatePath("/mensajes")
  revalidatePath("/admin/mensajes")
  return { data: mensaje }
}

export async function crearConversacion(params: {
  otroUsuarioId: string
  solicitudId?: string
  trabajoId?: string
  mensajeInicial?: string
}) {
  if (!UUID_RE.test(params.otroUsuarioId)) return { error: "Usuario no válido" }
  if (params.solicitudId && !UUID_RE.test(params.solicitudId)) return { error: "Demanda no válida" }
  if (params.trabajoId && !UUID_RE.test(params.trabajoId)) return { error: "Trabajo no válido" }

  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "No autenticado" }
  }

  const errorModeracion = errorContenidoProhibido(params.mensajeInicial)
  if (errorModeracion) return { error: errorModeracion }

  // Nadie puede abrir un chat consigo mismo. Se comprueba aquí, en el servidor,
  // y no solo en los botones: la constraint UNIQUE (participante_1,
  // participante_2) no lo impide, y una conversación con uno mismo deja la
  // bandeja en un estado sin sentido (no hay "otra parte" que mostrar).
  if (params.otroUsuarioId === user.id) {
    return { error: "No puedes iniciar una conversación contigo mismo." }
  }

  const [{ data: perfilActual }, { data: otroPerfil, error: otroPerfilError }] = await Promise.all([
    supabase.from("profiles").select("es_admin").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("id, es_admin, cuenta_eliminada").eq("id", params.otroUsuarioId).maybeSingle(),
  ])
  if (otroPerfilError || !otroPerfil || otroPerfil.cuenta_eliminada) {
    return { error: "El usuario ya no está disponible." }
  }

  // Sin demanda ni trabajo, el contacto libre solo va hacia un profesional o
  // involucra a soporte. Un proveedor no puede saltarse el contexto de una
  // demanda para abrir un chat arbitrario con cualquier cliente.
  if (!params.solicitudId && !params.trabajoId && !perfilActual?.es_admin && !otroPerfil.es_admin) {
    const { data: destinatarioProfesional } = await supabase
      .from("profesionales")
      .select("id")
      .eq("id", params.otroUsuarioId)
      .maybeSingle()
    if (!destinatarioProfesional) {
      return { error: "Para escribir a un cliente, abre el chat desde una de sus demandas." }
    }
  }

  // El contexto no puede venir fiado del navegador: además de etiquetar el
  // chat, se usa para decidir quién es cliente y quién es proveedor. Validamos
  // que la solicitud o el trabajo pertenezcan realmente a estas dos personas.
  let solicitudIdValidada = params.solicitudId
  if (params.trabajoId) {
    const { data: trabajo, error: trabajoError } = await supabase
      .from("trabajos")
      .select("cliente_id, profesional_id, solicitud_id")
      .eq("id", params.trabajoId)
      .maybeSingle()

    if (trabajoError || !trabajo) return { error: "El trabajo ya no está disponible." }

    const participantesValidos =
      (trabajo.cliente_id === user.id && trabajo.profesional_id === params.otroUsuarioId) ||
      (trabajo.cliente_id === params.otroUsuarioId && trabajo.profesional_id === user.id)
    if (!participantesValidos) return { error: "Este trabajo no corresponde a la conversación." }
    if (params.solicitudId && trabajo.solicitud_id !== params.solicitudId) {
      return { error: "La demanda no corresponde a este trabajo." }
    }
    solicitudIdValidada = params.solicitudId ?? trabajo.solicitud_id ?? undefined
  } else if (params.solicitudId) {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select("cliente_id, estado")
      .eq("id", params.solicitudId)
      .maybeSingle()

    if (solicitudError || !solicitud) return { error: "La demanda ya no está disponible." }
    if (solicitud.estado !== "abierta") return { error: "Esta demanda ya no admite nuevos contactos." }
    if (solicitud.cliente_id !== user.id && solicitud.cliente_id !== params.otroUsuarioId) {
      return { error: "La demanda no corresponde a esta conversación." }
    }

    const proveedorId = solicitud.cliente_id === user.id ? params.otroUsuarioId : user.id
    const { data: proveedor } = await supabase
      .from("profesionales")
      .select("id")
      .eq("id", proveedorId)
      .maybeSingle()
    if (!proveedor) {
      return { error: "Para poder escribir desde una demanda, primero crea tu perfil profesional en Mi perfil." }
    }
  }

  const { data: bloqueada } = await supabase.rpc("interaccion_bloqueada_con", { p_otro: params.otroUsuarioId })
  if (bloqueada) return { error: "No puedes iniciar una conversación con este usuario." }

  // Reutilizar cualquier conversación existente entre ambos usuarios (en
  // cualquier dirección). Existe una constraint UNIQUE (participante_1,
  // participante_2), así que no debemos crear duplicados.
  const { data: existingConv } = await supabase
    .from("conversaciones")
    .select("id, solicitud_id, trabajo_id")
    .or(
      `and(participante_1.eq.${user.id},participante_2.eq.${params.otroUsuarioId}),and(participante_1.eq.${params.otroUsuarioId},participante_2.eq.${user.id})`,
    )
    .limit(1)
    .maybeSingle()

  if (existingConv) {
    // Una pareja conserva un único chat. Al abrirlo desde una demanda o trabajo
    // actualizamos su contexto mediante una RPC acotada: la tabla no concede
    // UPDATE general a los participantes para evitar que puedan alterar a la
    // otra parte o asociar proyectos ajenos.
    if (solicitudIdValidada || params.trabajoId) {
      const { data: vinculada, error: vinculoError } = await supabase.rpc("vincular_contexto_conversacion", {
        p_conversacion_id: existingConv.id,
        p_solicitud_id: solicitudIdValidada ?? null,
        p_trabajo_id: params.trabajoId ?? null,
      })
      if (vinculoError) return { error: "No se pudo vincular el chat con esta demanda." }
      const conversacionVinculada = Array.isArray(vinculada) ? vinculada[0] : vinculada
      if (conversacionVinculada) return { data: conversacionVinculada }
    }
    return { data: existingConv }
  }

  // Orden canónico: dos aperturas simultáneas (A→B y B→A) intentan insertar
  // la misma pareja y la restricción UNIQUE puede resolver la carrera.
  const [participante1, participante2] = [user.id, params.otroUsuarioId].sort()

  // Create new conversation
  const { data: conv, error } = await supabase
    .from("conversaciones")
    .insert({
      participante_1: participante1,
      participante_2: participante2,
      solicitud_id: solicitudIdValidada,
      trabajo_id: params.trabajoId,
      ultimo_mensaje: params.mensajeInicial,
      fecha_ultimo_mensaje: params.mensajeInicial ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error) {
    // Otra petición pudo crear la misma conversación después de nuestra
    // consulta. En ese caso devolvemos esa conversación en vez de mostrar un
    // error de clave duplicada.
    if (error.code === "23505") {
      const { data: creadaEnParalelo } = await supabase
        .from("conversaciones")
        .select("id, solicitud_id, trabajo_id")
        .or(
          `and(participante_1.eq.${user.id},participante_2.eq.${params.otroUsuarioId}),and(participante_1.eq.${params.otroUsuarioId},participante_2.eq.${user.id})`,
        )
        .limit(1)
        .maybeSingle()
      if (creadaEnParalelo) {
        if (solicitudIdValidada || params.trabajoId) {
          const { data: vinculada, error: vinculoError } = await supabase.rpc("vincular_contexto_conversacion", {
            p_conversacion_id: creadaEnParalelo.id,
            p_solicitud_id: solicitudIdValidada ?? null,
            p_trabajo_id: params.trabajoId ?? null,
          })
          if (vinculoError) return { error: "No se pudo vincular el chat con esta demanda." }
          const conversacionVinculada = Array.isArray(vinculada) ? vinculada[0] : vinculada
          if (conversacionVinculada) return { data: conversacionVinculada }
        }
        return { data: creadaEnParalelo }
      }
    }
    return { error: error.message }
  }

  // Send initial message if provided
  if (params.mensajeInicial) {
    await supabase.from("mensajes").insert({
      conversacion_id: conv.id,
      remitente_id: user.id,
      contenido: params.mensajeInicial,
      leido: false,
    })

    const { data: remitente } = await supabase
      .from("profiles")
      .select("nombre, apellido")
      .eq("id", user.id)
      .maybeSingle()
    const { data: destinatario } = await supabase
      .from("profiles")
      .select("es_admin")
      .eq("id", params.otroUsuarioId)
      .maybeSingle()
    await enviarPushAUsuario(params.otroUsuarioId, {
      titulo: `${remitente?.nombre ?? ""} ${remitente?.apellido ?? ""}`.trim() || "Nuevo mensaje",
      cuerpo: params.mensajeInicial.slice(0, 160),
      link: destinatario?.es_admin ? `/admin/mensajes?c=${conv.id}` : `/mensajes?c=${conv.id}`,
      conversacionId: conv.id,
      tipo: "mensaje",
    })
  }

  revalidatePath("/mensajes")
  revalidatePath("/admin/mensajes")
  return { data: conv }
}

export async function crearConversacionAdmin(otroUsuarioId: string) {
  if (!UUID_RE.test(otroUsuarioId)) return { error: "Usuario no válido" }

  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "No autenticado" }
  if (otroUsuarioId === user.id) return { error: "No puedes iniciar una conversación contigo mismo." }

  const [{ data: perfilAdmin }, { data: destinatario, error: errorDestinatario }] = await Promise.all([
    supabase.from("profiles").select("es_admin").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("id, cuenta_eliminada").eq("id", otroUsuarioId).maybeSingle(),
  ])

  if (!perfilAdmin?.es_admin) return { error: "No tienes permiso para iniciar conversaciones administrativas" }
  if (errorDestinatario) return { error: errorDestinatario.message }
  if (!destinatario || destinatario.cuenta_eliminada) return { error: "El usuario ya no está disponible" }

  // El núcleo normal conserva la moderación, los bloqueos y la comprobación
  // de pertenencia. La diferencia es que aquí el rol admin ya está verificado
  // en el servidor y no se exige solicitud o trabajo previo.
  const resultado = await crearConversacion({ otroUsuarioId })
  if (resultado.error || !resultado.data) return resultado

  revalidatePath("/admin/mensajes")
  return { data: { id: resultado.data.id } }
}

export async function crearConversacionSoporte() {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "No autenticado" }

  // Reparto estable entre los administradores disponibles: una misma persona
  // vuelve siempre al mismo perfil de soporte y `crearConversacion` reutiliza
  // el chat existente en lugar de abrir duplicados.
  const { data: admins, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("es_admin", true)
    .neq("id", user.id)
    .order("id")

  if (error) return { error: "No se pudo localizar al equipo de soporte." }
  if (!admins?.length) return { error: "No hay ningún perfil de soporte disponible." }

  const semilla = user.id.replaceAll("-", "").split("").reduce((total, caracter) => total + caracter.charCodeAt(0), 0)
  const admin = admins[semilla % admins.length]
  return crearConversacion({ otroUsuarioId: admin.id })
}

export async function vincularConversacionATrabajo(conversacionId: string, trabajoId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "No autenticado" }
  }

  const { error } = await supabase.rpc("vincular_contexto_conversacion", {
    p_conversacion_id: conversacionId,
    p_solicitud_id: null,
    p_trabajo_id: trabajoId,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/mensajes")
  return { success: true }
}
