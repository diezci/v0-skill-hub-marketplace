import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { ID_ARCHIVO, validarArchivo } from "@/lib/archivos"
import { streamArchivoPrivado, usuarioParaSubida } from "@/lib/archivos-servidor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) {
  const actor = await usuarioParaSubida()
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: "Almacenamiento no disponible. Inténtalo más tarde." }, { status: 503 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.id !== "string" || !ID_ARCHIVO.test(body.id)) return NextResponse.json({ error: "Subida no disponible." }, { status: 404 })
  const { data: pendiente, error } = await admin.from("archivos_subidas_pendientes").select("*")
    .eq("id", body.id).eq("propietario_id", actor.user.id).maybeSingle()
  if (error) return NextResponse.json({ error: "Almacenamiento no disponible. Inténtalo más tarde." }, { status: 503 })
  if (!pendiente) return NextResponse.json({ error: "Subida no disponible." }, { status: 404 })
  if (pendiente.estado === "confirmado_publico") return NextResponse.json({
    id: pendiente.id, url: pendiente.public_url, filename: pendiente.nombre,
    type: pendiente.tipo, size: Number(pendiente.bytes_declarados),
  }, { headers: { "Cache-Control": "private, no-store" } })
  if (pendiente.estado === "confirmado") {
    const { data, error: e } = await admin.from("archivos_privados").select("url,nombre,tipo,bytes").eq("id", pendiente.id).single()
    if (e || !data) return NextResponse.json({ error: "Subida no disponible." }, { status: 503 })
    return NextResponse.json({ id: pendiente.id, url: data.url, filename: data.nombre, type: data.tipo, size: data.bytes })
  }
  if (pendiente.estado !== "pendiente" || Date.parse(pendiente.expira_at) <= Date.now()) {
    return NextResponse.json({ error: "La subida ha caducado o no es válida." }, { status: 409 })
  }
  const publica = pendiente.purpose === "imagen_publica"
  if (publica && !process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Publicación de imágenes no disponible. Inténtalo más tarde." }, { status: 503 })
  try {
    const stream = await streamArchivoPrivado(pendiente.storage_path, request.signal)
    if (!stream) return NextResponse.json({ error: "El archivo todavía no está disponible. Vuelve a intentarlo." }, { status: 409 })
    // The stream enforces a hard byte limit before allocating the validation File.
    const blob = await new Response(stream).blob()
    const file = new File([blob], pendiente.nombre, { type: pendiente.tipo })
    const validation = await validarArchivo(file, publica)
    if ("error" in validation || file.size !== Number(pendiente.bytes_declarados)) {
      await admin.from("archivos_subidas_pendientes").update({ estado: "rechazado" }).eq("id", pendiente.id).eq("estado", "pendiente")
      return NextResponse.json({ error: "error" in validation ? validation.error : "El archivo recibido no coincide con la subida autorizada." }, { status: 400 })
    }
    const sha256 = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex")
    let publicUrl: string | undefined
    if (publica) {
      // Keep a full minute for the bounded Blob transfer before reservation expiry.
      // Cleanup waits another five minutes, so an in-flight publication cannot
      // recreate a Blob after its expired reservation has been collected.
      if (Date.parse(pendiente.expira_at) <= Date.now() + 60_000) return NextResponse.json({ error: "La subida ha caducado o no es válida." }, { status: 409 })
      const blob = await put(`perfiles/${pendiente.storage_path}`, file, {
        access: "public", addRandomSuffix: false, allowOverwrite: true,
        contentType: validation.tipo, abortSignal: AbortSignal.timeout(30_000),
      })
      // Concurrent retries publish the same validated immutable staging object
      // at one deterministic path. Only the transaction below exposes the URL.
      publicUrl = blob.url
    }
    const { data, error: confirmError } = await admin.rpc(publica ? "confirmar_imagen_publica" : "confirmar_archivo_subida", {
      p_id: pendiente.id, p_usuario: actor.user.id, p_bytes: file.size, p_tipo: validation.tipo, p_sha256: sha256, ...(publica ? { p_url: publicUrl } : {}),
    })
    if (confirmError) return NextResponse.json({ error: "No se pudo confirmar el archivo. Vuelve a intentarlo." }, { status: 409 })
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    console.error("[archivos] No se pudo validar la subida privada")
    return NextResponse.json({ error: "No se pudo confirmar el archivo. Vuelve a intentarlo." }, { status: 503 })
  }
}
