"use server"

// Compatibilidad con pantallas antiguas: todas las entradas de chat comparten
// autorización de participantes, bloqueo, contexto y moderación.
import * as mensajesSeguros from "@/app/actions/messages"

export async function obtenerConversaciones() {
  return mensajesSeguros.obtenerConversaciones()
}

export async function obtenerMensajes(conversacionId: string) {
  return mensajesSeguros.obtenerMensajes(conversacionId)
}

export async function enviarMensaje(conversacionId: string, contenido: string) {
  return mensajesSeguros.enviarMensaje(conversacionId, contenido)
}

export async function crearConversacion(otroUsuarioId: string) {
  return mensajesSeguros.crearConversacion({ otroUsuarioId })
}
