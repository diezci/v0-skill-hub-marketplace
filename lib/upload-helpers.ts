import { createClient } from "@/lib/supabase/client"
import { BUCKET_ADJUNTOS, validarArchivo } from "@/lib/archivos"

type ArchivoSubido = { url: string; filename: string; type: string; size: number }

export async function subirArchivoPrivado(file: File): Promise<ArchivoSubido> {
  return subirArchivoDirecto(file)
}

async function subirArchivoDirecto(file: File, purpose?: "imagen_publica"): Promise<ArchivoSubido> {
  const validation = await validarArchivo(file, purpose === "imagen_publica")
  if ("error" in validation) throw new Error(validation.error)
  const supabase = createClient()
  if (!supabase) throw new Error("Almacenamiento no disponible. Inténtalo más tarde.")
  const prepared = await fetch("/api/upload/iniciar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: file.name, bytes: file.size, purpose }),
  })
  const upload = await prepared.json()
  if (!prepared.ok || !upload.id || !upload.path || !upload.token) throw new Error(upload.error || "No se pudo preparar la subida.")
  const result = await supabase.storage.from(BUCKET_ADJUNTOS).uploadToSignedUrl(upload.path, upload.token, file,
    { contentType: validation.tipo, upsert: false })
  if (result.error) throw new Error("No se pudo subir el archivo. Comprueba la conexión y vuelve a intentarlo.")
  const confirmed = await fetch("/api/upload/confirmar", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: upload.id }),
  })
  const data = await confirmed.json()
  if (!confirmed.ok || !data.url) throw new Error(data.error || "No se pudo confirmar el archivo.")
  return data
}

export async function uploadFile(file: File, options?: { purpose: "imagen_publica" }): Promise<{ url: string; filename: string } | null> {
  try {
    return await subirArchivoDirecto(file, options?.purpose)
  } catch (error) {
    console.error("Error uploading file:", error)
    return null
  }
}
