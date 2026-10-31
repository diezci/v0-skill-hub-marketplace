import { z } from "zod"
import { PRECIO_MAX } from "@/lib/precios"

const valoresSchema = z.object({
  category: z.string().max(200), title: z.string().max(500),
  description: z.string().max(20000), location: z.string().max(200),
  budget: z.tuple([z.number().min(0).max(PRECIO_MAX), z.number().min(0).max(PRECIO_MAX)]),
  urgency: z.string().max(100), neededDate: z.string().max(20),
})
const subidaSchema = z.object({
  usuarioId: z.string(), envioId: z.string().uuid(), nombre: z.string().max(255),
  bytes: z.number().int().positive().max(10 * 1024 * 1024), tipo: z.string().max(255),
  sha256: z.string().regex(/^[0-9a-f]{64}$/), url: z.string().max(2048),
})
export type SubidaBorradorSolicitud = z.infer<typeof subidaSchema>
type ContextoSubida = { usuarioId: string; envioId: string; origen: string }
type MetadatosSubida = Pick<File, "name" | "size" | "type">
const RUTA_PRIVADA = /^\/api\/archivos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function referenciaPrivada(url: string, origen: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.origin !== new URL(origen).origin || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || !RUTA_PRIVADA.test(parsed.pathname) || Array.from(parsed.searchParams.keys()).some((key) => key !== "nombre")) return null
    return parsed.href
  } catch { return null }
}

export async function huellaAdjuntoSolicitud(file: File): Promise<string | null> {
  if (!file.size || file.size > 10 * 1024 * 1024) return null
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  } catch { return null }
}

export function guardarReferenciaAdjuntoSolicitud(contexto: ContextoSubida, file: MetadatosSubida, sha256: string, url: string): SubidaBorradorSolicitud | null {
  const interna = referenciaPrivada(url, contexto.origen)
  if (!interna) return null
  const parsed = subidaSchema.safeParse({ usuarioId: contexto.usuarioId, envioId: contexto.envioId, nombre: file.name, bytes: file.size, tipo: file.type, sha256, url: interna })
  return parsed.success ? parsed.data : null
}

export function recuperarReferenciaAdjuntoSolicitud(subidas: SubidaBorradorSolicitud[], contexto: ContextoSubida, file: MetadatosSubida, sha256: string): string | null {
  const match = subidas.find((subida) => subida.usuarioId === contexto.usuarioId && subida.envioId === contexto.envioId && subida.nombre === file.name && subida.bytes === file.size && subida.tipo === file.type && subida.sha256 === sha256)
  return match ? referenciaPrivada(match.url, contexto.origen) : null
}

const schema = z.object({
  version: z.literal(1), usuarioId: z.string(), guardadoAt: z.number(),
  valores: valoresSchema, empresaId: z.string().uuid().nullable(),
  envioId: z.string().uuid().optional(),
  adjuntos: z.array(z.string().max(255)).max(100),
  subidas: z.array(subidaSchema).max(100).optional(),
})
export type ValoresBorradorSolicitud = z.infer<typeof valoresSchema>
export type BorradorSolicitud = z.infer<typeof schema>
type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">
const clave = (usuarioId: string) => `diime:solicitud-borrador:v1:${usuarioId}`
const DURACION = 24 * 60 * 60 * 1000

export function almacenBorradorSolicitud(): Almacen | null {
  try { return window.sessionStorage } catch { return null }
}

export function borrarBorradorSolicitud(almacen: Almacen | null, usuarioId: string) {
  try { almacen?.removeItem(clave(usuarioId)) } catch { /* Almacenamiento bloqueado. */ }
}

export function leerBorradorSolicitud(almacen: Almacen | null, usuarioId: string, ahora = Date.now()): BorradorSolicitud | null {
  try {
    const raw = almacen?.getItem(clave(usuarioId))
    if (!raw) return null
    const resultado = schema.safeParse(JSON.parse(raw))
    if (resultado.success && resultado.data.usuarioId === usuarioId && resultado.data.guardadoAt <= ahora && ahora - resultado.data.guardadoAt < DURACION) return resultado.data
    borrarBorradorSolicitud(almacen, usuarioId)
  } catch { borrarBorradorSolicitud(almacen, usuarioId) }
  return null
}

export function guardarBorradorSolicitud(almacen: Almacen | null, borrador: Omit<BorradorSolicitud, "version" | "guardadoAt">, ahora = Date.now()) {
  if (!almacen) return false
  try {
    const dato = schema.parse({ ...borrador, version: 1, guardadoAt: ahora })
    const v = dato.valores
    if (!v.category && !v.title && !v.description && !v.location && !v.urgency && !v.neededDate && !dato.empresaId && !dato.adjuntos.length && v.budget[0] === 0 && v.budget[1] === PRECIO_MAX) {
      borrarBorradorSolicitud(almacen, dato.usuarioId)
    } else almacen.setItem(clave(dato.usuarioId), JSON.stringify(dato))
    return true
  } catch { return false }
}
