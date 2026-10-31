"use server"

import { textoServidor } from "@/lib/i18n-servidor"

import { createClient } from "@/lib/supabase/server"
import { validateCalendarEvent } from "@/lib/calendar-events"

export interface TrabajoCalendario {
  id: string
  titulo: string
  descripcion: string
  estado: string
  monto: number
  fecha_inicio: string | null
  fecha_estimada_fin: string | null
  // Fecha REAL de cierre (se rellena al completar o cancelar). Manda sobre la
  // estimada en el calendario: si un trabajo se termina antes de tiempo, la
  // marca debe moverse al día en que se terminó, no quedarse en la previsión.
  fecha_fin: string | null
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
  error?: string; codigo?: "NO_AUTENTICADO"
}> {
  const supabase = await createClient()
  if (!supabase) {
    return { data: [], error: await textoServidor("No se pudo conectar a la base de datos") }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { codigo: "NO_AUTENTICADO", data: [], error: await textoServidor("No autenticado") }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .select(`
      id,
      titulo,
      descripcion,
      estado,
      monto:precio_acordado,
      fecha_inicio,
      fecha_estimada_fin,
      fecha_fin,
      horas_estimadas,
      horas_registradas,
      prioridad,
      cliente:cliente_id (
        id,
        nombre,
        apellido,
        foto_perfil
      ),
      solicitud:solicitud_id (
        id,
        titulo
      )
    `)
    .eq("profesional_id", user.id)
    .in("estado", ["en_progreso", "pendiente_pago", "entregado", "completado", "cancelado"])
    .order("fecha_inicio", { ascending: true })

  if (error) {
    return { data: [], error: await textoServidor(error.message) }
  }

  const notasPorTrabajo = new Map<string, string>()
  const planesPorTrabajo = new Map<string, Record<string, unknown>>()
  for (let inicio = 0; inicio < (data || []).length; inicio += 500) {
    const { data: notas, error: errorNotas } = await supabase.rpc("notas_trabajos_proveedor", {
      p_trabajo_ids: (data || []).slice(inicio, inicio + 500).map((trabajo) => trabajo.id),
    })
    if (errorNotas) return { data: [], error: await textoServidor(errorNotas.message) }
    for (const nota of (notas || []) as { trabajo_id: string; notas_privadas_proveedor: string }[]) {
      notasPorTrabajo.set(nota.trabajo_id, nota.notas_privadas_proveedor)
    }
    const { data: planes, error: errorPlanes } = await supabase.rpc("planificacion_trabajos_proveedor", {
      p_trabajo_ids: (data || []).slice(inicio, inicio + 500).map((trabajo) => trabajo.id),
    })
    if (errorPlanes) return { data: [], error: await textoServidor(errorPlanes.message) }
    for (const plan of (planes || []) as { trabajo_id: string; datos: Record<string, unknown> }[]) {
      planesPorTrabajo.set(plan.trabajo_id, plan.datos)
    }
  }
  // Las notas nunca se leen de la fila contractual visible para el cliente.
  return { data: (data || []).map((trabajo) => ({
    ...trabajo,
    ...planesPorTrabajo.get(trabajo.id),
    notas_privadas_proveedor: notasPorTrabajo.get(trabajo.id) ?? null,
  })) as unknown as TrabajoCalendario[] }
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
): Promise<{ success: boolean; error?: string; codigo?: "NO_AUTENTICADO" }> {
  const supabase = await createClient()
  if (!supabase) {
    return { success: false, error: await textoServidor("No se pudo conectar a la base de datos") }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { codigo: "NO_AUTENTICADO", success: false, error: await textoServidor("No autenticado") }
  }

  const { error } = await supabase.rpc("actualizar_planificacion_trabajo", {
    p_trabajo_id: trabajoId,
    p_datos: datos,
  })

  if (error) {
    return { success: false, error: await textoServidor(error.message) }
  }

  return { success: true }
}

export interface ServicioSolicitado {
  id: string
  titulo: string
  descripcion: string
  estado: string
  monto: number
  fecha_inicio: string | null
  fecha_estimada_fin: string | null
  fecha_fin: string | null
  profesional: {
    id: string
    nombre: string
    apellido: string
    foto_perfil: string | null
    titulo?: string
  } | null
  solicitud: {
    id: string
    titulo: string
    categoria: string
  } | null
}

export async function obtenerServiciosSolicitados(): Promise<{
  data: ServicioSolicitado[]
  error?: string; codigo?: "NO_AUTENTICADO"
}> {
  const supabase = await createClient()
  if (!supabase) {
    return { data: [], error: await textoServidor("No se pudo conectar a la base de datos") }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { codigo: "NO_AUTENTICADO", data: [], error: await textoServidor("No autenticado") }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .select(`
      id,
      titulo,
      descripcion,
      estado,
      monto:precio_acordado,
      fecha_inicio,
      fecha_estimada_fin,
      fecha_fin,
      profesional_id,
      solicitud:solicitud_id (
        id,
        titulo
      )
    `)
    .eq("cliente_id", user.id)
    .in("estado", ["en_progreso", "pendiente_pago", "entregado", "completado", "cancelado"])
    .order("fecha_inicio", { ascending: true })

  if (error) {
    return { data: [], error: await textoServidor(error.message) }
  }

  const ids = [...new Set((data || []).map(servicio => servicio.profesional_id).filter(Boolean))]
  const [perfiles, profesionales] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, nombre, apellido, foto_perfil").in("id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("profesionales").select("id, titulo").in("id", ids) : Promise.resolve({ data: [], error: null }),
  ])
  if (perfiles.error || profesionales.error) return { data: [], error: await textoServidor("No se pudo cargar la información de los profesionales.") }
  const perfilesPorId = new Map((perfiles.data || []).map(perfil => [perfil.id, perfil]))
  const titulosPorId = new Map((profesionales.data || []).map(perfil => [perfil.id, perfil.titulo]))
  return { data: (data || []).map(servicio => ({
    ...servicio,
    profesional: perfilesPorId.has(servicio.profesional_id)
      ? { ...perfilesPorId.get(servicio.profesional_id), titulo: titulosPorId.get(servicio.profesional_id) }
      : null,
  })) as unknown as ServicioSolicitado[] }

}

export interface EventoCalendario {
  id: string
  titulo: string
  descripcion: string | null
  fecha_inicio: string
  fecha_fin: string | null
  color: string
  tipo: string
  todo_el_dia: boolean
  ubicacion: string | null
}

export async function obtenerEventosCalendario(): Promise<{
  data: EventoCalendario[]
  error?: string; codigo?: "NO_AUTENTICADO"
}> {
  const supabase = await createClient()
  if (!supabase) {
    return { data: [], error: await textoServidor("No se pudo conectar a la base de datos") }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { codigo: "NO_AUTENTICADO", data: [], error: await textoServidor("No autenticado") }
  }

  const { data, error } = await supabase
    .from("eventos_calendario")
    .select("id, titulo, descripcion, fecha_inicio, fecha_fin, color, tipo, todo_el_dia, ubicacion")
    .eq("usuario_id", user.id)
    .order("fecha_inicio", { ascending: true })

  if (error) {
    return { data: [], error: await textoServidor(error.message) }
  }

  return { data: (data || []) as EventoCalendario[] }
}

export async function crearEventoCalendario(datos: {
  titulo: string
  descripcion?: string
  fecha_inicio: string
  fecha_fin?: string | null
  color?: string
  tipo?: string
  todo_el_dia?: boolean
  ubicacion?: string
}): Promise<{ success: boolean; error?: string; codigo?: "NO_AUTENTICADO"; id?: string }> {
  const invalid = validateCalendarEvent(datos)
  if (invalid) return { success: false, error: await textoServidor(invalid) }
  const supabase = await createClient()
  if (!supabase) {
    return { success: false, error: await textoServidor("No se pudo conectar a la base de datos") }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { codigo: "NO_AUTENTICADO", success: false, error: await textoServidor("No autenticado") }
  }

  const { data, error } = await supabase
    .from("eventos_calendario")
    .insert({
      usuario_id: user.id,
      titulo: datos.titulo.trim(),
      descripcion: datos.descripcion || null,
      fecha_inicio: datos.fecha_inicio,
      fecha_fin: datos.fecha_fin || null,
      color: datos.color || "emerald",
      tipo: datos.tipo || "personal",
      todo_el_dia: datos.todo_el_dia ?? true,
      ubicacion: datos.ubicacion || null,
    })
    .select("id")
    .single()

  if (error) {
    return { success: false, error: await textoServidor(error.message) }
  }

  return { success: true, id: data?.id }
}

export async function actualizarEventoCalendario(
  id: string,
  datos: Partial<{
    titulo: string
    descripcion: string | null
    fecha_inicio: string
    fecha_fin: string | null
    color: string
    tipo: string
    todo_el_dia: boolean
    ubicacion: string | null
  }>,
): Promise<{ success: boolean; error?: string; codigo?: "NO_AUTENTICADO" }> {
  const supabase = await createClient()
  if (!supabase) {
    return { success: false, error: await textoServidor("No se pudo conectar a la base de datos") }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { codigo: "NO_AUTENTICADO", success: false, error: await textoServidor("No autenticado") }
  }

  const existente = await supabase.from("eventos_calendario")
    .select("titulo, descripcion, fecha_inicio, fecha_fin, color, tipo, todo_el_dia, ubicacion")
    .eq("id", id).eq("usuario_id", user.id).maybeSingle()
  if (existente.error || !existente.data) return { success: false, error: await textoServidor("No se encontró el evento en tu calendario.") }
  // Whitelist fields: a crafted action payload must never change its owner.
  const permitidos = ["titulo", "descripcion", "fecha_inicio", "fecha_fin", "color", "tipo", "todo_el_dia", "ubicacion"] as const
  const cambios = Object.fromEntries(permitidos.filter(campo => datos[campo] !== undefined).map(campo => [campo, datos[campo]]))
  const completo = { ...existente.data, ...cambios }
  const invalid = validateCalendarEvent(completo)
  if (invalid) return { success: false, error: await textoServidor(invalid) }
  const { data, error } = await supabase
    .from("eventos_calendario")
    .update({ ...cambios, titulo: completo.titulo.trim() })
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select("id")
    .maybeSingle()

  if (error) {
    return { success: false, error: await textoServidor(error.message) }
  }

  if (!data) return { success: false, error: await textoServidor("No se encontró el evento en tu calendario.") }
  return { success: true }
}

export async function eliminarEventoCalendario(id: string): Promise<{ success: boolean; error?: string; codigo?: "NO_AUTENTICADO" }> {
  const supabase = await createClient()
  if (!supabase) {
    return { success: false, error: await textoServidor("No se pudo conectar a la base de datos") }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { codigo: "NO_AUTENTICADO", success: false, error: await textoServidor("No autenticado") }
  }

  const { data, error } = await supabase
    .from("eventos_calendario")
    .delete()
    .eq("id", id)
    .eq("usuario_id", user.id)
    .select("id")
    .maybeSingle()

  if (error) {
    return { success: false, error: await textoServidor(error.message) }
  }

  if (!data) return { success: false, error: await textoServidor("No se encontró el evento en tu calendario.") }
  return { success: true }
}

export async function obtenerEstadisticasCarga(): Promise<{
  error?: string
  totalTrabajos: number
  trabajosEnProgreso: number
  horasEstimadasAcumuladas: number
  horasRegistradasAcumuladas: number
  trabajosAtrasados: number
}> {
  // Use the same authorized private planning as the calendar. Contract fields
  // remain frozen and cannot represent later changes to a provider's plan.
  const calendario = await obtenerTrabajosCalendario()
  if (calendario.error) return {
    error: calendario.error,
    totalTrabajos: 0,
    trabajosEnProgreso: 0,
    horasEstimadasAcumuladas: 0,
    horasRegistradasAcumuladas: 0,
    trabajosAtrasados: 0,
  }
  const trabajos = calendario.data.filter((t) => ["en_progreso", "pendiente_pago"].includes(t.estado))
  const hoy = new Date()
  return {
    totalTrabajos: trabajos.length,
    trabajosEnProgreso: trabajos.filter((t) => t.estado === "en_progreso").length,
    horasEstimadasAcumuladas: trabajos.reduce((sum, t) => sum + (t.horas_estimadas || 0), 0),
    horasRegistradasAcumuladas: trabajos.reduce((sum, t) => sum + (t.horas_registradas || 0), 0),
    trabajosAtrasados: trabajos.filter((t) => t.fecha_estimada_fin && new Date(t.fecha_estimada_fin) < hoy && t.estado === "en_progreso").length,
  }
}
