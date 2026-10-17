import { z } from "zod"

const valoresSchema = z.object({
  titulo: z.string().max(500), descripcion: z.string().max(20000),
  imagen_url: z.string().max(4000), categoria: z.string().max(200),
  fecha_completado: z.string().max(30), ubicacion: z.string().max(200),
  duracion: z.string().max(200), presupuesto: z.string().max(100),
  trabajo_id: z.union([z.literal(""), z.string().uuid()]),
  contexto_proveedor: z.string().max(20000),
})
const schema = z.object({
  version: z.literal(1), usuarioId: z.string().uuid(), guardadoAt: z.number(),
  itemId: z.string().uuid().nullable(), valores: valoresSchema,
})
export type BorradorPortfolio = z.infer<typeof schema>
type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">
const clave = (usuarioId: string) => `diime:portfolio-borrador:v1:${usuarioId}`
const DURACION = 24 * 60 * 60 * 1000

export function almacenBorradorPortfolio(): Almacen | null {
  try { return window.sessionStorage } catch { return null }
}
export function borrarBorradorPortfolio(almacen: Almacen | null, usuarioId: string) {
  try { almacen?.removeItem(clave(usuarioId)) } catch { /* Almacenamiento bloqueado. */ }
}
export function leerBorradorPortfolio(almacen: Almacen | null, usuarioId: string, ahora = Date.now()): BorradorPortfolio | null {
  try {
    const raw = almacen?.getItem(clave(usuarioId))
    if (!raw) return null
    const result = schema.safeParse(JSON.parse(raw))
    if (result.success && result.data.usuarioId === usuarioId && result.data.guardadoAt <= ahora && ahora - result.data.guardadoAt < DURACION) return result.data
  } catch { /* Un borrador dañado no bloquea el editor. */ }
  borrarBorradorPortfolio(almacen, usuarioId)
  return null
}
export function guardarBorradorPortfolio(almacen: Almacen | null, borrador: Omit<BorradorPortfolio, "version" | "guardadoAt">, ahora = Date.now()) {
  if (!almacen) return false
  try {
    const dato = schema.parse({ ...borrador, version: 1, guardadoAt: ahora })
    if (!dato.itemId && Object.values(dato.valores).every(v => !v)) borrarBorradorPortfolio(almacen, dato.usuarioId)
    else almacen.setItem(clave(dato.usuarioId), JSON.stringify(dato))
    return true
  } catch { return false }
}
