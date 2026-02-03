"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function obtenerProfesionales(filtros?: {
  categoria?: string
  ubicacion?: string
  rating_min?: number
}) {
  const supabase = await createClient()

  if (!supabase) {
    console.warn("[v0] Supabase client not available")
    return { error: "Base de datos no disponible", data: [] }
  }

  let query = supabase
    .from("profesionales")
    .select(`
      *,
      perfil:profiles(nombre, apellido, ubicacion, foto_perfil),
      categoria:categorias(nombre, icono)
    `)
    .eq("verificado", true)
    .order("rating_promedio", { ascending: false })

  if (filtros?.categoria) {
    const { data: categoria } = await supabase.from("categorias").select("id").eq("nombre", filtros.categoria).single()

    if (categoria) {
      query = query.eq("categoria_id", categoria.id)
    }
  }

  if (filtros?.ubicacion) {
    query = query.eq("perfil.ubicacion", filtros.ubicacion)
  }

  if (filtros?.rating_min) {
    query = query.gte("rating_promedio", filtros.rating_min)
  }

  const { data, error } = await query

  if (error) {
    console.log("[v0] Error fetching professionals:", error)
    return { error: error.message }
  }

  return { data }
}

export async function obtenerProfesionalPorId(id: string) {
  const supabase = await createClient()

  if (!supabase) {
    return { error: "Base de datos no disponible" }
  }

  const { data: profesional, error: profError } = await supabase
    .from("profesionales")
    .select(`
      *,
      perfil:profiles(nombre, apellido, ubicacion, foto_perfil, foto_portada, email, telefono),
      categoria:categorias(nombre)
    `)
    .eq("id", id)
    .single()

  if (profError) {
    console.log("[v0] Error fetching professional:", profError)
    return { error: profError.message }
  }

  const { data: portfolio } = await supabase
    .from("portfolio")
    .select("*")
    .eq("profesional_id", id)
    .order("fecha_completado", { ascending: false })

  const { data: reviews } = await supabase
    .from("reviews")
    .select(`
      *,
      cliente:cliente_id(nombre, apellido, foto_perfil)
    `)
    .eq("profesional_id", id)
    .order("fecha_creacion", { ascending: false })

  return {
    data: {
      ...profesional,
      portfolio: portfolio || [],
      reviews: reviews || [],
    },
  }
}

export async function actualizarPerfil(formData: {
  nombre?: string
  apellido?: string
  bio?: string
  ubicacion?: string
  telefono?: string
  foto_perfil?: string
  foto_portada?: string
  habilidades?: string[]
  certificaciones?: string[]
  idiomas?: string[]
  tarifa_por_hora?: number
  anos_experiencia?: number
  titulo?: string
  tiempo_respuesta?: string
}) {
  const supabase = await createClient()

  if (!supabase) {
    return { error: "Base de datos no disponible" }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "No autenticado" }
  }

  console.log("[v0] Updating profile for user:", user.id)

  const profileUpdates: any = {}
  if (formData.nombre) profileUpdates.nombre = formData.nombre
  if (formData.apellido) profileUpdates.apellido = formData.apellido
  if (formData.ubicacion) profileUpdates.ubicacion = formData.ubicacion
  if (formData.telefono) profileUpdates.telefono = formData.telefono
  if (formData.foto_perfil) profileUpdates.foto_perfil = formData.foto_perfil
  if (formData.foto_portada) profileUpdates.foto_portada = formData.foto_portada

  if (Object.keys(profileUpdates).length > 0) {
    console.log("[v0] Updating profiles table:", profileUpdates)
    const { error: profileError } = await supabase.from("profiles").update(profileUpdates).eq("id", user.id)

    if (profileError) {
      console.log("[v0] Error updating profile:", profileError)
      return { error: profileError.message }
    }
  }

  const { data: profesional } = await supabase.from("profesionales").select("id").eq("id", user.id).single()

  if (profesional) {
    const profUpdates: any = {}
    if (formData.bio) profUpdates.bio = formData.bio
    if (formData.titulo) profUpdates.titulo = formData.titulo
    if (formData.habilidades) profUpdates.habilidades = formData.habilidades
    if (formData.certificaciones) profUpdates.certificaciones = formData.certificaciones
    if (formData.idiomas) profUpdates.idiomas = formData.idiomas
    if (formData.tarifa_por_hora) profUpdates.tarifa_por_hora = formData.tarifa_por_hora
    if (formData.anos_experiencia) profUpdates.anos_experiencia = formData.anos_experiencia
    if (formData.tiempo_respuesta) profUpdates.tiempo_respuesta = formData.tiempo_respuesta

    if (Object.keys(profUpdates).length > 0) {
      console.log("[v0] Updating profesionales table:", profUpdates)
      const { error: profError } = await supabase.from("profesionales").update(profUpdates).eq("id", profesional.id)

      if (profError) {
        console.log("[v0] Error updating professional:", profError)
        return { error: profError.message }
      }
    }
  }

  console.log("[v0] Profile update successful")
  revalidatePath("/mi-cuenta")
  revalidatePath(`/profesional/${profesional?.id}`)
  return { data: { success: true } }
}

export async function obtenerPerfilActual() {
  const supabase = await createClient()

  if (!supabase) {
    return { error: "Base de datos no disponible" }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "No autenticado" }
  }

  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).single()

  if (profileError) {
    return { error: profileError.message }
  }

  const { data: profesional } = await supabase.from("profesionales").select("*").eq("id", user.id).single()

  return {
    data: {
      ...profile,
      profesional,
    },
  }
}

export async function obtenerProfesionalesDestacados() {
  try {
    const supabase = await createClient()

    if (!supabase) {
      console.warn("[v0] Supabase client not available, returning empty array")
      return []
    }

    try {
      const { data, error } = await supabase
        .from("profesionales")
        .select(`
          id,
          titulo,
          tarifa_por_hora,
          rating_promedio,
          total_reseñas,
          profiles!inner(nombre, apellido, foto_perfil, ubicacion)
        `)
        .eq("disponible", true)
        .gte("rating_promedio", 4.5)
        .order("total_reseñas", { ascending: false })
        .limit(6)

      if (error) {
        console.error("[v0] Supabase query error:", error.message)
        return []
      }

      if (!data || data.length === 0) {
        console.log("[v0] No featured professionals found in database")
        return []
      }

      return data.map((prof: any) => ({
        id: prof.id,
        titulo_profesional: prof.titulo || "Profesional",
        descripcion: "Profesional verificado",
        tarifa_hora: prof.tarifa_por_hora || 0,
        rating_promedio: prof.rating_promedio || 0,
        total_reviews: prof.total_reseñas || 0,
        foto_portada: prof.profiles?.foto_portada,
        foto_perfil: prof.profiles?.foto_perfil,
        nombre_completo: `${prof.profiles?.nombre || ""} ${prof.profiles?.apellido || ""}`.trim(),
        ubicacion: prof.profiles?.ubicacion || "Ubicación no especificada",
        categoria: "Servicios Generales",
        disponible: true,
      }))
    } catch (queryError) {
      console.error(
        "[v0] Network or server error fetching professionals:",
        queryError instanceof Error ? queryError.message : "Unknown error",
      )
      return []
    }
  } catch (error) {
    console.error(
      "[v0] Unexpected error in obtenerProfesionalesDestacados:",
      error instanceof Error ? error.message : "Unknown error",
    )
    return []
  }
}
