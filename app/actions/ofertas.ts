"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function crearOferta(formData: {
  solicitud_id: string
  precio: number
  tiempo_estimado: number
  unidad_tiempo: string
  descripcion: string
  materiales_incluidos?: string
  condiciones_pago?: string
  notas?: string
  archivos?: any[]
  // El profesional debe aceptar explícitamente los gastos de servicio de la
  // plataforma en CADA oferta que envía.
  acepta_gastos?: boolean
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado. Por favor inicia sesión." }
  }

  const { data: profesional } = await supabase.from("profesionales").select("id").eq("id", user.id).single()

  if (!profesional) {
    return { error: "Debes crear un perfil profesional antes de enviar ofertas. Ve a 'Mi Perfil' para configurarlo." }
  }

  // Importes y tiempos siempre positivos.
  if (!Number.isFinite(formData.precio) || formData.precio <= 0) {
    return { error: "El precio propuesto debe ser mayor que 0." }
  }
  if (!Number.isFinite(formData.tiempo_estimado) || formData.tiempo_estimado <= 0) {
    return { error: "El tiempo estimado debe ser mayor que 0." }
  }
  if (!formData.acepta_gastos) {
    return { error: "Debes aceptar los gastos de servicio de la plataforma para enviar la oferta." }
  }

  // Check if already sent an offer for this solicitud
  const { data: existingOffer } = await supabase
    .from("ofertas")
    .select("id, estado")
    .eq("solicitud_id", formData.solicitud_id)
    .eq("profesional_id", user.id)
    .maybeSingle()

  if (existingOffer && !["retirada", "rechazada"].includes(existingOffer.estado)) {
    return { error: "Ya has enviado una oferta para esta solicitud." }
  }
  // Una oferta previa retirada o rechazada (p. ej. tras cancelar el trabajo de
  // mutuo acuerdo) no bloquea: se elimina y se envía la nueva en su lugar.
  if (existingOffer) {
    await supabase.from("ofertas").delete().eq("id", existingOffer.id).eq("profesional_id", user.id)
  }

  const { data, error } = await supabase
    .from("ofertas")
    .insert({
      profesional_id: user.id,
      solicitud_id: formData.solicitud_id,
      precio: formData.precio,
      tiempo_estimado: formData.tiempo_estimado,
      unidad_tiempo: formData.unidad_tiempo,
      descripcion: formData.descripcion,
      materiales_incluidos: formData.materiales_incluidos,
      condiciones_pago: formData.condiciones_pago,
      notas: formData.notas,
      archivos: formData.archivos || [],
      estado: "pendiente",
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update total_ofertas in solicitud
  await supabase.rpc("increment_total_ofertas", { solicitud_uuid: formData.solicitud_id })

  // Notificar al cliente dueño de la demanda.
  const { data: solicitud } = await supabase
    .from("solicitudes")
    .select("cliente_id, titulo")
    .eq("id", formData.solicitud_id)
    .maybeSingle()
  if (solicitud?.cliente_id) {
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: solicitud.cliente_id,
      tipo: "oferta_nueva",
      titulo: "Nueva oferta en tu demanda",
      mensaje: `Has recibido una oferta en "${solicitud.titulo}".`,
      link: "/mis-solicitudes",
    })
  }

  revalidatePath("/demandas")
  revalidatePath("/mis-solicitudes")
  return { data }
}

export async function obtenerMisOfertas() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("ofertas")
    .select(`
      *,
      solicitud:solicitudes(
        id,
        titulo,
        ubicacion,
        estado,
        presupuesto_min,
        presupuesto_max
      )
    `)
    .eq("profesional_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  // Get client info for each solicitud
  const dataWithClientes = await Promise.all(
    data.map(async (oferta: any) => {
      if (oferta.solicitud) {
        const { data: solicitudFull } = await supabase
          .from("solicitudes")
          .select("cliente_id")
          .eq("id", oferta.solicitud.id)
          .single()

        if (solicitudFull) {
          const { data: cliente } = await supabase
            .from("profiles")
            .select("nombre, apellido, foto_perfil")
            .eq("id", solicitudFull.cliente_id)
            .single()

          return {
            ...oferta,
            solicitud: {
              ...oferta.solicitud,
              cliente,
              cliente_id: solicitudFull.cliente_id,
            },
          }
        }
      }
      return oferta
    }),
  )

  return { data: dataWithClientes }
}

export async function obtenerOfertasPorProfesional() {
  return obtenerMisOfertas()
}

export async function actualizarOferta(
  ofertaId: string,
  campos: { precio?: number; tiempo_estimado?: number; unidad_tiempo?: string; descripcion?: string },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  // Solo el profesional dueño y mientras la oferta no esté aceptada.
  const { data: oferta } = await supabase
    .from("ofertas")
    .select("profesional_id, estado, solicitud_id")
    .eq("id", ofertaId)
    .maybeSingle()

  if (!oferta || oferta.profesional_id !== user.id) {
    return { error: "No tienes permiso para editar esta oferta." }
  }
  if (oferta.estado === "aceptada") {
    return { error: "No puedes editar una oferta que ya ha sido aceptada." }
  }
  if (campos.precio != null && (!Number.isFinite(campos.precio) || campos.precio <= 0)) {
    return { error: "El precio propuesto debe ser mayor que 0." }
  }
  if (campos.tiempo_estimado != null && (!Number.isFinite(campos.tiempo_estimado) || campos.tiempo_estimado <= 0)) {
    return { error: "El tiempo estimado debe ser mayor que 0." }
  }

  const { data, error } = await supabase
    .from("ofertas")
    .update({
      precio: campos.precio,
      tiempo_estimado: campos.tiempo_estimado,
      unidad_tiempo: campos.unidad_tiempo,
      descripcion: campos.descripcion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ofertaId)
    .eq("profesional_id", user.id)
    .select()
    .single()

  if (error) return { error: error.message }

  // Avisar al cliente dueño de la demanda de que la oferta ha cambiado.
  if (oferta.solicitud_id) {
    const { data: solicitud } = await supabase
      .from("solicitudes")
      .select("cliente_id, titulo")
      .eq("id", oferta.solicitud_id)
      .maybeSingle()
    if (solicitud?.cliente_id) {
      const { crearNotificacion } = await import("./notificaciones")
      await crearNotificacion({
        usuarioId: solicitud.cliente_id,
        tipo: "oferta_actualizada",
        titulo: "Una oferta ha sido actualizada",
        mensaje: `El profesional ha modificado su oferta en "${solicitud.titulo}"${
          campos.precio != null ? ` (nuevo precio: ${campos.precio}€)` : ""
        }. Revísala en Mis Demandas.`,
        link: "/mis-solicitudes",
      })
    }
  }

  revalidatePath("/mis-trabajos")
  revalidatePath("/demandas")
  return { data }
}

export async function eliminarOferta(ofertaId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: oferta } = await supabase
    .from("ofertas")
    .select("profesional_id, estado, solicitud_id")
    .eq("id", ofertaId)
    .maybeSingle()

  if (!oferta || oferta.profesional_id !== user.id) {
    return { error: "No tienes permiso para eliminar esta oferta." }
  }
  if (oferta.estado === "aceptada") {
    return { error: "No puedes eliminar una oferta que ya ha sido aceptada." }
  }

  const { error } = await supabase.from("ofertas").delete().eq("id", ofertaId).eq("profesional_id", user.id)
  if (error) return { error: error.message }

  revalidatePath("/mis-trabajos")
  revalidatePath("/demandas")
  return { success: true }
}

export async function aceptarOferta(ofertaId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Get oferta details
  const { data: oferta, error: ofertaError } = await supabase
    .from("ofertas")
    .select("*, solicitud:solicitudes(*)")
    .eq("id", ofertaId)
    .single()

  if (ofertaError || !oferta) {
    return { error: "Oferta no encontrada" }
  }

  // Verify user is the client of this solicitud
  if (oferta.solicitud.cliente_id !== user.id) {
    return { error: "No tienes permiso para aceptar esta oferta" }
  }

  // Import and call crearTrabajo
  const { crearTrabajo } = await import("./trabajos")
  const trabajoResult = await crearTrabajo({
    oferta_id: ofertaId,
    solicitud_id: oferta.solicitud_id,
    profesional_id: oferta.profesional_id,
  })

  if (trabajoResult.error) {
    return { error: trabajoResult.error }
  }

  // Notificar al profesional que su oferta ha sido aceptada.
  const { crearNotificacion } = await import("./notificaciones")
  await crearNotificacion({
    usuarioId: oferta.profesional_id,
    tipo: "oferta_aceptada",
    titulo: "Han aceptado tu oferta",
    mensaje: `Tu oferta para "${oferta.solicitud?.titulo ?? "una demanda"}" ha sido aceptada. Revisa el trabajo en Gestión de proyectos.`,
    link: "/mis-trabajos",
  })

  return { data: trabajoResult.data }
}

export async function rechazarOferta(ofertaId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data: oferta } = await supabase
    .from("ofertas")
    .select("estado, profesional_id, solicitud_id")
    .eq("id", ofertaId)
    .maybeSingle()

  if (!oferta) {
    return { error: "Oferta no encontrada." }
  }

  const { data: solicitud } = await supabase
    .from("solicitudes")
    .select("cliente_id, titulo")
    .eq("id", oferta.solicitud_id)
    .maybeSingle()

  // Solo el cliente dueño de la demanda puede rechazar la oferta.
  if (!solicitud || solicitud.cliente_id !== user.id) {
    return { error: "No tienes permiso para rechazar esta oferta." }
  }
  if (["aceptada", "rechazada", "retirada"].includes(oferta.estado)) {
    return { error: "Esta oferta ya no está pendiente de respuesta." }
  }

  const { error } = await supabase
    .from("ofertas")
    .update({ estado: "rechazada", updated_at: new Date().toISOString() })
    .eq("id", ofertaId)

  if (error) {
    return { error: error.message }
  }

  const { crearNotificacion } = await import("./notificaciones")
  await crearNotificacion({
    usuarioId: oferta.profesional_id,
    tipo: "oferta_rechazada",
    titulo: "Han rechazado tu oferta",
    mensaje: `Tu oferta para "${solicitud.titulo}" ha sido rechazada.`,
    link: "/mis-ofertas",
  })

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-ofertas")
  return { success: true }
}

export async function actualizarEstadoOferta(ofertaId: string, estado: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("ofertas")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", ofertaId)
    .eq("profesional_id", user.id)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/mis-solicitudes")
  return { data }
}

export async function obtenerOfertasPorSolicitud(solicitudId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("ofertas")
    .select("*")
    .eq("solicitud_id", solicitudId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  // Get professional info for each oferta
  const dataWithProfesionales = await Promise.all(
    data.map(async (oferta: any) => {
      const { data: profesional } = await supabase
        .from("profesionales")
        .select("id, titulo, tarifa_por_hora, rating_promedio, total_reseñas")
        .eq("id", oferta.profesional_id)
        .single()

      const { data: profile } = await supabase
        .from("profiles")
        .select("nombre, apellido, foto_perfil, ubicacion")
        .eq("id", oferta.profesional_id)
        .single()

      return {
        ...oferta,
        profesional: profesional
          ? {
              ...profesional,
              profiles: profile,
            }
          : null,
      }
    }),
  )

  return { data: dataWithProfesionales }
}
