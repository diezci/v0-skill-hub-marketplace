"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function crearReview(data: {
  profesional_id: string
  solicitud_id?: string
  rating: number
  comentario: string
  proyecto_tipo?: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data: review, error } = await supabase
    .from("reviews")
    .insert({
      cliente_id: user.id,
      profesional_id: data.profesional_id,
      solicitud_id: data.solicitud_id,
      rating: data.rating,
      comentario: data.comentario,
      proyecto_tipo: data.proyecto_tipo,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/profesional/${data.profesional_id}`)
  return { data: review }
}

export async function obtenerReviewsPorProfesional(profesionalId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("reviews")
    .select(
      `
      *,
      cliente:profiles(nombre, apellido, foto_perfil)
    `,
    )
    .eq("profesional_id", profesionalId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}
