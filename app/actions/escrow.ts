"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { revalidatePath } from "next/cache"
import { crearTrabajo } from "./trabajos"

export async function crearTransaccionEscrow(data: {
  oferta_id: string
  monto: number
  descripcion: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Get offer details
  const { data: oferta, error: ofertaError } = await supabase
    .from("ofertas")
    .select("*, solicitud:solicitudes(*)")
    .eq("id", data.oferta_id)
    .single()

  if (ofertaError || !oferta) {
    return { error: "Oferta no encontrada" }
  }

  try {
    // Create PaymentIntent with manual capture
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(data.monto * 100), // Convert to cents
      currency: "eur",
      capture_method: "manual",
      description: data.descripcion,
      metadata: {
        oferta_id: data.oferta_id,
        cliente_id: user.id,
        profesional_id: oferta.profesional_id,
        type: "escrow",
      },
    })

    // Create escrow record in database
    const { data: escrow, error: escrowError } = await supabase
      .from("transacciones_escrow")
      .insert({
        oferta_id: data.oferta_id,
        cliente_id: user.id,
        profesional_id: oferta.profesional_id,
        monto: data.monto,
        estado: "fondos_retenidos",
        stripe_payment_intent_id: paymentIntent.id,
        descripcion: data.descripcion,
      })
      .select()
      .single()

    if (escrowError) {
      // Cancel PaymentIntent if database insert fails
      await stripe.paymentIntents.cancel(paymentIntent.id)
      return { error: escrowError.message }
    }

    const trabajoResult = await crearTrabajo({
      oferta_id: data.oferta_id,
      solicitud_id: oferta.solicitud_id,
      profesional_id: oferta.profesional_id,
      transaccion_escrow_id: escrow.id,
    })

    if (trabajoResult.error) {
      console.error("[v0] Error creating trabajo:", trabajoResult.error)
    }

    revalidatePath("/escrow")
    revalidatePath("/mi-cuenta")
    return { data: escrow, clientSecret: paymentIntent.client_secret }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function liberarFondosEscrow(escrowId: string) {
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
    .eq("id", escrowId)
    .eq("cliente_id", user.id)
    .single()

  if (escrowError || !escrow) {
    return { error: "Transacción no encontrada" }
  }

  if (escrow.estado !== "trabajo_entregado") {
    return { error: "El trabajo debe estar entregado para liberar fondos" }
  }

  try {
    // Capture the payment
    await stripe.paymentIntents.capture(escrow.stripe_payment_intent_id)

    // Update escrow status
    const { error: updateError } = await supabase
      .from("transacciones_escrow")
      .update({
        estado: "completado",
        fecha_completado: new Date().toISOString(),
      })
      .eq("id", escrowId)

    if (updateError) {
      return { error: updateError.message }
    }

    revalidatePath("/escrow")
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function marcarTrabajoEntregado(escrowId: string) {
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
      estado: "trabajo_entregado",
    })
    .eq("id", escrowId)
    .eq("profesional_id", user.id)
    .eq("estado", "en_progreso")

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/escrow")
  return { success: true }
}

export async function reembolsarEscrow(escrowId: string, razon: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data: escrow, error: escrowError } = await supabase
    .from("transacciones_escrow")
    .select("*")
    .eq("id", escrowId)
    .eq("cliente_id", user.id)
    .single()

  if (escrowError || !escrow) {
    return { error: "Transacción no encontrada" }
  }

  try {
    // Cancel the PaymentIntent
    await stripe.paymentIntents.cancel(escrow.stripe_payment_intent_id)

    // Update escrow status
    const { error: updateError } = await supabase
      .from("transacciones_escrow")
      .update({
        estado: "reembolsado",
        fecha_completado: new Date().toISOString(),
      })
      .eq("id", escrowId)

    if (updateError) {
      return { error: updateError.message }
    }

    revalidatePath("/escrow")
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

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
    .select(
      `
      *,
      oferta:ofertas(
        *,
        solicitud:solicitudes(*)
      ),
      cliente:profiles!transacciones_escrow_cliente_id_fkey(*),
      profesional:profiles!transacciones_escrow_profesional_id_fkey(*)
    `,
    )
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export { crearTransaccionEscrow as createEscrowPayment }
export { marcarTrabajoEntregado as deliverWork }
export { liberarFondosEscrow as releaseEscrowFunds }
export { reembolsarEscrow as refundEscrow }

export async function confirmFundsHeld(escrowId: string) {
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
      estado: "fondos_retenidos",
    })
    .eq("id", escrowId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/escrow")
  return { success: true }
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
    })
    .eq("id", escrowId)
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/escrow")
  return { success: true }
}
