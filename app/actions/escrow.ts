"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import type Stripe from "stripe"
import { revalidatePath } from "next/cache"
import { calcularTotalCliente, PLATFORM_CONFIG } from "@/lib/comisiones"
import { createAdminClient } from "@/lib/supabase/admin"
import { crearTransferGroup } from "@/lib/stripe-liquidacion"
import { cerrarCheckoutsPendientes, conciliarSesionPagada, liquidarPagoReclamado } from "@/lib/flujo-pagos"

type DesglosePago = {
  precioBase: number
  comisionCliente: number
  totalCliente: number
  comisionProveedor: number
  pagoNeto: number
}

// Reconcilia filas creadas por versiones antiguas que redondeaban dos lados de
// una operación por separado. El total cobrado y la comisión del profesional
// quedan fijos; los importes derivados se ajustan para conservar cada céntimo.
function normalizarDesgloseGuardado(desglose: DesglosePago): DesglosePago {
  const baseCentimos = Math.round(desglose.precioBase * 100)
  const totalCentimos = Math.round(desglose.totalCliente * 100)
  const comisionProveedorCentimos = Math.round(desglose.comisionProveedor * 100)
  return {
    precioBase: baseCentimos / 100,
    comisionCliente: (totalCentimos - baseCentimos) / 100,
    totalCliente: totalCentimos / 100,
    comisionProveedor: comisionProveedorCentimos / 100,
    pagoNeto: (baseCentimos - comisionProveedorCentimos) / 100,
  }
}

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
    .select("id, titulo, precio_acordado, profesional_id, cliente_id, estado, oferta_id, solicitud_id, pago_bloqueado, cancelacion_estado")
    .eq("id", data.trabajo_id)
    .single()

  if (trabajoError || !trabajo) {
    return { error: "Trabajo no encontrado" }
  }

  if (trabajo.cliente_id !== user.id) {
    return { error: "Solo el cliente puede realizar el pago" }
  }

  if (trabajo.estado !== "pendiente_pago" || trabajo.pago_bloqueado || trabajo.cancelacion_estado === "pendiente") {
    return { error: "Este trabajo ya ha sido pagado" }
  }

  if (!trabajo.oferta_id || !trabajo.solicitud_id) {
    return { error: "El trabajo no está vinculado a una oferta y una solicitud válidas." }
  }

  const [{ data: oferta, error: ofertaError }, { data: solicitud, error: solicitudError }] = await Promise.all([
    admin
      .from("ofertas")
      .select("id, solicitud_id, profesional_id, precio, estado, comision_proveedor_prevista, pago_neto_proveedor_previsto")
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
  const desgloseClienteOferta = calcularTotalCliente(precioAcordado)
  const comisionProveedorOferta = Number(oferta.comision_proveedor_prevista)
  const pagoNetoOferta = Number(oferta.pago_neto_proveedor_previsto)
  if (
    oferta.comision_proveedor_prevista == null ||
    oferta.pago_neto_proveedor_previsto == null ||
    !Number.isFinite(comisionProveedorOferta) ||
    comisionProveedorOferta < 0 ||
    !Number.isFinite(pagoNetoOferta) ||
    pagoNetoOferta < 0 ||
    Math.round((comisionProveedorOferta + pagoNetoOferta) * 100) !==
      Math.round(desgloseClienteOferta.precioBase * 100)
  ) {
    return { error: "No se pudieron verificar los gastos de servicio aceptados por el profesional. No se realizará ningún cargo." }
  }
  const desgloseOferta: DesglosePago = {
    ...desgloseClienteOferta,
    comisionProveedor: comisionProveedorOferta,
    pagoNeto: pagoNetoOferta,
  }

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

    let { precioBase, comisionCliente, totalCliente, comisionProveedor, pagoNeto } = desgloseOferta

    if (escrowAbierto?.stripe_session_id) {
      const desgloseAnterior = {
        precioBase: Number(escrowAbierto.monto_base),
        comisionCliente: Number(escrowAbierto.comision_cliente),
        totalCliente: Number(escrowAbierto.monto),
        comisionProveedor: Number(escrowAbierto.comision_proveedor),
        pagoNeto: Number(escrowAbierto.pago_neto_proveedor),
      }
      const importesAnterioresValidos =
        Object.values(desgloseAnterior).every((importe) => Number.isFinite(importe) && importe >= 0) &&
        Math.round(desgloseAnterior.precioBase * 100) === Math.round(precioAcordado * 100) &&
        desgloseAnterior.totalCliente >= desgloseAnterior.precioBase &&
        desgloseAnterior.comisionProveedor <= desgloseAnterior.precioBase &&
        escrowAbierto.cliente_id === clienteId &&
        escrowAbierto.profesional_id === profesionalId
      if (!importesAnterioresValidos) {
        return { error: "El intento de pago anterior tiene un desglose incoherente. No se realizará ningún cargo." }
      }

      // La fila está ligada a una sesión ya creada. Conservamos exactamente su
      // total y solo normalizamos los importes derivados al recuperarla.
      ;({ precioBase, comisionCliente, totalCliente, comisionProveedor, pagoNeto } = desgloseAnterior)
    }

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
          // La fila de escrow es la foto contractual del intento de pago. Si
          // la tarifa cambia mientras Checkout sigue abierto, mostramos sus
          // importes guardados y no un desglose recalculado con la tarifa nueva.
          const desgloseGuardado = normalizarDesgloseGuardado({
            precioBase,
            comisionCliente,
            totalCliente,
            comisionProveedor,
            pagoNeto,
          })
          const { data: escrowNormalizado, error: normalizarError } = await admin
            .from("transacciones_escrow")
            .update({
              comision_cliente: desgloseGuardado.comisionCliente,
              pago_neto_proveedor: desgloseGuardado.pagoNeto,
              monto_bruto_proveedor: desgloseGuardado.precioBase,
            })
            .eq("id", escrowAbierto.id)
            .eq("estado", "pendiente")
            .select()
            .single()
          if (normalizarError) {
            return { error: "No se pudo conciliar el desglose del intento de pago anterior." }
          }
          return {
            clientSecret: anterior.client_secret,
            escrow: escrowNormalizado,
            desglose: desgloseGuardado,
          }
        }

        // Nunca dejamos viva una sesión cuyo importe o participantes ya no
        // coinciden con los documentos contractuales verificados.
        await stripe.checkout.sessions.expire(anterior.id)
      }
      const { error: cancelarEscrowError } = await admin.rpc("diime_cerrar_intento", {
        p_escrow: escrowAbierto.id, p_session: escrowAbierto.stripe_session_id,
      })
      if (cancelarEscrowError) {
        return { error: "No se pudo cerrar de forma segura el intento de pago anterior." }
      }
      ;({ precioBase, comisionCliente, totalCliente, comisionProveedor, pagoNeto } = desgloseOferta)
    } else if (escrowAbierto) {
      // Si faltó guardar el id, el navegador nunca recibió el client secret.
      // No se puede repetir la petición con seguridad porque parámetros como
      // `expires_at` cambian; cerramos la fila huérfana y usamos una nueva clave
      // idempotente. Cualquier sesión inaccesible expirará por sí sola.
      const { error: cancelarEscrowError } = await admin.rpc("diime_cerrar_intento", {
        p_escrow: escrowAbierto.id,
      })
      if (cancelarEscrowError) {
        return { error: "No se pudo cerrar de forma segura el intento de pago anterior." }
      }
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
    const { data: escrowNuevo, error: crearEscrowError } = await admin
      .from("transacciones_escrow")
      .insert(camposEscrow)
      .select()
      .single()
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
              description: `Precio final del servicio: ${precioBase.toFixed(2)}EUR + Gastos Diime con IVA incluido: ${comisionCliente.toFixed(2)}EUR`,
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

    const desgloseNormalizado = normalizarDesgloseGuardado({
      precioBase,
      comisionCliente,
      totalCliente,
      comisionProveedor,
      pagoNeto,
    })
    const { data: escrow, error: escrowError } = await admin
      .from("transacciones_escrow")
      .update({
        stripe_session_id: session.id,
        stripe_payment_intent_id: (session.payment_intent as string) || null,
        comision_cliente: desgloseNormalizado.comisionCliente,
        pago_neto_proveedor: desgloseNormalizado.pagoNeto,
        monto_bruto_proveedor: desgloseNormalizado.precioBase,
      })
      .eq("id", escrowNuevo.id)
      .eq("estado", "pendiente")
      .is("stripe_session_id", null)
      .select()
      .maybeSingle()

    if (escrowError || !escrow) {
      // Otra petición pudo cerrar o sustituir esta fila mientras Stripe creaba
      // la sesión. Nunca devolvemos un secreto cuyo escrow ya no está abierto.
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(session.id)
      }
      return { error: escrowError?.message || "El intento de pago fue sustituido. Vuelve a intentarlo." }
    }

    return { 
      clientSecret: session.client_secret,
      escrow,
      desglose: desgloseNormalizado,
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
  if (!supabase) return { error: "No se pudo conectar con la base de datos." }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }
  const admin = createAdminClient()
  if (!admin) return { error: "La configuración segura del servidor no está disponible." }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const resultado = await conciliarSesionPagada(admin, session, user.id)
    revalidatePath("/mis-solicitudes")
    revalidatePath("/mis-trabajos")
    if (resultado.tardio) return { error: "Este pago llegó después del cierre del intento. Se ha reembolsado íntegramente y el servicio no se ha reactivado." }
    return { data: resultado.escrow }
  } catch (error: any) {
    return { error: error.message || "No se pudo conciliar el pago." }
  }
}

/** A durable claim arbitrates confirmation, dispute and cancellation. */
export async function liberarFondosEscrow(trabajoId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "No se pudo conectar con la base de datos." }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }
  const admin = createAdminClient()
  if (!admin) return { error: "La configuración segura del servidor no está disponible." }
  try {
    // Include the same completed operation so a retry also repairs a previous
    // interruption between the Stripe movement and the contract closure.
    const { data: escrow, error } = await admin.from("transacciones_escrow").select("*")
      .eq("trabajo_id", trabajoId).eq("cliente_id", user.id)
      .or("estado.in.(retenido,fondos_retenidos,liquidando),liquidacion_operacion_id.like.confirmacion-%")
      .maybeSingle()
    if (error || !escrow) return { error: "No se encontró un único pago retenido para confirmar." }
    const { data: reclamada, error: claimError } = await admin.rpc("diime_reclamar_liquidacion", {
      p_escrow: escrow.id, p_actor: user.id, p_tipo: "confirmacion",
    })
    if (claimError) throw claimError
    await liquidarPagoReclamado(admin, reclamada)
    revalidatePath("/mis-solicitudes")
    revalidatePath("/mis-trabajos")
    return { success: true }
  } catch (error: any) {
    return { error: error.message || "No se pudo completar la liquidación." }
  }
}

/** Accept, close Checkout links, refund if necessary and close atomically. */
export async function reembolsarPorCancelacion(trabajoId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "No se pudo conectar con la base de datos." }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }
  const admin = createAdminClient()
  if (!admin) return { error: "La configuración segura del servidor no está disponible." }
  try {
    const { error: bloqueoError } = await admin.rpc("diime_bloquear_checkout", {
      p_trabajo: trabajoId, p_actor: user.id, p_cancelacion: true,
    })
    if (bloqueoError) throw bloqueoError
    await cerrarCheckoutsPendientes(admin, trabajoId)
    const { data: escrow, error } = await admin.from("transacciones_escrow").select("*")
      .eq("trabajo_id", trabajoId)
      .or("estado.in.(retenido,fondos_retenidos,liquidando),liquidacion_operacion_id.like.cancelacion-mutua-%")
      .maybeSingle()
    if (error) throw error
    let reembolso = 0
    let nuevoCierre = false
    if (escrow) {
      const { data: reclamada, error: claimError } = await admin.rpc("diime_reclamar_liquidacion", {
        p_escrow: escrow.id, p_actor: user.id, p_tipo: "cancelacion",
      })
      if (claimError) throw claimError
      const finalizada = await liquidarPagoReclamado(admin, reclamada)
      nuevoCierre = Boolean(finalizada.nuevo_cierre)
      reembolso = Number(reclamada.monto_reembolsado)
    }
    const { data: cierre, error: cierreError } = await admin.rpc("diime_cerrar_cancelacion", { p_trabajo: trabajoId, p_actor: user.id })
    if (cierreError) throw cierreError
    revalidatePath("/mis-solicitudes")
    revalidatePath("/mis-trabajos")
    return { reembolso, reutilizado: !nuevoCierre && !cierre?.nuevo_cierre }
  } catch (error: any) {
    return { error: error.message || "No se pudo conciliar la cancelación. Puedes reintentar sin duplicar el reembolso." }
  }
}
