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

  // Check if already sent an offer for this solicitud
  const { data: existingOffer } = await supabase
    .from("ofertas")
    .select("id")
    .eq("solicitud_id", formData.solicitud_id)
    .eq("profesional_id", user.id)
    .single()

  if (existingOffer) {
    return { error: "Ya has enviado una oferta para esta solicitud." }
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
    console.error("[v0] Error creating oferta:", error)
    return { error: error.message }
  }

  // Update total_ofertas in solicitud
  await supabase.rpc("increment_total_ofertas", { solicitud_uuid: formData.solicitud_id })

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
    console.error("[v0] Error fetching ofertas:", error)
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

  return { data: trabajoResult.data }
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
    console.error("[v0] Error fetching ofertas por solicitud:", error)
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
