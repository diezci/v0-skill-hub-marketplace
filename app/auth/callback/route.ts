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
      const aceptaTerminos = requestUrl.searchParams.get("terms") === "1"
      const confirmaMayoriaEdad = requestUrl.searchParams.get("age") === "1"
      const aceptacionLegal = new Date().toISOString()

      if (aceptaTerminos || confirmaMayoriaEdad) {
        await supabase.auth.updateUser({
          data: {
            ...(aceptaTerminos
              ? { terms_accepted_at: aceptacionLegal, terms_version: "2026-08" }
              : {}),
            ...(confirmaMayoriaEdad
              ? {
                  mayor_edad_confirmada_at: aceptacionLegal,
                  mayor_edad_version: "18-plus-2026-08",
                }
              : {}),
          },
        })
      }
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", sessionData.user.id)
        .single()

      if (existingProfile && confirmaMayoriaEdad) {
        await supabase
          .from("profiles")
          .update({
            mayor_edad_confirmada_at: aceptacionLegal,
            mayor_edad_version: "18-plus-2026-08",
          })
          .eq("id", sessionData.user.id)
      } else if (!existingProfile) {
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
          mayor_edad_confirmada_at: confirmaMayoriaEdad ? aceptacionLegal : null,
          mayor_edad_version: confirmaMayoriaEdad ? "18-plus-2026-08" : null,
        })
      }
    }
  }

  // Tras el login (incluido Google), aterrizar en el homepage como el login normal.
  // Los admins se redirigen a /admin desde el navbar.
  return NextResponse.redirect(new URL(destination, request.url))
}
