import { NextRequest, NextResponse } from "next/server"

const ACTORES = new Set(["owner", "ana", "mario", "cliente", "admin", "invitado"])
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"])

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.DIIME_EMPRESAS_LOCAL !== "1") {
    return new NextResponse(null, { status: 404 })
  }
  const host = request.headers.get("host")
  const origin = request.headers.get("origin")
  try {
    if (!host || !origin || !HOSTS_LOCALES.has(new URL(`http://${host}`).hostname) || new URL(origin).host !== host) {
      return NextResponse.json({ error: "Acceso local requerido" }, { status: 403 })
    }
    const body = await request.json()
    if (!ACTORES.has(body.actorId)) return NextResponse.json({ error: "Cuenta de prueba no válida" }, { status: 400 })
    const response = NextResponse.json({ ok: true })
    response.headers.set("Cache-Control", "no-store")
    response.cookies.set("diime_empresa_actor", body.actorId, { httpOnly: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 8 })
    return response
  } catch { return NextResponse.json({ error: "Solicitud no válida" }, { status: 400 }) }
}
