"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { errorContenidoProhibido } from "@/lib/moderacion"

// NOTA SOBRE `solicitudes.total_ofertas`: aquí no se toca, a propósito.
//
// Esta acción la ejecuta el PROFESIONAL, y la RLS de `solicitudes` solo deja
// escribir al dueño de la demanda, así que desde aquí es imposible mantener el
// contador (probado: el update se acepta sin error y no cambia nada). Antes
// había una llamada a `increment_total_ofertas`, una función que ni siquiera
// existe en la base de datos, con el error ignorado; por eso el contador
// llevaba desfasado desde el principio.
//
// El número se calcula al leer, con la RPC `contar_ofertas_por_solicitud`
// (ver obtenerSolicitudesAbiertas y scripts/047).

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
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado. Por favor inicia sesión." }
  }

  const errorModeracion = errorContenidoProhibido(
    formData.descripcion,
    formData.materiales_incluidos,
    formData.condiciones_pago,
    formData.notas,
  )
  if (errorModeracion) return { error: errorModeracion }

  const { data: profesional } = await supabase.from("profesionales").select("id").eq("id", user.id).single()

  if (!profesional) {
    return { error: "Debes crear un perfil profesional antes de enviar ofertas. Ve a 'Mi Perfil' para configurarlo." }
  }

  // No se puja por la propia demanda: acabarías siendo cliente y profesional
  // del mismo trabajo, con el escrow pagándote a ti mismo. Se comprueba en el
  // servidor porque ocultar el botón no basta.
  const { data: solicitudDeLaOferta, error: solicitudError } = await supabase
    .from("solicitudes")
    .select("cliente_id, estado")
    .eq("id", formData.solicitud_id)
    .maybeSingle()

  if (solicitudError || !solicitudDeLaOferta) {
    return { error: "La demanda ya no está disponible." }
  }
  if (solicitudDeLaOferta?.cliente_id === user.id) {
    return { error: "No puedes enviar una oferta a tu propia demanda." }
  }
  if (solicitudDeLaOferta.estado !== "abierta") {
    return { error: "Esta demanda ya no admite nuevas ofertas." }
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

  // Puede haber ofertas históricas del mismo profesional para esta demanda. La
  // consulta anterior usaba maybeSingle(), por lo que dejaba de funcionar en
  // cuanto había más de una, y además intentaba borrar la rechazada ignorando
  // el posible error de RLS. Solo una oferta viva debe bloquear una nueva puja.
  const { data: existingOffers, error: existingOffersError } = await supabase
    .from("ofertas")
    .select("id, estado")
    .eq("solicitud_id", formData.solicitud_id)
    .eq("profesional_id", user.id)
    .order("updated_at", { ascending: false })

  if (existingOffersError) return { error: existingOffersError.message }

  const ofertasCerradas = (existingOffers || []).filter((oferta: any) =>
    ["retirada", "rechazada"].includes(oferta.estado),
  )
  const existingActiveOffer = (existingOffers || []).find(
    (oferta: any) => !["retirada", "rechazada"].includes(oferta.estado),
  )

  if (existingActiveOffer) {
    return { error: "Ya has enviado una oferta para esta solicitud." }
  }

  // Si la oferta llegó a generar un trabajo, incluso uno cancelado, se conserva
  // como parte de su historial contractual. Una rechazada directamente por el
  // cliente no tiene trabajo y sí se puede reutilizar sin depender de DELETE.
  let ofertaReutilizable: { id: string; estado: string } | undefined = ofertasCerradas[0]
  if (ofertasCerradas.length > 0) {
    const { data: trabajosDeOfertas, error: trabajosError } = await supabase
      .from("trabajos")
      .select("oferta_id")
      .in(
        "oferta_id",
        ofertasCerradas.map((oferta: any) => oferta.id),
      )

    if (trabajosError) return { error: trabajosError.message }

    const ofertasConTrabajo = new Set((trabajosDeOfertas || []).map((trabajo: any) => trabajo.oferta_id))
    ofertaReutilizable = ofertasCerradas.find((oferta: any) => !ofertasConTrabajo.has(oferta.id))
  }

  const ahora = new Date().toISOString()
  const camposOferta = {
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
  }

  const resultado = ofertaReutilizable
    ? await supabase
        .from("ofertas")
        .update({ ...camposOferta, created_at: ahora, updated_at: ahora })
        .eq("id", ofertaReutilizable.id)
        .eq("profesional_id", user.id)
        .in("estado", ["retirada", "rechazada"])
        .select()
        .single()
    : await supabase.from("ofertas").insert(camposOferta).select().single()

  const { data, error } = resultado

  if (error) {
    return { error: error.message }
  }


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
  revalidatePath("/mis-ofertas")
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

  // La solicitud completa: Mis Pujas debe poder enseñar la publicación entera
  // de la demanda por la que se puja (descripción, urgencia, adjuntos...).
  const { data, error } = await supabase
    .from("ofertas")
    .select(`
      *,
      solicitud:solicitudes(
        id,
        titulo,
        descripcion,
        ubicacion,
        estado,
        urgencia,
        archivos,
        categoria_id,
        created_at,
        presupuesto_min,
        presupuesto_max
      )
    `)
    .eq("profesional_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  // Para las pujas aceptadas, el estado de su trabajo: mientras esté sin pagar
  // (pendiente_pago) la puja sigue viviendo aquí, no en Gestión de Proyectos.
  const idsAceptadas = (data || []).filter((o: any) => o.estado === "aceptada").map((o: any) => o.id)
  const trabajosPorOferta: Record<string, { id: string; estado: string }> = {}
  if (idsAceptadas.length > 0) {
    const { data: trabajosDeOfertas } = await supabase
      .from("trabajos")
      .select("id, estado, oferta_id")
      .in("oferta_id", idsAceptadas)
    for (const t of trabajosDeOfertas || []) {
      trabajosPorOferta[t.oferta_id] = { id: t.id, estado: t.estado }
    }
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
            trabajo: trabajosPorOferta[oferta.id] ?? null,
            solicitud: {
              ...oferta.solicitud,
              cliente,
              cliente_id: solicitudFull.cliente_id,
            },
          }
        }
      }
      return { ...oferta, trabajo: trabajosPorOferta[oferta.id] ?? null }
    }),
  )

  return { data: dataWithClientes }
}

export async function obtenerOfertasPorProfesional() {
  return obtenerMisOfertas()
}

export async function actualizarOferta(
  ofertaId: string,
  campos: {
    precio?: number
    tiempo_estimado?: number
    unidad_tiempo?: string
    descripcion?: string
    archivos?: string[]
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const errorModeracion = errorContenidoProhibido(campos.descripcion)
  if (errorModeracion) return { error: errorModeracion }

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
      // Solo se sobreescriben los adjuntos si se envían (edición explícita).
      ...(campos.archivos !== undefined ? { archivos: campos.archivos } : {}),
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

  // El cliente puede estar comparando ofertas ahora mismo: si una desaparece de
  // su lista sin avisar, parece un fallo de la web.
  if (oferta.solicitud_id) {
    const { data: solicitud } = await supabase
      .from("solicitudes")
      .select("cliente_id, titulo, estado")
      .eq("id", oferta.solicitud_id)
      .maybeSingle()

    // Solo si la demanda sigue viva: en una ya contratada el aviso sobraría.
    if (solicitud?.cliente_id && solicitud.estado === "abierta") {
      const { crearNotificacion } = await import("./notificaciones")
      await crearNotificacion({
        usuarioId: solicitud.cliente_id,
        tipo: "oferta_retirada",
        titulo: "Un profesional ha retirado su oferta",
        mensaje: `Una de las ofertas que habías recibido en "${solicitud.titulo}" ya no está disponible.`,
        link: "/mis-solicitudes",
      })
    }
  }

  revalidatePath("/mis-trabajos")
  revalidatePath("/mis-ofertas")
  revalidatePath("/mis-solicitudes")
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
    titulo: "Han aceptado tu puja",
    mensaje: `Tu oferta para "${oferta.solicitud?.titulo ?? "una demanda"}" ha sido aceptada. Cuando el cliente complete el pago protegido, el trabajo aparecerá en Gestión de Proyectos.`,
    link: "/mis-ofertas",
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
