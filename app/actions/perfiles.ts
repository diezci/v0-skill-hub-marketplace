"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function obtenerPerfil(userId?: string) {
  const supabase = await createClient()

  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { error: "No autenticado" }
    }
    userId = user.id
  }

  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function obtenerPerfilProfesional(profesionalId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("profesionales")
    .select(`
      *,
      perfil:profiles(*),
      portfolio:portfolio(*),
      reseñas:reseñas(
        *,
        autor:profiles(nombre, apellido, foto_perfil)
      )
    `)
    .eq("id", profesionalId)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function actualizarPerfil(updates: any) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase.from("profiles").update(updates).eq("id", user.id).select().single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/mi-cuenta")
  revalidatePath(`/profesional/${user.id}`)
  return { data }
}

export async function actualizarPerfilProfesional(updates: any) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("profesionales")
    .upsert({
      id: user.id,
      ...updates,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/mi-cuenta")
  revalidatePath(`/profesional/${user.id}`)
  return { data }
}
