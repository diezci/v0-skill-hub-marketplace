import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const requested = requestUrl.searchParams.get("next")
  const destination = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/"

  if (code) {
    const supabase = await createClient()
    if (!supabase) return NextResponse.redirect(new URL("/auth/error?error=config", request.url))
    const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

    if (sessionData.user && !sessionError) {
      if (requestUrl.searchParams.get("terms") === "1") {
        await supabase.auth.updateUser({
          data: {
            terms_accepted_at: new Date().toISOString(),
            terms_version: "2026-08",
          },
        })
      }
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", sessionData.user.id)
        .single()

      if (!existingProfile) {
        // Extract name from user metadata
        const fullName = sessionData.user.user_metadata?.full_name || sessionData.user.email?.split("@")[0] || "Usuario"
        const [nombre, ...apellidoParts] = fullName.split(" ")
        const apellido = apellidoParts.join(" ") || ""

        await supabase.from("profiles").insert({
          id: sessionData.user.id,
          nombre,
          apellido,
          email: sessionData.user.email,
          foto_perfil: sessionData.user.user_metadata?.avatar_url || null,
          tipo_usuario: "cliente",
        })
      }
    }
  }

  // Tras el login (incluido Google), aterrizar en el homepage como el login normal.
  // Los admins se redirigen a /admin desde el navbar.
  return NextResponse.redirect(new URL(destination, request.url))
}
