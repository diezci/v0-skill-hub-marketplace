"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function crearTrabajo(data: {
  oferta_id: string
  solicitud_id: string
  profesional_id: string
  transaccion_escrow_id?: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data: trabajo, error } = await supabase
    .from("trabajos")
    .insert({
      cliente_id: user.id,
      profesional_id: data.profesional_id,
      solicitud_id: data.solicitud_id,
      oferta_id: data.oferta_id,
      transaccion_escrow_id: data.transaccion_escrow_id,
      estado: "en_progreso",
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update solicitud status
  await supabase.from("solicitudes").update({ estado: "en-progreso" }).eq("id", data.solicitud_id)

  // Update oferta status
  await supabase.from("ofertas").update({ estado: "aceptada" }).eq("id", data.oferta_id)

  revalidatePath("/mi-cuenta")
  revalidatePath("/escrow")
  return { data: trabajo }
}

export async function obtenerMisTrabajos() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .select(
      `
      *,
      solicitud:solicitudes(*),
      oferta:ofertas(*),
      cliente:profiles!trabajos_cliente_id_fkey(*),
      profesional:profiles!trabajos_profesional_id_fkey(*),
      transaccion_escrow:transacciones_escrow(*)
    `,
    )
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function actualizarEstadoTrabajo(trabajoId: string, estado: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .update({ estado })
    .eq("id", trabajoId)
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // If completed, update solicitud and escrow
  if (estado === "completado") {
    await supabase.from("solicitudes").update({ estado: "completado" }).eq("id", data.solicitud_id)

    // Mark escrow as trabajo_entregado
    if (data.transaccion_escrow_id) {
      await supabase
        .from("transacciones_escrow")
        .update({ estado: "trabajo_entregado" })
        .eq("id", data.transaccion_escrow_id)
    }
  }

  revalidatePath("/mi-cuenta")
  revalidatePath("/escrow")
  return { data }
}

export async function cancelarTrabajo(trabajoId: string, razon: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("trabajos")
    .update({
      estado: "cancelado",
      fecha_completado: new Date().toISOString(),
    })
    .eq("id", trabajoId)
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Update solicitud
  await supabase.from("solicitudes").update({ estado: "cancelado" }).eq("id", data.solicitud_id)

  revalidatePath("/mi-cuenta")
  return { data }
}
