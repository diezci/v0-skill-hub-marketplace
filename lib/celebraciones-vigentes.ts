type TrabajoAviso = {
  estado: string
  transacciones_escrow: { estado: string; liquidacion_estado: string | null }[] | null
}

/** A historical notification remains in the bell, but cannot invite an obsolete action. */
export function celebracionVigente(tipo: string, trabajo?: TrabajoAviso | null) {
  if (!trabajo) return false
  const pagos = trabajo.transacciones_escrow || []
  const retenido = pagos.some(p => ["retenido", "fondos_retenidos"].includes(p.estado))
  const cerrado = pagos.some(p => ["completado", "liberado", "reembolsado"].includes(p.estado) && p.liquidacion_estado !== "error")
  if (tipo === "pago_recibido") return trabajo.estado === "en_progreso" && retenido
  if (tipo === "trabajo_entregado") return trabajo.estado === "entregado" && retenido
  if (tipo === "pago_liberado") return trabajo.estado === "completado" && pagos.some(p => ["completado", "liberado"].includes(p.estado) && p.liquidacion_estado !== "error")
  if (["disputa_ganada", "disputa_perdida", "disputa_resuelta"].includes(tipo)) return ["completado", "rechazado"].includes(trabajo.estado) && cerrado
  return false
}
