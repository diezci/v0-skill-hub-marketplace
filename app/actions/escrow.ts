"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { revalidatePath } from "next/cache"
import { calcularTotalCliente, calcularPagoProveedor, calcularReembolsoCliente, PLATFORM_CONFIG } from "@/lib/comisiones"

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

    // Create escrow record in database
    const { data: escrow, error: escrowError } = await supabase
      .from("transacciones_escrow")
      .insert({
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
        stripe_payment_intent_id: session.payment_intent as string || null,
      })
      .select()
      .single()

    if (escrowError) {
      console.error("[v0] Error creating escrow:", escrowError)
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
    console.error("[v0] Stripe error:", error)
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
      console.error("[v0] Error confirming escrow:", error)
      return { error: error.message }
    }

    // Update trabajo to en_progreso
    await supabase.from("trabajos").update({ 
      estado: "en_progreso",
      updated_at: new Date().toISOString(),
    }).eq("id", escrow.trabajo_id)

    revalidatePath("/mis-solicitudes")
    revalidatePath("/mis-trabajos")
    return { data: escrow }
  } catch (error: any) {
    console.error("[v0] Error confirming payment:", error)
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

    revalidatePath("/mis-solicitudes")
    revalidatePath("/mis-trabajos")
    return { success: true }
  } catch (error: any) {
    console.error("[v0] Error releasing funds:", error)
    return { error: error.message }
  }
}

/**
 * Client rejects the delivered work.
 * Client receives refund: total paid - platform commission (non-refundable).
 * Provider receives nothing.
 */
export async function rechazarTrabajoYReembolsar(trabajoId: string, motivo: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Get trabajo
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("cliente_id, estado, precio_acordado")
    .eq("id", trabajoId)
    .single()

  if (!trabajo || trabajo.cliente_id !== user.id) {
    return { error: "No tienes permiso para rechazar este trabajo" }
  }

  if (trabajo.estado !== "entregado") {
    return { error: "Solo puedes rechazar un trabajo que haya sido entregado" }
  }

  // Get escrow
  const { data: escrow } = await supabase
    .from("transacciones_escrow")
    .select("*")
    .eq("trabajo_id", trabajoId)
    .eq("estado", "fondos_retenidos")
    .single()

  if (!escrow) {
    return { error: "No se encontro la transaccion de pago" }
  }

  // Calculate refund
  const { reembolso, retencionPlataforma } = calcularReembolsoCliente(trabajo.precio_acordado)

  try {
    // Create Stripe refund (partial - platform keeps its commission)
    if (escrow.stripe_payment_intent_id) {
      await stripe.refunds.create({
        payment_intent: escrow.stripe_payment_intent_id,
        amount: Math.round(reembolso * 100), // Refund in cents, minus platform fee
        reason: "requested_by_customer",
      })
    }

    // Update escrow
    await supabase
      .from("transacciones_escrow")
      .update({
        estado: "reembolsado",
        monto_reembolsado: reembolso,
        retencion_plataforma: retencionPlataforma,
        fecha_reembolso: new Date().toISOString(),
        notas: motivo,
      })
      .eq("id", escrow.id)

    // Update trabajo
    await supabase
      .from("trabajos")
      .update({
        estado: "rechazado",
        fecha_fin: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", trabajoId)

    // Update solicitud back to open
    const { data: trabajoData } = await supabase
      .from("trabajos")
      .select("solicitud_id")
      .eq("id", trabajoId)
      .single()

    if (trabajoData) {
      await supabase.from("solicitudes").update({ estado: "abierta" }).eq("id", trabajoData.solicitud_id)
    }

    // Create update record
    await supabase.from("actualizaciones_trabajo").insert({
      trabajo_id: trabajoId,
      usuario_id: user.id,
      tipo: "rechazo",
      mensaje: `Trabajo rechazado. Motivo: ${motivo}. Reembolso: ${reembolso.toFixed(2)}EUR (se retiene ${retencionPlataforma.toFixed(2)}EUR de comision de plataforma).`,
      progreso: 0,
    })

    revalidatePath("/mis-solicitudes")
    revalidatePath("/mis-trabajos")
    return { 
      success: true,
      reembolso,
      retencionPlataforma,
    }
  } catch (error: any) {
    console.error("[v0] Error processing refund:", error)
    return { error: error.message }
  }
}

/**
 * Get escrow details for a trabajo
 */
export async function obtenerEscrowPorTrabajo(trabajoId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("transacciones_escrow")
    .select("*")
    .eq("trabajo_id", trabajoId)
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}

/**
 * Get all escrow transactions for the current user
 */
export async function obtenerTransaccionesEscrow() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("transacciones_escrow")
    .select("*")
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  // Get trabajo info for each escrow
  const dataWithTrabajos = await Promise.all(
    (data || []).map(async (escrow: any) => {
      const { data: trabajo } = await supabase
        .from("trabajos")
        .select("titulo, estado")
        .eq("id", escrow.trabajo_id)
        .single()
      return { ...escrow, trabajo }
    })
  )

  return { data: dataWithTrabajos }
}

// Backward compatible exports






export async function confirmFundsHeld(sessionId: string) {
  return confirmarPagoEscrow(sessionId)
}

export async function openDispute(escrowId: string, descripcion: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { error } = await supabase
    .from("transacciones_escrow")
    .update({
      estado: "disputa",
      notas: descripcion,
    })
    .eq("id", escrowId)
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/mis-solicitudes")
  return { success: true }
}
