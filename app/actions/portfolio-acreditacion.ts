"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type AcreditacionPortfolio = {
  item_id: string
  revision_id: string
  estado: "pendiente" | "acreditado" | "requiere_informacion"
  titulo: string
  descripcion: string | null
  imagenes: string[] | null
  evidencia_acreditacion: string | null
  contexto_proveedor: string | null
  proveedor: string
  proveedor_id: string
  presentado_en: string
  nota: string | null
}

export async function listarAcreditacionesPortfolio(): Promise<{ data?: AcreditacionPortfolio[]; error?: string }> {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }
  const { data, error } = await supabase.rpc("portfolio_acreditaciones_listar")
  return error ? { error: error.message } : { data: data || [] }
}

export async function revisarAcreditacionPortfolio(input: {
  itemId: string; revisionId: string
  decision: "acreditado" | "requiere_informacion"; nota: string
}) {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }
  const { error } = await supabase.rpc("portfolio_acreditacion_revisar", {
    p_item_id: input.itemId, p_revision_id: input.revisionId,
    p_decision: input.decision, p_nota: input.nota,
  })
  if (error) return { error: error.message }
  for (const route of ["/admin/portfolio", "/mi-perfil"]) revalidatePath(route)
  revalidatePath("/profesional/[id]", "page")
  return { success: true }
}
