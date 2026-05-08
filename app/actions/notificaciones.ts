"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type TipoNotificacion =
  | "nuevo_mensaje"
  | "nueva_oferta"
  | "oferta_aceptada"
  | "oferta_rechazada"
  | "trabajo_iniciado"
  | "trabajo_completado"
  | "pago_recibido"
  | "nueva_resena"
  | "disputa_abierta"
  | "disputa_resuelta"
  | "general"

export async function crearNotificacion(params: {
  usuario_id: string
  tipo: TipoNotificacion
  titulo: string
  mensaje: string
  link?: string
  metadata?: Record<string, unknown>
}) {
  const supabase = await createClient()
  if (!supabase) return { error: "Database connection error" }

  const { error } = await supabase.from("notificaciones").insert({
    usuario_id: params.usuario_id,
    tipo: params.tipo,
    titulo: params.titulo,
    mensaje: params.mensaje,
    link: params.link || null,
    metadata: params.metadata || {},
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function marcarNotificacionLeida(id: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "Database connection error" }

  const { error } = await supabase.from("notificaciones").update({ leida: true }).eq("id", id)
  if (error) return { error: error.message }

  revalidatePath("/")
  return { success: true }
}

export async function marcarTodasLeidas() {
  const supabase = await createClient()
  if (!supabase) return { error: "Database connection error" }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "No autenticado" }

  const { error } = await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("usuario_id", user.id)
    .eq("leida", false)

  if (error) return { error: error.message }

  revalidatePath("/")
  return { success: true }
}
