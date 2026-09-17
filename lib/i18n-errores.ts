import { traducir, type Idioma } from "./i18n"

// This helper belongs only at the application/server-error boundary. The one
// legacy SQL interpolation we accept is a non-negative dispute count. We never
// rewrite fragments or apply patterns to user-authored descriptions/messages.
export function traducirErrorServidor(idioma: Idioma, texto: string): string {
  const exacto = traducir(idioma, texto)
  if (idioma === "es" || exacto !== texto) return exacto

  const disputas = /^Tienes (\d+) disputa\(s\) abierta\(s\)\. Hay que resolverlas antes de darte de baja: si desapareces, la otra parte se queda sin nadie con quien cerrarlas\.$/.exec(texto)
  if (disputas) {
    return traducir(idioma, "Tienes {cantidad} disputa(s) abierta(s). Hay que resolverlas antes de darte de baja: si desapareces, la otra parte se queda sin nadie con quien cerrarlas.", { cantidad: disputas[1] })
  }
  return texto
}
