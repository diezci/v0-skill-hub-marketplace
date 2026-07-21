import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")

  if (code) {
    const supabase = await createClient()
    const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

    if (sessionData.user && !sessionError) {
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

  return NextResponse.redirect(new URL("/mi-cuenta", request.url))
}
