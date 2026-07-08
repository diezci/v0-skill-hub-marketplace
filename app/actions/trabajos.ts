"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function crearTrabajo(data: {
  oferta_id: string
  solicitud_id: string
  profesional_id: string
  fecha_estimada_fin?: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data: oferta } = await supabase
    .from("ofertas")
    .select("precio, descripcion, tiempo_estimado, unidad_tiempo")
    .eq("id", data.oferta_id)
    .single()

  const { data: solicitud } = await supabase
    .from("solicitudes")
    .select("titulo, ubicacion")
    .eq("id", data.solicitud_id)
    .single()

  // Calculate estimated end date based on offer
  let fechaEstimadaFin = data.fecha_estimada_fin
  if (!fechaEstimadaFin && oferta?.tiempo_estimado) {
    const diasEstimados = oferta.unidad_tiempo === "semanas" 
      ? oferta.tiempo_estimado * 7 
      : oferta.unidad_tiempo === "meses" 
        ? oferta.tiempo_estimado * 30 
        : oferta.tiempo_estimado
    const fecha = new Date()
    fecha.setDate(fecha.getDate() + diasEstimados)
    fechaEstimadaFin = fecha.toISOString()
  }

  const { data: trabajo, error } = await supabase
    .from("trabajos")
    .insert({
      cliente_id: user.id,
      profesional_id: data.profesional_id,
      solicitud_id: data.solicitud_id,
      oferta_id: data.oferta_id,
      titulo: solicitud?.titulo || "Proyecto",
      descripcion: oferta?.descripcion || "",
      ubicacion: solicitud?.ubicacion || "",
      precio_acordado: oferta?.precio || 0,
      estado: "pendiente_pago",
      fecha_inicio: new Date().toISOString(),
      fecha_estimada_fin: fechaEstimadaFin,
      progreso: 0,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update solicitud status (valor válido para la constraint: en_progreso)
  await supabase.from("solicitudes").update({ estado: "en_progreso" }).eq("id", data.solicitud_id)

  // Update oferta status
  await supabase.from("ofertas").update({ estado: "aceptada" }).eq("id", data.oferta_id)

  // Reject other ofertas for this solicitud
  await supabase
    .from("ofertas")
    .update({ estado: "rechazada" })
    .eq("solicitud_id", data.solicitud_id)
    .neq("id", data.oferta_id)

  revalidatePath("/mis-solicitudes")
  return { data: trabajo }
}

export async function obtenerMisTrabajos() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .select(`
      *,
      solicitud:solicitudes(titulo, descripcion, urgencia),
      oferta:ofertas(precio, tiempo_estimado, unidad_tiempo)
    `)
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  // Get client and professional profiles separately
  const dataWithProfiles = await Promise.all(
    data.map(async (trabajo: any) => {
      const { data: cliente } = await supabase
        .from("profiles")
        .select("nombre, apellido, foto_perfil")
        .eq("id", trabajo.cliente_id)
        .single()

      const { data: profesional } = await supabase
        .from("profiles")
        .select("nombre, apellido, foto_perfil")
        .eq("id", trabajo.profesional_id)
        .single()

      const { data: escrow } = await supabase
        .from("transacciones_escrow")
        .select("*")
        .eq("trabajo_id", trabajo.id)
        .single()

      return {
        ...trabajo,
        cliente,
        profesional,
        transaccion_escrow: escrow,
      }
    }),
  )

  return { data: dataWithProfiles }
}

export async function actualizarEstadoTrabajo(trabajoId: string, estado: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", trabajoId)
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // If completed, update solicitud
  if (estado === "completado") {
    await supabase.from("solicitudes").update({ estado: "completada" }).eq("id", data.solicitud_id)
  }

  revalidatePath("/mis-solicitudes")
  return { data }
}

export async function cancelarTrabajo(trabajoId: string, razon: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .update({
      estado: "cancelado",
      fecha_fin: new Date().toISOString(),
    })
    .eq("id", trabajoId)
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update solicitud back to abierta
  await supabase.from("solicitudes").update({ estado: "abierta" }).eq("id", data.solicitud_id)

  revalidatePath("/mis-solicitudes")
  return { data }
}

// Publica un mensaje automático en el chat del trabajo (entre cliente y proveedor),
// creando la conversación si aún no existe. El remitente es el usuario actual.
async function postMensajeTrabajo(supabase: any, userId: string, trabajo: any, contenido: string) {
  const otroId = trabajo.cliente_id === userId ? trabajo.profesional_id : trabajo.cliente_id
  if (!otroId) return

  let { data: conv } = await supabase
    .from("conversaciones")
    .select("id")
    .or(
      `and(participante_1.eq.${userId},participante_2.eq.${otroId}),and(participante_1.eq.${otroId},participante_2.eq.${userId})`,
    )
    .limit(1)
    .maybeSingle()

  if (!conv) {
    const { data: nueva } = await supabase
      .from("conversaciones")
      .insert({ participante_1: userId, participante_2: otroId, trabajo_id: trabajo.id })
      .select("id")
      .single()
    conv = nueva
  }
  if (!conv) return

  await supabase.from("mensajes").insert({
    conversacion_id: conv.id,
    remitente_id: userId,
    contenido,
    leido: false,
  })
  await supabase
    .from("conversaciones")
    .update({ ultimo_mensaje: contenido, fecha_ultimo_mensaje: new Date().toISOString() })
    .eq("id", conv.id)
}

// Solicita la cancelación de mutuo acuerdo (solo en 'pendiente_pago', sin dinero
// en escrow). La otra parte deberá aceptarla o rechazarla.
export async function solicitarCancelacion(trabajoId: string, razon: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("id, cliente_id, profesional_id, estado, cancelacion_estado, titulo")
    .eq("id", trabajoId)
    .maybeSingle()

  if (!trabajo || (trabajo.cliente_id !== user.id && trabajo.profesional_id !== user.id)) {
    return { error: "No tienes permiso sobre este trabajo" }
  }
  if (trabajo.estado !== "pendiente_pago") {
    return { error: "Solo puedes cancelar de mutuo acuerdo un trabajo que aún no se ha pagado." }
  }
  if (trabajo.cancelacion_estado === "pendiente") {
    return { error: "Ya hay una solicitud de cancelación pendiente para este trabajo." }
  }

  const { error } = await supabase
    .from("trabajos")
    .update({
      cancelacion_solicitada_por: user.id,
      cancelacion_razon: razon?.trim() || null,
      cancelacion_estado: "pendiente",
      updated_at: new Date().toISOString(),
    })
    .eq("id", trabajoId)
  if (error) return { error: error.message }

  await postMensajeTrabajo(
    supabase,
    user.id,
    trabajo,
    `🚫 Ha solicitado cancelar el trabajo "${trabajo.titulo}".${razon?.trim() ? ` Motivo: ${razon.trim()}` : ""} La otra parte puede aceptar o rechazar la cancelación desde la ficha del trabajo.`,
  )

  // Notificar a la otra parte para que acepte o rechace.
  {
    const otroId = trabajo.cliente_id === user.id ? trabajo.profesional_id : trabajo.cliente_id
    const otroEsCliente = otroId === trabajo.cliente_id
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: otroId,
      tipo: "cancelacion_solicitada",
      titulo: "Solicitud de cancelación",
      mensaje: `La otra parte quiere cancelar "${trabajo.titulo}". Acepta o rechaza la cancelación desde la ficha del trabajo.`,
      link: otroEsCliente ? "/mis-solicitudes" : "/mis-trabajos",
    })
  }

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-trabajos")
  revalidatePath("/mensajes")
  return { data: { ok: true } }
}

// Responde a una solicitud de cancelación: la OTRA parte acepta (trabajo cancelado)
// o rechaza (queda 'rechazada' y el solicitante podrá abrir disputa).
export async function responderCancelacion(trabajoId: string, aceptar: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select(
      "id, cliente_id, profesional_id, estado, cancelacion_estado, cancelacion_solicitada_por, solicitud_id, titulo",
    )
    .eq("id", trabajoId)
    .maybeSingle()

  if (!trabajo || (trabajo.cliente_id !== user.id && trabajo.profesional_id !== user.id)) {
    return { error: "No tienes permiso sobre este trabajo" }
  }
  if (trabajo.cancelacion_estado !== "pendiente") {
    return { error: "No hay ninguna solicitud de cancelación pendiente." }
  }
  if (trabajo.cancelacion_solicitada_por === user.id) {
    return { error: "Tú solicitaste la cancelación; debe responder la otra parte." }
  }

  if (aceptar) {
    const { error } = await supabase
      .from("trabajos")
      .update({
        estado: "cancelado",
        cancelacion_estado: null,
        fecha_fin: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", trabajoId)
    if (error) return { error: error.message }
    if (trabajo.solicitud_id) {
      await supabase.from("solicitudes").update({ estado: "abierta" }).eq("id", trabajo.solicitud_id)
    }
    await postMensajeTrabajo(
      supabase,
      user.id,
      trabajo,
      `✅ Ha aceptado la cancelación. El trabajo "${trabajo.titulo}" queda cancelado.`,
    )
  } else {
    const { error } = await supabase
      .from("trabajos")
      .update({ cancelacion_estado: "rechazada", updated_at: new Date().toISOString() })
      .eq("id", trabajoId)
    if (error) return { error: error.message }
    await postMensajeTrabajo(
      supabase,
      user.id,
      trabajo,
      `❌ Ha rechazado la cancelación del trabajo "${trabajo.titulo}". Si no hay acuerdo, la otra parte puede abrir una disputa.`,
    )
  }

  // Notificar al solicitante el resultado de su petición de cancelación.
  {
    const solicitanteEsCliente = trabajo.cancelacion_solicitada_por === trabajo.cliente_id
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: trabajo.cancelacion_solicitada_por,
      tipo: aceptar ? "cancelacion_aceptada" : "cancelacion_rechazada",
      titulo: aceptar ? "Cancelación aceptada" : "Cancelación rechazada",
      mensaje: aceptar
        ? `La otra parte ha aceptado cancelar "${trabajo.titulo}". El trabajo queda cancelado.`
        : `La otra parte ha rechazado cancelar "${trabajo.titulo}". Si no hay acuerdo, puedes abrir una disputa desde la ficha del trabajo.`,
      link: solicitanteEsCliente ? "/mis-solicitudes" : "/mis-trabajos",
    })
  }

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-trabajos")
  revalidatePath("/mensajes")
  return { data: { ok: true } }
}

// Provider updates progress percentage
export async function actualizarProgresoTrabajo(trabajoId: string, progreso: number, mensaje?: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Verify user is the professional
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("profesional_id, cliente_id")
    .eq("id", trabajoId)
    .single()

  if (!trabajo || trabajo.profesional_id !== user.id) {
    return { error: "No tienes permiso para actualizar este trabajo" }
  }

  const updates: any = {
    progreso: Math.min(100, Math.max(0, progreso)),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("trabajos")
    .update(updates)
    .eq("id", trabajoId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Create progress update record if message provided
  if (mensaje) {
    await supabase.from("actualizaciones_trabajo").insert({
      trabajo_id: trabajoId,
      usuario_id: user.id,
      tipo: "progreso",
      mensaje,
      progreso,
    })
  }

  // Avisar al cliente del avance.
  if (trabajo.cliente_id) {
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: trabajo.cliente_id,
      tipo: "progreso_trabajo",
      titulo: `Progreso actualizado: ${Math.min(100, Math.max(0, progreso))}%`,
      mensaje: mensaje || `El profesional ha actualizado el progreso de "${data?.titulo ?? "tu trabajo"}".`,
      link: "/mis-solicitudes",
    })
  }

  revalidatePath("/mis-solicitudes")
  return { data }
}

// Provider marks work as completed/delivered
export async function marcarTrabajoEntregado(trabajoId: string, mensaje?: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Verify user is the professional
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("profesional_id, cliente_id, titulo")
    .eq("id", trabajoId)
    .single()

  if (!trabajo || trabajo.profesional_id !== user.id) {
    return { error: "No tienes permiso para actualizar este trabajo" }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .update({
      estado: "entregado",
      progreso: 100,
      fecha_entrega: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", trabajoId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Create delivery update record
  await supabase.from("actualizaciones_trabajo").insert({
    trabajo_id: trabajoId,
    usuario_id: user.id,
    tipo: "entrega",
    mensaje: mensaje || "El trabajo ha sido entregado y está pendiente de confirmación del cliente.",
    progreso: 100,
  })

  // Avisar al cliente: debe revisar y confirmar (o rechazar) la entrega.
  if (trabajo.cliente_id) {
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: trabajo.cliente_id,
      tipo: "trabajo_entregado",
      titulo: "Trabajo entregado",
      mensaje: `El profesional ha entregado "${trabajo.titulo ?? "tu trabajo"}". Revísalo y confirma la finalización para liberar el pago.`,
      link: "/mis-solicitudes",
    })
  }

  revalidatePath("/mis-solicitudes")
  return { data }
}

// Client confirms work completion and releases payment
export async function confirmarTrabajoCompletado(trabajoId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Verify user is the client
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("cliente_id, estado")
    .eq("id", trabajoId)
    .single()

  if (!trabajo || trabajo.cliente_id !== user.id) {
    return { error: "No tienes permiso para confirmar este trabajo" }
  }

  if (trabajo.estado !== "entregado") {
    return { error: "El trabajo debe estar entregado para poder confirmarlo" }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .update({
      estado: "completado",
      fecha_fin: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", trabajoId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update solicitud
  await supabase.from("solicitudes").update({ estado: "completada" }).eq("id", data.solicitud_id)

  // Create confirmation record
  await supabase.from("actualizaciones_trabajo").insert({
    trabajo_id: trabajoId,
    usuario_id: user.id,
    tipo: "confirmacion",
    mensaje: "El cliente ha confirmado la finalización del trabajo.",
    progreso: 100,
  })

  revalidatePath("/mis-solicitudes")
  return { data }
}

// Get work updates/progress history
export async function obtenerActualizacionesTrabajo(trabajoId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("actualizaciones_trabajo")
    .select("*")
    .eq("trabajo_id", trabajoId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}
