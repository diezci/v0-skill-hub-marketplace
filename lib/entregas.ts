export const MAX_ADJUNTOS_ENTREGA = 5
// Límite de producto para los archivos de entrega y de rechazo.
export const MAX_ARCHIVO_ENTREGA_BYTES = 4 * 1024 * 1024

export function validarAdjuntosEntrega(archivos: unknown): { archivos: string[]; error?: never } | { error: string; archivos?: never } {
  if (!Array.isArray(archivos) || archivos.some((archivo) => typeof archivo !== "string" || !archivo.trim())) {
    return { error: "Los archivos adjuntos no son válidos." }
  }
  const unicos = [...new Set(archivos.map((archivo: string) => archivo.trim()))]
  if (unicos.length > MAX_ADJUNTOS_ENTREGA) return { error: "Puedes adjuntar un máximo de 5 archivos." }
  if (unicos.some((archivo) => {
    try { return new URL(archivo).protocol !== "https:" } catch { return true }
  })) return { error: "Hay un archivo adjunto no válido." }
  return { archivos: unicos }
}
