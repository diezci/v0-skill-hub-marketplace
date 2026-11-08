// Shared display metadata only. Privileged queries stay in lib/operaciones.ts.
export const GRUPOS_OPERATIVOS = [
  { id: "pagos", titulo: "Pagos y devoluciones" },
  { id: "servicios", titulo: "Solicitudes y trabajos" },
  { id: "atencion", titulo: "Atención y verificaciones" },
  { id: "avisos", titulo: "Avisos técnicos" },
] as const

export const CONTROLES_OPERATIVOS = {
  eventos: { grupo: "avisos", titulo: "Fallos registrados por revisar", criterio: "Avisos de email, notificaciones y otros errores pendientes de revisión. No equivalen a fallos que sigan ocurriendo." },
  webhooksError: { grupo: "pagos", titulo: "Confirmaciones de pago con error", criterio: "Stripe comunicó un evento que la app no pudo procesar." },
  webhooksAtascados: { grupo: "pagos", titulo: "Confirmaciones demoradas", criterio: "Eventos de Stripe procesándose durante más de 15 minutos." },
  liquidacionesError: { grupo: "pagos", titulo: "Liquidaciones con error", criterio: "Transferencias o devoluciones cuya liquidación necesita revisión." },
  liquidacionesAtascadas: { grupo: "pagos", titulo: "Liquidaciones demoradas", criterio: "Movimientos de fondos procesándose durante más de 15 minutos." },
  reembolsosPendientes: { grupo: "pagos", titulo: "Reembolsos pendientes", criterio: "Devoluciones registradas como pendientes o que requieren una acción en Stripe." },
  contracargosPorResponder: { grupo: "pagos", titulo: "Contracargos con plazo cercano", criterio: "Respuesta bancaria pendiente con un plazo registrado vencido o dentro de las próximas 48 horas." },
  solicitudesSinOferta: { grupo: "servicios", titulo: "Demandas sin ofertas tras 24 h", criterio: "Demandas abiertas desde hace al menos 24 horas sin ofertas registradas, en cualquier ubicación." },
  pagosSinCompletar: { grupo: "servicios", titulo: "Contratos con pago por revisar", criterio: "Contratos aún pendientes de pago después de 15 días. Requieren comprobar el cobro antes de cerrarlos." },
  entregasSinRevisar: { grupo: "servicios", titulo: "Entregas sin revisar", criterio: "Trabajos entregados hace 7 días o más que siguen esperando revisión del cliente." },
  cancelacionesPendientes: { grupo: "servicios", titulo: "Cancelaciones por responder", criterio: "Solicitudes de cancelación pendientes de respuesta. No se cancelan automáticamente." },
  disputasVencidas: { grupo: "atencion", titulo: "Disputas sin resolver tras 24 h", criterio: "Disputas abiertas o en revisión desde hace más de 24 horas." },
  incidenciasCriticas: { grupo: "atencion", titulo: "Incidencias críticas", criterio: "Problemas de prioridad crítica que siguen abiertos o en revisión." },
  incidenciasPendientes: { grupo: "atencion", titulo: "Incidencias sin resolver tras 24 h", criterio: "Incidencias abiertas o en revisión desde hace al menos 24 horas, con cualquier prioridad." },
  verificacionesPendientes: { grupo: "atencion", titulo: "Verificaciones demoradas", criterio: "Solicitudes de verificación profesional pendientes o en revisión desde hace al menos 48 horas." },
} as const

export type ControlOperativo = keyof typeof CONTROLES_OPERATIVOS
export type IndicadoresOperativos = {
  generadoAt: string
  controles: Record<ControlOperativo, { total: number | null; error: string | null }>
}

export function anclaControl(categoria: ControlOperativo) {
  return categoria === "solicitudesSinOferta" ? "demandas-sin-oferta" : `control-${categoria}`
}
