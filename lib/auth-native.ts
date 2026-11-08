import type { SupabaseClient } from "@supabase/supabase-js"
import { destinoAuthSeguro } from "@/lib/auth-redirect"

// Debe coincidir exactamente con la URL autorizada en Supabase. Añadirle
// parámetros hace que Auth vuelva al Site URL (la web) en vez de a la app.
export const AUTH_DEEP_LINK = "es.diime.app://auth/callback"
const RETORNO_KEY = "diime_oauth_return_v1"
const RETORNO_MAX_MS = 30 * 60 * 1000

type RetornoOAuth = { destino: string; terms: boolean; age: boolean }

export function guardarRetornoOAuthNativo(
  retorno: RetornoOAuth,
  storage: Pick<Storage, "setItem">,
  ahora = Date.now(),
) {
  // Solo contexto de navegación/consentimiento, nunca códigos ni tokens. Se
  // conserva al reiniciar la app, igual que la cookie del verificador PKCE.
  storage.setItem(RETORNO_KEY, JSON.stringify({ ...retorno, destino: destinoAuthSeguro(retorno.destino), creado: ahora }))
}

function consumirRetornoOAuth(storage: Pick<Storage, "getItem" | "removeItem">): RetornoOAuth | null {
  try {
    const raw = storage.getItem(RETORNO_KEY)
    storage.removeItem(RETORNO_KEY)
    if (!raw) return null
    const retorno = JSON.parse(raw)
    const antiguedad = Date.now() - retorno.creado
    if (typeof retorno.creado !== "number" || antiguedad < 0 || antiguedad > RETORNO_MAX_MS) return null
    return { destino: destinoAuthSeguro(retorno.destino), terms: retorno.terms === true, age: retorno.age === true }
  } catch {
    return null
  }
}

export function crearManejadorAuthNativo({
  supabase,
  storage,
  procesados,
  cerrarNavegador,
  navegar,
}: {
  supabase: SupabaseClient
  storage: Pick<Storage, "getItem" | "removeItem">
  procesados: Set<string>
  cerrarNavegador: () => Promise<unknown>
  navegar: (destino: string) => void
}) {
  return async (url: string) => {
    let callback: URL
    try { callback = new URL(url) } catch { return false }
    if (callback.protocol !== "es.diime.app:" || callback.hostname !== "auth" ||
        callback.pathname !== "/callback" || callback.username || callback.password || callback.port) return false

    // appUrlOpen y getLaunchUrl pueden entregar el mismo código. Es de un
    // solo uso: un segundo intercambio invalidaría un retorno correcto.
    const code = callback.searchParams.get("code")
    const id = code || callback.href
    if (procesados.has(id)) return true
    procesados.add(id)
    const retorno = consumirRetornoOAuth(storage)
    // getLaunchUrl conserva el enlace incluso después de recargar la WebView.
    // Sin una operación pendiente, es un retorno viejo y no se vuelve a canjear.
    if (!retorno) return true
    await cerrarNavegador().catch(() => {})

    try {
      const fragment = new URLSearchParams(callback.hash.slice(1))
      if (!code || callback.searchParams.has("error") || fragment.has("error")) throw new Error("OAuth callback failed")
      // El intercambio ocurre en la WebView que inició PKCE, donde se guardan
      // sus cookies. El navegador del proveedor no recibe la sesión de la app.
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error || !data.user) throw error || new Error("OAuth session missing")
      if (retorno.terms || retorno.age) {
        const aceptacionLegal = new Date().toISOString()
        await supabase.auth.updateUser({
          data: {
            ...(retorno.terms ? { terms_accepted_at: aceptacionLegal, terms_version: "2026-08" } : {}),
            ...(retorno.age ? { mayor_edad_confirmada_at: aceptacionLegal, mayor_edad_version: "18-plus-2026-08" } : {}),
          },
        })
        if (retorno.age) {
          await supabase.from("profiles").update({
            mayor_edad_confirmada_at: aceptacionLegal,
            mayor_edad_version: "18-plus-2026-08",
          }).eq("id", data.user.id)
        }
      }
      navegar(retorno.destino)
    } catch {
      navegar("/auth/login?error=oauth")
    }
    return true
  }
}
