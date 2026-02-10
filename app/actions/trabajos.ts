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
    console.error("[v0] Error creating trabajo:", error)
    return { error: error.message }
  }

  // Update solicitud status
  await supabase.from("solicitudes").update({ estado: "en-progreso" }).eq("id", data.solicitud_id)

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
    console.error("[v0] Error fetching trabajos:", error)
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
    .select("profesional_id")
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
