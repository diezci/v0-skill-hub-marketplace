"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function crearResena(data: {
  trabajo_id: string
  profesional_id: string
  rating: number
  comentario: string
  tipo_proyecto?: string
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Verify user is the client of this trabajo
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("cliente_id, estado, titulo")
    .eq("id", data.trabajo_id)
    .single()

  if (!trabajo || trabajo.cliente_id !== user.id) {
    return { error: "No tienes permiso para dejar una resena en este trabajo" }
  }

  if (trabajo.estado !== "completado") {
    return { error: "Solo puedes dejar resena en trabajos completados" }
  }

  // Check if review already exists
  const { data: existing } = await supabase
    .from("reseñas")
    .select("id")
    .eq("trabajo_id", data.trabajo_id)
    .eq("autor_id", user.id)
    .single()

  if (existing) {
    return { error: "Ya has dejado una resena para este trabajo" }
  }

  const { data: resena, error } = await supabase
    .from("reseñas")
    .insert({
      trabajo_id: data.trabajo_id,
      profesional_id: data.profesional_id,
      autor_id: user.id,
      rating: data.rating,
      comentario: data.comentario,
      tipo_proyecto: data.tipo_proyecto || trabajo.titulo,
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] Error creating review:", error)
    return { error: error.message }
  }

  // Update trabajo with review id
  await supabase
    .from("trabajos")
    .update({ review_cliente_id: resena.id })
    .eq("id", data.trabajo_id)

  // Recalculate professional's average rating
  const { data: allReviews } = await supabase
    .from("reseñas")
    .select("rating")
    .eq("profesional_id", data.profesional_id)

  if (allReviews && allReviews.length > 0) {
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
    await supabase
      .from("profesionales")
      .update({
        rating_promedio: Math.round(avgRating * 10) / 10,
        total_reseñas: allReviews.length,
      })
      .eq("id", data.profesional_id)
  }

  revalidatePath("/mis-solicitudes")
  revalidatePath(`/profesional/${data.profesional_id}`)
  return { data: resena }
}

export async function obtenerResenasProfesional(profesionalId: string) {
  const supabase = await createClient()

  const { data: resenas, error } = await supabase
    .from("reseñas")
    .select("id, rating, comentario, tipo_proyecto, created_at, votos_utiles, autor_id")
    .eq("profesional_id", profesionalId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message, data: [] }
  }

  if (resenas && resenas.length > 0) {
    const autorIds = [...new Set(resenas.map(r => r.autor_id))]
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, nombre, apellido, foto_perfil")
      .in("id", autorIds)

    const perfilesMap = new Map((perfiles || []).map(p => [p.id, p]))

    return {
      data: resenas.map(r => ({
        ...r,
        autor: perfilesMap.get(r.autor_id) || { nombre: "Usuario", apellido: "" },
      })),
    }
  }

  return { data: [] }
}
