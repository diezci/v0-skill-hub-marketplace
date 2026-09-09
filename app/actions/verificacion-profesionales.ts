"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type {
  EstadoVerificacionProfesional,
  EventoVerificacionProfesional,
  MiVerificacionProfesional,
  SolicitudVerificacionProfesional,
  VerificacionAdmin,
} from "@/lib/verificacion-profesional"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CAMPOS_SOLICITUD = "id, profesional_id, estado, mensaje, comentario_publico, empresa_id, solicitada_at, actualizada_at, resuelta_at"

async function contextoAutenticado(soloAdmin = false) {
  const supabase = await createClient()
  if (!supabase) return { error: "No se puede conectar con Diime. Inténtalo de nuevo." as const }
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: "Inicia sesión para continuar." as const }
  if (soloAdmin) {
    const { data: perfil, error: perfilError } = await supabase
      .from("profiles").select("es_admin").eq("id", user.id).maybeSingle()
    if (perfilError || !perfil?.es_admin) return { error: "No tienes permiso para gestionar verificaciones." as const }
  }
  return { supabase, user }
}

function refrescarVerificacion(profesionalId: string) {
  for (const ruta of ["/admin/verificaciones", "/admin/usuarios", `/admin/usuarios/${profesionalId}`, "/mi-perfil", "/mi-cuenta", "/profesionales", `/profesional/${profesionalId}`, `/usuario/${profesionalId}`, "/"]) {
    revalidatePath(ruta)
  }
}

export async function obtenerMiVerificacionProfesional(): Promise<{ data?: MiVerificacionProfesional; error?: string }> {
  const contexto = await contextoAutenticado()
  if ("error" in contexto) return { error: contexto.error }
  const { supabase, user } = contexto
  const [perfilRes, profesionalRes, solicitudRes] = await Promise.all([
    supabase.from("profiles").select("verificado, empresa_id").eq("id", user.id).maybeSingle(),
    supabase.from("profesionales").select("id").eq("id", user.id).maybeSingle(),
    supabase.from("solicitudes_verificacion_profesional").select(CAMPOS_SOLICITUD).eq("profesional_id", user.id).maybeSingle(),
  ])
  if (perfilRes.error || profesionalRes.error || solicitudRes.error) {
    return { error: "No se pudo cargar tu verificación. Inténtalo de nuevo." }
  }
  if (!perfilRes.data || !profesionalRes.data) return { error: "Primero completa tu perfil profesional." }
  let empresa: MiVerificacionProfesional["empresa"] = null
  if (perfilRes.data.empresa_id) {
    const resultado = await supabase.from("empresas").select("id, nombre").eq("id", perfilRes.data.empresa_id).maybeSingle()
    if (resultado.error || !resultado.data) return { error: "No se pudo comprobar la empresa de tu perfil." }
    empresa = resultado.data
  }
  return {
    data: {
      verificado: !!perfilRes.data.verificado,
      solicitud: solicitudRes.data as SolicitudVerificacionProfesional | null,
      empresa,
    },
  }
}

export async function solicitarVerificacionProfesional(mensaje: string): Promise<{ success?: boolean; error?: string }> {
  if (typeof mensaje !== "string" || mensaje.trim().length > 2000) {
    return { error: "El mensaje debe tener como máximo 2.000 caracteres." }
  }
  const contexto = await contextoAutenticado()
  if ("error" in contexto) return { error: contexto.error }
  const { supabase, user } = contexto
  // La función deriva el proveedor de la sesión y evita solicitudes duplicadas.
  const { data, error } = await supabase.rpc("solicitar_verificacion_profesional", { p_mensaje: mensaje.trim() })
  if (error) return { error: error.message }
  if (!data) return { error: "No se pudo registrar tu solicitud. Inténtalo de nuevo." }
  refrescarVerificacion(user.id)
  return { success: true }
}

export async function obtenerSolicitudesVerificacionAdmin(): Promise<{ data?: VerificacionAdmin[]; error?: string }> {
  const contexto = await contextoAutenticado(true)
  if ("error" in contexto) return { error: contexto.error }
  const { supabase } = contexto
  const resultado: VerificacionAdmin[] = []
  // Leer por bloques evita que el límite de la API oculte solicitudes antiguas.
  for (let desde = 0; ; desde += 200) {
    const solicitudesRes = await supabase.from("solicitudes_verificacion_profesional")
      .select(CAMPOS_SOLICITUD).order("actualizada_at", { ascending: false }).order("id")
      .range(desde, desde + 199)
    if (solicitudesRes.error) return { error: "No se pudieron cargar las solicitudes de verificación." }
    const solicitudes = (solicitudesRes.data || []) as SolicitudVerificacionProfesional[]
    if (!solicitudes.length) break
    const ids = solicitudes.map(s => s.profesional_id)
    const empresasIds = [...new Set(solicitudes.map(s => s.empresa_id).filter((id): id is string => !!id))]
    const [perfilesRes, contactosRes, profesionalesRes, empresasRes] = await Promise.all([
      supabase.from("profiles").select("id, nombre, apellido, verificado, cargo_empresa").in("id", ids),
      supabase.rpc("contacto_perfiles", { p_ids: ids }),
      supabase.from("profesionales").select("id, titulo").in("id", ids),
      empresasIds.length ? supabase.from("empresas").select("id, nombre").in("id", empresasIds) : Promise.resolve({ data: [], error: null }),
    ])
    if (perfilesRes.error || contactosRes.error || profesionalesRes.error || empresasRes.error) {
      return { error: "No se pudieron cargar los datos de contacto de los proveedores." }
    }
    const perfiles = new Map((perfilesRes.data || []).map(p => [p.id, p]))
    const contactos = new Map(((contactosRes.data || []) as { id: string; email?: string; telefono?: string }[]).map(p => [p.id, p]))
    const profesionales = new Map((profesionalesRes.data || []).map(p => [p.id, p]))
    const empresas = new Map((empresasRes.data || []).map(p => [p.id, p]))
    for (const solicitud of solicitudes) {
      const perfil = perfiles.get(solicitud.profesional_id)
      const contacto = contactos.get(solicitud.profesional_id)
      resultado.push({
        ...solicitud,
        nombre: perfil?.nombre || "Proveedor",
        apellido: perfil?.apellido || "",
        email: contacto?.email || "",
        telefono: contacto?.telefono || null,
        titulo: profesionales.get(solicitud.profesional_id)?.titulo || null,
        verificado: !!perfil?.verificado,
        empresa_nombre: solicitud.empresa_id ? empresas.get(solicitud.empresa_id)?.nombre || "Empresa vinculada" : null,
        cargo_empresa: perfil?.cargo_empresa || null,
      })
    }
    if (solicitudes.length < 200) break
  }
  return { data: resultado }
}

export async function obtenerHistorialVerificacionAdmin(profesionalId: string): Promise<{ data?: EventoVerificacionProfesional[]; error?: string }> {
  if (!UUID_RE.test(profesionalId)) return { error: "El proveedor no es válido." }
  const contexto = await contextoAutenticado(true)
  if ("error" in contexto) return { error: contexto.error }
  const { data, error } = await contexto.supabase.from("historial_verificacion_profesional")
    .select("id, estado, comentario_publico, nota_interna, creado_at")
    .eq("profesional_id", profesionalId).order("creado_at", { ascending: false }).limit(100)
  if (error) return { error: "No se pudo cargar el historial de la verificación." }
  return { data: (data || []) as EventoVerificacionProfesional[] }
}

export async function revisarVerificacionProfesional(params: {
  profesionalId: string
  estado: EstadoVerificacionProfesional
  actualizadaAt: string
  comentarioPublico?: string
  notaInterna?: string
}): Promise<{ success?: boolean; error?: string }> {
  if (!params || !UUID_RE.test(params.profesionalId || "") || !["en_revision", "verificado", "no_aprobado", "retirada"].includes(params.estado)) {
    return { error: "La revisión no es válida." }
  }
  if (typeof params.actualizadaAt !== "string" || !params.actualizadaAt || !Number.isFinite(Date.parse(params.actualizadaAt))) {
    return { error: "Actualiza la solicitud antes de tomar una decisión." }
  }
  if ((params.comentarioPublico != null && typeof params.comentarioPublico !== "string") ||
      (params.notaInterna != null && typeof params.notaInterna !== "string")) return { error: "Los comentarios no son válidos." }
  const comentario = params.comentarioPublico?.trim() || ""
  const nota = params.notaInterna?.trim() || ""
  if (comentario.length > 2000 || nota.length > 4000) return { error: "El comentario supera el límite de caracteres." }
  if (["no_aprobado", "retirada"].includes(params.estado) && !comentario) {
    return { error: "Indica al proveedor el motivo para que pueda revisarlo." }
  }
  const contexto = await contextoAutenticado(true)
  if ("error" in contexto) return { error: contexto.error }
  const { supabase } = contexto
  const anterior = await supabase.from("solicitudes_verificacion_profesional")
    .select("estado").eq("profesional_id", params.profesionalId).maybeSingle()
  if (anterior.error) return { error: "No se pudo comprobar el estado de la solicitud." }
  const { data, error } = await supabase.rpc("revisar_verificacion_profesional", {
    p_profesional_id: params.profesionalId,
    p_estado: params.estado,
    p_comentario_publico: comentario,
    p_nota_interna: nota,
    p_actualizada_at: params.actualizadaAt,
  })
  if (error) return { error: error.message }
  if (!data) return { error: "No se pudo guardar la revisión." }
  refrescarVerificacion(params.profesionalId)
  if (anterior.data?.estado !== params.estado) {
    const titulos = {
      en_revision: "El equipo de Diime está revisando tu perfil",
      verificado: "Tu perfil profesional ha sido verificado",
      no_aprobado: "Tu solicitud de verificación necesita una corrección",
      retirada: "Se ha retirado la verificación de tu perfil",
    }
    try {
      const { crearNotificacion } = await import("@/lib/notificaciones")
      await crearNotificacion({
        usuarioId: params.profesionalId,
        tipo: "verificacion_profesional_actualizada",
        titulo: titulos[params.estado as keyof typeof titulos],
        mensaje: comentario || "Consulta el estado de tu verificación en Mi perfil. El equipo de Diime puede contactar contigo para completar la revisión.",
        link: "/mi-perfil#verificacion",
      })
    } catch {
      // La revisión ya está guardada; el aviso no debe provocar un segundo envío.
    }
  }
  return { success: true }
}
