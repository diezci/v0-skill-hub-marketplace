"use server"

import { revalidatePath } from "next/cache"
import { textoServidor } from "@/lib/i18n-servidor"
import { errorContenidoProhibido } from "@/lib/moderacion"
import { createClient } from "@/lib/supabase/server"

type ProyectoEmpresa = {
  titulo: string
  descripcion: string
  imagen_url: string
  categoria: string
  fecha_completado: string
  ubicacion?: string
  duracion?: string
  presupuesto?: string
  trabajo_id?: string
  contexto_proveedor?: string
}

async function clienteAutenticado() {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  return { supabase }
}

function revalidarPortfolioEmpresa() {
  revalidatePath("/mi-empresa")
  revalidatePath("/mi-empresa/vista-previa")
  revalidatePath("/empresa/[id]", "page")
}

async function guardarProyecto(data: ProyectoEmpresa, itemId: string | null) {
  const acceso = await clienteAutenticado()
  if (!acceso.supabase) return { codigo: acceso.codigo, error: acceso.error }
  if (!data || typeof data !== "object" || Array.isArray(data)
    || ["titulo", "descripcion", "imagen_url", "categoria", "fecha_completado"].some((key) => typeof data[key as keyof ProyectoEmpresa] !== "string")
    || ["ubicacion", "duracion", "presupuesto", "trabajo_id", "contexto_proveedor"].some((key) => data[key as keyof ProyectoEmpresa] !== undefined && typeof data[key as keyof ProyectoEmpresa] !== "string")) {
    return { error: await textoServidor("Revisa los datos del proyecto.") }
  }
  const titulo = data.titulo.trim()
  const descripcion = data.descripcion.trim()
  if (!titulo || !descripcion) return { error: await textoServidor("Completa título y descripción.") }
  const moderacion = errorContenidoProhibido(titulo, descripcion, data.contexto_proveedor)
  if (moderacion) return { error: await textoServidor(moderacion) }
  const presupuesto = data.presupuesto?.trim() ? Number(data.presupuesto) : null
  if (presupuesto !== null && (!Number.isFinite(presupuesto) || presupuesto < 0 || presupuesto > 99999999.99)) {
    return { error: await textoServidor("Indica un presupuesto válido.") }
  }
  // The database resolves the current company and checks its current profile
  // permission. Verified demand fields come from its completed contract.
  const { data: proyecto, error } = await acceso.supabase.rpc("empresa_portfolio_guardar", {
    p_item_id: itemId,
    p_datos: { ...data, titulo, descripcion, presupuesto },
  })
  if (error) return { error: await textoServidor(error.message) }
  revalidarPortfolioEmpresa()
  return { data: proyecto }
}

export async function crearItemPortfolioEmpresa(data: ProyectoEmpresa) {
  return guardarProyecto(data, null)
}

export async function actualizarItemPortfolioEmpresa(itemId: string, data: ProyectoEmpresa) {
  return guardarProyecto(data, itemId)
}

export async function eliminarItemPortfolioEmpresa(itemId: string) {
  const acceso = await clienteAutenticado()
  if (!acceso.supabase) return { codigo: acceso.codigo, error: acceso.error }
  const { error } = await acceso.supabase.rpc("empresa_portfolio_eliminar", { p_item_id: itemId })
  if (error) return { error: await textoServidor(error.message) }
  revalidarPortfolioEmpresa()
  return { success: true }
}

export async function obtenerPortfolioEmpresa() {
  const acceso = await clienteAutenticado()
  if (!acceso.supabase) return { codigo: acceso.codigo, error: acceso.error, data: [] }
  const { data, error } = await acceso.supabase.rpc("empresa_portfolio")
  if (error) return { error: await textoServidor(error.message), data: [] }
  return { data: data || [] }
}

export async function obtenerTrabajosCompletadosParaPortfolioEmpresa() {
  const acceso = await clienteAutenticado()
  if (!acceso.supabase) return { codigo: acceso.codigo, error: acceso.error, data: [] }
  const { data, error } = await acceso.supabase.rpc("empresa_trabajos_completados_portfolio")
  if (error) return { error: await textoServidor(error.message), data: [] }
  return { data: data || [] }
}
