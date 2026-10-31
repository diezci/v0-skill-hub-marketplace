/** Retain a post-login destination without allowing a URL outside this app. */
export function destinoAuthSeguro(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback
  try {
    const base = "https://diime.invalid"
    const url = new URL(value, base)
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback
  } catch { return fallback }
}

/** Prefer the configured public origin to Next's internal localhost URL. */
export function origenAuthConfigurado(requestUrl: string, configuredUrl?: string): string {
  const url = new URL(configuredUrl || requestUrl)
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Invalid configured authentication origin")
  }
  return url.origin
}

export function destinoTrasConfirmacion(requested: string | null, saved: unknown): string {
  return requested ? destinoAuthSeguro(requested) : destinoAuthSeguro(saved)
}

export const EVENTO_REAUTENTICACION = "diime:solicitar-reautenticacion"

/** AppChrome owns navigation, including requests racing the Auth SDK event. */
export function solicitarReautenticacion(ruta: string): void {
  window.dispatchEvent(new CustomEvent(EVENTO_REAUTENTICACION, { detail: { ruta } }))
}
