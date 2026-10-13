export const BUCKET_ADJUNTOS = "adjuntos-privados"
export const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024
export const ID_ARCHIVO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TIPOS: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  avif: "image/avif", heic: "image/heic", heif: "image/heif", pdf: "application/pdf", txt: "text/plain",
  doc: "application/msword", xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

type ArchivoValidado = { error: string } | { tipo: string; nombre: string; extension: string }

export async function validarArchivo(file: File, imagenPublica = false): Promise<ArchivoValidado> {
  const extension = file.name.split(".").pop()?.toLowerCase() || ""
  const tipo = TIPOS[extension]
  if (!tipo || (imagenPublica && !tipo.startsWith("image/"))) return { error: "Tipo de archivo no permitido." }
  if (file.size === 0 || file.size > MAX_ARCHIVO_BYTES) return { error: "El archivo debe ocupar entre 1 byte y 10 MB." }
  const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer())
  const starts = (...prefix: number[]) => prefix.every((v, i) => bytes[i] === v)
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  const valido = tipo === "image/jpeg" ? starts(255, 216, 255)
    : tipo === "image/png" ? starts(137, 80, 78, 71, 13, 10, 26, 10)
    : tipo === "image/gif" ? ["GIF87a", "GIF89a"].includes(ascii(0, 6))
    : tipo === "image/webp" ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
    : ["image/avif", "image/heic", "image/heif"].includes(tipo) ? ascii(4, 8) === "ftyp" && /^(avif|avis|heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8, 12))
    : extension === "pdf" ? ascii(0, 5) === "%PDF-"
    : ["docx", "xlsx"].includes(extension) ? starts(80, 75, 3, 4)
    : ["doc", "xls"].includes(extension) ? starts(208, 207, 17, 224, 161, 177, 26, 225)
    : !bytes.includes(0)
  if (!valido) return { error: "El contenido del archivo no corresponde a su formato." }
  const nombre = file.name.replace(/[\r\n\x00-\x1f\\/]/g, "_").slice(0, 180) || `archivo.${extension}`
  return { tipo, nombre, extension }
}
