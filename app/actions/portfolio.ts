"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function crearItemPortfolio(data: {
  titulo: string
  descripcion: string
  imagen_url: string
  categoria: string
  fecha_completado: string
  ubicacion?: string
  duracion?: string
  presupuesto?: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data: portfolio, error } = await supabase
    .from("portfolio")
    .insert({
      profesional_id: user.id,
      ...data,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/mi-cuenta")
  return { data: portfolio }
}

export async function obtenerPortfolioPorProfesional(profesionalId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("portfolio")
    .select("*")
    .eq("profesional_id", profesionalId)
    .order("fecha_completado", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function eliminarItemPortfolio(itemId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { error } = await supabase.from("portfolio").delete().eq("id", itemId).eq("profesional_id", user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/mi-cuenta")
  return { success: true }
}
