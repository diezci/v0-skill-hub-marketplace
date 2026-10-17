import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { BUCKET_ADJUNTOS, validarMetadatosArchivo } from "@/lib/archivos"
import { limpiarSubidasPendientes, usuarioParaSubida } from "@/lib/archivos-servidor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) {
  const actor = await usuarioParaSubida()
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: "Almacenamiento no disponible. Inténtalo más tarde." }, { status: 503 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.nombre !== "string" || typeof body.bytes !== "number" || (body.purpose !== undefined && body.purpose !== "imagen_publica")) {
    return NextResponse.json({ error: "Datos de archivo no válidos." }, { status: 400 })
  }
  const publica = body.purpose === "imagen_publica"
  const validacion = validarMetadatosArchivo(body.nombre, body.bytes, publica)
  if ("error" in validacion) return NextResponse.json(validacion, { status: 400 })
  if (publica && !process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Publicación de imágenes no disponible. Inténtalo más tarde." }, { status: 503 })
  try {
    await limpiarSubidasPendientes(admin)
    const id = randomUUID(), storagePath = `${actor.user.id}/${id}.${validacion.extension}`
    const enlace = new URL(`/api/archivos/${id}`, process.env.NEXT_PUBLIC_SITE_URL || request.url)
    enlace.searchParams.set("nombre", validacion.nombre)
    const { error } = await admin.from("archivos_subidas_pendientes").insert({
      id, propietario_id: actor.user.id, storage_path: storagePath, url: enlace.toString(),
      purpose: publica ? "imagen_publica" : "privado", nombre: validacion.nombre, tipo: validacion.tipo, bytes_declarados: body.bytes,
    })
    if (error) throw error
    const signed = await admin.storage.from(BUCKET_ADJUNTOS).createSignedUploadUrl(storagePath, { upsert: false })
    if (signed.error || !signed.data) {
      await admin.from("archivos_subidas_pendientes").delete().eq("id", id)
      throw signed.error || new Error("No se pudo autorizar la subida.")
    }
    return NextResponse.json({ id, path: signed.data.path, token: signed.data.token, type: validacion.tipo },
      { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    console.error("[archivos] No se pudo preparar la subida privada")
    return NextResponse.json({ error: "Almacenamiento no disponible. Inténtalo más tarde." }, { status: 503 })
  }
}
