"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { buscarYEnviarInvitaciones } from "./invitaciones"
import { errorContenidoProhibido } from "@/lib/moderacion"

export async function crearSolicitud(formData: {
  titulo: string
  descripcion: string
  categoria_id: string // This is actually the category name
  ubicacion: string
  presupuesto_min?: number
  presupuesto_max?: number
  urgencia: string
  archivos_adjuntos?: string[]
}) {
  const supabase = await createClient()
  if (!supabase) {
    return { error: "El servidor no está configurado correctamente. Falta la conexión con Supabase." }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado. Por favor inicia sesión para publicar un proyecto." }
  }

  const errorModeracion = errorContenidoProhibido(formData.titulo, formData.descripcion)
  if (errorModeracion) return { error: errorModeracion }

  let categoria_uuid = null
  if (formData.categoria_id) {
    // Case-insensitive lookup so "Reformas integrales" matches "Reformas Integrales", etc.
    const { data: categoria } = await supabase
      .from("categorias")
      .select("id")
      .ilike("nombre", formData.categoria_id)
      .maybeSingle()

    if (categoria) {
      categoria_uuid = categoria.id
    } else {
      // Create category if it doesn't exist
      const { data: newCategoria } = await supabase
        .from("categorias")
        .insert({ nombre: formData.categoria_id })
        .select("id")
        .single()
      categoria_uuid = newCategoria?.id
    }
  }

  const { data, error } = await supabase
    .from("solicitudes")
    .insert({
      cliente_id: user.id,
      titulo: formData.titulo,
      descripcion: formData.descripcion,
      categoria_id: categoria_uuid,
      ubicacion: formData.ubicacion,
      presupuesto_min: formData.presupuesto_min,
      presupuesto_max: formData.presupuesto_max,
      urgencia: formData.urgencia,
      archivos: formData.archivos_adjuntos || [],
      estado: "abierta",
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] Error creating solicitud:", error)
    return { error: error.message }
  }

  console.log("[v0] Solicitud created successfully:", data)

  // Trigger AI provider finder in the background (non-blocking)
  buscarYEnviarInvitaciones(data.id).catch(() => {
    // Silent fail for background task
  })

  revalidatePath("/")
  revalidatePath("/mis-solicitudes")
  revalidatePath("/demandas")
  return { data }
}

// Helper: fetch categorias by id and return a lookup map
async function obtenerMapaCategorias(supabase: any, categoriaIds: (string | null)[]) {
  const ids = [...new Set(categoriaIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return {} as Record<string, { nombre: string; color: string | null }>

  const { data } = await supabase.from("categorias").select("id, nombre, color").in("id", ids)
  const mapa: Record<string, { nombre: string; color: string | null }> = {}
  for (const cat of data || []) {
    mapa[cat.id] = { nombre: cat.nombre, color: cat.color }
  }
  return mapa
}

// Helper: fetch profiles by id and return a lookup map
async function obtenerMapaPerfiles(supabase: any, clienteIds: (string | null)[]) {
  const ids = [...new Set(clienteIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return {} as Record<string, any>

  const { data } = await supabase
    .from("profiles")
    // Sin teléfono ni email: estas fichas acompañan a listados de demandas que
    // ve cualquiera, y el contacto del cliente no tiene por qué viajar ahí.
    .select("id, nombre, apellido, ubicacion, foto_perfil")
    .in("id", ids)
  const mapa: Record<string, any> = {}
  for (const p of data || []) {
    mapa[p.id] = p
  }
  return mapa
}

export async function obtenerSolicitudes(filtros?: {
  categoria?: string
  estado?: string
}) {
  const supabase = await createClient()

  let query = supabase.from("solicitudes").select("*").order("created_at", { ascending: false })

  if (filtros?.categoria) {
    query = query.eq("categoria_id", filtros.categoria)
  }

  if (filtros?.estado) {
    query = query.eq("estado", filtros.estado)
  }

  const { data, error } = await query

  if (error) {
    console.error("[v0] Error en obtenerSolicitudes:", error)
    return { error: error.message }
  }

  const mapaCategorias = await obtenerMapaCategorias(
    supabase,
    (data || []).map((s: any) => s.categoria_id),
  )
  const mapaPerfiles = await obtenerMapaPerfiles(
    supabase,
    (data || []).map((s: any) => s.cliente_id),
  )

  const enriquecidas = (data || []).map((s: any) => ({
    ...s,
    categoria: s.categoria_id ? mapaCategorias[s.categoria_id] || null : null,
    cliente: s.cliente_id ? mapaPerfiles[s.cliente_id] || null : null,
  }))

  return { data: enriquecidas }
}

export async function actualizarSolicitud(
  id: string,
  campos: {
    titulo?: string
    descripcion?: string
    ubicacion?: string
    // null = borrar la cifra; undefined = no tocarla. La diferencia importa:
    // ver el comentario del update.
    presupuesto_min?: number | null
    presupuesto_max?: number | null
    urgencia?: string
  },
) {
  const supabase = await createClient()
  if (!supabase) return { error: "Conexión con la base de datos no disponible." }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const errorModeracion = errorContenidoProhibido(campos.titulo, campos.descripcion)
  if (errorModeracion) return { error: errorModeracion }

  // Solo se puede editar una demanda propia que siga abierta (sin trabajo en curso).
  const { data: solicitud } = await supabase
    .from("solicitudes")
    .select("cliente_id, estado")
    .eq("id", id)
    .maybeSingle()

  if (!solicitud || solicitud.cliente_id !== user.id) {
    return { error: "No tienes permiso para editar esta demanda." }
  }
  if (solicitud.estado !== "abierta") {
    return { error: "Solo puedes editar demandas que sigan abiertas (sin ofertas aceptadas)." }
  }

  // Solo se mandan los campos que vienen. Antes se mandaban todos, y un
  // `undefined` desaparece al serializar el JSON: la columna nunca llegaba a
  // tocarse. Por eso vaciar el presupuesto mínimo no lo borraba —la demanda
  // seguía enseñando el rango viejo— y no había forma de pasar de un rango a
  // una sola cifra. Ahora `null` borra y `undefined` deja como estaba.
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const clave of ["titulo", "descripcion", "ubicacion", "presupuesto_min", "presupuesto_max", "urgencia"] as const) {
    if (campos[clave] !== undefined) cambios[clave] = campos[clave]
  }

  const { data, error } = await supabase
    .from("solicitudes")
    .update(cambios)
    .eq("id", id)
    .eq("cliente_id", user.id)
    .select()
    .single()

  if (error) return { error: error.message }

  // Quien ya ha pujado lo hizo sobre otras condiciones: si cambian el precio,
  // el plazo o el sitio, tiene que poder revisar su oferta.
  await avisarAQuienHaPujado(supabase, {
    solicitudId: id,
    tipo: "demanda_actualizada",
    titulo: "Han cambiado una demanda en la que pujaste",
    mensaje: `El cliente ha modificado "${data?.titulo ?? "una demanda"}". Revisa tu oferta por si ya no encaja con las nuevas condiciones.`,
    link: "/mis-ofertas",
  })

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-ofertas")
  revalidatePath("/demandas")
  return { data }
}

// Avisa a los profesionales con una puja viva en una demanda. Se usa al editarla
// y al borrarla: en los dos casos han dedicado tiempo a preparar una oferta y se
// quedaban sin enterarse de nada.
async function avisarAQuienHaPujado(
  supabase: any,
  aviso: { solicitudId: string; tipo: string; titulo: string; mensaje: string; link: string },
) {
  const { data: ofertas } = await supabase
    .from("ofertas")
    .select("profesional_id")
    .eq("solicitud_id", aviso.solicitudId)
    .in("estado", ["pendiente", "enviada", "en_negociacion"])

  const destinatarios = [...new Set(((ofertas as any[] | null) || []).map((o) => o.profesional_id).filter(Boolean))]
  if (destinatarios.length === 0) return

  await supabase.from("notificaciones").insert(
    destinatarios.map((id) => ({
      usuario_id: id,
      tipo: aviso.tipo,
      titulo: aviso.titulo,
      mensaje: aviso.mensaje,
      link: aviso.link,
      leida: false,
    })),
  )

  // Alta masiva: no pasa por `crearNotificacion`, así que el correo va aquí.
  const { enviarAvisoPorEmail } = await import("@/lib/emails/enviar")
  for (const usuarioId of destinatarios) {
    await enviarAvisoPorEmail({ usuarioId, ...aviso })
  }
}

export async function eliminarSolicitud(id: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "Conexión con la base de datos no disponible." }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: solicitud } = await supabase
    .from("solicitudes")
    .select("cliente_id, estado, titulo")
    .eq("id", id)
    .maybeSingle()

  if (!solicitud || solicitud.cliente_id !== user.id) {
    return { error: "No tienes permiso para borrar esta demanda." }
  }
  if (solicitud.estado !== "abierta") {
    return { error: "No puedes borrar una demanda con un trabajo en curso." }
  }

  // El aviso va ANTES del borrado: `ofertas.solicitud_id` es ON DELETE CASCADE,
  // así que después ya no habría a quién avisar. Sin esto, la puja de un
  // profesional desaparecía de su lista sin explicación.
  await avisarAQuienHaPujado(supabase, {
    solicitudId: id,
    tipo: "demanda_retirada",
    titulo: "Han retirado una demanda en la que pujaste",
    mensaje: `El cliente ha borrado "${solicitud.titulo}", así que tu oferta ya no sigue adelante. Puedes seguir pujando en otras demandas.`,
    link: "/mis-ofertas",
  })

  const { error } = await supabase.from("solicitudes").delete().eq("id", id).eq("cliente_id", user.id)
  if (error) return { error: error.message }

  revalidatePath("/mis-solicitudes")
  revalidatePath("/mis-ofertas")
  revalidatePath("/demandas")
  return { success: true }
}

export async function obtenerMisSolicitudes() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  const { data, error } = await supabase
    .from("solicitudes")
    .select("*")
    .eq("cliente_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error en obtenerMisSolicitudes:", error)
    return { error: error.message }
  }

  const mapaCategorias = await obtenerMapaCategorias(
    supabase,
    (data || []).map((s: any) => s.categoria_id),
  )

  const enriquecidas = await Promise.all(
    (data || []).map(async (s: any) => {
      const { data: ofertas } = await supabase
        .from("ofertas")
        .select(
          "id, precio, tiempo_estimado, unidad_tiempo, descripcion, estado, created_at, profesional_id, archivos, materiales_incluidos, condiciones_pago",
        )
        .eq("solicitud_id", s.id)
      return {
        ...s,
        categoria: s.categoria_id ? mapaCategorias[s.categoria_id] || null : null,
        ofertas: ofertas || [],
      }
    }),
  )

  return { data: enriquecidas }
}

export async function obtenerSolicitudesAbiertas() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("solicitudes")
    .select("*")
    .eq("estado", "abierta")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error en obtenerSolicitudesAbiertas:", error)
    return { error: error.message }
  }

  const mapaCategorias = await obtenerMapaCategorias(
    supabase,
    (data || []).map((s: any) => s.categoria_id),
  )
  const mapaPerfiles = await obtenerMapaPerfiles(
    supabase,
    (data || []).map((s: any) => s.cliente_id),
  )

  // Cuántas pujas tiene cada demanda. Va por RPC porque la RLS de `ofertas`
  // solo deja ver las propias y las de las demandas de uno: contándolas con un
  // SELECT normal, un profesional veía "0 ofertas" en TODAS las demandas
  // ajenas, tuvieran las que tuvieran. La función solo devuelve el número.
  const { data: conteos } = await supabase.rpc("contar_ofertas_por_solicitud", {
    p_ids: (data || []).map((s: any) => s.id),
  })
  const totalPorSolicitud = new Map<string, number>(
    ((conteos as any[] | null) || []).map((c) => [c.solicitud_id, Number(c.total) || 0]),
  )

  const dataWithCounts = (data || []).map((solicitud: any) => {
    const perfil = solicitud.cliente_id ? mapaPerfiles[solicitud.cliente_id] : null
    return {
      ...solicitud,
      categoria: solicitud.categoria_id ? mapaCategorias[solicitud.categoria_id] || null : null,
      cliente: perfil,
      telefono: perfil?.telefono || "",
      email: perfil?.email || "",
      total_ofertas: totalPorSolicitud.get(solicitud.id) ?? 0,
    }
  })

  return { data: dataWithCounts }
}

export async function obtenerSolicitudesPorUsuario() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "No autenticado" }
  }

  // First get solicitudes
  const { data: solicitudes, error: solicitudesError } = await supabase
    .from("solicitudes")
    .select("*")
    .eq("cliente_id", user.id)
    .order("created_at", { ascending: false })

  if (solicitudesError) {
    console.error("[v0] Error fetching solicitudes:", solicitudesError)
    return { error: solicitudesError.message }
  }

  console.log("[v0] Found solicitudes for user:", solicitudes?.length || 0)

  const mapaCategorias = await obtenerMapaCategorias(
    supabase,
    (solicitudes || []).map((s: any) => s.categoria_id),
  )

  // Then get ofertas for each solicitud with professional info
  const dataWithOfertas = await Promise.all(
    solicitudes.map(async (solicitud: any) => {
      const { data: ofertas, error: ofertasError } = await supabase
        .from("ofertas")
        .select(`
          id,
          precio,
          tiempo_estimado,
          unidad_tiempo,
          descripcion,
          estado,
          created_at,
          profesional_id,
          archivos,
          materiales_incluidos,
          condiciones_pago
        `)
        .eq("solicitud_id", solicitud.id)

      if (ofertasError) {
        return { ...solicitud, ofertas: [] }
      }

      // Get professional profiles for each oferta
      const ofertasWithProfesional = await Promise.all(
        (ofertas || []).map(async (oferta: any) => {
          const { data: profesional, error: profesionalError } = await supabase
            .from("profesionales")
            .select("id, titulo, tarifa_por_hora, rating_promedio, total_reseñas")
            .eq("id", oferta.profesional_id)
            .single()

          if (profesionalError) {
            return { ...oferta, profesional: null }
          }

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("nombre, apellido, foto_perfil")
            .eq("id", oferta.profesional_id)
            .single()

          if (profileError) {
            return { ...oferta, profesional: profesional }
          }

          return {
            ...oferta,
            profesional: profesional
              ? {
                  ...profesional,
                  profiles: profile,
                }
              : null,
          }
        }),
      )

      // Get the active trabajo for this solicitud (if any) with its escrow,
      // professional info and updates so the "En Progreso" tab can render the
      // confirm/release/reject actions for real data (not only mock data).
      const { data: trabajoRow } = await supabase
        .from("trabajos")
        .select("*")
        .eq("solicitud_id", solicitud.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      let trabajo: any = null
      if (trabajoRow) {
        const { data: escrow } = await supabase
          .from("transacciones_escrow")
          .select("id, estado, monto")
          .eq("trabajo_id", trabajoRow.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        // La oferta aceptada del trabajo: sus adjuntos y condiciones deben
        // seguir visibles para el cliente después de la contratación.
        const { data: ofertaTrabajo } = trabajoRow.oferta_id
          ? await supabase
              .from("ofertas")
              .select("archivos, materiales_incluidos, condiciones_pago, descripcion")
              .eq("id", trabajoRow.oferta_id)
              .maybeSingle()
          : { data: null }

        const { data: profProfile } = await supabase
          .from("profiles")
          .select("nombre, apellido, foto_perfil")
          .eq("id", trabajoRow.profesional_id)
          .maybeSingle()

        const { data: profDatos } = await supabase
          .from("profesionales")
          .select("rating_promedio")
          .eq("id", trabajoRow.profesional_id)
          .maybeSingle()

        const { data: actualizaciones } = await supabase
          .from("actualizaciones_trabajo")
          .select("mensaje, progreso, created_at")
          .eq("trabajo_id", trabajoRow.id)
          .order("created_at", { ascending: true })

        trabajo = {
          ...trabajoRow,
          escrow: escrow || null,
          oferta: ofertaTrabajo || null,
          profesional: profProfile
            ? { ...profProfile, rating: profDatos?.rating_promedio ?? null }
            : null,
          actualizaciones: (actualizaciones || []).map((a: any) => ({
            fecha: a.created_at,
            mensaje: a.mensaje,
            progreso: a.progreso,
          })),
        }
      }

      return {
        ...solicitud,
        categoria: solicitud.categoria_id ? mapaCategorias[solicitud.categoria_id] || null : null,
        ofertas: ofertasWithProfesional,
        trabajo,
      }
    }),
  )

  return { data: dataWithOfertas }
}
