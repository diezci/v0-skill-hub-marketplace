"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function crearDisputa(data: {
  trabajo_id: string
  tipo: "cliente" | "proveedor"
  razon: string
  descripcion: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Verify user is involved in the trabajo
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("cliente_id, profesional_id, estado")
    .eq("id", data.trabajo_id)
    .single()

  if (!trabajo || (trabajo.cliente_id !== user.id && trabajo.profesional_id !== user.id)) {
    return { error: "No tienes permiso para crear una disputa en este trabajo" }
  }

  const { data: disputa, error } = await supabase
    .from("disputas")
    .insert({
      trabajo_id: data.trabajo_id,
      iniciada_por: user.id,
      tipo: data.tipo,
      razon: data.razon,
      descripcion: data.descripcion,
      estado: "abierta",
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] Error creating disputa:", error)
    return { error: error.message }
  }

  revalidatePath("/admin/disputes")
  return { data: disputa }
}

export async function obtenerDisputas() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (profile?.rol !== "admin") {
    return { error: "No tienes permiso para acceder a las disputas" }
  }

  const { data: disputas, error } = await supabase
    .from("disputas")
    .select(`
      id,
      trabajo_id,
      iniciada_por,
      tipo,
      razon,
      descripcion,
      estado,
      resolucion,
      resuelto_por,
      created_at,
      updated_at,
      trabajos(id, titulo, cliente_id, profesional_id, precio_acordado, estado)
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching disputas:", error)
    return { error: error.message }
  }

  return { data: disputas }
}

export async function resolverDisputa(data: {
  disputa_id: string
  resolucion: "cliente" | "proveedor" | "reembolso_parcial"
  descripcion: string
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (profile?.rol !== "admin") {
    return { error: "No tienes permiso para resolver disputas" }
  }

  // Get disputa and trabajo info
  const { data: disputa } = await supabase
    .from("disputas")
    .select(`
      id,
      trabajo_id,
      trabajos(id, cliente_id, profesional_id, precio_acordado)
    `)
    .eq("id", data.disputa_id)
    .single()

  if (!disputa) {
    return { error: "Disputa no encontrada" }
  }

  const trabajo = disputa.trabajos

  // Update disputa
  const { error: updateError } = await supabase
    .from("disputas")
    .update({
      estado: "resuelta",
      resolucion: data.resolucion,
      resuelto_por: user.id,
      descripcion_resolucion: data.descripcion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.disputa_id)

  if (updateError) {
    return { error: updateError.message }
  }

  // Handle refund based on resolution
  if (data.resolucion === "cliente") {
    // Full refund to client, no payment to provider
    const { error: refundError } = await supabase
      .from("transacciones_escrow")
      .update({
        estado: "reembolsado",
        fecha_resolucion: new Date().toISOString(),
      })
      .eq("trabajo_id", trabajo.id)

    if (refundError) {
      return { error: refundError.message }
    }
  } else if (data.resolucion === "proveedor") {
    // Release full payment to provider
    const { error: releaseError } = await supabase
      .from("transacciones_escrow")
      .update({
        estado: "liberado",
        fecha_liberacion: new Date().toISOString(),
      })
      .eq("trabajo_id", trabajo.id)

    if (releaseError) {
      return { error: releaseError.message }
    }
  } else if (data.resolucion === "reembolso_parcial") {
    // Split payment: 50% to client, 50% to provider
    const { error: splitError } = await supabase
      .from("transacciones_escrow")
      .update({
        estado: "dividido",
        monto_reembolsado: trabajo.precio_acordado * 0.5,
        monto_pagado: trabajo.precio_acordado * 0.5,
        fecha_resolucion: new Date().toISOString(),
      })
      .eq("trabajo_id", trabajo.id)

    if (splitError) {
      return { error: splitError.message }
    }
  }

  revalidatePath("/admin/disputes")
  return { data: disputa }
}

export async function obtenerDisputaPorTrabajo(trabajo_id: string) {
  const supabase = await createClient()

  const { data: disputa } = await supabase
    .from("disputas")
    .select("*")
    .eq("trabajo_id", trabajo_id)
    .single()

  return { data: disputa }
}
