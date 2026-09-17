"use server"

import { textoServidor } from "@/lib/i18n-servidor"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { errorContenidoProhibido } from "@/lib/moderacion"
import {
  calcularPagoProveedor,
  calcularPagoProveedorConTarifa,
  PLATFORM_CONFIG,
} from "@/lib/comisiones"

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
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado. Por favor inicia sesión.") }
  }

  const errorModeracion = errorContenidoProhibido(
    formData.descripcion,
    formData.materiales_incluidos,
    formData.condiciones_pago,
    formData.notas,
  )
  if (errorModeracion) return { error: await textoServidor(errorModeracion) }

  const { data: profesional } = await supabase.from("profesionales").select("id").eq("id", user.id).single()

  if (!profesional) {
    return { error: await textoServidor("Debes crear un perfil profesional antes de enviar ofertas. Ve a 'Mi Perfil' para configurarlo.") }
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
    return { error: await textoServidor("La demanda ya no está disponible.") }
  }
  if (solicitudDeLaOferta?.cliente_id === user.id) {
    return { error: await textoServidor("No puedes enviar una oferta a tu propia demanda.") }
  }
  if (solicitudDeLaOferta.estado !== "abierta") {
    return { error: await textoServidor("Esta demanda ya no admite nuevas ofertas.") }
  }

  // Importes y tiempos siempre positivos.
  if (!Number.isFinite(formData.precio) || formData.precio <= 0) {
    return { error: await textoServidor("El precio propuesto debe ser mayor que 0.") }
  }
  if (!["horas", "dias", "semanas", "meses"].includes(formData.unidad_tiempo)) {
    return { error: await textoServidor("La unidad de tiempo de la oferta no es válida.") }
  }
  if (!Number.isInteger(formData.tiempo_estimado) || formData.tiempo_estimado <= 0) {
    return { error: await textoServidor("El tiempo estimado debe ser mayor que 0.") }
  }
  if (!formData.acepta_gastos) {
    return { error: await textoServidor("Debes aceptar los gastos de servicio de la plataforma para enviar la oferta.") }
  }

  // Se guarda la tarifa aceptada junto a la oferta. De ese modo una subida
  // futura no altera silenciosamente lo que cobrará el profesional.
  const liquidacionPrevista = calcularPagoProveedor(formData.precio)

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

  if (existingOffersError) return { error: await textoServidor(existingOffersError.message) }

  const ofertasCerradas = (existingOffers || []).filter((oferta: any) =>
    ["retirada", "rechazada"].includes(oferta.estado),
  )
  const existingActiveOffer = (existingOffers || []).find(
    (oferta: any) => !["retirada", "rechazada"].includes(oferta.estado),
  )

  if (existingActiveOffer) {
    return { error: await textoServidor("Ya has enviado una oferta para esta solicitud.") }
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

    if (trabajosError) return { error: await textoServidor(trabajosError.message) }

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
    comision_proveedor_porcentaje: PLATFORM_CONFIG.comision_proveedor,
    comision_proveedor_minima: PLATFORM_CONFIG.comision_minima,
    comision_proveedor_prevista: liquidacionPrevista.comisionProveedor,
    pago_neto_proveedor_previsto: liquidacionPrevista.pagoNeto,
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
    return { error: await textoServidor(error.message) }
  }


  // Notificar al cliente dueño de la demanda.
  const { data: solicitud } = await supabase
    .from("solicitudes")
    .select("cliente_id, titulo")
    .eq("id", formData.solicitud_id)
    .maybeSingle()
  if (solicitud?.cliente_id) {
    const { crearNotificacion } = await import("@/lib/notificaciones")
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
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
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
        fecha_necesaria,
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
    return { error: await textoServidor(error.message) }
  }

  // Para las pujas aceptadas, el estado de su trabajo: mientras esté sin pagar
  // (pendiente_pago) la puja sigue viviendo aquí, no en Gestión de Proyectos.
  const idsAceptadas = (data || []).filter((o: any) => o.estado === "aceptada").map((o: any) => o.id)
  type TrabajoOferta = {
    id: string
    estado: string
    oferta_id: string
    cliente_id: string
    profesional_id: string
    cancelacion_estado: string | null
    cancelacion_solicitada_por: string | null
    cancelacion_razon: string | null
    cancelacion_adjuntos_solicitante: string[]
    cancelacion_respuesta_razon: string | null
    cancelacion_adjuntos_respuesta: string[]
  }
  const trabajosPorOferta: Record<string, TrabajoOferta> = {}
  if (idsAceptadas.length > 0) {
    const { data: trabajosDeOfertas, error: trabajosError } = await supabase
      .from("trabajos")
      .select("id, estado, oferta_id, cliente_id, profesional_id, cancelacion_estado, cancelacion_solicitada_por, cancelacion_razon, cancelacion_adjuntos_solicitante, cancelacion_respuesta_razon, cancelacion_adjuntos_respuesta")
      .in("oferta_id", idsAceptadas)
      .order("created_at", { ascending: false })
    if (trabajosError) return { error: await textoServidor("No se pudo consultar el estado de tus contratos. Inténtalo de nuevo.") }
    for (const t of (trabajosDeOfertas || []) as TrabajoOferta[]) {
      // Conserva el contrato vigente; un duplicado histórico cancelado nunca
      // debe esconder un trabajo ya pagado ni mostrar una cancelación antigua.
      if (!trabajosPorOferta[t.oferta_id] || trabajosPorOferta[t.oferta_id].estado === "cancelado") {
        trabajosPorOferta[t.oferta_id] = t
      }
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
    acepta_gastos?: boolean
  },
) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  const errorModeracion = errorContenidoProhibido(campos.descripcion)
  if (errorModeracion) return { error: await textoServidor(errorModeracion) }

  // Solo el profesional dueño y mientras la oferta no esté aceptada.
  const { data: oferta } = await supabase
    .from("ofertas")
    .select("profesional_id, estado, solicitud_id, precio, comision_proveedor_porcentaje, comision_proveedor_minima, comision_proveedor_prevista, pago_neto_proveedor_previsto")
    .eq("id", ofertaId)
    .maybeSingle()

  if (!oferta || oferta.profesional_id !== user.id) {
    return { error: await textoServidor("No tienes permiso para editar esta oferta.") }
  }
  if (oferta.estado === "aceptada") {
    return { error: await textoServidor("No puedes editar una oferta que ya ha sido aceptada.") }
  }
  if (campos.precio != null && (!Number.isFinite(campos.precio) || campos.precio <= 0)) {
    return { error: await textoServidor("El precio propuesto debe ser mayor que 0.") }
  }
  if (campos.unidad_tiempo != null && !["horas", "dias", "semanas", "meses"].includes(campos.unidad_tiempo)) {
    return { error: await textoServidor("La unidad de tiempo de la oferta no es válida.") }
  }
  if (campos.tiempo_estimado != null && (!Number.isInteger(campos.tiempo_estimado) || campos.tiempo_estimado <= 0)) {
    return { error: await textoServidor("El tiempo estimado debe ser mayor que 0.") }
  }

  const precioActualizado = campos.precio ?? Number(oferta.precio)
  const requiereAceptarGastos = oferta.comision_proveedor_porcentaje == null ||
    oferta.comision_proveedor_minima == null || oferta.comision_proveedor_prevista == null ||
    oferta.pago_neto_proveedor_previsto == null
  if (requiereAceptarGastos && campos.acepta_gastos !== true) {
    return { error: await textoServidor("Debes revisar y aceptar los gastos de servicio de esta oferta antes de guardarla.") }
  }
  const porcentajeAceptado = requiereAceptarGastos
    ? PLATFORM_CONFIG.comision_proveedor : Number(oferta.comision_proveedor_porcentaje)
  const minimoAceptado = requiereAceptarGastos
    ? PLATFORM_CONFIG.comision_minima : Number(oferta.comision_proveedor_minima)
  if (
    !Number.isFinite(precioActualizado) ||
    precioActualizado <= 0 ||
    !Number.isFinite(porcentajeAceptado) ||
    porcentajeAceptado < 0 ||
    !Number.isFinite(minimoAceptado) ||
    minimoAceptado < 0
  ) {
    return { error: await textoServidor("No se pudieron verificar los gastos de servicio aceptados en esta oferta.") }
  }
  const liquidacionActualizada = calcularPagoProveedorConTarifa(
    precioActualizado,
    porcentajeAceptado,
    minimoAceptado,
  )

  const { data, error } = await supabase
    .from("ofertas")
    .update({
      precio: campos.precio,
      tiempo_estimado: campos.tiempo_estimado,
      unidad_tiempo: campos.unidad_tiempo,
      descripcion: campos.descripcion,
      ...(requiereAceptarGastos ? {
        comision_proveedor_porcentaje: porcentajeAceptado,
        comision_proveedor_minima: minimoAceptado,
      } : {}),
      ...(campos.precio !== undefined || requiereAceptarGastos
        ? {
            comision_proveedor_prevista: liquidacionActualizada.comisionProveedor,
            pago_neto_proveedor_previsto: liquidacionActualizada.pagoNeto,
          }
        : {}),
      // Solo se sobreescriben los adjuntos si se envían (edición explícita).
      ...(campos.archivos !== undefined ? { archivos: campos.archivos } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ofertaId)
    .eq("profesional_id", user.id)
    .select()
    .single()

  if (error) return { error: await textoServidor(error.message) }

  // Avisar al cliente dueño de la demanda de que la oferta ha cambiado.
  if (oferta.solicitud_id) {
    const { data: solicitud } = await supabase
      .from("solicitudes")
      .select("cliente_id, titulo")
      .eq("id", oferta.solicitud_id)
      .maybeSingle()
    if (solicitud?.cliente_id) {
      const { crearNotificacion } = await import("@/lib/notificaciones")
      await crearNotificacion({
        usuarioId: solicitud.cliente_id,
        tipo: "oferta_actualizada",
        titulo: "Una oferta ha sido actualizada",
        mensaje: `El profesional ha modificado su oferta en "${solicitud.titulo}"${
          campos.precio != null ? ` (nuevo precio: ${campos.precio}€)` : ""
        }. Revísala en Mis Solicitudes.`,
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
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  const { data: oferta } = await supabase
    .from("ofertas")
    .select("profesional_id, estado, solicitud_id")
    .eq("id", ofertaId)
    .maybeSingle()

  if (!oferta || oferta.profesional_id !== user.id) {
    return { error: await textoServidor("No tienes permiso para eliminar esta oferta.") }
  }
  if (oferta.estado === "aceptada") {
    return { error: await textoServidor("No puedes eliminar una oferta que ya ha sido aceptada.") }
  }
  if (["rechazada", "retirada"].includes(oferta.estado)) {
    return { error: await textoServidor("Esta oferta ya está cerrada.") }
  }

  // Repetir el estado leído en el DELETE evita borrar una oferta que haya
  // cambiado (por ejemplo, aceptada por el cliente) entre ambas consultas.
  const { data: ofertaEliminada, error } = await supabase
    .from("ofertas")
    .delete()
    .eq("id", ofertaId)
    .eq("profesional_id", user.id)
    .eq("estado", oferta.estado)
    .select("id")
    .maybeSingle()
  if (error) return { error: await textoServidor(error.message) }
  if (!ofertaEliminada) return { error: await textoServidor("La oferta ha cambiado. Actualiza la página e inténtalo de nuevo.") }

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
      const { crearNotificacion } = await import("@/lib/notificaciones")
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

/**
 * Quita una puja perdida de "Mis Pujas" sin destruir el registro histórico.
 * `retirada` ya es un estado cerrado y no se muestra en la pantalla; usarlo
 * evita romper el enlace si la oferta llegó a generar un trabajo sin pagar.
 */
export async function eliminarOfertaPerdida(ofertaId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  // El filtro de estado forma parte de la escritura: aunque la oferta cambie
  // mientras se confirma el diálogo, solo una rechazada puede ocultarse.
  const { data: ofertaOcultada, error } = await supabase
    .from("ofertas")
    .update({ estado: "retirada", updated_at: new Date().toISOString() })
    .eq("id", ofertaId)
    .eq("profesional_id", user.id)
    .eq("estado", "rechazada")
    .select("id")
    .maybeSingle()

  if (error) return { error: await textoServidor(error.message) }
  if (!ofertaOcultada) {
    return { error: await textoServidor("La puja ya no está marcada como perdida. Actualiza la página e inténtalo de nuevo.") }
  }

  revalidatePath("/mis-ofertas")
  return { success: true }
}

export async function aceptarOferta(ofertaId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  }

  // Get oferta details
  const { data: oferta, error: ofertaError } = await supabase
    .from("ofertas")
    .select("*, solicitud:solicitudes(*)")
    .eq("id", ofertaId)
    .single()

  if (ofertaError || !oferta) {
    return { error: await textoServidor("Oferta no encontrada") }
  }

  // Verify user is the client of this solicitud
  if (oferta.solicitud?.cliente_id !== user.id) {
    return { error: await textoServidor("No tienes permiso para aceptar esta oferta") }
  }

  // Import and call crearTrabajo
  const { crearTrabajo } = await import("./trabajos")
  const trabajoResult = await crearTrabajo({
    oferta_id: ofertaId,
    solicitud_id: oferta.solicitud_id,
    profesional_id: oferta.profesional_id,
  })

  if (trabajoResult.error) {
    return { error: await textoServidor(trabajoResult.error) }
  }

  // Reintentar una aceptación no vuelve a enviar el aviso.
  if (trabajoResult.reutilizado) return { data: trabajoResult.data }

  // Notificar al profesional que su oferta ha sido aceptada.
  const { crearNotificacion } = await import("@/lib/notificaciones")
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
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  }

  const { data: oferta } = await supabase
    .from("ofertas")
    .select("estado, profesional_id, solicitud_id")
    .eq("id", ofertaId)
    .maybeSingle()

  if (!oferta) {
    return { error: await textoServidor("Oferta no encontrada.") }
  }

  const { data: solicitud } = await supabase
    .from("solicitudes")
    .select("cliente_id, titulo")
    .eq("id", oferta.solicitud_id)
    .maybeSingle()

  // Solo el cliente dueño de la demanda puede rechazar la oferta.
  if (!solicitud || solicitud.cliente_id !== user.id) {
    return { error: await textoServidor("No tienes permiso para rechazar esta oferta.") }
  }
  if (["aceptada", "rechazada", "retirada"].includes(oferta.estado)) {
    return { error: await textoServidor("Esta oferta ya no está pendiente de respuesta.") }
  }

  const { error } = await supabase
    .from("ofertas")
    .update({ estado: "rechazada", updated_at: new Date().toISOString() })
    .eq("id", ofertaId)

  if (error) {
    return { error: await textoServidor(error.message) }
  }

  const { crearNotificacion } = await import("@/lib/notificaciones")
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
  // Un profesional no puede aceptar su propia oferta ni cambiar el acuerdo
  // mediante una acción genérica expuesta por el servidor.
  if (estado !== "retirada") return { error: await textoServidor("Solo puedes retirar una oferta pendiente desde esta acción.") }
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  const { data, error } = await supabase.from("ofertas")
    .update({ estado: "retirada", updated_at: new Date().toISOString() })
    .eq("id", ofertaId).eq("profesional_id", user.id)
    .in("estado", ["pendiente", "enviada", "en_negociacion", "rechazada"])
    .select().maybeSingle()
  if (error) return { error: await textoServidor(error.message) }
  if (!data) return { error: await textoServidor("La oferta ya no se puede retirar. Si está contratada, solicita la cancelación del trabajo.") }
  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-ofertas")
  return { data }
}

export async function obtenerOfertasPorSolicitud(solicitudId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const { data, error } = await supabase
    .from("ofertas")
    .select("*")
    .eq("solicitud_id", solicitudId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: await textoServidor(error.message) }
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
              ...(profesional as unknown as Record<string, unknown>),
              profiles: profile,
            }
          : null,
      }
    }),
  )

  return { data: dataWithProfesionales }
}
