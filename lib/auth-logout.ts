"use client"

import { createClient } from "@/lib/supabase/client"
import { desvincularPushActual } from "@/lib/push/client"

// La navegación solo puede anunciar el cierre cuando ambos servicios lo
// confirman. Un fallo conserva la sesión y permite repetir la operación.
let cierrePendiente: Promise<void> | null = null

export function cerrarSesionActual(scope: "local" | "global" = "local") {
  if (!cierrePendiente) {
    cierrePendiente = confirmarCierre(scope).finally(() => { cierrePendiente = null })
  }
  return cierrePendiente
}

async function confirmarCierre(scope: "local" | "global") {
  await desvincularPushActual()
  const supabase = createClient()
  const { error } = await supabase.auth.signOut({ scope })
  if (error) throw error
  const { data, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || data.session) throw sessionError || new Error("La sesión sigue abierta")
}
