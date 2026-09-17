"use server"

import { textoServidor } from "@/lib/i18n-servidor"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type EstadoBloqueo = {
  autenticado: boolean
  bloqueadoPorMi: boolean
  meHaBloqueado: boolean
  esMismoUsuario?: boolean
  esEquipoDiime: boolean
  pendienteMigracion?: boolean
  error?: string
}

async function comprobarEquipoDiime(
  usuarioId: string,
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
) {
  // La comprobación ocurre en el servidor y, cuando está disponible, con el
  // cliente administrativo. Así no depende de que una política pública de
  // perfiles exponga el rol interno del destinatario.
  const lectorPerfiles = createAdminClient() ?? supabase
  const { data, error } = await lectorPerfiles
    .from("profiles")
    .select("id, es_admin")
    .eq("id", usuarioId)
    .maybeSingle()

  return {
    existe: !!data,
    esEquipoDiime: !!data?.es_admin,
    error,
  }
}

export async function obtenerEstadoBloqueo(otroUsuarioId: string): Promise<EstadoBloqueo> {
  const supabase = await createClient()
  if (!supabase) {
    return { autenticado: false, bloqueadoPorMi: false, meHaBloqueado: false, esEquipoDiime: false }
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { autenticado: false, bloqueadoPorMi: false, meHaBloqueado: false, esEquipoDiime: false }
  }
  if (!UUID_RE.test(otroUsuarioId)) {
    return {
      autenticado: true,
      bloqueadoPorMi: false,
      meHaBloqueado: false,
      esEquipoDiime: false,
      error: await textoServidor("Usuario no válido."),
    }
  }
  if (user.id === otroUsuarioId) {
    return {
      autenticado: true,
      esMismoUsuario: true,
      bloqueadoPorMi: false,
      meHaBloqueado: false,
      esEquipoDiime: false,
    }
  }

  const equipo = await comprobarEquipoDiime(otroUsuarioId, supabase)
  if (equipo.error) {
    return {
      autenticado: true,
      bloqueadoPorMi: false,
      meHaBloqueado: false,
      esEquipoDiime: false,
      error: await textoServidor("No se pudo comprobar el perfil."),
    }
  }
  const { data, error } = await supabase
    .from("usuarios_bloqueados")
    .select("bloqueador_id, bloqueado_id")
    .or(
      `and(bloqueador_id.eq.${user.id},bloqueado_id.eq.${otroUsuarioId}),and(bloqueador_id.eq.${otroUsuarioId},bloqueado_id.eq.${user.id})`,
    )

  if (error) {
    if (error.code === "42P01") {
      return {
        autenticado: true,
        pendienteMigracion: true,
        bloqueadoPorMi: false,
        meHaBloqueado: false,
        esEquipoDiime: equipo.esEquipoDiime,
      }
    }
    return {
      autenticado: true,
      error: await textoServidor(error.message),
      bloqueadoPorMi: false,
      meHaBloqueado: false,
      esEquipoDiime: equipo.esEquipoDiime,
    }
  }

  const bloqueadoPorMiAnterior = (data || []).some((b) => b.bloqueador_id === user.id)
  const { data: hayBloqueo } = await supabase.rpc("interaccion_bloqueada_con", { p_otro: otroUsuarioId })

  return {
    autenticado: true,
    // Una relación antigua dirigida al equipo deja de contar como bloqueo. La
    // migración también la elimina para mantener la base de datos coherente.
    bloqueadoPorMi: equipo.esEquipoDiime ? false : bloqueadoPorMiAnterior,
    // La política de la tabla no revela quién te bloqueó. La RPC devuelve solo
    // el estado agregado, suficiente para desactivar la interacción.
    meHaBloqueado: !!hayBloqueo && !bloqueadoPorMiAnterior,
    esEquipoDiime: equipo.esEquipoDiime,
  }
}

export async function bloquearUsuario(otroUsuarioId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible.") }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: await textoServidor("Inicia sesión para bloquear a un usuario.") }
  if (!UUID_RE.test(otroUsuarioId)) return { error: await textoServidor("Usuario no válido.") }
  if (user.id === otroUsuarioId) return { error: await textoServidor("No puedes bloquearte a ti mismo.") }

  const equipo = await comprobarEquipoDiime(otroUsuarioId, supabase)
  if (equipo.error) return { error: await textoServidor("No se pudo comprobar el perfil. Inténtalo de nuevo.") }
  if (!equipo.existe) return { error: await textoServidor("El usuario ya no está disponible.") }
  if (equipo.esEquipoDiime) return { error: await textoServidor("No puedes bloquear al equipo de Diime.") }

  const { error } = await supabase.from("usuarios_bloqueados").upsert(
    { bloqueador_id: user.id, bloqueado_id: otroUsuarioId },
    { onConflict: "bloqueador_id,bloqueado_id", ignoreDuplicates: true },
  )
  if (error) {
    if (error.code === "42P01") return { error: await textoServidor("Falta aplicar la migración de bloqueo de usuarios.") }
    return { error: await textoServidor(error.message) }
  }

  revalidatePath("/mensajes")
  revalidatePath(`/usuario/${otroUsuarioId}`)
  revalidatePath(`/profesional/${otroUsuarioId}`)
  return { success: true }
}

export async function desbloquearUsuario(otroUsuarioId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible.") }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  if (!UUID_RE.test(otroUsuarioId)) return { error: await textoServidor("Usuario no válido.") }
  const { error } = await supabase
    .from("usuarios_bloqueados")
    .delete()
    .eq("bloqueador_id", user.id)
    .eq("bloqueado_id", otroUsuarioId)
  if (error) return { error: await textoServidor(error.message) }

  revalidatePath("/mensajes")
  revalidatePath(`/usuario/${otroUsuarioId}`)
  revalidatePath(`/profesional/${otroUsuarioId}`)
  return { success: true }
}
