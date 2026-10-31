import { z } from "zod"

const esquema = z.object({
  usuarioId: z.string().uuid(), solicitudId: z.string().uuid(), empresaId: z.string().uuid().nullable(),
  guardadoAt: z.number(),
  valores: z.object({ precio: z.string().max(30), duracion: z.string().max(20), unidadTiempo: z.string().max(20), descripcion: z.string().max(20000), materiales: z.string().max(100) }),
  adjuntos: z.array(z.string().max(255)).max(100),
})
export type BorradorOferta = z.infer<typeof esquema>
const clave = (usuarioId: string, solicitudId: string) => `diime:oferta-borrador:v1:${usuarioId}:${solicitudId}`
type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">
export function almacenBorradorOferta(): Almacen | null { try { return window.sessionStorage } catch { return null } }
export function borrarBorradorOferta(almacen: Almacen | null, usuarioId: string, solicitudId: string) {
  try { almacen?.removeItem(clave(usuarioId, solicitudId)) } catch { /* Storage may be unavailable. */ }
}
export function guardarBorradorOferta(almacen: Almacen | null, dato: Omit<BorradorOferta, "guardadoAt">) {
  try { if (!almacen) return false; almacen.setItem(clave(dato.usuarioId, dato.solicitudId), JSON.stringify(esquema.parse({ ...dato, guardadoAt: Date.now() }))); return true } catch { return false }
}
export function leerBorradorOferta(almacen: Almacen | null, usuarioId: string, solicitudId: string): BorradorOferta | null {
  try {
    const raw = almacen?.getItem(clave(usuarioId, solicitudId))
    if (!raw) return null
    const r = esquema.safeParse(JSON.parse(raw))
    if (r.success && r.data.usuarioId === usuarioId && r.data.solicitudId === solicitudId && r.data.guardadoAt <= Date.now() && Date.now() - r.data.guardadoAt < 86400000) return r.data
  } catch { /* Never restore malformed or another account's draft. */ }
  borrarBorradorOferta(almacen, usuarioId, solicitudId)
  return null
}
