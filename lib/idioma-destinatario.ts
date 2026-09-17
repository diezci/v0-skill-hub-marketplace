import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"
import { esIdiomaValido, type Idioma } from "@/lib/i18n"

// Read the recipient preference, never the triggering actor's request cookie.
// This is presentation metadata only and grants no permission or capability.
export async function idiomaDestinatario(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  usuarioId: string,
): Promise<Idioma> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(usuarioId)
    const idioma = !error ? data.user?.user_metadata?.idioma : undefined
    return esIdiomaValido(idioma) ? idioma : "es"
  } catch {
    return "es"
  }
}
