import { AUTH_DEEP_LINK } from "@/lib/auth-native"

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim()
  if (contentType !== "application/json") return new Response(null, { status: 415 })

  const solicitud = await request.json().catch(() => null)
  const challenge = solicitud?.challenge
  if (typeof challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return new Response(null, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return new Response(null, { status: 503 })

  try {
    // Supabase crea el estado OAuth con el reto PKCE de la WebView. iOS
    // puede abrir Google directamente tras resolver aquí el primer salto.
    const authorize = new URL("/auth/v1/authorize", supabaseUrl)
    authorize.search = new URLSearchParams({
      provider: "google",
      redirect_to: AUTH_DEEP_LINK,
      code_challenge: challenge,
      code_challenge_method: "s256",
      access_type: "offline",
      prompt: "consent",
    }).toString()
    const respuesta = await fetch(authorize, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    const destino = respuesta.headers.get("location")
    if (respuesta.status !== 302 || !destino) return new Response(null, { status: 502 })

    const google = new URL(destino)
    if (
      google.origin !== "https://accounts.google.com" ||
      google.pathname !== "/o/oauth2/v2/auth" ||
      google.username || google.password ||
      !google.searchParams.get("state")
    ) {
      return new Response(null, { status: 502 })
    }

    return Response.json({ url: google.href }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return new Response(null, { status: 502 })
  }
}
