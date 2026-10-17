import { z } from "zod"
import { PRECIO_MAX } from "@/lib/precios"

const valoresSchema = z.object({
  category: z.string().max(200), title: z.string().max(500),
  description: z.string().max(20000), location: z.string().max(200),
  budget: z.tuple([z.number().min(0).max(PRECIO_MAX), z.number().min(0).max(PRECIO_MAX)]),
  urgency: z.string().max(100), neededDate: z.string().max(20),
})
const schema = z.object({
  version: z.literal(1), usuarioId: z.string(), guardadoAt: z.number(),
  valores: valoresSchema, empresaId: z.string().uuid().nullable(),
  adjuntos: z.array(z.string().max(255)).max(100),
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
