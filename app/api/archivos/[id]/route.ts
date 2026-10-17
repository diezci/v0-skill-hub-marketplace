import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ID_ARCHIVO } from "@/lib/archivos"
import { streamArchivoPrivado } from "@/lib/archivos-servidor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const SIN_CACHE = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "X-Content-Type-Options": "nosniff" }

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!ID_ARCHIVO.test(id)) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404, headers: SIN_CACHE })
  const supabase = await createClient()
  const auth = await supabase?.auth.getUser()
  if (!supabase || auth?.error || !auth?.data.user) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401, headers: SIN_CACHE })
  // Se comprueba el acceso ACTUAL al objeto padre en cada descarga. No se
  // entregan enlaces públicos o firmados reutilizables después de revocar acceso.
  const { data: archivo, error } = await supabase.rpc("archivo_privado_metadata", { p_id: id })
  if (error) return NextResponse.json({ error: "No se pudo comprobar el acceso." }, { status: 503, headers: SIN_CACHE })
  if (!archivo) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404, headers: SIN_CACHE })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: "Almacenamiento no disponible." }, { status: 503, headers: SIN_CACHE })
  const stream = await streamArchivoPrivado(archivo.storage_path, _request.signal)
  if (!stream) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404, headers: SIN_CACHE })
  const imagen = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif"].includes(archivo.tipo)
  const nombre = encodeURIComponent(archivo.nombre).replace(/['()*]/g, (letra) => `%${letra.charCodeAt(0).toString(16).toUpperCase()}`)
  return new Response(stream, { headers: {
    ...SIN_CACHE, "Content-Type": archivo.tipo,
    "Content-Disposition": `${imagen ? "inline" : "attachment"}; filename="archivo"; filename*=UTF-8''${nombre}`,
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } })
}
