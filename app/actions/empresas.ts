"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type RegistroEmpresa = {
  tokenInvitacion?: string
  nombreEmpresa?: string
  cif?: string
  documentoPersonal: string
  cargoEmpresa?: string
  telefono?: string
  ubicacion?: string
}

// Estos datos solo rellenan el formulario. La pertenencia se decide siempre en
// la RPC contrastando el token o la propiedad, nunca por user_metadata.
export async function obtenerRegistroEmpresaPendiente() {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Debes iniciar sesión" }
  return { data: (user.user_metadata?.registro_empresa ?? null) as RegistroEmpresa | null }
}

export async function completarRegistroEmpresa(datos: RegistroEmpresa) {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Debes iniciar sesión" }
  if (!datos.documentoPersonal?.trim()) return { error: "Indica tu DNI/NIE como representante" }
  if (!datos.tokenInvitacion?.trim() && (!datos.nombreEmpresa?.trim() || !datos.cif?.trim())) {
    return { error: "Indica el nombre y CIF de la empresa o utiliza una invitación" }
  }
  const { data, error } = await supabase.rpc("vincular_mi_empresa", {
    p_token: datos.tokenInvitacion?.trim() || null,
    p_nombre: datos.nombreEmpresa?.trim() || null,
    p_cif: datos.cif?.trim().toUpperCase() || null,
    p_documento_personal: datos.documentoPersonal.trim(),
    p_cargo: datos.cargoEmpresa?.trim() || null,
    p_telefono: datos.telefono?.trim() || null,
    p_ubicacion: datos.ubicacion?.trim() || null,
  })
  if (error) return { error: error.message }
  if (!data) return { error: "No se ha podido vincular la empresa" }
  await supabase.auth.updateUser({ data: { registro_empresa: null } })
  revalidatePath("/mi-empresa")
  revalidatePath("/mi-perfil")
  return { data: { empresaId: data as string } }
}
