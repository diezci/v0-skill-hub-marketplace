"use server"

import { createClient } from "@/lib/supabase/server"
import { enviarPushAUsuario } from "@/lib/push/enviar"

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

  if (error) console.warn(`[push] registration_failed platform=${plataforma} reason=${error.code || "database"}`)
  else console.info(`[push] registration_ok platform=${plataforma}`)
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

export async function probarNotificacionPush() {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const resultado = await enviarPushAUsuario(user.id, {
    titulo: "Notificaciones de Diime activadas",
    cuerpo: "Esta es una prueba. Los mensajes mostrarán aquí el remitente y una vista previa.",
    link: "/mi-cuenta",
    tipo: "prueba_push",
  })
  console.info(
    `[push] self_test devices=${resultado?.encontrados ?? 0} delivered=${resultado?.enviados ?? 0} result=${resultado?.error ? "failed" : "ok"}`,
  )
  if (!resultado || resultado.encontrados === 0) {
    return { error: "Este dispositivo todavía no está registrado. Pulsa primero Activar." }
  }
  if (resultado.enviados === 0) {
    return { error: resultado.error || "Apple o Google no aceptaron la notificación de prueba." }
  }
  return { success: true }
}
