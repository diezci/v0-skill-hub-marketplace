"use server"

import { createClient } from "@/lib/supabase/server"

export interface TrabajoCalendario {
  id: string
  titulo: string
  descripcion: string
  estado: string
  monto: number
  fecha_inicio: string | null
  fecha_estimada_fin: string | null
  horas_estimadas: number | null
  horas_registradas: number | null
  notas_privadas_proveedor: string | null
  prioridad: string
  cliente: {
    id: string
    nombre: string
    apellido: string
    foto_perfil: string | null
  } | null
  solicitud: {
    id: string
    titulo: string
    categoria: string
  } | null
}

export async function obtenerTrabajosCalendario(): Promise<{
  data: TrabajoCalendario[]
  error?: string
}> {
  const supabase = await createClient()
  if (!supabase) {
    return { data: [], error: "No se pudo conectar a la base de datos" }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { data: [], error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .select(`
      id,
      titulo,
      descripcion,
      estado,
      monto,
      fecha_inicio,
      fecha_estimada_fin,
      horas_estimadas,
      horas_registradas,
      notas_privadas_proveedor,
      prioridad,
      cliente:cliente_id (
        id,
        nombre,
        apellido,
        foto_perfil
      ),
      solicitud:solicitud_id (
        id,
        titulo,
        categoria
      )
    `)
    .eq("profesional_id", user.id)
    .in("estado", ["en_progreso", "pendiente_pago", "completado"])
    .order("fecha_inicio", { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data as TrabajoCalendario[] }
}

export async function actualizarEstimacionTrabajo(
  trabajoId: string,
  datos: {
    horas_estimadas?: number
    horas_registradas?: number
    notas_privadas_proveedor?: string
    prioridad?: string
    fecha_inicio?: string
    fecha_estimada_fin?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  if (!supabase) {
    return { success: false, error: "No se pudo conectar a la base de datos" }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "No autenticado" }
  }

  // Verify ownership
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("profesional_id")
    .eq("id", trabajoId)
    .single()

  if (!trabajo || trabajo.profesional_id !== user.id) {
    return { success: false, error: "No tienes permiso para editar este trabajo" }
  }

  const { error } = await supabase
    .from("trabajos")
    .update(datos)
    .eq("id", trabajoId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function obtenerEstadisticasCarga(): Promise<{
  totalTrabajos: number
  trabajosEnProgreso: number
  horasEstimadasSemana: number
  horasRegistradasSemana: number
  trabajosAtrasados: number
}> {
  const supabase = await createClient()
  if (!supabase) {
    return {
      totalTrabajos: 0,
      trabajosEnProgreso: 0,
      horasEstimadasSemana: 0,
      horasRegistradasSemana: 0,
      trabajosAtrasados: 0,
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      totalTrabajos: 0,
      trabajosEnProgreso: 0,
      horasEstimadasSemana: 0,
      horasRegistradasSemana: 0,
      trabajosAtrasados: 0,
    }
  }

  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("estado, horas_estimadas, horas_registradas, fecha_estimada_fin")
    .eq("profesional_id", user.id)
    .in("estado", ["en_progreso", "pendiente_pago"])

  if (!trabajos) {
    return {
      totalTrabajos: 0,
      trabajosEnProgreso: 0,
      horasEstimadasSemana: 0,
      horasRegistradasSemana: 0,
      trabajosAtrasados: 0,
    }
  }

  const hoy = new Date()
  const trabajosAtrasados = trabajos.filter((t) => {
    if (!t.fecha_estimada_fin) return false
    return new Date(t.fecha_estimada_fin) < hoy && t.estado === "en_progreso"
  }).length

  return {
    totalTrabajos: trabajos.length,
    trabajosEnProgreso: trabajos.filter((t) => t.estado === "en_progreso").length,
    horasEstimadasSemana: trabajos.reduce((sum, t) => sum + (t.horas_estimadas || 0), 0),
    horasRegistradasSemana: trabajos.reduce((sum, t) => sum + (t.horas_registradas || 0), 0),
    trabajosAtrasados,
  }
}
