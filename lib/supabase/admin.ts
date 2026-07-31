import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// Cliente con la service role key. SOLO servidor: esta clave se salta la RLS,
// así que nunca debe acabar en el navegador (no lleva prefijo NEXT_PUBLIC_).
//
// Se usa para lo que el servidor necesita legítimamente y la sesión del usuario
// no puede dar: por ejemplo, leer el correo de la persona a la que se le manda
// un aviso, que puede no tener ninguna relación previa con quien lo provoca
// (el caso típico: avisar de una demanda nueva a los profesionales de esa
// categoría y provincia).
//
// Devuelve null si no está configurada, para que quien la use degrade sin
// romper en lugar de reventar la petición.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) return null

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
