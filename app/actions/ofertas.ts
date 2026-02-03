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
    return { error: "No autenticado" }
  }

  // Verificar que el usuario es profesional
  const { data: profesional } = await supabase.from("profesionales").select("id").eq("id", user.id).single()

  if (!profesional) {
    return { error: "Usuario no es profesional" }
  }

  const { data, error } = await supabase
    .from("ofertas")
    .insert({
      profesional_id: user.id,
      ...formData,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/register-freelancer")
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
        titulo,
        ubicacion,
        cliente:profiles(nombre, apellido)
      )
    `)
    .eq("profesional_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function obtenerOfertasPorProfesional() {
  return obtenerMisOfertas()
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
    .update({ estado })
    .eq("id", ofertaId)
    .eq("profesional_id", user.id)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/mi-cuenta")
  return { data }
}

export async function obtenerOfertasPorSolicitud(solicitudId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("ofertas")
    .select(
      `
      *,
      profesional:profesionales(
        id,
        titulo,
        tarifa_hora,
        rating_promedio,
        total_reseñas,
        profiles!inner(nombre, apellido, foto_perfil, ubicacion)
      )
    `,
    )
    .eq("solicitud_id", solicitudId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}
