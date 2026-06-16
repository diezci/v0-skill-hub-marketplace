"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { revalidatePath } from "next/cache"

// Comprueba que el usuario actual es un empleado de Diime (es_admin).
async function requireAdmin(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" as const }

  const { data: profile } = await supabase
    .from("profiles")
    .select("es_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile?.es_admin) return { error: "No tienes permiso para acceder al panel de disputas" as const }
  return { user }
}

export async function crearDisputa(data: {
  trabajo_id: string
  motivo: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("cliente_id, profesional_id, estado")
    .eq("id", data.trabajo_id)
    .maybeSingle()

  if (!trabajo || (trabajo.cliente_id !== user.id && trabajo.profesional_id !== user.id)) {
    return { error: "No tienes permiso para crear una disputa en este trabajo" }
  }

  const tipo = trabajo.cliente_id === user.id ? "cliente" : "proveedor"

  const { data: disputa, error } = await supabase
    .from("disputas")
    .insert({
      trabajo_id: data.trabajo_id,
      cliente_id: trabajo.cliente_id,
      profesional_id: trabajo.profesional_id,
      tipo,
      motivo: data.motivo,
      estado: "abierta",
    })
    .select()
    .single()

  if (error) return { error: error.message }

  // Marcar el trabajo y el escrow como en disputa.
  await supabase.from("trabajos").update({ estado: "en_disputa" }).eq("id", data.trabajo_id)
  await supabase.from("transacciones_escrow").update({ estado: "disputa" }).eq("trabajo_id", data.trabajo_id)

  revalidatePath("/admin/disputas")
  return { data: disputa }
}

// Lista de disputas para el panel admin (con datos básicos del trabajo y partes).
export async function obtenerDisputas() {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return { error: auth.error }

  const { data: disputas, error } = await supabase
    .from("disputas")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return { error: error.message }

  // Enriquecer con trabajo y nombres de las partes.
  const enriquecidas = await Promise.all(
    (disputas || []).map(async (d: any) => {
      const { data: trabajo } = await supabase
        .from("trabajos")
        .select("id, titulo, precio_acordado, estado")
        .eq("id", d.trabajo_id)
        .maybeSingle()
      const { data: cliente } = await supabase
        .from("profiles")
        .select("nombre, apellido, foto_perfil")
        .eq("id", d.cliente_id)
        .maybeSingle()
      const { data: profesional } = await supabase
        .from("profiles")
        .select("nombre, apellido, foto_perfil")
        .eq("id", d.profesional_id)
        .maybeSingle()
      return { ...d, trabajo, cliente, profesional }
    }),
  )

  return { data: enriquecidas }
}

// Detalle completo de una disputa para que el empleado pueda resolverla:
// conversación, pruebas/archivos, historial del trabajo y estado del escrow.
export async function obtenerDetalleDisputa(disputaId: string) {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return { error: auth.error }

  const { data: disputa, error } = await supabase
    .from("disputas")
    .select("*")
    .eq("id", disputaId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!disputa) return { error: "Disputa no encontrada" }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("*")
    .eq("id", disputa.trabajo_id)
    .maybeSingle()

  const { data: cliente } = await supabase
    .from("profiles")
    .select("id, nombre, apellido, foto_perfil, email, telefono, ubicacion")
    .eq("id", disputa.cliente_id)
    .maybeSingle()

  const { data: profesional } = await supabase
    .from("profiles")
    .select("id, nombre, apellido, foto_perfil, email, telefono, ubicacion")
    .eq("id", disputa.profesional_id)
    .maybeSingle()

  const { data: escrow } = await supabase
    .from("transacciones_escrow")
    .select("*")
    .eq("trabajo_id", disputa.trabajo_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: solicitud } = trabajo?.solicitud_id
    ? await supabase
        .from("solicitudes")
        .select("titulo, descripcion, archivos, ubicacion, presupuesto_min, presupuesto_max")
        .eq("id", trabajo.solicitud_id)
        .maybeSingle()
    : { data: null }

  const { data: oferta } = trabajo?.oferta_id
    ? await supabase
        .from("ofertas")
        .select("precio, descripcion, tiempo_estimado, unidad_tiempo, archivos")
        .eq("id", trabajo.oferta_id)
        .maybeSingle()
    : { data: null }

  // Conversación entre cliente y proveedor (la del trabajo, si existe).
  const { data: conversacion } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("trabajo_id", disputa.trabajo_id)
    .maybeSingle()

  let mensajes: any[] = []
  if (conversacion?.id) {
    const { data: msgs } = await supabase
      .from("mensajes")
      .select("id, remitente_id, contenido, created_at")
      .eq("conversacion_id", conversacion.id)
      .order("created_at", { ascending: true })
    mensajes = msgs || []
  }

  // Historial del trabajo + pruebas adjuntas.
  const { data: actualizaciones } = await supabase
    .from("actualizaciones_trabajo")
    .select("id, usuario_id, tipo, mensaje, progreso, archivos, created_at")
    .eq("trabajo_id", disputa.trabajo_id)
    .order("created_at", { ascending: true })

  return {
    data: {
      disputa,
      trabajo,
      cliente,
      profesional,
      escrow,
      solicitud,
      oferta,
      mensajes,
      actualizaciones: actualizaciones || [],
    },
  }
}

/**
 * Resuelve una disputa. El empleado decide a favor de quién y, si procede,
 * se ejecuta el reembolso real en Stripe.
 *  - "cliente": reembolso al cliente (total o parcial) y se cierra el trabajo.
 *  - "proveedor": se liberan los fondos al proveedor.
 *  - "parcial": reembolso parcial al cliente; el resto queda para el proveedor.
 */
export async function resolverDisputa(data: {
  disputa_id: string
  resolucion: "cliente" | "proveedor" | "parcial"
  nota: string
  monto_reembolso?: number
}) {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return { error: auth.error }
  const adminId = auth.user.id

  const { data: disputa } = await supabase
    .from("disputas")
    .select("id, trabajo_id, estado")
    .eq("id", data.disputa_id)
    .maybeSingle()
  if (!disputa) return { error: "Disputa no encontrada" }
  if (disputa.estado === "resuelta") return { error: "Esta disputa ya está resuelta" }

  const { data: escrow } = await supabase
    .from("transacciones_escrow")
    .select("*")
    .eq("trabajo_id", disputa.trabajo_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const base = Number(escrow?.monto_base ?? 0)

  try {
    if (data.resolucion === "proveedor") {
      // Liberar fondos al proveedor.
      await supabase
        .from("transacciones_escrow")
        .update({ estado: "completado", fecha_liberacion: new Date().toISOString() })
        .eq("id", escrow?.id)
      await supabase
        .from("trabajos")
        .update({ estado: "completado", fecha_fin: new Date().toISOString() })
        .eq("id", disputa.trabajo_id)
      const { data: t } = await supabase.from("trabajos").select("solicitud_id").eq("id", disputa.trabajo_id).maybeSingle()
      if (t?.solicitud_id) await supabase.from("solicitudes").update({ estado: "completada" }).eq("id", t.solicitud_id)
    } else {
      // Reembolso al cliente (total o parcial).
      const montoReembolso =
        data.resolucion === "parcial"
          ? Math.min(Math.max(Number(data.monto_reembolso ?? base / 2), 0), base)
          : base

      if (escrow?.stripe_payment_intent_id && montoReembolso > 0) {
        await stripe.refunds.create({
          payment_intent: escrow.stripe_payment_intent_id,
          amount: Math.round(montoReembolso * 100),
          reason: "requested_by_customer",
        })
      }

      await supabase
        .from("transacciones_escrow")
        .update({
          estado: "reembolsado",
          monto_reembolsado: montoReembolso,
          fecha_reembolso: new Date().toISOString(),
        })
        .eq("id", escrow?.id)
      await supabase
        .from("trabajos")
        .update({ estado: data.resolucion === "parcial" ? "completado" : "rechazado", fecha_fin: new Date().toISOString() })
        .eq("id", disputa.trabajo_id)
    }

    // Cerrar la disputa con la decisión y la nota del empleado.
    const { error: updError } = await supabase
      .from("disputas")
      .update({
        estado: "resuelta",
        resolucion: data.resolucion,
        resultado: data.nota,
        resuelto_por: adminId,
        fecha_resolucion: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.disputa_id)
    if (updError) return { error: updError.message }

    revalidatePath("/admin/disputas")
    return { data: { ok: true } }
  } catch (error: any) {
    return { error: error.message || "Error al resolver la disputa" }
  }
}
