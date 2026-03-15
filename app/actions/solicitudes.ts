"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function crearSolicitud(formData: {
  titulo: string
  descripcion: string
  categoria_id: string // This is actually the category name
  ubicacion: string
  presupuesto_min?: number
  presupuesto_max?: number
  urgencia: string
  archivos_adjuntos?: string[]
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado. Por favor inicia sesión para publicar un proyecto." }
  }

  let categoria_uuid = null
  if (formData.categoria_id) {
    const { data: categoria } = await supabase
      .from("categorias")
      .select("id")
      .eq("nombre", formData.categoria_id)
      .single()

    if (categoria) {
      categoria_uuid = categoria.id
    } else {
      // Create category if it doesn't exist
      const { data: newCategoria } = await supabase
        .from("categorias")
        .insert({ nombre: formData.categoria_id })
        .select("id")
        .single()
      categoria_uuid = newCategoria?.id
    }
  }

  const { data, error } = await supabase
    .from("solicitudes")
    .insert({
      cliente_id: user.id,
      titulo: formData.titulo,
      descripcion: formData.descripcion,
      categoria_id: categoria_uuid,
      ubicacion: formData.ubicacion,
      presupuesto_min: formData.presupuesto_min,
      presupuesto_max: formData.presupuesto_max,
      urgencia: formData.urgencia,
      archivos: formData.archivos_adjuntos || [],
      estado: "abierta",
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] Error creating solicitud:", error)
    return { error: error.message }
  }

  revalidatePath("/")
  revalidatePath("/mis-solicitudes")
  revalidatePath("/demandas")
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
      cliente:profiles!solicitudes_cliente_id_fkey(nombre, apellido, ubicacion, foto_perfil)
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
    console.error("[v0] Error fetching solicitudes:", error)
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
      categoria:categorias(nombre, color),
      ofertas(
        id,
        precio,
        tiempo_estimado,
        unidad_tiempo,
        descripcion,
        estado,
        created_at,
        profesional_id
      )
    `)
    .eq("cliente_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching mis solicitudes:", error)
    return { error: error.message }
  }

  return { data }
}

export async function obtenerSolicitudesAbiertas() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("solicitudes")
    .select(`
      *,
      categoria:categorias(nombre, color),
      cliente:profiles!solicitudes_cliente_id_fkey(nombre, apellido, telefono, email, foto_perfil)
    `)
    .eq("estado", "abierta")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching solicitudes abiertas:", error)
    return { error: error.message }
  }

  // Get offer counts separately
  const dataWithCounts = await Promise.all(
    data.map(async (solicitud: any) => {
      const { count } = await supabase
        .from("ofertas")
        .select("*", { count: "exact", head: true })
        .eq("solicitud_id", solicitud.id)
      return {
        ...solicitud,
        total_ofertas: count || 0,
      }
    }),
  )

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

  // First get solicitudes
  const { data: solicitudes, error: solicitudesError } = await supabase
    .from("solicitudes")
    .select(`
      *,
      categoria:categorias(nombre, color)
    `)
    .eq("cliente_id", user.id)
    .order("created_at", { ascending: false })

  if (solicitudesError) {
    console.error("[v0] Error fetching solicitudes por usuario:", solicitudesError)
    return { error: solicitudesError.message }
  }

  // Then get ofertas for each solicitud with professional info
  const dataWithOfertas = await Promise.all(
    solicitudes.map(async (solicitud: any) => {
      const { data: ofertas, error: ofertasError } = await supabase
        .from("ofertas")
        .select(`
          id,
          precio,
          tiempo_estimado,
          unidad_tiempo,
          descripcion,
          estado,
          created_at,
          profesional_id
        `)
        .eq("solicitud_id", solicitud.id)

      if (ofertasError) {
        console.error("[v0] Error fetching ofertas for solicitud:", ofertasError)
        return { ...solicitud, ofertas: [] }
      }

      // Get professional profiles for each oferta
      const ofertasWithProfesional = await Promise.all(
        (ofertas || []).map(async (oferta: any) => {
          const { data: profesional, error: profesionalError } = await supabase
            .from("profesionales")
            .select("id, titulo, tarifa_por_hora, rating_promedio, total_reseñas")
            .eq("id", oferta.profesional_id)
            .single()

          if (profesionalError) {
            console.error("[v0] Error fetching profesional info:", profesionalError)
            return { ...oferta, profesional: null }
          }

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("nombre, apellido, foto_perfil")
            .eq("id", oferta.profesional_id)
            .single()

          if (profileError) {
            console.error("[v0] Error fetching profile info:", profileError)
            return { ...oferta, profesional: profesional }
          }

          return {
            ...oferta,
            profesional: profesional
              ? {
                  ...profesional,
                  profiles: profile,
                }
              : null,
          }
        }),
      )

      return {
        ...solicitud,
        ofertas: ofertasWithProfesional,
      }
    }),
  )

  return { data: dataWithOfertas }
}
