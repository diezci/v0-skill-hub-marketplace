import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { crearNotificacion } from "@/lib/notificaciones"
import { destinatariosOperacionEmpresa } from "@/lib/empresas/notificaciones"

/** Only called after the authenticated plan RPC has committed its change. */
export async function notificarCambioHitos(accion: string, resultado: any, params: Record<string, unknown>) {
  const admin = createAdminClient()
  const parte = resultado?.rol
  if (!admin || !["cliente", "proveedor"].includes(parte)) return
  const contraparte = parte === "cliente" ? "proveedor" : "cliente"
  let destinatarios: string[] = [], tituloTrabajo = "el trabajo", link = "", metadata: Record<string, unknown> = {}
  if (params.p_oferta) {
    const { data: oferta, error } = await admin.from("ofertas").select("id,profesional_id,empresa_id,solicitud_id,solicitud:solicitudes(titulo,cliente_id,empresa_id)").eq("id", params.p_oferta).single()
    if (error || !oferta) return
    const solicitud = oferta.solicitud as any
    tituloTrabajo = solicitud?.titulo || tituloTrabajo
    const empresaId = contraparte === "cliente" ? solicitud?.empresa_id : oferta.empresa_id
    const actor = contraparte === "cliente" ? solicitud?.cliente_id : oferta.profesional_id
    const permiso = contraparte === "proveedor" ? "presupuestos" : "encargos"
    destinatarios = await destinatariosOperacionEmpresa(admin, empresaId, actor, permiso)
    link = `/ofertas/${oferta.id}/plan`
    metadata = { oferta_id: oferta.id, solicitud_id: oferta.solicitud_id, titulo_trabajo: tituloTrabajo, parte_destinataria: contraparte,
      ...(empresaId ? { empresa_id: empresaId, permiso_destinatario: permiso } : {}) }
  } else if (params.p_trabajo) {
    const { data: trabajo, error } = await admin.from("trabajos").select("id,titulo,cliente_id,profesional_id,operador_cliente_id,operador_proveedor_id,empresa_cliente_id,empresa_proveedora_id").eq("id", params.p_trabajo).single()
    if (error || !trabajo) return
    tituloTrabajo = trabajo.titulo
    destinatarios = await destinatariosOperacionEmpresa(admin,
      contraparte === "cliente" ? trabajo.empresa_cliente_id : trabajo.empresa_proveedora_id,
      contraparte === "cliente" ? trabajo.operador_cliente_id || trabajo.cliente_id : trabajo.operador_proveedor_id || trabajo.profesional_id)
    link = `/trabajos/${trabajo.id}/hitos`
    metadata = { trabajo_id: trabajo.id, hito_id: params.p_hito, titulo_trabajo: tituloTrabajo, parte_destinataria: contraparte }
  }
  const entrega = accion === "entregar_hito"
  const correccion = accion === "rechazar_entrega_hito"
  const respuesta = accion.startsWith("responder_")
  const titulo = entrega ? "Hito entregado: revisa la entrega" : correccion ? "Cambios solicitados en un hito" : respuesta ? "Respuesta al plan de hitos" : "Nueva propuesta de plan de pagos"
  const mensaje = entrega ? `Hay una entrega de "${tituloTrabajo}" pendiente de tu revisión. Comprueba sus criterios y evidencias antes de aprobar el pago.`
    : correccion ? `El cliente ha pedido cambios en una entrega de "${tituloTrabajo}". Consulta sus observaciones.`
    : respuesta ? `La otra parte ha ${params.p_aceptar ? "aceptado" : "rechazado"} el plan propuesto para "${tituloTrabajo}".`
    : `Revisa los cambios del plan de pagos de "${tituloTrabajo}". Solo se aplicarán cuando ambas partes estén conformes.`
  await Promise.allSettled(destinatarios.map(usuarioId => crearNotificacion({ usuarioId, tipo: entrega ? "trabajo_entregado" : "oferta_actualizada", titulo, mensaje, link, metadata })))
}
