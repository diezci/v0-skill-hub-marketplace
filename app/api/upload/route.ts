import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BUCKET_ADJUNTOS, MAX_ARCHIVO_BYTES, validarArchivo } from "@/lib/archivos"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const auth = await supabase?.auth.getUser()
    if (!supabase || auth?.error || !auth?.data.user) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 })
    const user = auth.data.user
    const profile = await supabase.from("profiles").select("id, cuenta_eliminada").eq("id", user.id).maybeSingle()
    if (profile.error || !profile.data || profile.data.cuenta_eliminada) return NextResponse.json({ error: "Cuenta no disponible." }, { status: 403 })
    const length = Number(request.headers.get("content-length"))
    if (length > MAX_ARCHIVO_BYTES + 1024 * 1024) return NextResponse.json({ error: "Archivo demasiado grande." }, { status: 413 })
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const purpose = formData.get("purpose")
    if (purpose && purpose !== "imagen_publica") return NextResponse.json({ error: "Uso de archivo no válido." }, { status: 400 })
    const imagenPublica = purpose === "imagen_publica"
    const validacion = await validarArchivo(file, imagenPublica)
    if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 })
    const id = randomUUID()
    let url: string
    if (imagenPublica) {
      // Solo imágenes destinadas explícitamente al perfil/portfolio público.
      const blob = await put(`perfiles/${user.id}/${id}.${validacion.extension}`, file, {
        access: "public", addRandomSuffix: true, contentType: validacion.tipo,
      })
      url = blob.url
    } else {
      const admin = createAdminClient()
      if (!admin) return NextResponse.json({ error: "Almacenamiento no disponible." }, { status: 503 })
      const path = `${user.id}/${id}.${validacion.extension}`
      const enlace = new URL(`/api/archivos/${id}`, process.env.NEXT_PUBLIC_SITE_URL || request.url)
      enlace.searchParams.set("nombre", validacion.nombre)
      url = enlace.toString()
      const bucket = admin.storage.from(BUCKET_ADJUNTOS)
      const upload = await bucket.upload(path, file, { contentType: validacion.tipo, upsert: false })
      if (upload.error) throw upload.error
      const registro = await admin.from("archivos_privados").insert({
        id, propietario_id: user.id, storage_path: path, url, nombre: validacion.nombre,
        tipo: validacion.tipo, bytes: file.size,
      })
      if (registro.error) {
        await bucket.remove([path])
        throw registro.error
      }
    }

    return NextResponse.json({
      url,
      filename: validacion.nombre,
      size: file.size,
      type: validacion.tipo,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
