"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function obtenerEstadoBloqueo(otroUsuarioId: string) {
  const supabase = await createClient()
  if (!supabase) return { autenticado: false, bloqueadoPorMi: false, meHaBloqueado: false }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { autenticado: false, bloqueadoPorMi: false, meHaBloqueado: false }
  if (user.id === otroUsuarioId) {
    return { autenticado: true, esMismoUsuario: true, bloqueadoPorMi: false, meHaBloqueado: false }
  }

  const { data, error } = await supabase
    .from("usuarios_bloqueados")
    .select("bloqueador_id, bloqueado_id")
    .or(
      `and(bloqueador_id.eq.${user.id},bloqueado_id.eq.${otroUsuarioId}),and(bloqueador_id.eq.${otroUsuarioId},bloqueado_id.eq.${user.id})`,
    )

  if (error) {
    if (error.code === "42P01") return { autenticado: true, pendienteMigracion: true, bloqueadoPorMi: false, meHaBloqueado: false }
    return { autenticado: true, error: error.message, bloqueadoPorMi: false, meHaBloqueado: false }
  }

  const bloqueadoPorMi = (data || []).some((b) => b.bloqueador_id === user.id)
  const { data: hayBloqueo } = await supabase.rpc("interaccion_bloqueada_con", { p_otro: otroUsuarioId })

  return {
    autenticado: true,
    bloqueadoPorMi,
    // La política de la tabla no revela quién te bloqueó. La RPC devuelve solo
    // el estado agregado, suficiente para desactivar la interacción.
    meHaBloqueado: !!hayBloqueo && !bloqueadoPorMi,
  }
}

export async function bloquearUsuario(otroUsuarioId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible." }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Inicia sesión para bloquear a un usuario." }
  if (user.id === otroUsuarioId) return { error: "No puedes bloquearte a ti mismo." }

  const { error } = await supabase.from("usuarios_bloqueados").upsert(
    { bloqueador_id: user.id, bloqueado_id: otroUsuarioId },
    { onConflict: "bloqueador_id,bloqueado_id", ignoreDuplicates: true },
  )
  if (error) {
    if (error.code === "42P01") return { error: "Falta aplicar la migración de bloqueo de usuarios." }
    return { error: error.message }
  }

  revalidatePath("/mensajes")
  revalidatePath(`/usuario/${otroUsuarioId}`)
  revalidatePath(`/profesional/${otroUsuarioId}`)
  return { success: true }
}

export async function desbloquearUsuario(otroUsuarioId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible." }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "No autenticado" }
  const { error } = await supabase
    .from("usuarios_bloqueados")
    .delete()
    .eq("bloqueador_id", user.id)
    .eq("bloqueado_id", otroUsuarioId)
  if (error) return { error: error.message }

  revalidatePath("/mensajes")
  revalidatePath(`/usuario/${otroUsuarioId}`)
  revalidatePath(`/profesional/${otroUsuarioId}`)
  return { success: true }
}
