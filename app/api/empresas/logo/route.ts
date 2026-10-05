import { del, put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const MAX_LOGO_BYTES = 3 * 1024 * 1024
const EXTENSIONES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const

class ErrorLogo extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function comprobarAcceso(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new ErrorLogo("Debes iniciar sesión para subir el logo.", 401)
  const { data: empresa, error: contextoError } = await supabase.rpc("empresa_contexto_actual")
  if (contextoError) throw new ErrorLogo("No se pudo comprobar el acceso a tu empresa. Vuelve a intentarlo.", 503)
  if (!empresa?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empresa.id)) {
    throw new ErrorLogo("No tienes permiso para cambiar el logo de esta empresa.", 403)
  }
  const { data: permitido, error: permisoError } = await supabase.rpc("empresa_comprobar_permiso", {
    p_empresa_id: empresa.id, p_permiso: "perfil",
  })
  if (permisoError) throw new ErrorLogo("No se pudo comprobar el acceso a tu empresa. Vuelve a intentarlo.", 503)
  if (permitido !== true) throw new ErrorLogo("No tienes permiso para cambiar el logo de esta empresa.", 403)
  return { usuarioId: user.id, empresaId: empresa.id as string }
}

function cabeceraValida(bytes: Uint8Array, tipo: keyof typeof EXTENSIONES) {
  if (tipo === "image/png") {
    return bytes.length >= 24
      && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
      && bytes[8] === 0 && bytes[9] === 0 && bytes[10] === 0 && bytes[11] === 13
      && String.fromCharCode(...bytes.slice(12, 16)) === "IHDR"
  }
  if (tipo === "image/jpeg") return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  return bytes.length >= 16 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    && ["VP8 ", "VP8L", "VP8X"].includes(String.fromCharCode(...bytes.slice(12, 16)))
}

export async function POST(request: NextRequest) {
  let subidaUrl: string | undefined
  try {
    const supabase = await createClient()
    if (!supabase) throw new ErrorLogo("No se pudo comprobar el acceso a tu empresa. Vuelve a intentarlo.", 503)
    // Authentication and current database permissions precede file parsing and
    // Blob writes. No company identity or storage path is trusted from the form.
    const acceso = await comprobarAcceso(supabase)
    const contentLength = Number(request.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > MAX_LOGO_BYTES + 64 * 1024) {
      throw new ErrorLogo("El logo no puede superar los 3 MB.", 413)
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      throw new ErrorLogo("Adjunta una imagen para el logo.", 400)
    }
    let form: FormData
    try { form = await request.formData() }
    catch { throw new ErrorLogo("No se pudo leer el archivo del logo.", 400) }
    const empresaEsperada = form.get("empresaId")
    if (empresaEsperada !== null && empresaEsperada !== acceso.empresaId) {
      throw new ErrorLogo("La empresa activa ha cambiado. Recarga la página antes de guardar.", 409)
    }
    const file = form.get("file")
    if (!(file instanceof File) || form.getAll("file").length !== 1 || file.size === 0) {
      throw new ErrorLogo("Adjunta una imagen para el logo.", 400)
    }
    if (file.size > MAX_LOGO_BYTES) throw new ErrorLogo("El logo no puede superar los 3 MB.", 413)
    if (!Object.hasOwn(EXTENSIONES, file.type)) throw new ErrorLogo("El logo debe ser una imagen PNG, JPEG o WebP.", 415)
    const tipo = file.type as keyof typeof EXTENSIONES
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > MAX_LOGO_BYTES) throw new ErrorLogo("El logo no puede superar los 3 MB.", 413)
    if (!cabeceraValida(bytes, tipo)) throw new ErrorLogo("El archivo no coincide con una imagen PNG, JPEG o WebP válida.", 415)

    const blob = await put(`empresas/${acceso.empresaId}/logo.${EXTENSIONES[tipo]}`, file, {
      access: "public", addRandomSuffix: true, contentType: tipo,
    })
    subidaUrl = blob.url
    // A revocation or context change during network upload must not return a
    // usable logo URL. Only the new upload is removed, never a previous logo.
    const accesoActual = await comprobarAcceso(supabase)
    if (accesoActual.usuarioId !== acceso.usuarioId || accesoActual.empresaId !== acceso.empresaId) {
      throw new ErrorLogo("La empresa activa ha cambiado. Recarga la página antes de guardar.", 409)
    }
    return NextResponse.json({ url: blob.url })
  } catch (error) {
    if (subidaUrl) {
      try { await del(subidaUrl) }
      catch {
        console.error("No se pudo limpiar una subida de logo no autorizada.")
        return NextResponse.json({ error: "No se pudo finalizar la subida del logo. Vuelve a intentarlo." }, { status: 500 })
      }
    }
    if (error instanceof ErrorLogo) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("No se pudo subir el logo de empresa.")
    return NextResponse.json({ error: "No se pudo subir el logo. Vuelve a intentarlo." }, { status: 500 })
  }
}
