"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { empresaLocalStore } from "@/lib/empresas/local-store"
import { esEmpresasLocal, obtenerActorEmpresaLocal } from "@/lib/empresas/service"

export type AcreditacionPortfolio = {
  tipo: "personal" | "empresa"
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
  if (esEmpresasLocal()) {
    try { return await empresaLocalStore.acreditacionesPortfolio(await obtenerActorEmpresaLocal()) }
    catch (error) { return { error: error instanceof Error ? error.message : "No se pudieron cargar los proyectos." } }
  }
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }
  const { data, error } = await supabase.rpc("portfolio_acreditaciones_listar")
  return error ? { error: error.message } : { data: data || [] }
}

export async function revisarAcreditacionPortfolio(input: {
  tipo: "personal" | "empresa"; itemId: string; revisionId: string
  decision: "acreditado" | "requiere_informacion"; nota: string
}) {
  if (esEmpresasLocal()) {
    try {
      const result = await empresaLocalStore.revisarAcreditacionPortfolio(await obtenerActorEmpresaLocal(), input)
      if (result.error) return { error: result.error }
      for (const route of ["/admin/portfolio", "/local-mi-empresa-preview", "/mi-empresa", "/mi-empresa/vista-previa"]) revalidatePath(route)
      revalidatePath("/empresa/[id]", "page")
      return { success: true }
    } catch (error) { return { error: error instanceof Error ? error.message : "No se pudo guardar la revisión." } }
  }
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }
  const { error } = await supabase.rpc("portfolio_acreditacion_revisar", {
    p_tipo: input.tipo, p_item_id: input.itemId, p_revision_id: input.revisionId,
    p_decision: input.decision, p_nota: input.nota,
  })
  if (error) return { error: error.message }
  for (const route of ["/admin/portfolio", "/mi-perfil", "/mi-empresa", "/mi-empresa/vista-previa"]) revalidatePath(route)
  revalidatePath("/profesional/[id]", "page")
  revalidatePath("/empresa/[id]", "page")
  return { success: true }
}
