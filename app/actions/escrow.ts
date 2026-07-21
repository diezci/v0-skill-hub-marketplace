"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { revalidatePath } from "next/cache"
import { calcularTotalCliente, calcularPagoProveedor, PLATFORM_CONFIG } from "@/lib/comisiones"

/**
 * Create Stripe Checkout Session for escrow payment.
 * The client pays: agreed price + platform commission.
 */
export async function crearPagoEscrow(data: {
  trabajo_id: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Get trabajo details
  const { data: trabajo, error: trabajoError } = await supabase
    .from("trabajos")
    .select("id, titulo, precio_acordado, profesional_id, cliente_id, estado")
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

  // Calculate amounts with commissions
  const { precioBase, comisionCliente, totalCliente } = calcularTotalCliente(trabajo.precio_acordado)
  const { comisionProveedor, pagoNeto } = calcularPagoProveedor(trabajo.precio_acordado)

  try {
    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      redirect_on_completion: "never",
      line_items: [
        {
          price_data: {
            currency: PLATFORM_CONFIG.moneda,
            product_data: {
              name: trabajo.titulo || "Servicio profesional",
              description: `Precio del servicio: ${precioBase.toFixed(2)}EUR + Comision plataforma: ${comisionCliente.toFixed(2)}EUR`,
            },
            unit_amount: Math.round(totalCliente * 100), // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        trabajo_id: trabajo.id,
        cliente_id: user.id,
        profesional_id: trabajo.profesional_id,
        precio_acordado: trabajo.precio_acordado.toString(),
        comision_cliente: comisionCliente.toString(),
        comision_proveedor: comisionProveedor.toString(),
        pago_neto_proveedor: pagoNeto.toString(),
        total_cliente: totalCliente.toString(),
        type: "escrow",
      },
    })

    // Reutilizar el escrow pendiente del trabajo si existe (cada visita a la
    // página de pago creaba una fila nueva y se acumulaban duplicados).
    const { data: escrowPrevio } = await supabase
      .from("transacciones_escrow")
      .select("id")
      .eq("trabajo_id", trabajo.id)
      .eq("estado", "pendiente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const camposEscrow = {
      trabajo_id: trabajo.id,
      cliente_id: user.id,
      profesional_id: trabajo.profesional_id,
      monto: totalCliente,
      monto_base: precioBase,
      comision_cliente: comisionCliente,
      comision_proveedor: comisionProveedor,
      pago_neto_proveedor: pagoNeto,
      estado: "pendiente",
      stripe_session_id: session.id,
      stripe_payment_intent_id: (session.payment_intent as string) || null,
    }

    const { data: escrow, error: escrowError } = escrowPrevio
      ? await supabase
          .from("transacciones_escrow")
          .update(camposEscrow)
          .eq("id", escrowPrevio.id)
          .select()
          .single()
      : await supabase.from("transacciones_escrow").insert(camposEscrow).select().single()

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

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Verify payment with Stripe
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    
    if (session.payment_status !== "paid") {
      return { error: "El pago no se ha completado" }
    }

    // Update escrow
    const { data: escrow, error } = await supabase
      .from("transacciones_escrow")
      .update({
        estado: "fondos_retenidos",
        fecha_retencion: new Date().toISOString(),
        stripe_payment_intent_id: session.payment_intent as string,
      })
      .eq("stripe_session_id", sessionId)
      .eq("cliente_id", user.id)
      .select()
      .single()

    if (error) {
      return { error: error.message }
    }

    // Update trabajo to en_progreso
    await supabase.from("trabajos").update({
      estado: "en_progreso",
      updated_at: new Date().toISOString(),
    }).eq("id", escrow.trabajo_id)

    const { data: trabajoPagado } = await supabase
      .from("trabajos")
      .select("titulo, solicitud_id, oferta_id")
      .eq("id", escrow.trabajo_id)
      .maybeSingle()

    // El pago consuma la contratación: hasta aquí la demanda seguía abierta y
    // las demás ofertas pendientes (por si el cliente abandonaba la pasarela).
    if (trabajoPagado?.solicitud_id) {
      await supabase.from("solicitudes").update({ estado: "en_progreso" }).eq("id", trabajoPagado.solicitud_id)
      await supabase
        .from("ofertas")
        .update({ estado: "rechazada", updated_at: new Date().toISOString() })
        .eq("solicitud_id", trabajoPagado.solicitud_id)
        .eq("estado", "pendiente")
    }
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: escrow.profesional_id,
      tipo: "pago_recibido",
      titulo: "El cliente ha pagado: puedes empezar",
      mensaje: `El pago de "${trabajoPagado?.titulo ?? "un trabajo"}" ya está retenido en custodia. El trabajo pasa a En Progreso.`,
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

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Get escrow transaction
  const { data: escrow, error: escrowError } = await supabase
    .from("transacciones_escrow")
    .select("*")
    .eq("trabajo_id", trabajoId)
    .eq("cliente_id", user.id)
    .eq("estado", "fondos_retenidos")
    .single()

  if (escrowError || !escrow) {
    return { error: "Transaccion escrow no encontrada o fondos no retenidos" }
  }

  try {
    // The payment has already been captured by Stripe Checkout.
    // We just update the database to reflect the release.
    // In production, you would use Stripe Connect to transfer funds to the provider.

    // Update escrow status
    const { error: updateError } = await supabase
      .from("transacciones_escrow")
      .update({
        estado: "completado",
        fecha_liberacion: new Date().toISOString(),
      })
      .eq("id", escrow.id)

    if (updateError) {
      return { error: updateError.message }
    }

    // Update trabajo to completado
    await supabase
      .from("trabajos")
      .update({
        estado: "completado",
        fecha_fin: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", trabajoId)

    // Update solicitud
    const { data: trabajo } = await supabase
      .from("trabajos")
      .select("solicitud_id")
      .eq("id", trabajoId)
      .single()

    if (trabajo) {
      await supabase.from("solicitudes").update({ estado: "completada" }).eq("id", trabajo.solicitud_id)
    }

    // Create update record
    await supabase.from("actualizaciones_trabajo").insert({
      trabajo_id: trabajoId,
      usuario_id: user.id,
      tipo: "pago_liberado",
      mensaje: `Pago liberado. El proveedor recibira ${escrow.pago_neto_proveedor?.toFixed(2) || escrow.monto_base?.toFixed(2)}EUR.`,
      progreso: 100,
    })

    // Avisar al proveedor de que su pago ha sido liberado.
    {
      const { data: trabajoInfo } = await supabase
        .from("trabajos")
        .select("titulo")
        .eq("id", trabajoId)
        .maybeSingle()
      const neto = Number(escrow.pago_neto_proveedor ?? escrow.monto_base ?? 0)
      const { crearNotificacion } = await import("./notificaciones")
      await crearNotificacion({
        usuarioId: escrow.profesional_id,
        tipo: "pago_liberado",
        titulo: "Pago liberado",
        mensaje: `El cliente ha confirmado "${trabajoInfo?.titulo ?? "el trabajo"}". Se te libera el pago de ${neto.toFixed(2)}€.`,
        link: "/mis-trabajos",
      })
    }

    revalidatePath("/mis-solicitudes")
    revalidatePath("/mis-trabajos")
    return { success: true }
  } catch (error: any) {
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

  const { data: escrow } = await supabase
    .from("transacciones_escrow")
    .select("*")
    .eq("trabajo_id", trabajoId)
    .eq("estado", "fondos_retenidos")
    .maybeSingle()

  if (!escrow) return { reembolso: 0 }

  try {
    if (escrow.stripe_payment_intent_id) {
      await stripe.refunds.create({
        payment_intent: escrow.stripe_payment_intent_id,
        reason: "requested_by_customer",
      })
    }

    await supabase
      .from("transacciones_escrow")
      .update({
        estado: "reembolsado",
        monto_reembolsado: escrow.monto,
        retencion_plataforma: 0,
        fecha_reembolso: new Date().toISOString(),
        notas: "Cancelación de mutuo acuerdo: reembolso íntegro al cliente.",
      })
      .eq("id", escrow.id)

    return { reembolso: Number(escrow.monto || 0) }
  } catch (error: any) {
    return { error: error.message }
  }
}
