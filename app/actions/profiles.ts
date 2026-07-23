"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { CATEGORIAS_SERVICIO_NOMBRES } from "@/lib/categorias"
import { PROVINCIAS_ES } from "@/lib/provincias"

export async function obtenerProfesionales(filtros?: {
  categoria?: string
  ubicacion?: string
  rating_min?: number
}) {
  const supabase = await createClient()

  if (!supabase) {
    return { error: "Base de datos no disponible", data: [] }
  }

  // Todos los que tienen ficha de profesional (perfil profesional creado).
  let query = supabase
    .from("profesionales")
    .select(`
      *,
      perfil:profiles(nombre, apellido, ubicacion, foto_perfil, bio, verificado)
    `)
    .order("rating_promedio", { ascending: false })

  if (filtros?.rating_min) {
    query = query.gte("rating_promedio", filtros.rating_min)
  }

  const { data, error } = await query

  if (error) {
    return { error: error.message, data: [] }
  }

  return { data: data || [] }
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
      perfil:profiles(nombre, apellido, ubicacion, foto_perfil, foto_portada, email, telefono)
    `)
    .eq("id", id)
    .single()

  if (profError) {
    return { error: profError.message }
  }

  const { data: portfolio } = await supabase
    .from("portfolio")
    .select("*")
    .eq("profesional_id", id)
    .order("fecha_completado", { ascending: false })

  const { data: reviews } = await supabase
    .from("reseñas")
    .select(`
      *,
      cliente:autor_id(nombre, apellido, foto_perfil)
    `)
    .eq("profesional_id", id)
    .order("created_at", { ascending: false })

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
  // En qué subcategorías de la taxonomía trabaja y qué provincias cubre: de
  // esto dependen los avisos de demandas nuevas.
  categorias_interes?: string[]
  provincias_cobertura?: string[]
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

  // Categorías y provincias solo pueden ser valores de la taxonomía y del
  // listado de provincias: son la base del emparejamiento con las demandas, y
  // un valor libre nunca casaría con ninguna.
  if (formData.categorias_interes !== undefined) {
    const invalidas = formData.categorias_interes.filter((c) => !CATEGORIAS_SERVICIO_NOMBRES.includes(c))
    if (invalidas.length > 0) {
      return { error: `Categorías no válidas: ${invalidas.join(", ")}` }
    }
    if (formData.categorias_interes.length === 0) {
      return { error: "Elige al menos una categoría de servicio para recibir demandas." }
    }
  }
  if (formData.provincias_cobertura !== undefined) {
    const invalidas = formData.provincias_cobertura.filter((p) => !PROVINCIAS_ES.includes(p))
    if (invalidas.length > 0) {
      return { error: `Provincias no válidas: ${invalidas.join(", ")}` }
    }
    if (formData.provincias_cobertura.length === 0) {
      return { error: "Elige al menos una provincia en la que quieras cubrir demandas." }
    }
  }

  const profileUpdates: any = {}
  if (formData.nombre !== undefined) profileUpdates.nombre = formData.nombre
  if (formData.apellido !== undefined) profileUpdates.apellido = formData.apellido
  if (formData.ubicacion !== undefined) profileUpdates.ubicacion = formData.ubicacion
  if (formData.telefono !== undefined) profileUpdates.telefono = formData.telefono
  if (formData.foto_perfil !== undefined) profileUpdates.foto_perfil = formData.foto_perfil
  if (formData.foto_portada !== undefined) profileUpdates.foto_portada = formData.foto_portada
  // bio belongs to profiles table, not profesionales
  if (formData.bio !== undefined) profileUpdates.bio = formData.bio

  if (Object.keys(profileUpdates).length > 0) {
    console.log("[v0] Updating profile with:", profileUpdates)
    const { error: profileError } = await supabase.from("profiles").update(profileUpdates).eq("id", user.id)

    if (profileError) {
      console.error("[v0] Profile update error:", profileError)
      return { error: profileError.message }
    }
    console.log("[v0] Profile updated successfully")
  }

  // Check if professional profile exists
  const { data: profesional } = await supabase.from("profesionales").select("id").eq("id", user.id).single()

  // Prepare professional data (bio is in profiles, not profesionales)
  const profData: any = {}
  if (formData.titulo !== undefined) profData.titulo = formData.titulo
  if (formData.habilidades !== undefined) profData.habilidades = formData.habilidades
  if (formData.certificaciones !== undefined) profData.certificaciones = formData.certificaciones
  if (formData.idiomas !== undefined) profData.idiomas = formData.idiomas
  if (formData.tarifa_por_hora !== undefined) profData.tarifa_por_hora = formData.tarifa_por_hora
  // DB column is "años_experiencia" (with ñ), not "anos_experiencia"
  if (formData.anos_experiencia !== undefined) profData["años_experiencia"] = formData.anos_experiencia
  if (formData.categorias_interes !== undefined) profData.categorias_interes = formData.categorias_interes
  if (formData.provincias_cobertura !== undefined) profData.provincias_cobertura = formData.provincias_cobertura

  if (Object.keys(profData).length > 0) {
    console.log("[v0] Updating profesional with:", profData)
    if (profesional) {
      // Update existing professional
      const { error: profError } = await supabase.from("profesionales").update(profData).eq("id", profesional.id)
      if (profError) {
        console.error("[v0] Profesional update error:", profError)
        return { error: profError.message }
      }
      console.log("[v0] Profesional updated successfully")
    } else {
      // Create new professional profile if user is trying to add professional data
      const hasProfessionalData = formData.titulo ||
        (formData.habilidades && formData.habilidades.length > 0) ||
        (formData.certificaciones && formData.certificaciones.length > 0) ||
        (formData.categorias_interes && formData.categorias_interes.length > 0) ||
        (formData.provincias_cobertura && formData.provincias_cobertura.length > 0)
      
      if (hasProfessionalData) {
        const { error: createError } = await supabase.from("profesionales").insert({
          id: user.id,
          ...profData,
          disponible: true,
          rating_promedio: 0,
          total_reseñas: 0,
        })
        if (createError) {
          return { error: createError.message }
        }
        // Al crear ficha profesional, marcar al usuario como profesional para
        // que aparezca en la sección "Profesionales".
        await supabase.from("profiles").update({ tipo_usuario: "profesional" }).eq("id", user.id)
      }
    }
  }

  revalidatePath("/mi-cuenta")
  revalidatePath("/mi-perfil")
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

  // Normalize años_experiencia to anos_experiencia for frontend compatibility
  const normalizedProfesional = profesional ? {
    ...profesional,
    anos_experiencia: profesional["años_experiencia"] ?? profesional.anos_experiencia ?? 0,
  } : null

  return {
    data: {
      ...profile,
      profesional: normalizedProfesional,
    },
  }
}

export async function obtenerProfesionalesDestacados() {
  try {
    const supabase = await createClient()

    if (!supabase) {
      return []
    }

    try {
      // First, get professionals
      const { data: profesionales, error: profError } = await supabase
        .from("profesionales")
        .select("id, titulo, tarifa_por_hora, rating_promedio, total_reseñas, disponible")
        .eq("disponible", true)
        .order("total_reseñas", { ascending: false })
        .limit(6)

      if (profError) {
        return []
      }

      if (!profesionales || profesionales.length === 0) {
        return []
      }

      // Then get profiles for these professionals
      const profIds = profesionales.map(p => p.id)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, nombre, apellido, foto_perfil, ubicacion")
        .in("id", profIds)

      if (profilesError) {
        // Continue with available data
      }

      // Create a map for quick profile lookup
      const profilesMap = new Map((profiles || []).map(p => [p.id, p]))

      return profesionales.map((prof: any) => {
        const profile = profilesMap.get(prof.id)
        return {
          id: prof.id,
          titulo_profesional: prof.titulo || "Profesional",
          descripcion: "Profesional verificado",
          tarifa_hora: prof.tarifa_por_hora || 0,
          rating_promedio: prof.rating_promedio || 0,
          total_reviews: prof.total_reseñas || 0,
          foto_portada: profile?.foto_perfil,
          foto_perfil: profile?.foto_perfil,
          nombre_completo: `${profile?.nombre || ""} ${profile?.apellido || ""}`.trim() || "Profesional",
          ubicacion: profile?.ubicacion || "Ubicación no especificada",
          categoria: "Servicios Generales",
          disponible: true,
        }
      })
    } catch {
      return []
    }
  } catch {
    return []
  }
}
