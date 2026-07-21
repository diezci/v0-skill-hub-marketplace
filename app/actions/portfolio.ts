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

  // Map the UI fields to the real DB columns:
  // - imagen_url (string)   -> imagenes (text[])
  // - fecha_completado      -> fecha_proyecto
  // - presupuesto (string)  -> numeric or null
  const presupuestoNum = data.presupuesto
    ? Number.parseFloat(String(data.presupuesto).replace(/[^\d.,]/g, "").replace(",", "."))
    : null

  const { data: portfolio, error } = await supabase
    .from("portfolio")
    .insert({
      profesional_id: user.id,
      titulo: data.titulo,
      descripcion: data.descripcion,
      categoria: data.categoria || null,
      imagenes: data.imagen_url ? [data.imagen_url] : [],
      fecha_proyecto: data.fecha_completado || null,
      ubicacion: data.ubicacion || null,
      duracion: data.duracion || null,
      presupuesto: presupuestoNum && !Number.isNaN(presupuestoNum) ? presupuestoNum : null,
      visible: true,
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
    .order("fecha_proyecto", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  // Map DB columns back to the field names the UI expects
  const mapped = (data || []).map((item: any) => ({
    ...item,
    imagen_url: Array.isArray(item.imagenes) ? item.imagenes[0] : item.imagen_url,
    fecha_completado: item.fecha_proyecto || item.fecha_completado,
  }))

  return { data: mapped }
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
