"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function toggleFavorito(profesionalId: string): Promise<{
  success?: boolean
  isFavorite?: boolean
  error?: string
}> {
  const supabase = await createClient()
  if (!supabase) return { error: "Database connection error" }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Debes iniciar sesion" }

  // Check if already favorite
  const { data: existing } = await supabase
    .from("favoritos")
    .select("id")
    .eq("cliente_id", user.id)
    .eq("profesional_id", profesionalId)
    .maybeSingle()

  if (existing) {
    // Remove from favorites
    const { error } = await supabase.from("favoritos").delete().eq("id", existing.id)
    if (error) return { error: error.message }

    revalidatePath("/favoritos")
    return { success: true, isFavorite: false }
  }

  // Add to favorites
  const { error } = await supabase.from("favoritos").insert({
    cliente_id: user.id,
    profesional_id: profesionalId,
  })

  if (error) return { error: error.message }

  revalidatePath("/favoritos")
  return { success: true, isFavorite: true }
}

export async function obtenerFavoritos() {
  const supabase = await createClient()
  if (!supabase) return { data: [], error: "Database connection error" }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { data: [], error: "No autenticado" }

  const { data, error } = await supabase
    .from("favoritos")
    .select(`
      id,
      created_at,
      profesional:profesional_id (
        id,
        nombre,
        apellido,
        foto_perfil,
        ubicacion,
        bio
      )
    `)
    .eq("cliente_id", user.id)
    .order("created_at", { ascending: false })

  if (error) return { data: [], error: error.message }

  // Enrich with profesional data
  const enriched = await Promise.all(
    (data || []).map(async (fav: any) => {
      if (!fav.profesional?.id) return fav
      const { data: profData } = await supabase
        .from("profesionales")
        .select("titulo, rating_promedio, total_trabajos, tarifa_por_hora")
        .eq("id", fav.profesional.id)
        .single()

      return {
        ...fav,
        profesional: { ...fav.profesional, ...profData },
      }
    })
  )

  return { data: enriched }
}

export async function isFavorito(profesionalId: string): Promise<boolean> {
  const supabase = await createClient()
  if (!supabase) return false

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return false

  const { data } = await supabase
    .from("favoritos")
    .select("id")
    .eq("cliente_id", user.id)
    .eq("profesional_id", profesionalId)
    .maybeSingle()

  return !!data
}
