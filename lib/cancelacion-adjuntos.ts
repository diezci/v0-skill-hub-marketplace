const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const ARCHIVO_LOCAL = new RegExp(`^/api/archivos/${ID}$`, "i")

export function validarAdjuntosCancelacion(archivos: string[] | undefined) {
  if (!archivos) return { archivos: [] as string[] }
  if (!Array.isArray(archivos) || archivos.some((url) => typeof url !== "string")) {
    return { error: "Los archivos adjuntos no son válidos." }
  }
  const unicos = [...new Set(archivos.map((url) => url.trim()).filter(Boolean))]
  if (unicos.length > 5) return { error: "Puedes adjuntar un máximo de 5 archivos." }
  const sandboxLocal = process.env.DIIME_QA_PROFILE === "sandbox"
    && process.env.DIIME_E2E_LOCAL === "1"
    && process.env.NEXT_PUBLIC_SITE_URL === "http://127.0.0.1:3200"
  const valido = (valor: string) => {
    try {
      const url = new URL(valor)
      if (url.username || url.password) return false
      return url.protocol === "https:" || (sandboxLocal
        && url.origin === "http://127.0.0.1:3200" && ARCHIVO_LOCAL.test(url.pathname))
    } catch { return false }
  }
  if (unicos.some((url) => !valido(url))) return { error: "Hay un archivo adjunto no válido." }
  // The existing database trigger still checks exact private-file ownership
  // and authorization; accepting a local URL never grants access to its bytes.
  return { archivos: unicos }
}
