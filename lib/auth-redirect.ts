/** Retain a post-login destination without allowing a URL outside this app. */
export function destinoAuthSeguro(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback
  try {
    const base = "https://diime.invalid"
    const url = new URL(value, base)
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback
  } catch { return fallback }
}
