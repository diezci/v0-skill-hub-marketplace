"use client"

import { eliminarDispositivoPush } from "@/app/actions/push"

let tokenActual: string | null = null

export function guardarTokenPushActual(token: string) {
  tokenActual = token
}

// Se llama antes de cerrar sesión para que el móvil no siga recibiendo avisos
// de la cuenta anterior. El token vive solo en memoria y se renueva cada vez
// que el sistema operativo registra la app.
export async function desvincularPushActual() {
  if (!tokenActual) return
  const token = tokenActual
  tokenActual = null
  await eliminarDispositivoPush(token).catch(() => {})
}
