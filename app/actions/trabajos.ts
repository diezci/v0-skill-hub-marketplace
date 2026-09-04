"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

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

  // Si el cliente ya había aceptado otra oferta de esta demanda pero nunca la
  // pagó, aceptar una nueva la sustituye: se anula aquel trabajo en limbo y su
  // oferta vuelve a quedar rechazada para el otro profesional.
  const { data: trabajoLimbo } = await supabase
    .from("trabajos")
    .select("id, oferta_id, profesional_id, titulo")
    .eq("solicitud_id", data.solicitud_id)
    .eq("estado", "pendiente_pago")
    .neq("oferta_id", data.oferta_id)
    .maybeSingle()
  if (trabajoLimbo) {
    await supabase.from("trabajos").update({ estado: "cancelado", fecha_fin: new Date().toISOString() }).eq("id", trabajoLimbo.id)
    await createAdminClient()?.from("transacciones_escrow").update({ estado: "cancelado" }).eq("trabajo_id", trabajoLimbo.id).eq("estado", "pendiente")
    if (trabajoLimbo.oferta_id) {
      await supabase.from("ofertas").update({ estado: "rechazada", updated_at: new Date().toISOString() }).eq("id", trabajoLimbo.oferta_id)
    }
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: trabajoLimbo.profesional_id,
      tipo: "oferta_rechazada",
      titulo: "Contratación no completada",
      mensaje: `El cliente no llegó a completar el pago de "${trabajoLimbo.titulo}" y ha optado por otra oferta.`,
      link: "/mis-ofertas",
    })
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

  // La oferta elegida queda aceptada, pero la contratación NO se consuma aquí:
  // la demanda sigue abierta y las demás ofertas siguen pendientes hasta que el
  // cliente complete el pago (confirmarPagoEscrow o el webhook de Stripe). Si
  // abandona la pasarela, nada ha cambiado para el resto.
  await supabase.from("ofertas").update({ estado: "aceptada" }).eq("id", data.oferta_id)

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
      oferta:ofertas(precio, tiempo_estimado, unidad_tiempo, archivos, materiales_incluidos, condiciones_pago)
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
        // Cada parte solo se lleva su lado del dinero. Lo que Diime le cobra al
        // cliente y lo que le descuenta al profesional son dos acuerdos
        // distintos, y ninguno de los dos tiene por qué conocer el del otro.
        // Se recorta aquí y no solo en la pantalla: esta acción la llaman
        // componentes de cliente, así que la fila entera acabaría viajando al
        // navegador y bastaría con mirar la respuesta para verlo todo.
        transaccion_escrow: recortarEscrowSegunRol(escrow, trabajo.cliente_id === user.id),
      }
    }),
  )

  return { data: dataWithProfiles }
}

// Campos del escrow que puede ver cada parte.
//
//   cliente     -> lo que ha pagado él (monto, comision_cliente)
//   profesional -> lo que va a cobrar él (pago_neto_proveedor, comision_proveedor)
//
// `monto_base` (el precio acordado) lo ven los dos: es lo que han pactado entre
// ellos, no una condición de la plataforma.
function recortarEscrowSegunRol(escrow: any, esElCliente: boolean) {
  if (!escrow) return escrow

  const comunes = {
    id: escrow.id,
    trabajo_id: escrow.trabajo_id,
    estado: escrow.estado,
    monto_base: escrow.monto_base,
    fecha_retencion: escrow.fecha_retencion,
    fecha_liberacion: escrow.fecha_liberacion,
    fecha_reembolso: escrow.fecha_reembolso,
    monto_reembolsado: escrow.monto_reembolsado,
    created_at: escrow.created_at,
  }

  return esElCliente
    ? { ...comunes, monto: escrow.monto, comision_cliente: escrow.comision_cliente }
    : {
        ...comunes,
        comision_proveedor: escrow.comision_proveedor,
        pago_neto_proveedor: escrow.pago_neto_proveedor,
      }
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

  // `leido: true` a propósito. Estos mensajes los escribe el sistema, no una
  // persona, y cada uno ya viene acompañado de su notificación, que es la que
  // lleva a donde hay que actuar (Mis Solicitudes o Gestión de proyectos). Si
  // además contaran como mensaje sin leer, el aviso de una cancelación
  // aparecería en Mensajes —donde no se puede aceptar ni rechazar— en vez de
  // en la sección que la resuelve. Se siguen viendo en el chat como registro.
  await supabase.from("mensajes").insert({
    conversacion_id: conv.id,
    remitente_id: userId,
    contenido,
    leido: true,
  })
  await supabase
    .from("conversaciones")
    .update({ ultimo_mensaje: contenido, fecha_ultimo_mensaje: new Date().toISOString() })
    .eq("id", conv.id)
}

// Solicita la cancelación de mutuo acuerdo antes del pago o durante el trabajo.
// La otra parte deberá aceptarla o rechazarla.
const MAX_ADJUNTOS_CANCELACION = 5

function validarAdjuntosCancelacion(archivos: string[] | undefined) {
  if (!archivos) return { archivos: [] as string[] }
  if (!Array.isArray(archivos)) return { error: "Los archivos adjuntos no son válidos." }

  const unicos = [...new Set(archivos.map((url) => url?.trim()).filter(Boolean))]
  if (unicos.length > MAX_ADJUNTOS_CANCELACION) {
    return { error: `Puedes adjuntar un máximo de ${MAX_ADJUNTOS_CANCELACION} archivos.` }
  }
  if (
    unicos.some((url) => {
      try {
        return new URL(url).protocol !== "https:"
      } catch {
        return true
      }
    })
  ) {
    return { error: "Hay un archivo adjunto no válido." }
  }

  return { archivos: unicos }
}

export async function solicitarCancelacion(trabajoId: string, razon: string, archivosAdjuntos: string[] = []) {
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
  // Cancelación de mutuo acuerdo: antes del pago o con el trabajo en curso.
  // Si ya está pagado y se acepta, el cliente recibe el reembolso íntegro.
  if (!["pendiente_pago", "en_progreso"].includes(trabajo.estado)) {
    return { error: "Este trabajo ya no admite cancelación de mutuo acuerdo (usa la disputa si hay un problema)." }
  }
  if (trabajo.cancelacion_estado === "pendiente") {
    return { error: "Ya hay una solicitud de cancelación pendiente para este trabajo." }
  }

  const motivo = razon?.trim()
  if (!motivo) return { error: "Explica por qué quieres cancelar el servicio." }

  const adjuntos = validarAdjuntosCancelacion(archivosAdjuntos)
  if (adjuntos.error) return { error: adjuntos.error }

  const { error } = await supabase
    .from("trabajos")
    .update({
      cancelacion_solicitada_por: user.id,
      cancelacion_razon: motivo,
      cancelacion_adjuntos_solicitante: adjuntos.archivos,
      // Una solicitud nueva no debe heredar argumentos ni pruebas de una
      // respuesta anterior.
      cancelacion_respuesta_razon: null,
      cancelacion_adjuntos_respuesta: [],
      cancelacion_estado: "pendiente",
      updated_at: new Date().toISOString(),
    })
    .eq("id", trabajoId)
  if (error) return { error: error.message }

  await postMensajeTrabajo(
    supabase,
    user.id,
    trabajo,
    `🚫 Ha solicitado cancelar el trabajo "${trabajo.titulo}". Motivo: ${motivo}. La otra parte puede aceptar o rechazar la cancelación desde la ficha del trabajo.`,
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
      // Antes de pagar, la demanda sigue en estado "abierta" y por tanto en la
      // pestaña Abiertas, no en En Progreso: decir "En Progreso" mandaba al
      // cliente a una pestaña donde su demanda no estaba.
      mensaje: `La otra parte quiere cancelar "${trabajo.titulo}". Acepta o rechaza la cancelación en ${
        otroEsCliente
          ? `Mis Solicitudes (pestaña ${trabajo.estado === "pendiente_pago" ? "Abiertas" : "En Progreso"})`
          : "Gestión de proyectos (pestaña Activos)"
      }.`,
      link: otroEsCliente ? "/mis-solicitudes" : "/mis-trabajos",
    })
  }

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-trabajos")
  revalidatePath("/mensajes")
  return { data: { ok: true } }
}

// Mientras la otra parte no haya respondido, quien inició la cancelación puede
// corregir tanto sus argumentos como las pruebas aportadas. El permiso depende
// de ser el solicitante, no de ser cliente o proveedor.
export async function editarSolicitudCancelacion(
  trabajoId: string,
  razon: string,
  archivosAdjuntos: string[] = [],
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("id, cliente_id, profesional_id, estado, cancelacion_estado, cancelacion_solicitada_por, titulo")
    .eq("id", trabajoId)
    .maybeSingle()

  if (!trabajo || (trabajo.cliente_id !== user.id && trabajo.profesional_id !== user.id)) {
    return { error: "No tienes permiso sobre este trabajo" }
  }
  if (trabajo.cancelacion_estado !== "pendiente") {
    return { error: "Esta solicitud ya no está pendiente y no se puede editar." }
  }
  if (trabajo.cancelacion_solicitada_por !== user.id) {
    return { error: "Solo quien solicitó la cancelación puede editarla." }
  }

  const motivo = razon?.trim()
  if (!motivo) return { error: "Explica por qué quieres cancelar el servicio." }
  const adjuntos = validarAdjuntosCancelacion(archivosAdjuntos)
  if (adjuntos.error) return { error: adjuntos.error }

  const { data: actualizado, error } = await supabase
    .from("trabajos")
    .update({
      cancelacion_razon: motivo,
      cancelacion_adjuntos_solicitante: adjuntos.archivos,
      updated_at: new Date().toISOString(),
    })
    .eq("id", trabajoId)
    .eq("cancelacion_estado", "pendiente")
    .eq("cancelacion_solicitada_por", user.id)
    .select("id")
    .maybeSingle()
  if (error) return { error: error.message }
  if (!actualizado) return { error: "La solicitud ya ha sido respondida y no se puede editar." }

  await postMensajeTrabajo(
    supabase,
    user.id,
    trabajo,
    `✏️ Ha actualizado su solicitud de cancelación de "${trabajo.titulo}". Motivo: ${motivo}.`,
  )

  const otroId = trabajo.cliente_id === user.id ? trabajo.profesional_id : trabajo.cliente_id
  const otroEsCliente = otroId === trabajo.cliente_id
  const { crearNotificacion } = await import("./notificaciones")
  await crearNotificacion({
    usuarioId: otroId,
    tipo: "cancelacion_actualizada",
    titulo: "Solicitud de cancelación actualizada",
    mensaje: `La otra parte ha actualizado sus argumentos o archivos para cancelar "${trabajo.titulo}".`,
    link: otroEsCliente ? "/mis-solicitudes" : "/mis-trabajos",
  })

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-trabajos")
  revalidatePath("/mensajes")
  return { data: { ok: true } }
}

// Retira una solicitud aún pendiente sin cancelar el servicio ni modificar el
// estado del trabajo. Puede hacerlo quien la inició, sea cliente o proveedor.
export async function retirarSolicitudCancelacion(trabajoId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("id, cliente_id, profesional_id, cancelacion_estado, cancelacion_solicitada_por, titulo")
    .eq("id", trabajoId)
    .maybeSingle()

  if (!trabajo || (trabajo.cliente_id !== user.id && trabajo.profesional_id !== user.id)) {
    return { error: "No tienes permiso sobre este trabajo" }
  }
  if (trabajo.cancelacion_estado !== "pendiente") {
    return { error: "Esta solicitud ya no está pendiente y no se puede retirar." }
  }
  if (trabajo.cancelacion_solicitada_por !== user.id) {
    return { error: "Solo quien solicitó la cancelación puede retirarla." }
  }

  const { data: retirado, error } = await supabase
    .from("trabajos")
    .update({
      cancelacion_estado: null,
      cancelacion_solicitada_por: null,
      cancelacion_razon: null,
      cancelacion_adjuntos_solicitante: [],
      cancelacion_respuesta_razon: null,
      cancelacion_adjuntos_respuesta: [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", trabajoId)
    .eq("cancelacion_estado", "pendiente")
    .eq("cancelacion_solicitada_por", user.id)
    .select("id")
    .maybeSingle()
  if (error) return { error: error.message }
  if (!retirado) return { error: "La solicitud ya ha sido respondida y no se puede retirar." }

  await postMensajeTrabajo(
    supabase,
    user.id,
    trabajo,
    `↩️ Ha retirado la solicitud de cancelación de "${trabajo.titulo}". El servicio continúa activo.`,
  )

  const otroId = trabajo.cliente_id === user.id ? trabajo.profesional_id : trabajo.cliente_id
  const otroEsCliente = otroId === trabajo.cliente_id
  const { crearNotificacion } = await import("./notificaciones")
  await crearNotificacion({
    usuarioId: otroId,
    tipo: "cancelacion_retirada",
    titulo: "Solicitud de cancelación retirada",
    mensaje: `La otra parte ha retirado la solicitud de cancelación de "${trabajo.titulo}". El servicio continúa.`,
    link: otroEsCliente ? "/mis-solicitudes" : "/mis-trabajos",
  })

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-trabajos")
  revalidatePath("/mensajes")
  return { data: { ok: true } }
}

// Responde a una solicitud de cancelación: la OTRA parte acepta (trabajo cancelado)
// o rechaza (la disputa se abre automáticamente para que decida el admin).
export async function responderCancelacion(
  trabajoId: string,
  aceptar: boolean,
  razonRespuesta = "",
  archivosAdjuntos: string[] = [],
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select(
      // cancelacion_razon: sin pedirla, la disputa que se abre al rechazar
      // quedaba con "Motivo original de la cancelación: no indicado" aunque el
      // solicitante lo hubiera escrito, y quien la resuelve se queda sin el dato.
      "id, cliente_id, profesional_id, estado, cancelacion_estado, cancelacion_solicitada_por, cancelacion_razon, cancelacion_adjuntos_solicitante, solicitud_id, oferta_id, titulo",
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

  const razonOposicion = razonRespuesta?.trim()
  const adjuntos = validarAdjuntosCancelacion(archivosAdjuntos)
  if (adjuntos.error) return { error: adjuntos.error }
  if (!aceptar && !razonOposicion) {
    return { error: "Explica por qué te opones a la cancelación para que el equipo de Diime pueda decidir." }
  }

  if (aceptar) {
    // Si el cliente ya había pagado, se le devuelve TODO automáticamente
    // (cancelación de mutuo acuerdo = reembolso íntegro, comisión incluida).
    const { reembolsarPorCancelacion } = await import("./escrow")
    const reembolsoResult = await reembolsarPorCancelacion(trabajoId)
    if (reembolsoResult.error) {
      return { error: `No se pudo emitir el reembolso al cliente: ${reembolsoResult.error}` }
    }

    const { error } = await supabase
      .from("trabajos")
      .update({
        estado: "cancelado",
        cancelacion_estado: null,
        cancelacion_respuesta_razon: null,
        cancelacion_adjuntos_respuesta: [],
        fecha_fin: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", trabajoId)
    if (error) return { error: error.message }

    if ((reembolsoResult.reembolso ?? 0) > 0) {
      const { crearNotificacion } = await import("./notificaciones")
      await crearNotificacion({
        usuarioId: trabajo.cliente_id,
        tipo: "reembolso_emitido",
        titulo: "Reembolso emitido",
        mensaje: `"${trabajo.titulo}" se ha cancelado de mutuo acuerdo y te hemos devuelto ${reembolsoResult.reembolso!.toFixed(2)}€ íntegros a tu método de pago.`,
        link: "/mis-solicitudes",
      })
    }
    if (trabajo.solicitud_id) {
      // La demanda vuelve a estar abierta y utilizable de verdad:
      await supabase.from("solicitudes").update({ estado: "abierta" }).eq("id", trabajo.solicitud_id)
      // - la oferta del trabajo cancelado se retira (así el profesional puede
      //   volver a ofertar más adelante si quiere)...
      if (trabajo.oferta_id) {
        await supabase.from("ofertas").update({ estado: "retirada" }).eq("id", trabajo.oferta_id)
      }
      // - ...y las demás ofertas, que se auto-rechazaron al aceptar esta,
      //   vuelven a estar pendientes para que el cliente pueda elegir otra.
      //   (Si responde el profesional, la RLS solo le deja tocar las suyas y
      //   este paso no revive nada: es un mejor-esfuerzo.)
      await supabase
        .from("ofertas")
        .update({ estado: "pendiente" })
        .eq("solicitud_id", trabajo.solicitud_id)
        .eq("estado", "rechazada")
    }
    await postMensajeTrabajo(
      supabase,
      user.id,
      trabajo,
      `✅ Ha aceptado la cancelación. El trabajo "${trabajo.titulo}" queda cancelado.`,
    )
  } else {
    // Rechazar la cancelación abre AUTOMÁTICAMENTE una disputa: el equipo de
    // Diime la resolverá según los términos de la contratación (en caso de
    // duda, a favor del cliente).
    const { data: escrowPrevio } = await supabase
      .from("transacciones_escrow")
      .select("estado")
      .eq("trabajo_id", trabajoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error } = await supabase
      .from("trabajos")
      .update({
        estado: "en_disputa",
        cancelacion_estado: "rechazada",
        cancelacion_respuesta_razon: razonOposicion,
        cancelacion_adjuntos_respuesta: adjuntos.archivos,
        updated_at: new Date().toISOString(),
      })
      .eq("id", trabajoId)
    if (error) return { error: error.message }

    const tipoDisputa = trabajo.cancelacion_solicitada_por === trabajo.cliente_id ? "cliente" : "proveedor"
    const { error: errorDisputa } = await supabase.from("disputas").insert({
      trabajo_id: trabajoId,
      cliente_id: trabajo.cliente_id,
      profesional_id: trabajo.profesional_id,
      tipo: tipoDisputa,
      motivo: `Cancelación solicitada y rechazada. Motivo de quien solicita: ${
        (trabajo as any).cancelacion_razon || "no indicado"
      }. Argumentos de quien se opone: ${razonOposicion}.`,
      estado: "abierta",
      estado_trabajo_previo: trabajo.estado,
      estado_escrow_previo: escrowPrevio?.estado ?? null,
    })
    if (errorDisputa) {
      // Sin disputa no habría nada que el admin pudiera revisar. Dejamos la
      // solicitud pendiente para que la otra parte pueda volver a responder.
      await supabase
        .from("trabajos")
        .update({
          estado: trabajo.estado,
          cancelacion_estado: "pendiente",
          cancelacion_respuesta_razon: null,
          cancelacion_adjuntos_respuesta: [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", trabajoId)
      return { error: `No se pudo abrir la revisión: ${errorDisputa.message}` }
    }
    await createAdminClient()?.from("transacciones_escrow").update({ estado: "disputa" }).eq("trabajo_id", trabajoId)

    const { data: admins } = await supabase.from("profiles").select("id").eq("es_admin", true)
    if (admins?.length) {
      const totalAdjuntos =
        ((trabajo as any).cancelacion_adjuntos_solicitante?.length || 0) + (adjuntos.archivos ?? []).length
      await supabase.from("notificaciones").insert(
        admins.map((admin: { id: string }) => ({
          usuario_id: admin.id,
          tipo: "disputa_abierta_admin",
          titulo: "Cancelación rechazada para revisar",
          mensaje: `Se ha abierto una disputa sobre "${trabajo.titulo}" con los argumentos de ambas partes y ${totalAdjuntos} archivo${totalAdjuntos === 1 ? "" : "s"} adjunto${totalAdjuntos === 1 ? "" : "s"}.`,
          link: "/admin/disputas",
          leida: false,
        })),
      )
    }

    await postMensajeTrabajo(
      supabase,
      user.id,
      trabajo,
      `❌ Ha rechazado la cancelación del trabajo "${trabajo.titulo}". Motivo: ${razonOposicion}. Se abre una disputa que resolverá el equipo de Diime según los términos de la contratación (en caso de duda, a favor del cliente).`,
    )
  }

  // Notificar el resultado a ambas partes.
  {
    const solicitanteEsCliente = trabajo.cancelacion_solicitada_por === trabajo.cliente_id
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: trabajo.cancelacion_solicitada_por,
      tipo: aceptar ? "cancelacion_aceptada" : "disputa_abierta",
      titulo: aceptar ? "Cancelación aceptada" : "Cancelación rechazada: disputa abierta",
      mensaje: aceptar
        ? `La otra parte ha aceptado cancelar "${trabajo.titulo}". El trabajo queda cancelado.`
        : `La otra parte ha rechazado cancelar "${trabajo.titulo}". Se ha abierto una disputa que resolverá el equipo de Diime según los términos de la contratación (en caso de duda, a favor del cliente).`,
      link: solicitanteEsCliente ? "/mis-solicitudes" : "/mis-trabajos",
    })
  }

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-trabajos")
  revalidatePath("/mensajes")
  revalidatePath("/admin/disputas")
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
    .select("profesional_id, cliente_id, titulo, estado, cancelacion_estado")
    .eq("id", trabajoId)
    .single()

  if (!trabajo || trabajo.profesional_id !== user.id) {
    return { error: "No tienes permiso para actualizar este trabajo" }
  }
  if (trabajo.estado !== "en_progreso") {
    return { error: "Solo se puede entregar un trabajo que esté en progreso." }
  }
  if (trabajo.cancelacion_estado === "pendiente") {
    return { error: "Hay una cancelación pendiente. Debe resolverse antes de entregar el trabajo." }
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
    .eq("estado", "en_progreso")
    .is("cancelacion_estado", null)
    .select()
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }
  if (!data) {
    return { error: "El estado del trabajo ha cambiado. Actualiza la página antes de continuar." }
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
  // El aviso nombra el trabajo y al profesional que lo entrega.
  if (trabajo.cliente_id) {
    const { data: perfilPro } = await supabase
      .from("profiles")
      .select("nombre, apellido")
      .eq("id", user.id)
      .maybeSingle()
    const nombrePro = `${perfilPro?.nombre ?? ""} ${perfilPro?.apellido ?? ""}`.trim() || "El profesional"
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: trabajo.cliente_id,
      tipo: "trabajo_entregado",
      titulo: `Entrega: ${trabajo.titulo ?? "tu trabajo"}`,
      mensaje: `${nombrePro} te ha entregado "${trabajo.titulo ?? "tu trabajo"}". Revísalo y confirma la finalización para liberar el pago.`,
      link: "/mis-solicitudes",
    })
  }

  revalidatePath("/mis-solicitudes")
  return { data }
}

// Client confirms work completion and releases payment
export async function confirmarTrabajoCompletado(trabajoId: string) {
  // Confirmación y transferencia forman una sola operación de servidor. No se
  // marca el trabajo como completado hasta que Stripe acepta la transferencia.
  const { liberarFondosEscrow } = await import("./escrow")
  const resultado = await liberarFondosEscrow(trabajoId)
  if (resultado.error) return { error: resultado.error }
  return { data: { id: trabajoId, estado: "completado" } }
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

// Todos los trabajos (actuales e históricos) entre el usuario actual y otro
// usuario, en cualquier dirección cliente/proveedor. Para el panel del chat.
export async function obtenerTrabajosConUsuario(otroUsuarioId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado", data: [] }

  const { data, error } = await supabase
    .from("trabajos")
    .select("id, titulo, estado, precio_acordado, created_at, fecha_fin, cliente_id, profesional_id")
    .or(
      `and(cliente_id.eq.${user.id},profesional_id.eq.${otroUsuarioId}),and(cliente_id.eq.${otroUsuarioId},profesional_id.eq.${user.id})`,
    )
    .order("created_at", { ascending: false })

  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}
