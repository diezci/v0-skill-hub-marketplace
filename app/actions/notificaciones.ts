"use server"

import { textoServidor } from "@/lib/i18n-servidor"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
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

// Resumen para el navbar: últimas notificaciones, cuántas sin leer (total y por
// sección, agrupadas por el link de destino) y cuántos mensajes de chat sin leer.
export async function obtenerResumenNotificaciones() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { notificaciones: [], noLeidas: 0, mensajesNoLeidos: 0, porSeccion: {} as Record<string, number> }

  const { data: notificaciones } = await supabase
    .from("notificaciones")
    .select("id, tipo, titulo, mensaje, link, leida, created_at")
    .eq("usuario_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20)

  // Contadores por sección para los badges del navbar: cada notificación apunta
  // (vía link) a la sección donde se resuelve.
  const porSeccion: Record<string, number> = {}
  const { data: pendientes } = await supabase
    .from("notificaciones")
    .select("link")
    .eq("usuario_id", user.id)
    .eq("leida", false)
  const noLeidas = pendientes?.length || 0
  for (const n of pendientes || []) {
    if (n.link) porSeccion[n.link] = (porSeccion[n.link] || 0) + 1
  }

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

// Marca como leídas las notificaciones cuyo destino es la sección visitada
// (los badges del navbar se apagan al entrar en la sección).
export async function marcarNotificacionesLeidasPorLink(link: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  const { error } = await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("usuario_id", user.id)
    .eq("leida", false)
    .eq("link", link)
  if (error) return { error: await textoServidor(error.message) }
  return { success: true }
}

// Marca todas mis notificaciones como leídas (al abrir la campana).
export async function marcarNotificacionesLeidas() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  const { error } = await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("usuario_id", user.id)
    .eq("leida", false)
  if (error) return { error: await textoServidor(error.message) }
  return { success: true }
}
