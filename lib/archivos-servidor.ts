import { del } from "@vercel/blob"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BUCKET_ADJUNTOS, MAX_ARCHIVO_BYTES } from "@/lib/archivos"

export async function usuarioParaSubida() {
  const supabase = await createClient()
  const auth = await supabase?.auth.getUser()
  if (!supabase || auth?.error || !auth?.data.user) return { error: "Debes iniciar sesión.", status: 401 } as const
  const user = auth.data.user
  const profile = await supabase.from("profiles").select("id, cuenta_eliminada").eq("id", user.id).maybeSingle()
  if (profile.error || !profile.data || profile.data.cuenta_eliminada) return { error: "Cuenta no disponible.", status: 403 } as const
  return { user } as const
}

// The signed read URL stays on the server. Streaming the body avoids Vercel's
// buffered 4.5 MB response limit while preserving authorization on every GET.
export async function streamArchivoPrivado(storagePath: string, signal?: AbortSignal) {
  const admin = createAdminClient()
  if (!admin) return null
  const signed = await admin.storage.from(BUCKET_ADJUNTOS).createSignedUrl(storagePath, 30)
  if (signed.error || !signed.data) return null
  const response = await fetch(signed.data.signedUrl, { cache: "no-store", signal }).catch(() => null)
  if (!response) return null
  if (!response.ok || !response.body) { await response.body?.cancel(); return null }
  const length = Number(response.headers.get("content-length"))
  if (length > MAX_ARCHIVO_BYTES) { await response.body.cancel(); return null }
  let bytes = 0
  return response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength
      if (bytes > MAX_ARCHIVO_BYTES) { controller.error(new Error("Archivo demasiado grande.")); return }
      controller.enqueue(chunk)
    },
  }))
}

// Kept bounded for both cron and opportunistic cleanup. Storage deletion is
// first; failures retain the reservation so the next run can retry safely.
export async function limpiarSubidasPendientes(admin = createAdminClient()) {
  if (!admin) return { eliminadas: 0, errores: 0 }
  const { data, error } = await admin.from("archivos_subidas_pendientes").select("id, storage_path, purpose, estado")
    .neq("estado", "confirmado").is("staging_eliminado_at", null)
    .lt("expira_at", new Date(Date.now() - 5 * 60_000).toISOString()).order("expira_at").limit(25)
  if (error) throw new Error("No se pudieron consultar las subidas caducadas.")
  let eliminadas = 0, errores = 0
  for (const row of data || []) {
    if (row.purpose === "imagen_publica" && row.estado !== "confirmado_publico") {
      // A timed-out publication can have reached Blob without DB confirmation.
      // Its deterministic path lets cleanup remove it, even without a saved URL.
      if (!process.env.BLOB_READ_WRITE_TOKEN) { errores++; continue }
      try { await del(`perfiles/${row.storage_path}`, { abortSignal: AbortSignal.timeout(30_000) }) }
      catch { errores++; continue }
    }
    const result = await admin.storage.from(BUCKET_ADJUNTOS).remove([row.storage_path])
    if (result.error) { errores++; continue }
    const deleted = row.estado === "confirmado_publico"
      ? await admin.from("archivos_subidas_pendientes").update({ staging_eliminado_at: new Date().toISOString() }).eq("id", row.id).eq("estado", "confirmado_publico")
      : await admin.from("archivos_subidas_pendientes").delete().eq("id", row.id).in("estado", ["pendiente", "rechazado"])
    if (deleted.error) errores++; else eliminadas++
  }
  return { eliminadas, errores }
}
