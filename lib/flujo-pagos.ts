import "server-only"

import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { crearTransferGroup, ejecutarLiquidacionStripe } from "@/lib/stripe-liquidacion"
import { rechazarYNotificarOfertasPerdedoras } from "@/lib/ofertas-perdedoras"
import { validarCuentaCobroContrato } from "@/lib/empresas/cobros"
import { destinatariosOperacionEmpresa } from "@/lib/empresas/notificaciones"

/** The in-app notices already committed with the money; delivery cannot undo it. */
export async function enviarAvisosExternos(avisos?: any[], admin?: any) {
  if (!avisos?.length) return
  const [{ enviarAvisoPorEmail }, { enviarPushAUsuario }] = await Promise.all([
    import("@/lib/emails/enviar"), import("@/lib/push/enviar"),
  ])
  // INSERT guards the persisted notice. Recheck before external delivery too,
  // because access may have been revoked after the financial transaction.
  await Promise.allSettled(avisos.filter(Boolean).map(async (aviso) => {
    let destinatarios = [aviso.usuario_id]
    let link = aviso.link
    const trabajoId = aviso.metadata?.trabajo_id
    if (trabajoId) {
      if (!admin) return
      const { data: t, error } = await admin.from("trabajos")
        .select("cliente_id,profesional_id,operador_cliente_id,operador_proveedor_id,empresa_cliente_id,empresa_proveedora_id")
        .eq("id", trabajoId).maybeSingle()
      if (error || !t) return
      if (t.empresa_cliente_id || t.empresa_proveedora_id) {
        const parte = aviso.metadata?.parte_destinataria
          || ([t.cliente_id,t.operador_cliente_id].includes(aviso.usuario_id) ? "cliente"
            : [t.profesional_id,t.operador_proveedor_id].includes(aviso.usuario_id) ? "proveedor" : null)
        if (!parte || !["cliente","proveedor"].includes(parte)) return
        const empresaId = parte === "cliente" ? t.empresa_cliente_id : t.empresa_proveedora_id
        if (empresaId) {
          const financiera = ["pago_liberado","reembolso_emitido","disputa_ganada","disputa_perdida","disputa_resuelta"].includes(aviso.tipo)
          const operador = parte === "cliente" ? t.operador_cliente_id || t.cliente_id : t.operador_proveedor_id || t.profesional_id
          destinatarios = await destinatariosOperacionEmpresa(admin, empresaId, operador, financiera ? "ver_cobros" : "encargos")
          link = "/perfil-empresa"
        }
      }
    }
    await Promise.allSettled(destinatarios.flatMap((usuarioId) => [
      enviarAvisoPorEmail({ usuarioId, tipo: aviso.tipo, titulo: aviso.titulo, mensaje: aviso.mensaje, link }),
      enviarPushAUsuario(usuarioId, { tipo: aviso.tipo, titulo: aviso.titulo, cuerpo: aviso.mensaje, link }),
    ]))
  }))
}

/** Resume the durable operation using only its frozen amounts and destination. */
export async function liquidarPagoReclamado(admin: any, escrow: any) {
  const contexto = escrow.liquidacion_contexto
  if (!contexto || !escrow.liquidacion_operacion_id) {
    throw new Error("La liquidación anterior requiere conciliar su decisión antes de continuar.")
  }
  try {
    if (contexto.empresa_proveedora_id && Number(escrow.pago_neto_proveedor) > 0 &&
      escrow.liquidacion_estado !== "completada" && !escrow.stripe_transfer_id) {
      if (!contexto.destino) {
        throw new Error("La liquidación no tiene el destinatario de empresa fijado.")
      }
      const cuenta = await stripe.accounts.retrieve(contexto.destino)
      validarCuentaCobroContrato(cuenta, contexto.proveedor_cobros_usuario_id || null, contexto.empresa_proveedora_id)
    }
    const movimientos = escrow.liquidacion_estado === "completada"
      ? {
          chargeId: escrow.stripe_charge_id,
          refundId: escrow.stripe_refund_id,
          refundStatus: escrow.stripe_refund_status,
          transferId: escrow.stripe_transfer_id,
        }
      : await ejecutarLiquidacionStripe({
          paymentIntentId: escrow.stripe_payment_intent_id,
          chargeId: escrow.stripe_charge_id,
          connectedAccountId: contexto.destino,
          transferGroup: escrow.stripe_transfer_group || crearTransferGroup(escrow.trabajo_id),
          montoTotal: Number(escrow.monto),
          refundId: escrow.stripe_refund_id,
          transferId: escrow.stripe_transfer_id,
          reembolsoCliente: Number(escrow.monto_reembolsado),
          netoProveedor: Number(escrow.pago_neto_proveedor),
          operacionId: escrow.liquidacion_operacion_id,
          metadata: {
            trabajo_id: escrow.trabajo_id,
            escrow_id: escrow.id,
            ...(contexto.empresa_proveedora_id ? {
              empresa_proveedora_id: contexto.empresa_proveedora_id,
              diime_proveedor_tipo: "empresa",
              ...(contexto.proveedor_cobros_usuario_id ? { proveedor_cobros_usuario_id: contexto.proveedor_cobros_usuario_id } : {}),
            } : {}),
            ...(contexto.disputa_id ? { disputa_id: contexto.disputa_id } : {}),
          },
        })
    const { data, error } = await admin.rpc("diime_finalizar_liquidacion", {
      p_escrow: escrow.id,
      p_operacion: escrow.liquidacion_operacion_id,
      p_charge: movimientos.chargeId,
      p_refund: movimientos.refundId,
      p_refund_status: movimientos.refundStatus,
      p_transfer: movimientos.transferId,
    })
    if (error) throw error
    await enviarAvisosExternos(data.avisos, admin)
    return data
  } catch (error: any) {
    // Never restore the economic state after a partial Stripe operation. The
    // same claim must resume; a dispute/withdrawal cannot steal this payment.
    await admin.from("transacciones_escrow")
      .update({ liquidacion_estado: "error", liquidacion_error: error.message || "Error de conciliación" })
      .eq("id", escrow.id).eq("liquidacion_operacion_id", escrow.liquidacion_operacion_id)
      .neq("liquidacion_estado", "completada")
    throw error
  }
}

/** Both browser confirmation and webhook use this exact validation and commit. */
export async function conciliarSesionPagada(admin: any, session: Stripe.Checkout.Session, clienteId?: string) {
  if (session.payment_status !== "paid") throw new Error("El pago aún no se ha completado.")
  let query = admin.from("transacciones_escrow").select("*")
  query = session.metadata?.escrow_id
    ? query.eq("id", session.metadata.escrow_id)
    : query.eq("stripe_session_id", session.id)
  const { data: escrow, error } = await query.maybeSingle()
  if (error || !escrow) throw new Error("No se encontró el pago preparado.")
  if (clienteId && escrow.cliente_id !== clienteId) throw new Error("No tienes permiso para confirmar este pago.")
  if (
    (escrow.stripe_session_id && escrow.stripe_session_id !== session.id) ||
    (session.metadata?.trabajo_id && session.metadata.trabajo_id !== escrow.trabajo_id) ||
    (session.metadata?.cliente_id && session.metadata.cliente_id !== escrow.cliente_id) ||
    (session.metadata?.profesional_id && session.metadata.profesional_id !== escrow.profesional_id) ||
    session.currency !== "eur" || session.amount_total !== Math.round(Number(escrow.monto) * 100)
  ) throw new Error("La sesión de Stripe no coincide con el contrato.")
  if (session.metadata?.proveedor_cobros_usuario_id || session.metadata?.empresa_proveedora_id) {
    const { data: trabajo, error: trabajoError } = await admin.from("trabajos")
      .select("profesional_id,empresa_cliente_id,empresa_proveedora_id,proveedor_cobros_usuario_id,proveedor_stripe_account_id")
      .eq("id", escrow.trabajo_id).single()
    if (trabajoError || !trabajo ||
      (session.metadata.proveedor_cobros_usuario_id || null) !== (trabajo.empresa_proveedora_id ? trabajo.proveedor_cobros_usuario_id || null : trabajo.proveedor_cobros_usuario_id || trabajo.profesional_id) ||
      session.metadata.proveedor_stripe_account_id !== trabajo.proveedor_stripe_account_id ||
      (session.metadata.empresa_proveedora_id || null) !== (trabajo.empresa_proveedora_id || null) ||
      (session.metadata.empresa_cliente_id || null) !== (trabajo.empresa_cliente_id || null)) {
      throw new Error("El titular de cobros de la sesión no coincide con el contrato.")
    }
  }
  const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id
  if (!intentId) throw new Error("Stripe no ha devuelto el identificador del pago.")
  const intent = await stripe.paymentIntents.retrieve(intentId)
  const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id
  if (intent.status !== "succeeded" || intent.currency !== "eur" || intent.amount_received !== session.amount_total || !chargeId) {
    throw new Error("El cargo no está capturado y conciliado con Stripe.")
  }
  const { data: resultado, error: confirmarError } = await admin.rpc("diime_confirmar_pago", {
    p_escrow: escrow.id, p_session: session.id, p_payment_intent: intentId,
    p_charge: chargeId, p_total: session.amount_total, p_moneda: session.currency,
  })
  if (confirmarError) throw confirmarError
  await enviarAvisosExternos(resultado.avisos, admin)
  if (resultado.tardio) {
    const { data: reclamada, error: claimError } = await admin.rpc("diime_reclamar_liquidacion", {
      p_escrow: escrow.id, p_actor: null, p_tipo: "pago_tardio",
    })
    if (claimError) throw claimError
    await liquidarPagoReclamado(admin, reclamada)
  }
  // This routine also runs on retries, so failure after the atomic financial
  // commit still has a recovery path for the losing-offer notifications.
  if (resultado.activado || resultado.escrow.estado === "fondos_retenidos") {
    const { data: trabajo, error: trabajoError } = await admin.from("trabajos")
      .select("solicitud_id,titulo,estado").eq("id", escrow.trabajo_id).single()
    if (trabajoError) throw trabajoError
    if (trabajo.estado === "en_progreso" && trabajo.solicitud_id) {
      await rechazarYNotificarOfertasPerdedoras(admin, { solicitudId: trabajo.solicitud_id, tituloSolicitud: trabajo.titulo })
    }
  }
  return resultado
}

/** Close all payable links while the durable job gate prevents new attempts. */
export async function cerrarCheckoutsPendientes(admin: any, trabajoId: string) {
  const { data: intentos, error } = await admin.from("transacciones_escrow")
    .select("id,stripe_session_id").eq("trabajo_id", trabajoId).eq("estado", "pendiente")
  if (error) throw error
  for (const intento of intentos || []) {
    if (!intento.stripe_session_id) {
      // A creator in flight may still receive its Stripe session. Its guarded
      // save will fail and expire it; it cannot return a client secret.
      const { error: cerrarError } = await admin.rpc("diime_cerrar_intento", { p_escrow: intento.id })
      if (cerrarError) throw cerrarError
      continue
    }
    let session = await stripe.checkout.sessions.retrieve(intento.stripe_session_id)
    if (session.status === "open") {
      try { session = await stripe.checkout.sessions.expire(session.id) }
      catch {
        // The customer may have paid while expire was in flight. Re-read the
        // authoritative status, instead of assuming the expiration succeeded.
        session = await stripe.checkout.sessions.retrieve(session.id)
      }
    }
    if (session.payment_status === "paid") {
      await conciliarSesionPagada(admin, session)
      continue
    }
    if (session.status !== "expired") {
      throw new Error("Stripe aún está procesando este pago. La operación queda bloqueada para conciliarlo; vuelve a intentarlo cuando termine.")
    }
    const { error: cerrarError } = await admin.rpc("diime_cerrar_intento", { p_escrow: intento.id, p_session: session.id })
    if (cerrarError) throw cerrarError
  }
}
