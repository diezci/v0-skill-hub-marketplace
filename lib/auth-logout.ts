"use client"

import { createClient } from "@/lib/supabase/client"
import { desvincularPushActual } from "@/lib/push/client"

// Todos los controles comparten el cierre y una única navegación. Tras el
// éxito, el documento anterior sigue en estado de salida hasta que se descargue.
let cierrePendiente: Promise<void> | null = null

export function cierreSesionSolicitado() {
  return cierrePendiente !== null
}

export function cerrarSesionActual(scope: "local" | "global" = "local") {
  if (!cierrePendiente) {
    cierrePendiente = confirmarCierre(scope).catch((error) => {
      cierrePendiente = null
      throw error
    })
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
  window.location.replace("/")
}
