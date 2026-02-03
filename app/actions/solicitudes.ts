"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function crearSolicitud(formData: {
  titulo: string
  descripcion: string
  categoria_id: string
  ubicacion: string
  presupuesto_min?: number
  presupuesto_max?: number
  urgencia: string
  archivos?: any[]
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("solicitudes")
    .insert({
      cliente_id: user.id,
      ...formData,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/")
  revalidatePath("/register-freelancer")
  return { data }
}

export async function obtenerSolicitudes(filtros?: {
  categoria?: string
  estado?: string
}) {
  const supabase = await createClient()

  let query = supabase
    .from("solicitudes")
    .select(`
      *,
      categoria:categorias(nombre, color),
      cliente:profiles(nombre, apellido, ubicacion)
    `)
    .order("created_at", { ascending: false })

  if (filtros?.categoria) {
    query = query.eq("categoria_id", filtros.categoria)
  }

  if (filtros?.estado) {
    query = query.eq("estado", filtros.estado)
  }

  const { data, error } = await query

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function obtenerMisSolicitudes() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("solicitudes")
    .select(`
      *,
      categoria:categorias(nombre),
      ofertas:ofertas(count)
    `)
    .eq("cliente_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function obtenerSolicitudesAbiertas() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("solicitudes")
    .select(
      `
      *,
      categoria:categorias(nombre, color),
      cliente:profiles(nombre, apellido, telefono, email),
      ofertas(count)
    `,
    )
    .eq("estado", "abierta")
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  // Transform data to include total_ofertas
  const dataWithCounts = data.map((solicitud: any) => ({
    ...solicitud,
    total_ofertas: solicitud.ofertas?.[0]?.count || 0,
  }))

  return { data: dataWithCounts }
}

export async function obtenerSolicitudesPorUsuario() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("solicitudes")
    .select(
      `
      *,
      categoria:categorias(nombre, color),
      ofertas(
        id,
        precio,
        tiempo_estimado,
        unidad_tiempo,
        descripcion,
        estado,
        created_at,
        profesional:profesionales(
          id,
          titulo,
          profiles!inner(nombre, apellido, foto_perfil)
        )
      )
    `,
    )
    .eq("cliente_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}
