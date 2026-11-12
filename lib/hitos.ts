/** Payment plans use integer cents from draft to settlement. */
export type ModalidadPago = "unico" | "hitos"

export type HitoBorrador = {
  id: string
  titulo: string
  descripcion?: string
  criterio_aceptacion: string
  fecha_limite: string
  importe_centimos: number
}

export type EstadoHito = "pendiente" | "financiado" | "entregado" | "cambios_solicitados" | "aprobado" | "completado" | "cancelado" | "en_disputa"

export const MAX_HITOS = 20
export const MIN_HITO_CENTIMOS = 50
export const MAX_COBRO_HITO_CENTIMOS = 99_999_999
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fechaValida = (fecha: string) => /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(Date.parse(`${fecha}T00:00:00Z`)) && new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) === fecha

export function validarHitosSugeridos(valor: unknown): string | null {
  if (!Array.isArray(valor) || valor.length > MAX_HITOS) return `Puedes proponer hasta ${MAX_HITOS} hitos.`
  const ids = new Set<string>()
  for (const h of valor) {
    if (!h || typeof h !== "object" || !uuid.test(h.id) || ids.has(h.id)) return "Cada hito debe tener un identificador único."
    ids.add(h.id)
    if (typeof h.titulo !== "string" || !h.titulo.trim() || h.titulo.length > 160) return "Escribe un título de hasta 160 caracteres para cada hito."
    if (typeof h.criterio_aceptacion !== "string" || h.criterio_aceptacion.length > 2000 || (h.descripcion != null && (typeof h.descripcion !== "string" || h.descripcion.length > 4000))) return "Revisa la descripción y el criterio de aceptación de cada hito."
    if (!Number.isSafeInteger(h.importe_centimos) || h.importe_centimos < 0 || h.importe_centimos > 999999999) return "Los importes deben ser positivos y tener como máximo dos decimales."
    if (typeof h.fecha_limite !== "string" || (h.fecha_limite !== "" && !fechaValida(h.fecha_limite))) return "Indica una fecha válida para cada hito."
  }
  return null
}

export function validarPlanHitos(valor: unknown, totalCentimos: number): string | null {
  const error = validarHitosSugeridos(valor)
  if (error) return error
  const hitos = valor as HitoBorrador[]
  if (hitos.length < 2) return "Añade al menos dos hitos o elige pago único."
  if (!Number.isSafeInteger(totalCentimos) || totalCentimos <= 0 || totalCentimos > 999999999) return "El total del presupuesto no es válido."
  for (const h of hitos) {
    if (h.importe_centimos < MIN_HITO_CENTIMOS) return "Cada hito debe tener un importe mínimo de 0,50 €."
    if (!h.criterio_aceptacion.trim()) return "Indica qué debe entregarse para aprobar cada hito."
    if (!fechaValida(h.fecha_limite)) return "Indica la fecha prevista de cada hito."
  }
  if (hitos.reduce((sum, h) => sum + h.importe_centimos, 0) !== totalCentimos) return "La suma de los hitos debe coincidir con el precio acordado."
  // Same current client tariff snapshotted by iniciar_contrato_hitos in SQL.
  // The database also checks the actual remaining fee allocation on amendments.
  const comisionCliente = Math.max(Math.round(totalCentimos / 10), 200)
  if (repartirComisionesHitos(hitos, comisionCliente, 0).some(h => h.importe_centimos + h.comision_cliente_centimos > MAX_COBRO_HITO_CENTIMOS)) {
    return "El cobro de un hito, incluidos los gastos de servicio del cliente, no puede superar 999.999,99 €. Divide ese importe en más hitos."
  }
  return null
}

/** Allocate the contract fee once; put the cent remainder on its last stage. */
export function repartirComisionesHitos(hitos: HitoBorrador[], comisionClienteCentimos: number, comisionProveedorCentimos: number) {
  const total = hitos.reduce((sum, h) => sum + h.importe_centimos, 0)
  const error = validarHitosSugeridos(hitos)
  if (error) throw new Error(error)
  if (!hitos.length || total <= 0 || hitos.some(h => h.importe_centimos <= 0)) throw new Error("Los importes deben ser positivos.")
  if (![comisionClienteCentimos, comisionProveedorCentimos].every(n => Number.isSafeInteger(n) && n >= 0) || comisionProveedorCentimos > total) throw new Error("Las comisiones del contrato no son válidas.")
  let clienteAsignado = 0
  let proveedorAsignado = 0
  let acumulado = 0
  return hitos.map((h, i) => {
    acumulado += h.importe_centimos
    const ultimo = i === hitos.length - 1
    const cliente = (ultimo ? comisionClienteCentimos : Number(BigInt(comisionClienteCentimos) * BigInt(acumulado) / BigInt(total))) - clienteAsignado
    const proveedor = (ultimo ? comisionProveedorCentimos : Number(BigInt(comisionProveedorCentimos) * BigInt(acumulado) / BigInt(total))) - proveedorAsignado
    clienteAsignado += cliente
    proveedorAsignado += proveedor
    return { ...h, comision_cliente_centimos: cliente, comision_proveedor_centimos: proveedor }
  })
}
