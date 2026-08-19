"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { errorContenidoProhibido } from "@/lib/moderacion"

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
  trabajo_id?: string
  contexto_proveedor?: string
}) {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  let titulo = data.titulo.trim()
  let descripcion = data.descripcion.trim()
  let categoria = data.categoria.trim() || null
  let ubicacion = data.ubicacion?.trim() || null
  if (!titulo || !descripcion) {
    return { error: "Completa título y descripción." }
  }
  const errorModeracion = errorContenidoProhibido(titulo, descripcion, data.contexto_proveedor)
  if (errorModeracion) return { error: errorModeracion }

  let trabajoId: string | null = null
  if (data.trabajo_id) {
    const { data: trabajo } = await supabase
      .from("trabajos")
      .select("id, solicitud:solicitudes(titulo, descripcion, ubicacion, categoria:categorias(nombre))")
      .eq("id", data.trabajo_id)
      .eq("profesional_id", user.id)
      .eq("estado", "completado")
      .maybeSingle()
    const solicitud = trabajo?.solicitud as any
    if (!trabajo || !solicitud?.titulo || !solicitud?.descripcion) {
      return { error: "Ese trabajo no está disponible para el portfolio." }
    }
    trabajoId = trabajo.id
    // Un trabajo verificado siempre conserva la demanda que publicó el
    // cliente; el profesional solo puede ampliar el contexto en su campo.
    titulo = solicitud.titulo
    descripcion = solicitud.descripcion
    categoria = solicitud.categoria?.nombre || categoria
    ubicacion = solicitud.ubicacion || ubicacion
  }

  const { data: portfolio, error } = await supabase
    .from("portfolio")
    .insert({
      profesional_id: user.id,
      trabajo_id: trabajoId,
      titulo,
      descripcion,
      categoria,
      imagenes: data.imagen_url ? [data.imagen_url] : [],
      ubicacion,
      duracion: data.duracion?.trim() || null,
      presupuesto: parsePresupuesto(data.presupuesto),
      fecha_proyecto: data.fecha_completado || null,
      contexto_proveedor: data.contexto_proveedor?.trim() || null,
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

export async function actualizarItemPortfolio(
  itemId: string,
  data: {
    titulo: string
    descripcion: string
    imagen_url: string
    categoria: string
    fecha_completado: string
    ubicacion?: string
    duracion?: string
    presupuesto?: string
    trabajo_id?: string
    contexto_proveedor?: string
  },
) {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  let titulo = data.titulo.trim()
  let descripcion = data.descripcion.trim()
  let categoria = data.categoria.trim() || null
  let ubicacion = data.ubicacion?.trim() || null
  if (!titulo || !descripcion) {
    return { error: "Completa título y descripción." }
  }
  const errorModeracion = errorContenidoProhibido(titulo, descripcion, data.contexto_proveedor)
  if (errorModeracion) return { error: errorModeracion }

  let trabajoId: string | null = null
  if (data.trabajo_id) {
    const { data: trabajo } = await supabase
      .from("trabajos")
      .select("id, solicitud:solicitudes(titulo, descripcion, ubicacion, categoria:categorias(nombre))")
      .eq("id", data.trabajo_id)
      .eq("profesional_id", user.id)
      .eq("estado", "completado")
      .maybeSingle()
    const solicitud = trabajo?.solicitud as any
    if (!trabajo || !solicitud?.titulo || !solicitud?.descripcion) {
      return { error: "Ese trabajo no está disponible para el portfolio." }
    }
    trabajoId = trabajo.id
    titulo = solicitud.titulo
    descripcion = solicitud.descripcion
    categoria = solicitud.categoria?.nombre || categoria
    ubicacion = solicitud.ubicacion || ubicacion
  }

  const { data: portfolio, error } = await supabase
    .from("portfolio")
    .update({
      titulo,
      descripcion,
      trabajo_id: trabajoId,
      categoria,
      imagenes: data.imagen_url ? [data.imagen_url] : [],
      ubicacion,
      duracion: data.duracion?.trim() || null,
      presupuesto: parsePresupuesto(data.presupuesto),
      fecha_proyecto: data.fecha_completado || null,
      contexto_proveedor: data.contexto_proveedor?.trim() || null,
    })
    .eq("id", itemId)
    .eq("profesional_id", user.id)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath("/mi-perfil")
  revalidatePath(`/profesional/${user.id}`)
  return { data: portfolio }
}

export async function obtenerTrabajosCompletadosParaPortfolio() {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible", data: [] }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado", data: [] }

  const { data, error } = await supabase
    .from("trabajos")
    .select("id, ubicacion, precio_acordado, fecha_fin, oferta:ofertas(archivos), solicitud:solicitudes(titulo, descripcion, ubicacion, categoria:categorias(nombre))")
    .eq("profesional_id", user.id)
    .eq("estado", "completado")
    .order("fecha_fin", { ascending: false, nullsFirst: false })

  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

export async function obtenerPortfolioPorProfesional(profesionalId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

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
  if (!supabase) return { error: "Base de datos no disponible" }

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
