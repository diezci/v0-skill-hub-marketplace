import { NextResponse } from "next/server"
import { enviarMensaje } from "@/app/actions/messages"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SolicitudMensaje = {
  conversacionId?: unknown
  contenido?: unknown
  adjunto?: {
    tipo?: unknown
    url?: unknown
    nombre?: unknown
  }
}

export async function POST(request: Request) {
  let solicitud: SolicitudMensaje
  try {
    solicitud = (await request.json()) as SolicitudMensaje
  } catch {
    return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 })
  }

  if (typeof solicitud.conversacionId !== "string" || typeof solicitud.contenido !== "string") {
    return NextResponse.json({ error: "Faltan datos del mensaje" }, { status: 400 })
  }

  let adjunto: { tipo: "imagen" | "archivo"; url: string; nombre: string } | undefined
  if (solicitud.adjunto !== undefined) {
    const { tipo, url, nombre } = solicitud.adjunto
    if (
      (tipo !== "imagen" && tipo !== "archivo") ||
      typeof url !== "string" ||
      typeof nombre !== "string"
    ) {
      return NextResponse.json({ error: "Adjunto no válido" }, { status: 400 })
    }
    adjunto = { tipo, url, nombre }
  }

  console.info(`[push] message_api_started conversation=${solicitud.conversacionId.slice(0, 8)}`)
  const resultado = await enviarMensaje(solicitud.conversacionId, solicitud.contenido, adjunto)
  console.info(
    `[push] message_api_finished conversation=${solicitud.conversacionId.slice(0, 8)} result=${resultado.error ? "error" : "ok"}`,
  )

  return NextResponse.json(resultado, {
    status: resultado.error === "No autenticado" ? 401 : resultado.error ? 400 : 200,
  })
}
