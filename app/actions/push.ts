"use server"

import { createClient } from "@/lib/supabase/server"

export async function registrarDispositivoPush(token: string, plataforma: "ios" | "android") {
  const limpio = token.trim()
  if (limpio.length < 16 || !["ios", "android"].includes(plataforma)) {
    return { error: "Token de notificaciones inválido" }
  }

  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { error } = await supabase.rpc("registrar_dispositivo_push", {
    p_token: limpio,
    p_plataforma: plataforma,
  })

  return error ? { error: error.message } : { success: true }
}

export async function eliminarDispositivoPush(token: string) {
  const limpio = token.trim()
  if (!limpio) return { success: true }

  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: true }

  const { error } = await supabase.rpc("eliminar_dispositivo_push", { p_token: limpio })
  return error ? { error: error.message } : { success: true }
}
