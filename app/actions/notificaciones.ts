"use server"

import { textoServidor } from "@/lib/i18n-servidor"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { contextualizarNotificacion, construirLinkNotificacion, idNotificacionValido, seccionDeNotificacion, type NotificacionBase, type NotificacionContextual } from "@/lib/notificaciones-contexto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  preferenciasEmailAFila,
  sonPreferenciasEmailValidas,
  type PreferenciasEmail,
} from "@/lib/preferencias-notificaciones"

// Guarda el interruptor general y cada categoría. La fila siempre se vincula al
// usuario autenticado en el servidor; el navegador no decide su propietario.
export async function actualizarPreferenciasEmails(preferencias: PreferenciasEmail) {
  if (!sonPreferenciasEmailValidas(preferencias)) return { error: await textoServidor("Preferencias no válidas") }

  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  const { error } = await supabase.from("preferencias_notificaciones").upsert(
    {
      usuario_id: user.id,
      ...preferenciasEmailAFila(preferencias),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "usuario_id" },
  )
  if (error) return { error: await textoServidor(error.message) }

  revalidatePath("/mi-cuenta")
  return { success: true }
}

const CAMPOS_AVISO = "id, tipo, titulo, mensaje, link, enlace, metadata, leida, created_at"

// Read pending rows in pages: an old unread profile/support notice must remain
// reachable even when more than 20 (or the API's 1000-row limit) are newer.
async function cargarPendientes(supabase: SupabaseClient, usuarioId: string) {
  const filas: NotificacionBase[] = []
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await supabase.from("notificaciones").select(CAMPOS_AVISO)
      .eq("usuario_id", usuarioId).eq("leida", false)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(desde, desde + 499)
    if (error) throw error
    filas.push(...(data || []))
    if (!data || data.length < 500) return filas
  }
}

// Legacy notifications lacked IDs. Resolve only an unambiguous title among
// records the viewer can read, and never use an admin client for enrichment.
async function enriquecerAvisos(supabase: SupabaseClient, usuarioId: string, filas: NotificacionBase[]) {
  const avisos = filas.map(contextualizarNotificacion)
  const incidencias: any[] = []
  const avisosIncidencia = avisos.filter(n => n.seccion === "/incidencias")
  for (const [campo, valores] of [
    ["id", [...new Set(avisosIncidencia.map(n => n.incidencia_id).filter(Boolean))]],
    ["asunto", [...new Set(avisosIncidencia.filter(n => !n.incidencia_id).map(n => n.tituloEntidad).filter(Boolean))]],
  ] as [string, string[]][]) {
    for (let inicio = 0; inicio < valores.length; inicio += 100) {
      const { data } = await supabase.from("incidencias").select("id, asunto")
        .eq("reportado_por", usuarioId).in(campo, valores.slice(inicio, inicio + 100))
      for (const inc of data || []) if (!incidencias.some(actual => actual.id === inc.id)) incidencias.push(inc)
    }
  }
  const titulos = [...new Set(avisos.filter(n => n.seccion !== "/incidencias" && !n.solicitud_id && !n.trabajo_id && n.tituloEntidad).map(n => n.tituloEntidad!))]
  const trabajos: any[] = [], solicitudes: any[] = [], ofertas: any[] = []
  const filtros = [
    ["titulo", titulos],
    ["id", [...new Set(avisos.map(n => n.trabajo_id).filter(Boolean))]],
    ["solicitud_id", [...new Set(avisos.map(n => n.solicitud_id).filter(Boolean))]],
    ["oferta_id", [...new Set(avisos.map(n => n.oferta_id).filter(Boolean))]],
  ] as [string, string[]][]
  for (const [campo, valores] of filtros) {
    for (let inicio = 0; inicio < valores.length; inicio += 100) {
      const { data } = await supabase.from("trabajos")
        .select("id, solicitud_id, oferta_id, titulo, cliente_id, profesional_id, estado")
        .or(`cliente_id.eq.${usuarioId},profesional_id.eq.${usuarioId}`).in(campo, valores.slice(inicio, inicio + 100))
      for (const t of data || []) if (!trabajos.some(actual => actual.id === t.id)) trabajos.push(t)
    }
  }
  const solicitudesIds = [...new Set([...avisos.map(n => n.solicitud_id), ...trabajos.map(t => t.solicitud_id)].filter(Boolean))] as string[]
  for (const [campo, valores] of [["titulo", titulos], ["id", solicitudesIds]] as [string, string[]][]) {
    for (let inicio = 0; inicio < valores.length; inicio += 100) {
      const { data } = await supabase.from("solicitudes").select("id, titulo, cliente_id").in(campo, valores.slice(inicio, inicio + 100))
      for (const sol of data || []) if (!solicitudes.some(actual => actual.id === sol.id)) solicitudes.push(sol)
    }
  }
  const ids = [...new Set([...solicitudes.map(s => s.id), ...solicitudesIds])]
  for (let inicio = 0; inicio < ids.length; inicio += 100) {
    const { data } = await supabase.from("ofertas").select("id, solicitud_id")
      .eq("profesional_id", usuarioId).in("solicitud_id", ids.slice(inicio, inicio + 100))
    ofertas.push(...(data || []))
  }
  return avisos.map(n => {
    if (n.seccion === "/incidencias") {
      const candidatas = incidencias.filter(inc => n.incidencia_id ? inc.id === n.incidencia_id : inc.asunto === n.tituloEntidad)
      if (candidatas.length !== 1) return n
      const url = new URL(n.link!, "https://www.diime.es")
      url.searchParams.set("incidencia", candidatas[0].id)
      return { ...n, incidencia_id: candidatas[0].id, tituloEntidad: candidatas[0].asunto, link: `${url.pathname}${url.search}${url.hash}` }
    }
    const candidatosT = n.seccion === "/demandas" ? [] : trabajos.filter(t => n.trabajo_id ? t.id === n.trabajo_id : n.oferta_id ? t.oferta_id === n.oferta_id : n.solicitud_id ? t.solicitud_id === n.solicitud_id : !!n.tituloEntidad && t.titulo === n.tituloEntidad)
    const trabajo = candidatosT.length === 1 ? candidatosT[0] : null
    const candidatosS = solicitudes.filter(s => (n.solicitud_id ? s.id === n.solicitud_id : trabajo?.solicitud_id ? s.id === trabajo.solicitud_id : !!n.tituloEntidad && s.titulo === n.tituloEntidad) && (n.seccion !== "/mis-solicitudes" || s.cliente_id === usuarioId))
    const solicitud = candidatosS.length === 1 ? candidatosS[0] : null
    const solicitudId = n.solicitud_id || trabajo?.solicitud_id || solicitud?.id || null
    const candidatasO = ofertas.filter(o => o.solicitud_id === solicitudId)
    const ofertaId = n.oferta_id || (n.seccion === "/mis-ofertas" && candidatasO.length === 1 ? candidatasO[0].id : null)
    // Once a bid becomes a paid/cancelled project it no longer appears in the
    // active bid list. Historical notices must follow the actual work item.
    const movidoAProyecto = n.seccion === "/mis-ofertas" && trabajo && trabajo.estado !== "pendiente_pago" && ofertaId === trabajo.oferta_id
    const seccion = movidoAProyecto ? "/mis-trabajos" : n.seccion
    const trabajoId = n.trabajo_id || (movidoAProyecto || (["/mis-trabajos", "/mis-solicitudes"].includes(seccion) && !n.tipo.startsWith("oferta_")) ? trabajo?.id : null)
    return { ...n, seccion, solicitud_id: solicitudId, trabajo_id: trabajoId || null, oferta_id: ofertaId,
      tituloEntidad: trabajo?.titulo || solicitud?.titulo || n.tituloEntidad,
      link: construirLinkNotificacion({ seccion: movidoAProyecto ? seccion : n.link!, solicitudId, trabajoId, ofertaId, aspecto: n.tipo }) }
  })
}

export async function obtenerNotificacionesSeccion(seccion: string) {
  const supabase = await createClient()
  if (!supabase) return { data: [] as NotificacionContextual[] }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [] as NotificacionContextual[] }
  try {
    const filas = await cargarPendientes(supabase, user.id)
    const seccionNormalizada = seccionDeNotificacion(seccion)
    const contextualizadas = await enriquecerAvisos(supabase, user.id, filas)
    return { data: contextualizadas.filter(n => n.seccion === seccionNormalizada) }
  } catch {
    return { data: [] as NotificacionContextual[], error: await textoServidor("No se pudieron cargar las notificaciones") }
  }
}

// The summary includes every unread notification; recent history is a separate
// page. Opening the bell or visiting a section never marks anything as read.
export async function obtenerResumenNotificaciones() {
  const vacio = { notificaciones: [] as NotificacionContextual[], noLeidas: 0, mensajesNoLeidos: 0, porSeccion: {} as Record<string, number>, ultimoMensajeNoLeido: null as { id: string; conversacion_id: string; preview: string; remitente: string; created_at: string } | null }
  const supabase = await createClient()
  if (!supabase) return vacio
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return vacio
  let notificaciones: NotificacionContextual[]
  try {
    notificaciones = await enriquecerAvisos(supabase, user.id, await cargarPendientes(supabase, user.id))
  } catch {
    return { ...vacio, error: await textoServidor("No se pudieron cargar las notificaciones") }
  }
  const porSeccion: Record<string, number> = {}
  for (const n of notificaciones) porSeccion[n.seccion] = (porSeccion[n.seccion] || 0) + 1
  const noLeidas = notificaciones.length

  // Mensajes de chat sin leer (en conversaciones donde participo, no enviados por mí).
  const { data: convs } = await supabase
    .from("conversaciones")
    .select("id")
    .or(`participante_1.eq.${user.id},participante_2.eq.${user.id}`)
  const convIds = (convs || []).map((c: any) => c.id)

  let mensajesNoLeidos = 0
  let ultimoMensajeNoLeido: {
    id: string
    conversacion_id: string
    preview: string
    remitente: string
    created_at: string
  } | null = null
  if (convIds.length > 0) {
    const { count } = await supabase
      .from("mensajes")
      .select("*", { count: "exact", head: true })
      .in("conversacion_id", convIds)
      .eq("leido", false)
      .neq("remitente_id", user.id)
    mensajesNoLeidos = count || 0

    // El más reciente sin leer, con nombre del remitente: para el popup del navbar.
    if (mensajesNoLeidos > 0) {
      const { data: ultimo } = await supabase
        .from("mensajes")
        .select("id, conversacion_id, contenido, tipo, remitente_id, created_at")
        .in("conversacion_id", convIds)
        .eq("leido", false)
        .neq("remitente_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ultimo) {
        const { data: perfil } = await supabase
          .from("profiles")
          .select("nombre, apellido")
          .eq("id", ultimo.remitente_id)
          .maybeSingle()
        ultimoMensajeNoLeido = {
          id: ultimo.id,
          conversacion_id: ultimo.conversacion_id,
          preview:
            ultimo.tipo === "imagen"
              ? "📷 Imagen"
              : ultimo.tipo === "archivo"
                ? "📎 Archivo"
                : String(ultimo.contenido || "").slice(0, 90),
          remitente: `${perfil?.nombre ?? ""} ${perfil?.apellido ?? ""}`.trim() || "Nuevo mensaje",
          created_at: ultimo.created_at,
        }
      }
    }
  }

  return { notificaciones: notificaciones || [], noLeidas, mensajesNoLeidos, porSeccion, ultimoMensajeNoLeido }
}

// Explicit acknowledgement, scoped to the authenticated owner and the IDs
// actually shown. Concurrent new notices must never be cleared by this action.
export async function marcarNotificacionesLeidasPorIds(ids: string[]) {
  if (!Array.isArray(ids) || ids.length > 500 || ids.some(id => !idNotificacionValido(id))) {
    return { error: await textoServidor("Notificaciones no válidas") }
  }
  if (!ids.length) return { success: true }
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: await textoServidor("No autenticado") }
  const { data, error } = await supabase.from("notificaciones").update({ leida: true })
    .eq("usuario_id", user.id).in("id", [...new Set(ids)]).select("id")
  if (error || data?.length !== new Set(ids).size) return { error: await textoServidor("No se pudieron marcar las notificaciones") }
  return { success: true }
}

export async function obtenerHistorialNotificaciones(pagina = 0) {
  if (!Number.isInteger(pagina) || pagina < 0 || pagina > 10000) return { data: [] as NotificacionContextual[], hayMas: false }
  const supabase = await createClient()
  if (!supabase) return { data: [] as NotificacionContextual[], hayMas: false }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [] as NotificacionContextual[], hayMas: false }
  const { data, error } = await supabase.from("notificaciones").select(CAMPOS_AVISO)
    .eq("usuario_id", user.id).order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(pagina * 30, pagina * 30 + 30)
  if (error) return { data: [] as NotificacionContextual[], hayMas: false, error: await textoServidor("No se pudieron cargar las notificaciones") }
  return { data: await enriquecerAvisos(supabase, user.id, (data || []).slice(0, 30)), hayMas: (data?.length || 0) > 30 }
}
