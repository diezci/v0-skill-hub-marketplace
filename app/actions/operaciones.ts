"use server"

import { textoServidor } from "@/lib/i18n-servidor"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CATEGORIAS_OPERATIVAS, obtenerConteoSolicitudesSinOferta, obtenerDetalleOperativo, obtenerResumenOperativo, obtenerIndicadoresOperativos, type CategoriaOperativa } from "@/lib/operaciones"
import type { IndicadoresOperativos } from "@/lib/operaciones-catalogo"

export type ResumenOperativo = Awaited<ReturnType<typeof obtenerResumenOperativo>>
type ErrorOperativo = { ok: false; error: string; codigo?: "NO_AUTENTICADO" | "SIN_PERMISO" }

async function exigirAdmin(usuarioEsperado?: string) {
  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: await textoServidor("Supabase no está configurado.") }
  const { data: { user }, error: errorSesion } = await supabase.auth.getUser()
  if (errorSesion || !user || (usuarioEsperado && usuarioEsperado !== user.id)) return { codigo: "NO_AUTENTICADO" as const, ok: false as const, error: await textoServidor("No autenticado") }
  const { data: perfil, error } = await supabase.from("profiles").select("es_admin,cuenta_eliminada").eq("id", user.id).maybeSingle()
  if (error || !perfil?.es_admin || perfil.cuenta_eliminada) return { codigo: "SIN_PERMISO" as const, ok: false as const, error: await textoServidor("No tienes permiso para acceder a operaciones.") }
  return { ok: true as const, user }
}

export async function obtenerIndicadoresOperativosAdmin(): Promise<
  { ok: true; data: IndicadoresOperativos } | ErrorOperativo
> {
  try {
    const permiso = await exigirAdmin()
    if (!permiso.ok) return permiso
    const data = await obtenerIndicadoresOperativos()
    const vigente = await exigirAdmin(permiso.user.id)
    if (!vigente.ok) return vigente
    return { ok: true, data }
  } catch {
    return { ok: false, error: await textoServidor("No se pudo obtener el estado operativo.") }
  }
}

export async function obtenerEstadoOperativo(): Promise<
  { ok: true; data: ResumenOperativo } | ErrorOperativo
> {
  try {
    const permiso = await exigirAdmin()
    if (!permiso.ok) return permiso
    const data = await obtenerResumenOperativo()
    const vigente = await exigirAdmin(permiso.user.id)
    if (!vigente.ok) return vigente
    return { ok: true, data }
  } catch {
    return { ok: false, error: await textoServidor("No se pudo obtener el estado operativo.") }
  }
}

export async function obtenerConteoDemandasSinOferta(): Promise<
  { ok: true; total: number } | { ok: false; error: string }
> {
  try {
    const permiso = await exigirAdmin()
    if (!permiso.ok) return { ok: false, error: await textoServidor(permiso.error) }
    return { ok: true, total: await obtenerConteoSolicitudesSinOferta() }
  } catch {
    return { ok: false, error: await textoServidor("No se pudo comprobar si hay demandas sin ofertas.") }
  }
}

export async function resolverEventoOperativo(eventoId: string) {
  const permiso = await exigirAdmin()
  if (!permiso.ok) return { error: await textoServidor(permiso.error) }
  const admin = createAdminClient()
  if (!admin) return { error: await textoServidor("Supabase service role no está configurado.") }
  const { error } = await admin
    .from("eventos_operativos")
    .update({ estado: "resuelto", resuelto_at: new Date().toISOString() })
    .eq("id", eventoId)
    .eq("estado", "abierto")
  if (error) return { error: await textoServidor("No se pudo actualizar el aviso operativo.") }
  revalidatePath("/admin/operaciones")
  return { success: true }
}

// The category is a whitelist, not an arbitrary privileged table name.
export async function obtenerPaginaOperativa(categoria: CategoriaOperativa, desde: number) {
  try {
    const permiso = await exigirAdmin()
    if (!permiso.ok) return permiso
    if (!CATEGORIAS_OPERATIVAS.includes(categoria) || !Number.isSafeInteger(desde) || desde < 0 || desde > 2147483622) {
      return { ok: false as const, error: await textoServidor("Paginación no válida.") }
    }
    const data = await obtenerDetalleOperativo(categoria, desde)
    const vigente = await exigirAdmin(permiso.user.id)
    if (!vigente.ok) return vigente
    return { ok: true as const, data }
  } catch {
    return { ok: false as const, error: await textoServidor("No se pudo obtener el estado operativo.") }
  }
}
