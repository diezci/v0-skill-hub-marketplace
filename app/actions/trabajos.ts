"use server"

import { construirLinkNotificacion } from "@/lib/notificaciones-contexto"
import { textoServidor } from "@/lib/i18n-servidor"

import { createClient } from "@/lib/supabase/server"
import { identidadesEmpresas, validarActorTrabajoEmpresa } from "@/lib/empresas/identidad"
import { destinatariosOperacionEmpresa } from "@/lib/empresas/notificaciones"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

export async function crearTrabajo(data: {
  oferta_id: string
  solicitud_id: string
  profesional_id: string
  fecha_estimada_fin?: string
}) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  }

  // Una transacción bloquea la demanda, verifica los participantes y devuelve
  // el mismo contrato si se repite la aceptación, incluso desde dos pestañas.
  // Los datos económicos y descriptivos proceden de la oferta en la base de datos.
  const { data: resultado, error } = await supabase.rpc("aceptar_oferta_y_crear_trabajo", {
    p_oferta_id: data.oferta_id,
    p_solicitud_id: data.solicitud_id,
    p_profesional_id: data.profesional_id,
    p_fecha_estimada_fin: data.fecha_estimada_fin ?? null,
  })
  if (error) return { error: await textoServidor(error.message) }
  if (!resultado?.trabajo?.id) return { error: await textoServidor("No se pudo confirmar la contratación. Inténtalo de nuevo.") }

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-trabajos")
  revalidatePath("/mis-ofertas")
  return { data: resultado.trabajo, reutilizado: resultado.reutilizado === true }
}

export async function obtenerMisTrabajos() {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
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
    return { error: await textoServidor(error.message) }
  }

  const empresas = await identidadesEmpresas(supabase, (data || []).flatMap((trabajo: any) => [trabajo.empresa_cliente_id, trabajo.empresa_proveedora_id]))

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

      const { data: escrows } = await supabase
        .from("transacciones_escrow")
        .select("*")
        .eq("trabajo_id", trabajo.id)
        .order("created_at", { ascending: false })

      // Puede haber varios intentos de Checkout cerrados para un mismo
      // trabajo. Se usa la transacción que llegó a mover dinero, no un intento
      // cancelado ni una consulta `.single()` que falle con varias filas.
      const estadosEconomicos = new Set([
        "retenido",
        "fondos_retenidos",
        "liquidando",
        "liberado",
        "completado",
        "reembolsado",
        "disputa",
      ])
      const escrow =
        (escrows || []).find((fila: any) => fila.fecha_retencion || estadosEconomicos.has(fila.estado)) ??
        (escrows || []).find((fila: any) => fila.estado === "pendiente") ??
        null

      return {
        ...trabajo,
        empresa_cliente: empresas[trabajo.empresa_cliente_id] || null,
        empresa_proveedora: empresas[trabajo.empresa_proveedora_id] || null,
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

// Compatibilidad con pantallas antiguas: cada transición utiliza el flujo que
// valida su actor y concilia el dinero; no existe un cambio genérico de estado.
export async function actualizarEstadoTrabajo(trabajoId: string, estado: string) {
  if (estado === "entregado") return marcarTrabajoEntregado(trabajoId)
  if (estado === "completado") return confirmarTrabajoCompletado(trabajoId)
  return { error: await textoServidor("Usa la acción de entrega, confirmación, cancelación o disputa correspondiente al trabajo.") }
}

export async function cancelarTrabajo(trabajoId: string, razon: string) {
  return solicitarCancelacion(trabajoId, razon)
}

// Publica un mensaje automático en el chat del trabajo (entre cliente y proveedor),
// creando la conversación si aún no existe. El remitente es el usuario actual.
async function postMensajeTrabajo(supabase: any, userId: string, trabajo: any, contenido: string) {
  // Company transitions are recorded transactionally in work activity. Never
  // create a personal conversation between an operator and the other party.
  if (trabajo.empresa_cliente_id || trabajo.empresa_proveedora_id) return
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

type ParteCancelacion = "cliente" | "proveedor"

async function destinatarioCancelacion(admin: any, trabajo: any, parte: ParteCancelacion) {
  const esCliente = parte === "cliente"
  const empresa = esCliente ? trabajo.empresa_cliente_id : trabajo.empresa_proveedora_id
  return {
    usuarios: await destinatariosOperacionEmpresa(admin, empresa, esCliente ? trabajo.operador_cliente_id || trabajo.cliente_id : trabajo.operador_proveedor_id || trabajo.profesional_id),
    metadata: { trabajo_id: trabajo.id, titulo_trabajo: trabajo.titulo, parte_destinataria: parte },
    link: empresa ? "/perfil-empresa" : construirLinkNotificacion({
      seccion: esCliente ? "/mis-solicitudes" : trabajo.estado === "pendiente_pago" ? "/mis-ofertas" : "/mis-trabajos",
      solicitudId: trabajo.solicitud_id, trabajoId: trabajo.id, ofertaId: trabajo.oferta_id, aspecto: "cancelacion",
    }),
  }
}

async function gestionarSolicitudCancelacion(trabajoId: string, accion: "solicitar" | "editar" | "retirar", razon = "", archivosAdjuntos: string[] = []) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  // Check the session before privileged access; the scoped RPC checks again
  // under locks so reassignment/revocation cannot race a cancellation change.
  const permisoError = await validarActorTrabajoEmpresa(supabase, trabajoId, user.id, "encargos")
  if (permisoError) return { error: await textoServidor(permisoError) }
  const motivo = razon?.trim()
  if (accion !== "retirar" && !motivo) return { error: await textoServidor("Explica por qué quieres cancelar el servicio.") }
  const adjuntos = validarAdjuntosCancelacion(archivosAdjuntos)
  if (adjuntos.error) return { error: await textoServidor(adjuntos.error) }
  const admin = createAdminClient()
  if (!admin) return { error: await textoServidor("La configuración segura del servidor no está disponible.") }
  const { data: trabajo, error } = await admin.rpc("diime_gestionar_solicitud_cancelacion", {
    p_trabajo: trabajoId, p_actor: user.id, p_accion: accion, p_razon: motivo || "", p_adjuntos: adjuntos.archivos,
  })
  if (error || !trabajo) return { error: await textoServidor(error?.message || "No se pudo actualizar la cancelación.") }
  const mensaje = accion === "solicitar"
    ? `Ha solicitado cancelar el trabajo "${trabajo.titulo}". Motivo: ${motivo}. La otra parte puede aceptar o rechazar la cancelación desde la ficha del trabajo.`
    : accion === "editar"
      ? `Ha actualizado la solicitud de cancelación de "${trabajo.titulo}". Motivo: ${motivo}.`
      : `Ha retirado la solicitud de cancelación de "${trabajo.titulo}". El servicio continúa activo.`
  await postMensajeTrabajo(supabase, user.id, trabajo, mensaje)
  const destinatario = await destinatarioCancelacion(admin, trabajo, trabajo.parte_actor === "cliente" ? "proveedor" : "cliente")
  const { crearNotificacion } = await import("@/lib/notificaciones")
  for (const usuarioId of destinatario.usuarios) await crearNotificacion({
    usuarioId, link: destinatario.link,
    tipo: accion === "solicitar" ? "cancelacion_solicitada" : accion === "editar" ? "cancelacion_actualizada" : "cancelacion_retirada",
    titulo: accion === "solicitar" ? "Solicitud de cancelación" : accion === "editar" ? "Solicitud de cancelación actualizada" : "Solicitud de cancelación retirada",
    metadata: destinatario.metadata, mensaje,
  })
  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-trabajos")
  revalidatePath("/perfil-empresa")
  revalidatePath("/mensajes")
  return { data: { ok: true } }
}

export async function solicitarCancelacion(trabajoId: string, razon: string, archivosAdjuntos: string[] = []) {
  return gestionarSolicitudCancelacion(trabajoId, "solicitar", razon, archivosAdjuntos)
}

export async function editarSolicitudCancelacion(trabajoId: string, razon: string, archivosAdjuntos: string[] = []) {
  return gestionarSolicitudCancelacion(trabajoId, "editar", razon, archivosAdjuntos)
}

export async function retirarSolicitudCancelacion(trabajoId: string) {
  return gestionarSolicitudCancelacion(trabajoId, "retirar")
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
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  const permiso = aceptar ? "gestionar_cobros" : "encargos"
  const permisoEmpresa = await validarActorTrabajoEmpresa(supabase, trabajoId, user.id, permiso)
  if (permisoEmpresa) return { error: await textoServidor(permisoEmpresa) }
  const admin = createAdminClient()
  if (!admin) return { error: await textoServidor("La configuración segura del servidor no está disponible.") }
  const { data: trabajo } = await admin.from("trabajos")
    .select("id, solicitud_id, oferta_id, cliente_id, profesional_id, empresa_cliente_id, empresa_proveedora_id, operador_cliente_id, operador_proveedor_id, estado, cancelacion_estado, cancelacion_solicitada_por, cancelacion_parte_solicitante, cancelacion_razon, titulo")
    .eq("id", trabajoId).maybeSingle()
  if (!trabajo) return { error: await textoServidor("No tienes permiso sobre este trabajo") }
  if (trabajo.cancelacion_estado !== "pendiente") return { error: await textoServidor("No hay ninguna solicitud de cancelación pendiente.") }
  const parteSolicitante: ParteCancelacion | null = trabajo.cancelacion_parte_solicitante
    || (trabajo.cancelacion_solicitada_por === trabajo.cliente_id ? "cliente" : trabajo.cancelacion_solicitada_por === trabajo.profesional_id ? "proveedor" : null)
  if (!parteSolicitante) return { error: await textoServidor("No se pudo identificar la parte que solicita la cancelación.") }
  const permisoContraparte = await validarActorTrabajoEmpresa(supabase, trabajoId, user.id, permiso, parteSolicitante === "cliente" ? "proveedor" : "cliente")
  if (permisoContraparte) return { error: await textoServidor("Solo la otra parte puede responder a esta cancelación.") }

  const razonOposicion = razonRespuesta?.trim()
  const adjuntos = validarAdjuntosCancelacion(archivosAdjuntos)
  if (adjuntos.error) return { error: await textoServidor(adjuntos.error) }
  if (!aceptar && !razonOposicion) {
    return { error: await textoServidor("Explica por qué te opones a la cancelación para que el equipo de Diime pueda decidir.") }
  }

  if (aceptar) {
    // La liquidación fija el reembolso y los gastos retenidos. Los reintentos
    // conservan siempre los importes originales, incluso en casos históricos.
    const { reembolsarPorCancelacion } = await import("./escrow")
    const reembolsoResult = await reembolsarPorCancelacion(trabajoId)
    if (reembolsoResult.error) {
      return { error: await textoServidor(`No se pudo emitir el reembolso al cliente: ${reembolsoResult.error}`) }
    }

    if (reembolsoResult.reutilizado) return { data: { ok: true } }
    await postMensajeTrabajo(
      supabase,
      user.id,
      trabajo,
      `✅ Ha aceptado la cancelación. El trabajo "${trabajo.titulo}" queda cancelado.`,
    )
  } else {
    try {
      const { cerrarCheckoutsPendientes } = await import("@/lib/flujo-pagos")
      const { error: bloqueoError } = await admin.rpc("diime_bloquear_checkout", {
        p_trabajo: trabajoId, p_actor: user.id, p_rechazo_cancelacion: true,
      })
      if (bloqueoError) throw bloqueoError
      await cerrarCheckoutsPendientes(admin, trabajoId)
      const { error: disputaError } = await admin.rpc("diime_abrir_disputa", {
        p_trabajo: trabajoId, p_actor: user.id, p_motivo: razonOposicion,
        p_rechazo_cancelacion: true, p_adjuntos: adjuntos.archivos,
      })
      if (disputaError) throw disputaError
    } catch (error: any) {
      return { error: await textoServidor(error.message || "No se pudo conciliar el pago y abrir la disputa. Puedes reintentar.") }
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
    const destinatario = await destinatarioCancelacion(admin, trabajo, parteSolicitante)
    const { crearNotificacion } = await import("@/lib/notificaciones")
    for (const usuarioId of destinatario.usuarios) await crearNotificacion({
      usuarioId, link: destinatario.link,
      tipo: aceptar ? "cancelacion_aceptada" : "disputa_abierta",
      titulo: aceptar ? "Cancelación aceptada" : "Cancelación rechazada: disputa abierta",
      metadata: destinatario.metadata,
      mensaje: aceptar
        ? `La otra parte ha aceptado cancelar "${trabajo.titulo}". El trabajo queda cancelado.`
        : `La otra parte ha rechazado cancelar "${trabajo.titulo}". Se ha abierto una disputa que resolverá el equipo de Diime según los términos de la contratación (en caso de duda, a favor del cliente).`,
    })
  }

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-trabajos")
  revalidatePath("/perfil-empresa")
  revalidatePath("/mensajes")
  revalidatePath("/admin/disputas")
  return { data: { ok: true } }
}

// Provider updates progress percentage
export async function actualizarProgresoTrabajo(trabajoId: string, progreso: number, mensaje?: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  }

  if (!Number.isFinite(progreso) || !Number.isInteger(progreso) || progreso < 0 || progreso > 100) {
    return { error: await textoServidor("El progreso debe ser un número entero entre 0 y 100.") }
  }

  // Verify user is the professional
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("profesional_id, cliente_id, estado, cancelacion_estado")
    .eq("id", trabajoId)
    .single()

  if (!trabajo || trabajo.profesional_id !== user.id) {
    return { error: await textoServidor("No tienes permiso para actualizar este trabajo") }
  }

  if (trabajo.estado !== "en_progreso" || trabajo.cancelacion_estado === "pendiente") {
    return { error: await textoServidor("Solo puedes actualizar el progreso de un trabajo pagado y en curso, sin cancelación pendiente.") }
  }

  const updates: any = {
    progreso,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("trabajos")
    .update(updates)
    .eq("id", trabajoId)
    .eq("estado", "en_progreso")
    .or("cancelacion_estado.is.null,cancelacion_estado.neq.pendiente")
    .select()
    .single()

  if (error) {
    return { error: await textoServidor(error.message) }
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
    const { crearNotificacion } = await import("@/lib/notificaciones")
    const admin = createAdminClient()
    const destinatarios = data?.empresa_cliente_id
      ? admin ? await destinatariosOperacionEmpresa(admin, data.empresa_cliente_id, data.operador_cliente_id || trabajo.cliente_id) : []
      : [trabajo.cliente_id]
    for (const usuarioId of destinatarios) await crearNotificacion({
      usuarioId,
      tipo: "progreso_trabajo",
      titulo: `Progreso actualizado: ${Math.min(100, Math.max(0, progreso))}%`,
      metadata: { titulo_trabajo: data?.titulo, trabajo_id: trabajoId, parte_destinataria: "cliente" },
      mensaje: mensaje || `El profesional ha actualizado el progreso de "${data?.titulo ?? "tu trabajo"}".`,
      link: data?.empresa_cliente_id ? "/perfil-empresa" : construirLinkNotificacion({ seccion: "/mis-solicitudes", solicitudId: data?.solicitud_id, trabajoId, aspecto: "progreso" }),
    })
  }

  revalidatePath("/mis-solicitudes")
  return { data }
}

// Provider marks work as completed/delivered
export async function marcarTrabajoEntregado(trabajoId: string, mensaje?: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  }

  // Verify user is the professional
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("profesional_id, cliente_id, titulo, estado, cancelacion_estado")
    .eq("id", trabajoId)
    .single()

  if (!trabajo || trabajo.profesional_id !== user.id) {
    return { error: await textoServidor("No tienes permiso para actualizar este trabajo") }
  }
  if (trabajo.estado !== "en_progreso") {
    return { error: await textoServidor("Solo se puede entregar un trabajo que esté en progreso.") }
  }
  if (trabajo.cancelacion_estado === "pendiente") {
    return { error: await textoServidor("Hay una cancelación pendiente. Debe resolverse antes de entregar el trabajo.") }
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
    .or("cancelacion_estado.is.null,cancelacion_estado.neq.pendiente")
    .select()
    .maybeSingle()

  if (error) {
    return { error: await textoServidor(error.message) }
  }
  if (!data) {
    return { error: await textoServidor("El estado del trabajo ha cambiado. Actualiza la página antes de continuar.") }
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
    const { crearNotificacion } = await import("@/lib/notificaciones")
    const admin = createAdminClient()
    const destinatarios = data?.empresa_cliente_id
      ? admin ? await destinatariosOperacionEmpresa(admin, data.empresa_cliente_id, data.operador_cliente_id || trabajo.cliente_id) : []
      : [trabajo.cliente_id]
    for (const usuarioId of destinatarios) await crearNotificacion({
      usuarioId,
      tipo: "trabajo_entregado",
      titulo: `Entrega: ${trabajo.titulo ?? "tu trabajo"}`,
      metadata: { titulo_trabajo: trabajo.titulo, trabajo_id: trabajoId, parte_destinataria: "cliente" },
      mensaje: `${nombrePro} te ha entregado "${trabajo.titulo ?? "tu trabajo"}". Revísalo y confirma la finalización para liberar el pago.`,
      link: data?.empresa_cliente_id ? "/perfil-empresa" : construirLinkNotificacion({ seccion: "/mis-solicitudes", solicitudId: data?.solicitud_id, trabajoId, aspecto: "entrega" }),
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
  if (resultado.error) return { error: await textoServidor(resultado.error) }
  return { data: { id: trabajoId, estado: "completado" } }
}

// Get work updates/progress history
export async function obtenerActualizacionesTrabajo(trabajoId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  }

  const { data, error } = await supabase
    .from("actualizaciones_trabajo")
    .select("*")
    .eq("trabajo_id", trabajoId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: await textoServidor(error.message) }
  }

  return { data }
}

// Todos los trabajos (actuales e históricos) entre el usuario actual y otro
// usuario, en cualquier dirección cliente/proveedor. Para el panel del chat.
export async function obtenerTrabajosConUsuario(otroUsuarioId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado"), data: [] }

  const { data, error } = await supabase
    .from("trabajos")
    .select("id, titulo, estado, precio_acordado, created_at, fecha_fin, cliente_id, profesional_id")
    .or(
      `and(cliente_id.eq.${user.id},profesional_id.eq.${otroUsuarioId}),and(cliente_id.eq.${otroUsuarioId},profesional_id.eq.${user.id})`,
    )
    .order("created_at", { ascending: false })

  if (error) return { error: await textoServidor(error.message), data: [] }
  return { data: data || [] }
}
