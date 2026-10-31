import type { SupabaseClient } from "@supabase/supabase-js"

// Only an explicitly supplied chat context constrains preparatory uploads.
// The current membership/assignment is checked with the actor's public client.
export async function autorizarConversacionSubida(supabase: SupabaseClient, userId: string, conversacionId: unknown): Promise<{error: string; status: number} | null> {
  if (conversacionId === null || conversacionId === undefined) return null
  if (typeof conversacionId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(conversacionId)) return { error: "Conversación no válida.", status: 400 }
  const personal = await supabase.from("conversaciones").select("participante_1, participante_2").eq("id", conversacionId).maybeSingle()
  let otro: string | undefined
  if (!personal.error && personal.data && [personal.data.participante_1, personal.data.participante_2].includes(userId)) {
    otro = personal.data.participante_1 === userId ? personal.data.participante_2 : personal.data.participante_1
  } else {
    const empresariales = await supabase.rpc("empresa_conversaciones_listar")
    const actual = !empresariales.error && Array.isArray(empresariales.data)
      ? empresariales.data.find((c: { id: string; puede_escribir?: boolean }) => c.id === conversacionId && c.puede_escribir === true)
      : null
    otro = actual?.otro_usuario_id
  }
  if (!otro) return { error: "No tienes permiso para adjuntar archivos a esta conversación.", status: 403 }
  const bloqueada = await supabase.rpc("interaccion_bloqueada_con", { p_otro: otro })
  if (bloqueada.error || bloqueada.data !== false) return { error: "La conversación no está disponible.", status: 403 }
  return null
}
