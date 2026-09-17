"use server"

import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { esIdiomaValido, IDIOMA_COOKIE, type Idioma } from "@/lib/i18n"

/** This metadata is only a display preference, never an authorization claim. */
export async function guardarIdioma(idioma: Idioma) {
  if (!esIdiomaValido(idioma)) return { guardado: false }
  ;(await cookies()).set(IDIOMA_COOKIE, idioma, {
    path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
  try {
    const supabase = await createClient()
    if (!supabase) return { guardado: false }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { guardado: true }
    const { error } = await supabase.auth.updateUser({ data: { idioma } })
    return { guardado: !error }
  } catch {
    return { guardado: false }
  }
}
