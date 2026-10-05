"use server"

import { createClient } from "@/lib/supabase/server"

export async function obtenerContextoEmpresa() {
  const supabase = await createClient()
  if (!supabase) return { data: null }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null }
  const { data, error } = await supabase.rpc("empresa_contexto_actual")
  if (error) return { data: null, error: "No se pudo cargar tu empresa. Vuelve a intentarlo." }
  return { data: data as { id: string; nombre: string; cargo: string; propietario_id: string } | null }
}
