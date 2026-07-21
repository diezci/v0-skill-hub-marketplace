"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { calcularPagoProveedor, formatearPrecio } from "@/lib/comisiones"
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

// Estados de trabajo en los que tiene sentido abrir una disputa: el pago ya
// está retenido en el escrow (cliente pagó) y el trabajo aún no se ha cerrado.
const ESTADOS_DISPUTABLES = ["en_progreso", "entregado"] as const

export async function crearDisputa(data: {
  trabajo_id: string
  motivo: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const motivo = data.motivo?.trim()
  if (!motivo) return { error: "Describe el motivo de la disputa." }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("cliente_id, profesional_id, estado, cancelacion_estado, cancelacion_solicitada_por")
    .eq("id", data.trabajo_id)
    .maybeSingle()

  if (!trabajo || (trabajo.cliente_id !== user.id && trabajo.profesional_id !== user.id)) {
    return { error: "No tienes permiso para crear una disputa en este trabajo" }
  }

  // Caso especial: el solicitante de una cancelación que ha sido RECHAZADA puede
  // abrir disputa aunque el trabajo siga en 'pendiente_pago' (mediación sin dinero).
  const esDisputaPorCancelacion =
    trabajo.estado === "pendiente_pago" &&
    trabajo.cancelacion_estado === "rechazada" &&
    trabajo.cancelacion_solicitada_por === user.id

  if (trabajo.estado === "en_disputa") {
    return { error: "Ya hay una disputa abierta para este trabajo." }
  }
  if (!esDisputaPorCancelacion) {
    // Resto de casos: solo cuando hay dinero retenido y el trabajo sigue activo.
    if (trabajo.estado === "pendiente_pago") {
      return {
        error:
          "Aún no se ha realizado el pago, así que no hay fondos en custodia. Si el cliente no paga, cancela el trabajo en su lugar.",
      }
    }
    if (!ESTADOS_DISPUTABLES.includes(trabajo.estado)) {
      return { error: "Este trabajo ya está cerrado y no admite disputas." }
    }
  }

  // Evitar disputas duplicadas para el mismo trabajo.
  const { data: existente } = await supabase
    .from("disputas")
    .select("id")
    .eq("trabajo_id", data.trabajo_id)
    .eq("estado", "abierta")
    .maybeSingle()
  if (existente) return { error: "Ya hay una disputa abierta para este trabajo." }

  const tipo = trabajo.cliente_id === user.id ? "cliente" : "proveedor"

  const { data: disputa, error } = await supabase
    .from("disputas")
    .insert({
      trabajo_id: data.trabajo_id,
      cliente_id: trabajo.cliente_id,
      profesional_id: trabajo.profesional_id,
      tipo,
      motivo,
      estado: "abierta",
    })
    .select()
    .single()

  if (error) return { error: error.message }

  // Marcar el trabajo y el escrow como en disputa (congela los fondos).
  await supabase.from("trabajos").update({ estado: "en_disputa" }).eq("id", data.trabajo_id)
  await supabase.from("transacciones_escrow").update({ estado: "disputa" }).eq("trabajo_id", data.trabajo_id)

  revalidatePath("/admin/disputas")
  revalidatePath("/mis-trabajos")
  revalidatePath("/mis-solicitudes")
  return { data: disputa }
}

// El cliente rechaza una entrega porque, según él, no cumple lo acordado.
// NO se reembolsa automáticamente: se abre una disputa para que el equipo de
// Diime decida según las pruebas adjuntadas y los términos acordados. El pago
// queda retenido en custodia mientras tanto.
export async function rechazarEntrega(trabajoId: string, motivo: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const razon = motivo?.trim()
  if (!razon) return { error: "Explica por qué la entrega no cumple lo acordado." }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("cliente_id, profesional_id, estado, titulo")
    .eq("id", trabajoId)
    .maybeSingle()

  if (!trabajo || trabajo.cliente_id !== user.id) {
    return { error: "No tienes permiso para rechazar la entrega de este trabajo." }
  }
  if (trabajo.estado !== "entregado") {
    return { error: "Solo puedes rechazar una entrega que el profesional haya marcado como entregada." }
  }

  // Abrir la disputa reutiliza toda la lógica: congela los fondos (escrow a
  // "disputa"), pone el trabajo "en_disputa" y crea el registro para el admin.
  const res = await crearDisputa({
    trabajo_id: trabajoId,
    motivo: `Entrega rechazada por el cliente. Motivo: ${razon}`,
  })
  if (res.error) return { error: res.error }

  // Deja constancia en el historial del trabajo y avisa al profesional.
  await supabase.from("actualizaciones_trabajo").insert({
    trabajo_id: trabajoId,
    usuario_id: user.id,
    tipo: "disputa",
    mensaje: `El cliente ha rechazado la entrega. El equipo de Diime decidirá según las pruebas y los términos acordados. Motivo: ${razon}`,
    progreso: 100,
  })

  const { crearNotificacion } = await import("./notificaciones")
  await crearNotificacion({
    usuarioId: trabajo.profesional_id,
    tipo: "trabajo_rechazado",
    titulo: "El cliente ha rechazado tu entrega",
    mensaje: `El cliente considera que "${trabajo.titulo ?? "el trabajo"}" no cumple lo acordado. El pago sigue retenido en custodia y el equipo de Diime decidirá según las pruebas y los términos. Motivo: ${razon}`,
    link: "/mis-trabajos",
  })

  return { data: res.data }
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
    .select("id, trabajo_id, estado, cliente_id, profesional_id")
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
  // Se declara fuera del try para poder contarlo en las notificaciones.
  let montoReembolso = 0

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
      montoReembolso =
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

    await notificarResolucionDisputa({
      supabase,
      disputa,
      resolucion: data.resolucion,
      nota: data.nota,
      base,
      montoReembolso,
    })

    revalidatePath("/admin/disputas")
    revalidatePath("/mis-trabajos")
    revalidatePath("/mis-solicitudes")
    return { data: { ok: true } }
  } catch (error: any) {
    return { error: error.message || "Error al resolver la disputa" }
  }
}

// Avisa a las dos partes de cómo ha quedado la disputa. Cada una recibe solo su
// lado económico: el cliente nunca ve el neto del profesional (tras el 5%) ni el
// profesional el total que pagó el cliente (con el 10%).
async function notificarResolucionDisputa({
  supabase,
  disputa,
  resolucion,
  nota,
  base,
  montoReembolso,
}: {
  supabase: any
  disputa: { trabajo_id: string; cliente_id: string | null; profesional_id: string | null }
  resolucion: "cliente" | "proveedor" | "parcial"
  nota: string
  base: number
  montoReembolso: number
}) {
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("titulo")
    .eq("id", disputa.trabajo_id)
    .maybeSingle()
  const titulo = trabajo?.titulo ?? "el trabajo"
  const motivo = nota?.trim() ? ` Motivo: ${nota.trim()}` : ""

  let mensajeCliente: string
  let mensajeProfesional: string

  // Sin transacción de escrow (base 0) no hay cifras fiables que comunicar:
  // se avisa del sentido de la resolución sin importes.
  const sinImportes = base <= 0

  if (resolucion === "proveedor") {
    mensajeCliente = `La disputa de "${titulo}" se ha resuelto a favor del profesional, así que se le ha liberado el pago y no hay reembolso.${motivo}`
    mensajeProfesional = sinImportes
      ? `La disputa de "${titulo}" se ha resuelto a tu favor: se ha liberado tu cobro.${motivo}`
      : `La disputa de "${titulo}" se ha resuelto a tu favor: se ha liberado tu cobro de ${formatearPrecio(
          calcularPagoProveedor(base).pagoNeto,
        )} netos.${motivo}`
  } else if (resolucion === "cliente") {
    mensajeCliente = sinImportes
      ? `La disputa de "${titulo}" se ha resuelto a tu favor.${motivo}`
      : `La disputa de "${titulo}" se ha resuelto a tu favor: te hemos reembolsado ${formatearPrecio(
          montoReembolso,
        )}.${motivo}`
    mensajeProfesional = `La disputa de "${titulo}" se ha resuelto a favor del cliente, así que se le ha reembolsado el importe y el trabajo no se abonará.${motivo}`
  } else {
    mensajeCliente = sinImportes
      ? `La disputa de "${titulo}" se ha resuelto de forma parcial.${motivo}`
      : `La disputa de "${titulo}" se ha resuelto de forma parcial: te hemos reembolsado ${formatearPrecio(
          montoReembolso,
        )}.${motivo}`
    mensajeProfesional = sinImportes
      ? `La disputa de "${titulo}" se ha resuelto de forma parcial.${motivo}`
      : `La disputa de "${titulo}" se ha resuelto de forma parcial: se han reembolsado ${formatearPrecio(
          montoReembolso,
        )} al cliente sobre un precio acordado de ${formatearPrecio(base)}.${motivo}`
  }

  const { crearNotificacion } = await import("./notificaciones")
  if (disputa.cliente_id) {
    await crearNotificacion({
      usuarioId: disputa.cliente_id,
      tipo: "disputa_resuelta",
      titulo: "Disputa resuelta",
      mensaje: mensajeCliente,
      link: "/mis-solicitudes",
    })
  }
  if (disputa.profesional_id) {
    await crearNotificacion({
      usuarioId: disputa.profesional_id,
      tipo: "disputa_resuelta",
      titulo: "Disputa resuelta",
      mensaje: mensajeProfesional,
      link: "/mis-trabajos",
    })
  }
}
