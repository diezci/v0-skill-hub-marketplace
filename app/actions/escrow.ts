"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import type Stripe from "stripe"
import { revalidatePath } from "next/cache"
import { calcularTotalCliente, calcularPagoProveedor, PLATFORM_CONFIG } from "@/lib/comisiones"
import { rechazarYNotificarOfertasPerdedoras } from "@/lib/ofertas-perdedoras"
import { createAdminClient } from "@/lib/supabase/admin"
import { calcularLiquidacion } from "@/lib/liquidacion"
import { crearTransferGroup, ejecutarLiquidacionStripe, obtenerCargoDePaymentIntent } from "@/lib/stripe-liquidacion"

/**
 * Create Stripe Checkout Session for escrow payment.
 * The client pays: agreed price + platform commission.
 */
export async function crearPagoEscrow(data: {
  trabajo_id: string
}) {
  const supabase = await createClient()
  if (!supabase) return { error: "Conexión con la base de datos no disponible." }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const admin = createAdminClient()
  if (!admin) return { error: "La configuración segura del servidor no está disponible." }

  // El identificador recibido del navegador solo sirve para localizar el
  // trabajo. Precio, cliente y profesional se vuelven a derivar en el servidor
  // desde la oferta aceptada y la solicitud que la originó.
  const { data: trabajo, error: trabajoError } = await admin
    .from("trabajos")
    .select("id, titulo, precio_acordado, profesional_id, cliente_id, estado, oferta_id, solicitud_id")
    .eq("id", data.trabajo_id)
    .single()

  if (trabajoError || !trabajo) {
    return { error: "Trabajo no encontrado" }
  }

  if (trabajo.cliente_id !== user.id) {
    return { error: "Solo el cliente puede realizar el pago" }
  }

  if (trabajo.estado !== "pendiente_pago") {
    return { error: "Este trabajo ya ha sido pagado" }
  }

  if (!trabajo.oferta_id || !trabajo.solicitud_id) {
    return { error: "El trabajo no está vinculado a una oferta y una solicitud válidas." }
  }

  const [{ data: oferta, error: ofertaError }, { data: solicitud, error: solicitudError }] = await Promise.all([
    admin
      .from("ofertas")
      .select("id, solicitud_id, profesional_id, precio, estado")
      .eq("id", trabajo.oferta_id)
      .maybeSingle(),
    admin
      .from("solicitudes")
      .select("id, cliente_id, titulo, estado")
      .eq("id", trabajo.solicitud_id)
      .maybeSingle(),
  ])

  if (ofertaError || solicitudError || !oferta || !solicitud) {
    return { error: "No se pudieron verificar los términos originales de la contratación." }
  }

  const relacionesValidas =
    oferta.solicitud_id === solicitud.id &&
    oferta.profesional_id === trabajo.profesional_id &&
    solicitud.cliente_id === trabajo.cliente_id &&
    solicitud.cliente_id === user.id
  if (!relacionesValidas) {
    return { error: "Los participantes o documentos de la contratación no coinciden. No se realizará ningún cargo." }
  }
  if (oferta.estado !== "aceptada" || solicitud.estado !== "abierta") {
    return { error: "La oferta o la solicitud ya no están disponibles para completar este pago." }
  }

  const precioAcordado = Number(oferta.precio)
  const precioGuardado = Number(trabajo.precio_acordado)
  if (!Number.isFinite(precioAcordado) || precioAcordado <= 0) {
    return { error: "El precio de la oferta no es válido." }
  }
  if (!Number.isFinite(precioGuardado) || Math.round(precioGuardado * 100) !== Math.round(precioAcordado * 100)) {
    return { error: "El precio del trabajo no coincide con la oferta aceptada. No se realizará ningún cargo." }
  }

  const clienteId = solicitud.cliente_id
  const profesionalId = oferta.profesional_id
  const tituloServicio = solicitud.titulo || trabajo.titulo || "Servicio profesional"

  // No se cobra al cliente hasta saber que el profesional está verificado y
  // que Stripe permite transferirle el dinero.
  const { data: cuentaProfesional } = await admin
    .from("profesionales")
    .select("stripe_account_id, stripe_onboarding_completado, stripe_transferencias_habilitadas, stripe_payouts_habilitados")
    .eq("id", profesionalId)
    .maybeSingle()
  if (
    !cuentaProfesional?.stripe_account_id ||
    !cuentaProfesional.stripe_onboarding_completado ||
    !cuentaProfesional.stripe_transferencias_habilitadas ||
    !cuentaProfesional.stripe_payouts_habilitados
  ) {
    return { error: "Este profesional aún no ha terminado de configurar su cuenta de cobros. No se realizará ningún cargo." }
  }

  // Calculate amounts with commissions
  const { precioBase, comisionCliente, totalCliente } = calcularTotalCliente(precioAcordado)
  const { comisionProveedor, pagoNeto } = calcularPagoProveedor(precioAcordado)

  try {
    // Al no fijar `payment_method_types`, Checkout usa los métodos dinámicos
    // activados en Stripe. Esto permite mostrar tarjeta, Apple Pay, Google Pay,
    // Link y cualquier otro método compatible sin desplegar código de nuevo.
    // Apple Pay y Google Pay viajan como pagos de tarjeta y Stripe decide si
    // mostrarlos según el dominio, navegador, dispositivo y wallet del cliente.
    const paymentMethodConfiguration = process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID?.trim()
    const transferGroup = crearTransferGroup(trabajo.id)

    // Una sesión abierta se reutiliza. Así, recargar la página no crea varios
    // enlaces que podrían cobrarse después por separado.
    const { data: escrowAbierto, error: escrowAbiertoError } = await admin
      .from("transacciones_escrow")
      .select("*")
      .eq("trabajo_id", trabajo.id)
      .eq("estado", "pendiente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (escrowAbiertoError) {
      return { error: "No se pudo comprobar si ya había un pago preparado." }
    }

    let escrowPreparado = escrowAbierto

    if (escrowAbierto?.stripe_session_id) {
      const anterior = await stripe.checkout.sessions.retrieve(escrowAbierto.stripe_session_id)
      if (anterior.payment_status === "paid") {
        return { error: "Este trabajo ya tiene un pago completado. Estamos conciliándolo con Stripe." }
      }
      if (anterior.status === "complete") {
        return { error: "Este pago está siendo procesado por Stripe. Espera a que termine la conciliación antes de intentarlo de nuevo." }
      }
      if (anterior.status === "open") {
        const sesionCoincide =
          Boolean(anterior.client_secret) &&
          anterior.payment_status === "unpaid" &&
          anterior.currency === PLATFORM_CONFIG.moneda &&
          anterior.amount_total === Math.round(totalCliente * 100) &&
          anterior.metadata?.trabajo_id === trabajo.id &&
          anterior.metadata?.escrow_id === escrowAbierto.id &&
          anterior.metadata?.cliente_id === clienteId &&
          anterior.metadata?.profesional_id === profesionalId &&
          Math.round(Number(anterior.metadata?.precio_acordado) * 100) === Math.round(precioAcordado * 100)

        if (sesionCoincide && anterior.client_secret) {
          return {
            clientSecret: anterior.client_secret,
            escrow: escrowAbierto,
            desglose: { precioBase, comisionCliente, totalCliente, comisionProveedor, pagoNeto },
          }
        }

        // Nunca dejamos viva una sesión cuyo importe o participantes ya no
        // coinciden con los documentos contractuales verificados.
        await stripe.checkout.sessions.expire(anterior.id)
      }
      const { error: cancelarEscrowError } = await admin
        .from("transacciones_escrow")
        .update({ estado: "cancelado" })
        .eq("id", escrowAbierto.id)
      if (cancelarEscrowError) {
        return { error: "No se pudo cerrar de forma segura el intento de pago anterior." }
      }
      escrowPreparado = null
    }

    const camposEscrow = {
      trabajo_id: trabajo.id,
      cliente_id: clienteId,
      profesional_id: profesionalId,
      monto: totalCliente,
      monto_base: precioBase,
      comision_cliente: comisionCliente,
      comision_proveedor: comisionProveedor,
      comision_proveedor_original: comisionProveedor,
      pago_neto_proveedor: pagoNeto,
      monto_bruto_proveedor: precioBase,
      estado: "pendiente",
      stripe_transfer_group: transferGroup,
      liquidacion_estado: "pendiente",
    }
    // Si Stripe creó la sesión pero el guardado de su id falló, esta fila queda
    // pendiente y sin `stripe_session_id`. La reutilizamos: la clave idempotente
    // basada en su id recuperará exactamente la misma sesión en el reintento.
    const prepararEscrow = escrowPreparado
      ? admin
          .from("transacciones_escrow")
          .update(camposEscrow)
          .eq("id", escrowPreparado.id)
          .eq("estado", "pendiente")
          .is("stripe_session_id", null)
      : admin.from("transacciones_escrow").insert(camposEscrow)
    const { data: escrowNuevo, error: crearEscrowError } = await prepararEscrow.select().single()
    if (crearEscrowError || !escrowNuevo) {
      return { error: crearEscrowError?.message || "No se pudo preparar el pago." }
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      ui_mode: "embedded",
      redirect_on_completion: "never",
      customer_email: user.email || undefined,
      line_items: [
        {
          price_data: {
            currency: PLATFORM_CONFIG.moneda,
            product_data: {
              name: tituloServicio,
              description: `Precio del servicio: ${precioBase.toFixed(2)}EUR + Comision plataforma: ${comisionCliente.toFixed(2)}EUR`,
            },
            unit_amount: Math.round(totalCliente * 100), // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      payment_intent_data: {
        transfer_group: transferGroup,
        metadata: {
          trabajo_id: trabajo.id,
          escrow_id: escrowNuevo.id,
          type: "diime_pago_protegido",
        },
      },
      metadata: {
        escrow_id: escrowNuevo.id,
        trabajo_id: trabajo.id,
        cliente_id: clienteId,
        profesional_id: profesionalId,
        precio_acordado: precioAcordado.toString(),
        comision_cliente: comisionCliente.toString(),
        comision_proveedor: comisionProveedor.toString(),
        pago_neto_proveedor: pagoNeto.toString(),
        total_cliente: totalCliente.toString(),
        type: "diime_pago_protegido",
      },
    }

    // Permite mantener una configuración exclusiva para el checkout de Diime.
    // Si no se define, Stripe utiliza la configuración predeterminada.
    if (paymentMethodConfiguration) {
      sessionParams.payment_method_configuration = paymentMethodConfiguration
    }

    const session = await stripe.checkout.sessions.create(
      sessionParams,
      { idempotencyKey: `diime-checkout-${escrowNuevo.id}` },
    )

    const { data: escrow, error: escrowError } = await admin
      .from("transacciones_escrow")
      .update({
        stripe_session_id: session.id,
        stripe_payment_intent_id: (session.payment_intent as string) || null,
      })
      .eq("id", escrowNuevo.id)
      .select()
      .single()

    if (escrowError) {
      return { error: escrowError.message }
    }

    return { 
      clientSecret: session.client_secret,
      escrow,
      desglose: {
        precioBase,
        comisionCliente,
        totalCliente,
        comisionProveedor,
        pagoNeto,
      }
    }
  } catch (error: any) {
    return { error: error.message }
  }
}

/**
 * Called after Stripe checkout completes successfully.
 * Marks escrow as funds_held and trabajo as in_progress.
 */
export async function confirmarPagoEscrow(sessionId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "Conexión con la base de datos no disponible." }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }
  const admin = createAdminClient()
  if (!admin) return { error: "La configuración segura del servidor no está disponible." }

  // Verify payment with Stripe
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge"] })
    
    if (session.payment_status !== "paid") {
      return { error: "El pago no se ha completado" }
    }

    // Update escrow
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id
    if (!paymentIntent) return { error: "Stripe no ha devuelto el identificador del pago." }
    const latestCharge = typeof session.payment_intent === "object" && session.payment_intent
      ? session.payment_intent.latest_charge
      : null
    const chargeId = typeof latestCharge === "string" ? latestCharge : latestCharge?.id || null

    const { data: escrow, error } = await admin
      .from("transacciones_escrow")
      .update({
        estado: "fondos_retenidos",
        fecha_retencion: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntent,
        stripe_charge_id: chargeId,
      })
      .eq("stripe_session_id", sessionId)
      .eq("cliente_id", user.id)
      .eq("estado", "pendiente")
      .select()
      .maybeSingle()

    if (error) {
      return { error: error.message }
    }
    if (!escrow) {
      const { data: yaConfirmado } = await admin
        .from("transacciones_escrow")
        .select("*")
        .eq("stripe_session_id", sessionId)
        .eq("cliente_id", user.id)
        .maybeSingle()
      return yaConfirmado ? { data: yaConfirmado } : { error: "No se encontró el pago preparado." }
    }

    // Update trabajo to en_progreso
    await admin.from("trabajos").update({
      estado: "en_progreso",
      updated_at: new Date().toISOString(),
    }).eq("id", escrow.trabajo_id)

    const { data: trabajoPagado } = await admin
      .from("trabajos")
      .select("titulo, solicitud_id, oferta_id")
      .eq("id", escrow.trabajo_id)
      .maybeSingle()

    // El pago consuma la contratación: hasta aquí la demanda seguía abierta y
    // las demás ofertas pendientes (por si el cliente abandonaba la pasarela).
    if (trabajoPagado?.solicitud_id) {
      const { data: solicitudPagada } = await admin
        .from("solicitudes")
        .update({ estado: "en_progreso" })
        .eq("id", trabajoPagado.solicitud_id)
        .select("titulo")
        .maybeSingle()

      await rechazarYNotificarOfertasPerdedoras(admin, {
        solicitudId: trabajoPagado.solicitud_id,
        tituloSolicitud: solicitudPagada?.titulo ?? trabajoPagado.titulo,
      })
    }
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: escrow.profesional_id,
      tipo: "pago_recibido",
      titulo: "El cliente ha pagado: puedes empezar",
      mensaje: `El pago de "${trabajoPagado?.titulo ?? "un trabajo"}" está confirmado y su transferencia queda aplazada. El trabajo pasa a En Progreso.`,
      link: "/mis-trabajos",
    })

    revalidatePath("/mis-solicitudes")
    revalidatePath("/mis-trabajos")
    return { data: escrow }
  } catch (error: any) {
    return { error: error.message }
  }
}

/**
 * Release funds to the provider after client confirms work completion.
 * Provider receives: agreed price - platform commission.
 */
export async function liberarFondosEscrow(trabajoId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "Conexión con la base de datos no disponible." }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }
  const admin = createAdminClient()
  if (!admin) return { error: "La configuración segura del servidor no está disponible." }

  const { data: trabajoActual } = await admin
    .from("trabajos")
    .select("id, cliente_id, profesional_id, estado, titulo, solicitud_id, cancelacion_estado")
    .eq("id", trabajoId)
    .maybeSingle()
  if (!trabajoActual || trabajoActual.cliente_id !== user.id) {
    return { error: "No tienes permiso para confirmar este trabajo." }
  }

  // Antes de buscar trabajo pendiente, comprobamos cualquier liquidación ya
  // finalizada. Esto evita que una fila antigua/duplicada más reciente pueda
  // ocultarla y provocar un segundo intento de transferencia.
  const { data: liquidacionCompletada, error: liquidacionCompletadaError } = await admin
    .from("transacciones_escrow")
    .select("id")
    .eq("trabajo_id", trabajoId)
    .eq("cliente_id", user.id)
    .eq("liquidacion_estado", "completada")
    .in("estado", ["completado", "liberado"])
    .limit(1)
    .maybeSingle()
  if (liquidacionCompletadaError) {
    return { error: "No se pudo comprobar el estado de la liquidación." }
  }
  if (liquidacionCompletada) {
    return { success: true }
  }

  // Get escrow transaction
  const { data: escrow, error: escrowError } = await admin
    .from("transacciones_escrow")
    .select("*")
    .eq("trabajo_id", trabajoId)
    .eq("cliente_id", user.id)
    .in("estado", ["fondos_retenidos", "liquidando"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (escrowError) {
    return { error: "No se encontró un pago retenido que pueda liquidarse." }
  }
  if (!escrow) {
    // Puede haber finalizado entre las dos lecturas anteriores por otro clic o
    // proceso. Una última comprobación convierte esa carrera en éxito idempotente.
    const { data: completadaDuranteLectura } = await admin
      .from("transacciones_escrow")
      .select("id")
      .eq("trabajo_id", trabajoId)
      .eq("cliente_id", user.id)
      .eq("liquidacion_estado", "completada")
      .in("estado", ["completado", "liberado"])
      .limit(1)
      .maybeSingle()
    return completadaDuranteLectura
      ? { success: true }
      : { error: "No se encontró un pago retenido que pueda liquidarse." }
  }

  if (trabajoActual.estado !== "entregado") {
    return { error: "El profesional debe marcar el trabajo como entregado antes de liberar el pago." }
  }
  if (trabajoActual.cancelacion_estado === "pendiente") {
    return { error: "Hay una cancelación pendiente. Debe resolverse antes de liberar el pago." }
  }

  const operacionId = `confirmacion-${escrow.id}`
  if (escrow.liquidacion_operacion_id && escrow.liquidacion_operacion_id !== operacionId) {
    return { error: "Este pago ya tiene otra liquidación en curso. Revísalo desde administración." }
  }

  const liquidacion = calcularLiquidacion(
    Number(escrow.monto_base || 0),
    0,
    Number(escrow.comision_proveedor_original ?? escrow.comision_proveedor ?? 0),
  )
  const { data: profesional } = await admin
    .from("profesionales")
    .select("stripe_account_id, stripe_transferencias_habilitadas, stripe_payouts_habilitados")
    .eq("id", escrow.profesional_id)
    .maybeSingle()
  if (
    !profesional?.stripe_account_id ||
    !profesional.stripe_transferencias_habilitadas ||
    !profesional.stripe_payouts_habilitados
  ) {
    return { error: "La cuenta de cobros del profesional no está habilitada. El dinero sigue sin moverse." }
  }
  if (!escrow.stripe_payment_intent_id) {
    return { error: "El pago no tiene un PaymentIntent conciliado con Stripe." }
  }

  try {
    // Reclamar la liquidación antes de hablar con Stripe. Reintentar la misma
    // operación es seguro; cambiar la decisión una vez reclamada no lo es.
    const { data: reclamada, error: claimError } = await admin
      .from("transacciones_escrow")
      .update({
        estado: "liquidando",
        liquidacion_estado: "procesando",
        liquidacion_operacion_id: operacionId,
        liquidacion_error: null,
        monto_reembolsado: 0,
        monto_bruto_proveedor: liquidacion.brutoProveedor,
        comision_proveedor: liquidacion.comisionProveedor,
        pago_neto_proveedor: liquidacion.netoProveedor,
      })
      .eq("id", escrow.id)
      .or(`liquidacion_operacion_id.is.null,liquidacion_operacion_id.eq.${operacionId}`)
      .select("id")
      .maybeSingle()

    if (claimError || !reclamada) {
      return { error: claimError?.message || "Otro proceso está liquidando este pago." }
    }

    const movimientos = await ejecutarLiquidacionStripe({
      paymentIntentId: escrow.stripe_payment_intent_id,
      chargeId: escrow.stripe_charge_id,
      connectedAccountId: profesional.stripe_account_id,
      transferGroup: escrow.stripe_transfer_group || crearTransferGroup(trabajoId),
      reembolsoCliente: 0,
      netoProveedor: liquidacion.netoProveedor,
      operacionId,
      metadata: { trabajo_id: trabajoId, escrow_id: escrow.id, motivo: "confirmacion_cliente" },
    })

    const ahora = new Date().toISOString()
    const { data: finalizada, error: updateError } = await admin
      .from("transacciones_escrow")
      .update({
        estado: "completado",
        liquidacion_estado: "completada",
        liquidacion_error: null,
        stripe_charge_id: movimientos.chargeId,
        stripe_transfer_id: movimientos.transferId,
        monto_bruto_proveedor: liquidacion.brutoProveedor,
        comision_proveedor: liquidacion.comisionProveedor,
        pago_neto_proveedor: liquidacion.netoProveedor,
        comision_cliente_retenida: Number(escrow.comision_cliente || 0),
        retencion_plataforma: Number(escrow.comision_cliente || 0) + liquidacion.comisionProveedor,
        fecha_liberacion: ahora,
      })
      .eq("id", escrow.id)
      .neq("liquidacion_estado", "completada")
      .select("id")
      .maybeSingle()

    if (updateError) return { error: updateError.message }
    // Otro reintento idéntico ya pudo finalizar y notificar.
    if (!finalizada) return { success: true }

    // Update trabajo to completado
    await admin
      .from("trabajos")
      .update({
        estado: "completado",
        fecha_fin: ahora,
        updated_at: ahora,
      })
      .eq("id", trabajoId)

    // Update solicitud
    if (trabajoActual.solicitud_id) {
      await admin.from("solicitudes").update({ estado: "completada" }).eq("id", trabajoActual.solicitud_id)
    }

    // Create update record
    await admin.from("actualizaciones_trabajo").insert({
      trabajo_id: trabajoId,
      usuario_id: user.id,
      tipo: "pago_liberado",
      mensaje: `Pago liberado. El proveedor recibe ${liquidacion.netoProveedor.toFixed(2)} EUR netos.`,
      progreso: 100,
    })

    // Avisar al proveedor de que su pago ha sido liberado.
    {
      const { crearNotificacion } = await import("./notificaciones")
      await crearNotificacion({
        usuarioId: escrow.profesional_id,
        tipo: "pago_liberado",
        titulo: "Pago liberado",
        mensaje: `El cliente ha confirmado "${trabajoActual.titulo ?? "el trabajo"}". Se te ha transferido un pago de ${liquidacion.netoProveedor.toFixed(2)}€ netos.`,
        link: "/mis-trabajos",
      })
    }

    revalidatePath("/mis-solicitudes")
    revalidatePath("/mis-trabajos")
    return { success: true }
  } catch (error: any) {
    await admin
      .from("transacciones_escrow")
      .update({ estado: "fondos_retenidos", liquidacion_estado: "error", liquidacion_error: error.message || "Error de Stripe" })
      .eq("id", escrow.id)
      .eq("liquidacion_operacion_id", operacionId)
    return { error: error.message }
  }
}

/**
 * Reembolso íntegro al cliente cuando un trabajo pagado se cancela de mutuo
 * acuerdo: al haber acuerdo entre las partes se devuelve todo lo pagado
 * (incluida la comisión), a diferencia del rechazo de una entrega.
 * Devuelve el importe reembolsado, o 0 si no había fondos retenidos.
 */
export async function reembolsarPorCancelacion(trabajoId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "Conexión con la base de datos no disponible." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }
  const admin = createAdminClient()
  if (!admin) return { error: "La configuración segura del servidor no está disponible." }

  const { data: trabajo } = await admin
    .from("trabajos")
    .select("cliente_id, profesional_id, estado, cancelacion_estado, cancelacion_solicitada_por")
    .eq("id", trabajoId)
    .maybeSingle()
  if (!trabajo || (trabajo.cliente_id !== user.id && trabajo.profesional_id !== user.id)) {
    return { error: "No tienes permiso sobre este trabajo." }
  }
  if (trabajo.cancelacion_estado !== "pendiente" || trabajo.cancelacion_solicitada_por === user.id) {
    return { error: "El reembolso íntegro exige una cancelación pendiente aceptada por la otra parte." }
  }

  const { data: escrow, error: escrowError } = await admin
    .from("transacciones_escrow")
    .select("*")
    .eq("trabajo_id", trabajoId)
    .in("estado", ["fondos_retenidos", "liquidando"])
    .maybeSingle()

  if (escrowError) return { error: "No se pudo comprobar de forma segura el pago retenido." }
  if (!escrow) {
    return trabajo.estado === "pendiente_pago"
      ? { reembolso: 0 }
      : { error: "No se encontró un pago retenido que pueda reembolsarse." }
  }

  try {
    const operacionId = `cancelacion-mutua-${escrow.id}`
    if (escrow.liquidacion_operacion_id && escrow.liquidacion_operacion_id !== operacionId) {
      return { error: "Este pago ya tiene otra liquidación en curso. Revísalo desde administración." }
    }
    if (!escrow.stripe_payment_intent_id) {
      return { error: "El pago no tiene un PaymentIntent conciliado con Stripe." }
    }

    const montoTotal = Number(escrow.monto || 0)
    const { data: reclamada, error: claimError } = await admin
      .from("transacciones_escrow")
      .update({
        estado: "liquidando",
        liquidacion_estado: "procesando",
        liquidacion_operacion_id: operacionId,
        liquidacion_error: null,
        monto_reembolsado: montoTotal,
        retencion_plataforma: 0,
        comision_cliente_retenida: 0,
        monto_bruto_proveedor: 0,
        comision_proveedor: 0,
        pago_neto_proveedor: 0,
      })
      .eq("id", escrow.id)
      .or(`liquidacion_operacion_id.is.null,liquidacion_operacion_id.eq.${operacionId}`)
      .select("id")
      .maybeSingle()
    if (claimError || !reclamada) {
      return { error: claimError?.message || "Otro proceso está liquidando este pago." }
    }

    const movimientos = await ejecutarLiquidacionStripe({
      paymentIntentId: escrow.stripe_payment_intent_id,
      chargeId: escrow.stripe_charge_id,
      connectedAccountId: null,
      transferGroup: escrow.stripe_transfer_group || crearTransferGroup(trabajoId),
      montoTotal,
      refundId: escrow.stripe_refund_id,
      transferId: null,
      reembolsoCliente: montoTotal,
      netoProveedor: 0,
      operacionId,
      metadata: { trabajo_id: trabajoId, escrow_id: escrow.id, motivo: "cancelacion_mutuo_acuerdo" },
    })

    const { data: finalizada, error: updateError } = await admin
      .from("transacciones_escrow")
      .update({
        estado: "reembolsado",
        liquidacion_estado: "completada",
        liquidacion_operacion_id: operacionId,
        monto_reembolsado: montoTotal,
        retencion_plataforma: 0,
        comision_cliente_retenida: 0,
        monto_bruto_proveedor: 0,
        comision_proveedor: 0,
        pago_neto_proveedor: 0,
        stripe_charge_id: movimientos.chargeId,
        stripe_refund_id: movimientos.refundId,
        stripe_refund_status: movimientos.refundStatus,
        fecha_reembolso: new Date().toISOString(),
        notas: "Cancelación de mutuo acuerdo: reembolso íntegro al cliente.",
      })
      .eq("id", escrow.id)
      .eq("liquidacion_operacion_id", operacionId)
      .neq("liquidacion_estado", "completada")
      .select("id")
      .maybeSingle()

    if (updateError) return { error: updateError.message }
    if (!finalizada) return { reembolso: montoTotal }

    return { reembolso: montoTotal }
  } catch (error: any) {
    const operacionId = `cancelacion-mutua-${escrow.id}`
    await admin
      .from("transacciones_escrow")
      .update({ liquidacion_estado: "error", liquidacion_error: error.message || "Error de Stripe" })
      .eq("id", escrow.id)
      .eq("liquidacion_operacion_id", operacionId)
    return { error: error.message }
  }
}
