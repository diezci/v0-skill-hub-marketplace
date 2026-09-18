"use server"

import { construirLinkNotificacion } from "@/lib/notificaciones-contexto"
import { textoServidor } from "@/lib/i18n-servidor"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { cerrarCheckoutsPendientes, enviarAvisosExternos, liquidarPagoReclamado } from "@/lib/flujo-pagos"

// Comprueba que el usuario actual es un empleado de Diime (es_admin).
async function requireAdmin(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado" as const) }

  const { data: profile } = await supabase
    .from("profiles")
    .select("es_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile?.es_admin) return { codigo: "SIN_PERMISO", error: await textoServidor("No tienes permiso para acceder al panel de disputas" as const) }
  return { user }
}

export async function crearDisputa(data: {
  trabajo_id: string
  motivo: string
  avisoOtraParte?: { titulo: string; mensaje: string }
}) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos.") }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  const admin = createAdminClient()
  if (!admin) return { error: await textoServidor("La configuración segura del servidor no está disponible") }
  const motivo = data.motivo?.trim()
  if (!motivo) return { error: await textoServidor("Describe el motivo de la disputa.") }
  try {
    const { error: bloqueoError } = await admin.rpc("diime_bloquear_checkout", {
      p_trabajo: data.trabajo_id, p_actor: user.id,
    })
    if (bloqueoError) throw bloqueoError
    await cerrarCheckoutsPendientes(admin, data.trabajo_id)
    const { data: disputa, error } = await admin.rpc("diime_abrir_disputa", {
      p_trabajo: data.trabajo_id, p_actor: user.id, p_motivo: motivo,
    })
    if (error) throw error
    const { data: trabajoAviso } = await supabase.from("trabajos").select("titulo").eq("id", data.trabajo_id).maybeSingle()
    const otraParteId = user.id === disputa.cliente_id ? disputa.profesional_id : disputa.cliente_id
    const { crearNotificacion } = await import("@/lib/notificaciones")
    await crearNotificacion({
      usuarioId: otraParteId,
      tipo: "disputa_abierta",
      titulo: data.avisoOtraParte?.titulo || "Se ha abierto una disputa",
      metadata: { titulo_trabajo: trabajoAviso?.titulo },
      mensaje: data.avisoOtraParte?.mensaje || (disputa.escrow_id
        ? "El trabajo está en disputa. La transferencia queda bloqueada mientras Diime revisa las pruebas."
        : "Se ha abierto una mediación sobre la cancelación. No se ha realizado ningún pago."),
      link: construirLinkNotificacion({ seccion: otraParteId === disputa.cliente_id ? "/mis-solicitudes" : "/mis-trabajos", trabajoId: data.trabajo_id, aspecto: "disputa" }),
    })
    revalidatePath("/admin/disputas")
    revalidatePath("/mis-trabajos")
    revalidatePath("/mis-solicitudes")
    return { data: disputa }
  } catch (error: any) {
    return { error: await textoServidor(error.message || "No se pudo abrir la disputa.") }
  }
}

// El cliente rechaza una entrega porque, según él, no cumple lo acordado.
// NO se reembolsa automáticamente: se abre una disputa para que el equipo de
// Diime decida según las pruebas adjuntadas y los términos acordados. El pago
// queda retenido en custodia mientras tanto.
export async function rechazarEntrega(trabajoId: string, motivo: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos.") }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  const razon = motivo?.trim()
  if (!razon) return { error: await textoServidor("Explica por qué la entrega no cumple lo acordado.") }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("cliente_id, profesional_id, estado, titulo")
    .eq("id", trabajoId)
    .maybeSingle()

  if (!trabajo || trabajo.cliente_id !== user.id) {
    return { error: await textoServidor("No tienes permiso para rechazar la entrega de este trabajo.") }
  }
  if (trabajo.estado !== "entregado") {
    return { error: await textoServidor("Solo puedes rechazar una entrega que el profesional haya marcado como entregada.") }
  }

  // Abrir la disputa reutiliza toda la lógica: congela los fondos (escrow a
  // "disputa"), pone el trabajo "en_disputa", crea el registro para el admin y
  // avisa al profesional con el mensaje específico de rechazo de entrega.
  const res = await crearDisputa({
    trabajo_id: trabajoId,
    motivo: `Entrega rechazada por el cliente. Motivo: ${razon}`,
    avisoOtraParte: {
      titulo: "El cliente ha rechazado tu entrega",
      mensaje: `El cliente considera que "${trabajo.titulo ?? "el trabajo"}" no cumple lo acordado. La transferencia sigue bloqueada y el equipo de Diime decidirá según las pruebas y los términos. Motivo: ${razon}`,
    },
  })
  if (res.error) return { error: await textoServidor(res.error) }

  // Deja constancia en el historial del trabajo (el aviso al profesional ya lo
  // ha enviado crearDisputa mediante avisoOtraParte).
  await supabase.from("actualizaciones_trabajo").insert({
    trabajo_id: trabajoId,
    usuario_id: user.id,
    tipo: "disputa",
    mensaje: `El cliente ha rechazado la entrega. El equipo de Diime decidirá según las pruebas y los términos acordados. Motivo: ${razon}`,
    progreso: 100,
  })

  return { data: res.data }
}

// Disputas del usuario actual (donde es cliente o profesional), para que siga
// las que ha abierto él y las que la otra parte ha abierto contra él.
export async function obtenerMisDisputas() {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos.") }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado"), data: [] }

  const { data, error } = await supabase
    .from("disputas")
    .select("id, trabajo_id, cliente_id, profesional_id, tipo, motivo, estado, resolucion, resultado, fecha_resolucion, created_at")
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .order("created_at", { ascending: false })

  if (error) {
    if (error.code === "42P01") return { data: [] }
    return { error: await textoServidor(error.message), data: [] }
  }

  // Enriquecer con el título del trabajo y el nombre de la otra parte.
  const otrosIds = [
    ...new Set(
      (data || [])
        .map((d: any) => (d.cliente_id === user.id ? d.profesional_id : d.cliente_id))
        .filter((x): x is string => !!x),
    ),
  ]
  const perfiles: Record<string, any> = {}
  if (otrosIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, nombre, apellido").in("id", otrosIds)
    for (const p of profs || []) perfiles[p.id] = p
  }

  const enriquecidas = await Promise.all(
    (data || []).map(async (d: any) => {
      const { data: trabajo } = await supabase
        .from("trabajos")
        .select(
          "titulo, estado, cancelacion_solicitada_por, cancelacion_adjuntos_solicitante, cancelacion_respuesta_razon, cancelacion_adjuntos_respuesta",
        )
        .eq("id", d.trabajo_id)
        .maybeSingle()
      const otraParteId = d.cliente_id === user.id ? d.profesional_id : d.cliente_id
      // tipo = quién la abrió ("cliente" o "proveedor"). La abrió el usuario
      // actual si su rol en el trabajo coincide con el tipo de la disputa.
      const miRol = d.cliente_id === user.id ? "cliente" : "proveedor"
      return {
        ...d,
        trabajo_titulo: trabajo?.titulo ?? "Trabajo",
        trabajo_estado: trabajo?.estado ?? null,
        cancelacion_solicitada_por: trabajo?.cancelacion_solicitada_por ?? null,
        cancelacion_respuesta_razon: trabajo?.cancelacion_respuesta_razon ?? null,
        cancelacion_adjuntos_solicitante: trabajo?.cancelacion_adjuntos_solicitante ?? [],
        cancelacion_adjuntos_respuesta: trabajo?.cancelacion_adjuntos_respuesta ?? [],
        la_abri_yo: d.tipo === miRol,
        // Mi papel EN ESTA disputa. Es imprescindible: el mismo fallo se lee al
        // revés según seas cliente o profesional, y hasta ahora la pantalla lo
        // deducía de en qué sección estabas, no de la disputa.
        soy_cliente: d.cliente_id === user.id,
        otra_parte: perfiles[otraParteId] || null,
      }
    }),
  )

  return { data: enriquecidas }
}

// Retirar una disputa que abrió el propio usuario, mientras siga abierta. La
// validación (autor + estado) y la restauración del trabajo/escrow las hace la
// RPC restringida diime_retirar_disputa; aquí solo avisamos a la otra parte
// y a los admins de que ya no hay nada que revisar.
export async function retirarDisputa(disputaId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar") }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  // Datos para las notificaciones antes de retirarla.
  const { data: disputa } = await supabase
    .from("disputas")
    .select("trabajo_id, cliente_id, profesional_id, tipo")
    .eq("id", disputaId)
    .maybeSingle()

  const admin = createAdminClient()
  if (!admin) return { error: await textoServidor("La configuración segura del servidor no está disponible") }
  const { data: resultado, error } = await admin.rpc("diime_retirar_disputa", { p_disputa: disputaId, p_actor: user.id })
  if (error) return { error: await textoServidor(error.message) }
  if (resultado !== "ok") {
    const motivos: Record<string, string> = {
      no_encontrada: "La disputa no existe.",
      no_abierta: "Esta disputa ya no está abierta: no se puede retirar.",
      no_autorizado: "Solo quien abrió la disputa puede retirarla.",
      contracargo: "Un contracargo bancario debe gestionarse en Stripe y no puede retirarse aquí.",
      liquidacion_iniciada: "Diime ya ha iniciado la resolución económica. No se puede retirar la disputa.",
      requiere_conciliacion: "Este expediente necesita conciliar su pago antes de poder retirarse.",
    }
    return { error: await textoServidor(motivos[resultado as string] || "No se ha podido retirar la disputa.") }
  }

  if (disputa) {
    const { data: trabajo } = await supabase
      .from("trabajos")
      .select("titulo")
      .eq("id", disputa.trabajo_id)
      .maybeSingle()
    const titulo = trabajo?.titulo ?? "un trabajo"
    const otraParteId = user.id === disputa.cliente_id ? disputa.profesional_id : disputa.cliente_id
    const { crearNotificacion } = await import("@/lib/notificaciones")
    if (otraParteId) {
      await crearNotificacion({
        usuarioId: otraParteId,
        tipo: "disputa_retirada",
        titulo: "Disputa retirada",
        metadata: { titulo_trabajo: titulo },
        mensaje: `Se ha retirado la disputa sobre "${titulo}". El trabajo continúa con normalidad.`,
        link: construirLinkNotificacion({ seccion: otraParteId === disputa.cliente_id ? "/mis-solicitudes" : "/mis-trabajos", trabajoId: disputa.trabajo_id, aspecto: "disputa" }),
      })
    }
    const { data: admins } = await supabase.from("profiles").select("id").eq("es_admin", true)
    if (admins?.length) {
      await admin.from("notificaciones").insert(
        admins.map((a: { id: string }) => ({
          usuario_id: a.id,
          tipo: "disputa_retirada_admin",
          titulo: "Disputa retirada",
          metadata: { titulo_trabajo: titulo, trabajo_id: disputa.trabajo_id, disputa_id: disputaId },
          mensaje: `Se ha retirado la disputa sobre "${titulo}"; ya no requiere revisión.`,
          link: construirLinkNotificacion({ seccion: "/admin/disputas", trabajoId: disputa.trabajo_id, aspecto: "disputa_retirada" }),
          leida: false,
        })),
      )
    }
  }

  revalidatePath("/admin/disputas")
  revalidatePath("/mis-trabajos")
  revalidatePath("/mis-solicitudes")
  return { success: true }
}

// Lista de disputas para el panel admin (con datos básicos del trabajo y partes).
export async function obtenerDisputas() {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos.") }
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return { codigo: auth.codigo, error: await textoServidor(auth.error) }

  const { data: disputas, error } = await supabase
    .from("disputas")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return { error: await textoServidor(error.message) }

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
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos.") }
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return { codigo: auth.codigo, error: await textoServidor(auth.error) }

  const { data: disputa, error } = await supabase
    .from("disputas")
    .select("*")
    .eq("id", disputaId)
    .maybeSingle()
  if (error) return { error: await textoServidor(error.message) }
  if (!disputa) return { error: await textoServidor("Disputa no encontrada") }

  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("*")
    .eq("id", disputa.trabajo_id)
    .maybeSingle()

  const { data: clienteBase } = await supabase
    .from("profiles")
    .select("id, nombre, apellido, foto_perfil, ubicacion")
    .eq("id", disputa.cliente_id)
    .maybeSingle()

  const { data: profesionalBase } = await supabase
    .from("profiles")
    .select("id, nombre, apellido, foto_perfil, ubicacion")
    .eq("id", disputa.profesional_id)
    .maybeSingle()

  // Contacto de ambas partes: para resolver una disputa hace falta, pero ya no
  // se lee de `profiles` (ver scripts/043). La RPC solo responde a las partes
  // del trabajo y a un admin, que son quienes abren esta vista.
  const { data: contactos } = await supabase.rpc("contacto_perfiles", {
    p_ids: [disputa.cliente_id, disputa.profesional_id],
  })
  const conContacto = (base: any) => {
    if (!base) return base
    const c = (contactos as any[] | null)?.find((x) => x.id === base.id)
    return { ...base, email: c?.email ?? null, telefono: c?.telefono ?? null }
  }
  const cliente = conContacto(clienteBase)
  const profesional = conContacto(profesionalBase)

  const { data: escrow } = disputa.escrow_id
    ? await supabase.from("transacciones_escrow").select("*").eq("id", disputa.escrow_id).maybeSingle()
    : { data: null }

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
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos.") }
  const auth = await requireAdmin(supabase)
  if ("error" in auth) return { codigo: auth.codigo, error: await textoServidor(auth.error) }
  const admin = createAdminClient()
  if (!admin) return { error: await textoServidor("La configuración segura del servidor no está disponible") }
  if (!data.nota?.trim()) return { error: await textoServidor("Escribe la justificación de la resolución.") }
  const { data: disputa, error: readError } = await admin.from("disputas").select("*")
    .eq("id", data.disputa_id).maybeSingle()
  if (readError || !disputa) return { error: await textoServidor("Disputa no encontrada") }
  if (disputa.origen !== "usuario" || disputa.stripe_disputa_id) {
    return { error: await textoServidor("Este expediente contiene un contracargo bancario. Debe conciliarse primero en Stripe.") }
  }
  if (disputa.estado === "retirada") return { error: await textoServidor("La disputa fue retirada.") }
  if (!["abierta", "en_revision", "resuelta"].includes(disputa.estado)) return { error: await textoServidor("La disputa no admite esta resolución.") }
  try {
    if (!disputa.escrow_id) {
      await cerrarCheckoutsPendientes(admin, disputa.trabajo_id)
      const { data: mediacion, error } = await admin.rpc("diime_resolver_mediacion", {
        p_disputa: disputa.id, p_actor: auth.user.id, p_resolucion: data.resolucion, p_nota: data.nota,
      })
      if (error) throw error
      await enviarAvisosExternos(mediacion.avisos)
    } else {
      const { data: escrow, error } = await admin.from("transacciones_escrow").select("*")
        .eq("id", disputa.escrow_id).single()
      if (error) throw error
      const base = Number(escrow.monto_base)
      const montoReembolso = data.resolucion === "cliente" ? base
        : data.resolucion === "proveedor" ? 0 : Number(data.monto_reembolso)
      if (!Number.isFinite(montoReembolso)) return { error: await textoServidor("Introduce un reembolso válido.") }
      const { data: reclamada, error: claimError } = await admin.rpc("diime_reclamar_liquidacion", {
        p_escrow: escrow.id, p_actor: auth.user.id, p_tipo: "disputa", p_reembolso: montoReembolso,
        p_disputa: disputa.id, p_resolucion: data.resolucion, p_nota: data.nota,
      })
      if (claimError) throw claimError
      await liquidarPagoReclamado(admin, reclamada)
    }
    revalidatePath("/admin/disputas")
    revalidatePath("/mis-trabajos")
    revalidatePath("/mis-solicitudes")
    return { data: { ok: true } }
  } catch (error: any) {
    return { error: await textoServidor(error.message || "No se pudo resolver la disputa. El reparto iniciado se conserva para reintentarlo.") }
  }
}
