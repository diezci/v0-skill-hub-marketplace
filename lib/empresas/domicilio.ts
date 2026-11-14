import { createHmac, timingSafeEqual } from "node:crypto"

export type DireccionCandidata = { id: string; domicilio: string; latitud: number; longitud: number }
export type DireccionComprobada = DireccionCandidata & { comprobadoEn: string }
export type DireccionFirmada = DireccionCandidata & { comprobante: string }

/** Only actual numbered portals count; municipalities and streets are suggestions, not addresses. */
export function candidatosCartociudad(respuesta: unknown): DireccionCandidata[] {
  if (!Array.isArray(respuesta)) return []
  return respuesta.flatMap((v): DireccionCandidata[] => {
    if (!v || typeof v !== "object" || v.type !== "portal" || v.noNumber === true ||
      !Number.isFinite(v.portalNumber) || v.portalNumber < 1 || typeof v.id !== "string" ||
      typeof v.address !== "string" || !v.address.trim() || !Number.isFinite(v.lat) || !Number.isFinite(v.lng) ||
      v.lat < 27 || v.lat > 45 || v.lng < -19 || v.lng > 5 || typeof v.postalCode !== "string" || !/^\d{5}$/.test(v.postalCode)) return []
    const domicilio = `${v.address.trim()}, ${v.postalCode}${v.province ? `, ${v.province}` : ""}, España`
    if (domicilio.length > 500 || v.id.length > 160) return []
    return [{ id: v.id, domicilio, latitud: v.lat, longitud: v.lng }]
  }).slice(0, 5)
}

export async function buscarCartociudad(consulta: string, request: typeof fetch = fetch): Promise<DireccionCandidata[]> {
  const limpia = consulta.trim()
  if (limpia.length < 8 || limpia.length > 300 || /[\u0000-\u001f\u007f]/.test(limpia)) throw new Error("Escribe la calle, el número y la localidad para buscar la dirección.")
  const url = new URL("https://www.cartociudad.es/geocoder/api/geocoder/candidates")
  url.searchParams.set("q", limpia); url.searchParams.set("limit", "5")
  const response = await request(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000), cache: "no-store" })
  if (!response.ok) throw new Error("El servicio de direcciones no está disponible. Vuelve a intentarlo.")
  return candidatosCartociudad(await response.json())
}

export function firmarDireccion(direccion: DireccionCandidata, actorId: string, empresaId: string, secreto: string, ahora = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...direccion, actorId, empresaId, comprobadoEn: new Date(ahora).toISOString(), caduca: ahora + 15 * 60 * 1000 })).toString("base64url")
  return `${payload}.${createHmac("sha256", secreto).update(`diime-domicilio-v1:${payload}`).digest("base64url")}`
}

export function verificarDireccion(comprobante: string, actorId: string, empresaId: string, domicilio: string, secreto: string, ahora = Date.now()): DireccionComprobada | null {
  try {
    if (comprobante.length > 4000) return null
    const [payload, firma, extra] = comprobante.split(".")
    if (!payload || !firma || extra) return null
    const actual = Buffer.from(firma, "base64url")
    const esperada = createHmac("sha256", secreto).update(`diime-domicilio-v1:${payload}`).digest()
    if (actual.length !== esperada.length || !timingSafeEqual(actual, esperada)) return null
    const valor = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (valor.actorId !== actorId || valor.empresaId !== empresaId || valor.domicilio !== domicilio || !Number.isFinite(valor.caduca) || valor.caduca <= ahora) return null
    return { id: valor.id, domicilio: valor.domicilio, latitud: valor.latitud, longitud: valor.longitud, comprobadoEn: valor.comprobadoEn }
  } catch { return null }
}
