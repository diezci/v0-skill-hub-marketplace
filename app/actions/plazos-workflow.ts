"use server"
import { createClient } from "@/lib/supabase/server"
import { procesarPlazosWorkflow } from "@/lib/plazos-workflow"
import { revalidatePath } from "next/cache"

// Manual retry is restricted to a current, active platform administrator.
export async function revisarPlazosWorkflow(trabajoIds?: string[]) {
  const db = await createClient()
  if (!db) return { error: "No se pudo conectar con la base de datos." }
  const { data: { user } } = await db.auth.getUser()
  if (!user || user.is_anonymous) return { codigo: "NO_AUTENTICADO", error: "No autenticado" }
  const { data: p, error } = await db.from("profiles").select("es_admin,cuenta_eliminada").eq("id", user.id).maybeSingle()
  if (error || !p?.es_admin || p.cuenta_eliminada) return { codigo: "SIN_PERMISO", error: "No tienes permiso para procesar plazos." }
  try {
    const data = await procesarPlazosWorkflow(trabajoIds)
    for (const ruta of ["/mis-solicitudes", "/mis-trabajos", "/mi-empresa", "/admin/operaciones"]) revalidatePath(ruta)
    return { data }
  } catch (error: any) { return { error: error.message || "No se pudieron procesar los plazos." } }
}
