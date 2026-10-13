"use client"

import { Badge } from "@capawesome/capacitor-badge"
import { Capacitor } from "@capacitor/core"
import { eliminarDispositivoPush } from "@/app/actions/push"

let tokenActual: string | null = null

export function guardarTokenPushActual(token: string) {
  tokenActual = token
}

export async function sincronizarBadgeApp(cantidad: number) {
  if (!Capacitor.isNativePlatform()) return
  const count = Math.max(0, Math.floor(Number.isFinite(cantidad) ? cantidad : 0))
  try {
    const { isSupported } = await Badge.isSupported()
    if (isSupported) await Badge.set({ count })
  } catch {
    // Algunos launchers Android no admiten un número. Esto nunca debe afectar
    // a la recepción del push ni al contador visible dentro de Diime.
  }
}

// Se llama antes de cerrar sesión para que el móvil no siga recibiendo avisos
// de la cuenta anterior. El token vive solo en memoria y se renueva cada vez
// que el sistema operativo registra la app.
export async function desvincularPushActual() {
  while (tokenActual) {
    const token = tokenActual
    const resultado = await eliminarDispositivoPush(token)
    if (resultado.error) throw new Error(resultado.error)
    // Si el sistema renovó el token durante la petición, también hay que
    // desvincular el nuevo antes de confirmar el cierre de sesión.
    if (tokenActual === token) tokenActual = null
  }
  await sincronizarBadgeApp(0)
}
