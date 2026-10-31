"use server"

import { createClient } from "@/lib/supabase/server"
import { textoServidor } from "@/lib/i18n-servidor"
import { revalidatePath } from "next/cache"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Respuesta = { data?: unknown; error?: string; codigo?: string }

async function ejecutar(nombre: string, datos: Record<string, unknown>): Promise<Respuesta> {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  const { data, error } = await supabase.rpc(nombre, datos)
  if (error) return { error: await textoServidor(error.message) }
  return { data }
}

export async function obtenerRevisionCuenta(usuarioId: string): Promise<Respuesta> {
  if (!UUID.test(usuarioId)) return { error: await textoServidor("Usuario no válido") }
  return ejecutar("cuenta_restriccion_obtener", { p_usuario: usuarioId })
}

export async function decidirSuspensionCuenta(input: {
  usuarioId: string; suspender: boolean; motivo: string; revision: number; solicitudId?: string | null; incidencias?: string[]
}): Promise<Respuesta> {
  if (!UUID.test(input.usuarioId) || typeof input.suspender !== "boolean" || !Number.isInteger(input.revision)
      || (input.solicitudId != null && !UUID.test(input.solicitudId)) || !Array.isArray(input.incidencias ?? [])
      || (input.incidencias ?? []).some(id => !UUID.test(id))) return { error: await textoServidor("Solicitud no válida") }
  const resultado = await ejecutar("cuenta_restriccion_decidir", {
    p_usuario: input.usuarioId, p_suspender: input.suspender, p_motivo: input.motivo,
    p_revision: input.revision, p_solicitud: input.solicitudId ?? null, p_incidencias: input.incidencias ?? [],
  })
  if (!resultado.error) {
    revalidatePath(`/admin/usuarios/${input.usuarioId}`)
    revalidatePath("/mi-cuenta")
  }
  return resultado
}

export async function solicitarRevisionCuenta(input: { revision: number; motivo: string }): Promise<Respuesta> {
  if (!Number.isInteger(input.revision)) return { error: await textoServidor("Solicitud no válida") }
  const resultado = await ejecutar("cuenta_restriccion_solicitar_revision", { p_revision: input.revision, p_motivo: input.motivo })
  if (!resultado.error) revalidatePath("/mi-cuenta")
  return resultado
}
