"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// La tabla guarda `imagenes` (text[]), `fecha_proyecto` (date) y `presupuesto` (numeric).
// El formulario trabaja con una sola imagen y un importe escrito a mano, así que se traduce aquí.
// El formulario envía el importe en euros como número plano; se descartan negativos.
function parsePresupuesto(valor?: string): number | null {
  if (!valor?.trim()) return null
  const num = Number.parseFloat(valor)
  if (!Number.isFinite(num) || num < 0) return null
  return num
}

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
      titulo: data.titulo,
      descripcion: data.descripcion,
      categoria: data.categoria || null,
      imagenes: data.imagen_url ? [data.imagen_url] : [],
      ubicacion: data.ubicacion || null,
      duracion: data.duracion || null,
      presupuesto: parsePresupuesto(data.presupuesto),
      fecha_proyecto: data.fecha_completado || null,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/mi-perfil")
  revalidatePath(`/profesional/${user.id}`)
  return { data: portfolio }
}

export async function obtenerPortfolioPorProfesional(profesionalId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("portfolio")
    .select("*")
    .eq("profesional_id", profesionalId)
    .order("fecha_proyecto", { ascending: false, nullsFirst: false })

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

  revalidatePath("/mi-perfil")
  revalidatePath(`/profesional/${user.id}`)
  return { success: true }
}
