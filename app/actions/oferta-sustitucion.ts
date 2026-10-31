"use server"

import { createClient } from "@/lib/supabase/server"
import { textoServidor } from "@/lib/i18n-servidor"

export async function obtenerContextoSustitucion(ofertaId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("Base de datos no disponible") }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: await textoServidor("Debes iniciar sesión"), codigo: "NO_AUTENTICADO" }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ofertaId)) {
    return { error: await textoServidor("No tienes permiso para sustituir esta oferta") }
  }
  const { data, error } = await supabase.rpc("empresa_oferta_sustitucion_contexto", { p_oferta_id: ofertaId })
  if (error || !data) {
    // Revalidating this page after insertion must retain the successful result.
    // This is an authenticated read of the current actor's existing child,
    // never permission to reopen the form or read another operator's proposal.
    const { data: creada, error: lecturaError } = await supabase.from("ofertas")
      .select("id, estado")
      .eq("oferta_origen_id", ofertaId)
      .eq("profesional_id", user.id)
      .in("estado", ["pendiente", "enviada", "en_negociacion", "aceptada"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!lecturaError && creada) return { creada: { id: creada.id as string, estado: creada.estado as string } }
    return { error: await textoServidor(error?.message || "No tienes permiso para sustituir esta oferta") }
  }
  return { data: data as { oferta_origen_id: string; solicitud_id: string; empresa_id: string; empresa_nombre: string; titulo: string } }
}
