"use server"

import { textoServidor } from "@/lib/i18n-servidor"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { errorContenidoProhibido } from "@/lib/moderacion"

export async function crearResena(data: {
  trabajo_id: string
  profesional_id: string
  rating: number
  comentario: string
  tipo_proyecto?: string
}) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos") }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }
  }

  const errorModeracion = errorContenidoProhibido(data.comentario, data.tipo_proyecto)
  if (errorModeracion) return { error: await textoServidor(errorModeracion) }

  if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5 || !data.comentario?.trim()) {
    return { error: await textoServidor("Indica una puntuación entera entre 1 y 5 y un comentario") }
  }

  // La base de datos valida el operador vigente y el profesional contratado.
  // Reseña, vínculo y reputación se confirman o revierten juntos, incluso ante
  // un reintento simultáneo o una escritura directa a la tabla.
  const { data: resena, error } = await supabase.rpc("crear_resena_trabajo", {
    p_trabajo_id: data.trabajo_id,
    p_profesional_id: data.profesional_id,
    p_rating: data.rating,
    p_comentario: data.comentario.trim(),
    p_tipo_proyecto: data.tipo_proyecto?.trim() || null,
  })

  if (error) return { error: await textoServidor(error.message) }
  if (!resena?.id) return { error: await textoServidor("No se pudo guardar la reseña. Inténtalo de nuevo.") }

  revalidatePath("/mis-solicitudes")
  revalidatePath(`/profesional/${data.profesional_id}`)
  return { data: resena }
}

// Busca el trabajo completado más reciente entre el usuario actual (cliente) y
// este profesional que aún no tenga reseña: es el que se puede valorar desde
// el botón "Valorar" del chat.
export async function obtenerTrabajoValorable(profesionalId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos") }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { codigo: "NO_AUTENTICADO", error: await textoServidor("No autenticado") }

  // Incluye al operador actual de un contrato empresarial y excluye al
  // autor original cuando su acceso se ha revocado.
  const { data: trabajos, error } = await supabase.rpc("trabajos_valorables_profesional", {
    p_profesional_id: profesionalId,
  })
  if (error) return { error: await textoServidor(error.message) }

  const sinResena = (trabajos || []).find((t: { id: string; titulo: string; review_cliente_id: string | null; estado: string }) => !t.review_cliente_id)
  if (sinResena) return { data: sinResena }

  if ((trabajos || []).length > 0) {
    return { error: await textoServidor("Ya has valorado todos los trabajos completados con este profesional.") }
  }
  return { error: await textoServidor("Solo puedes valorar a un profesional cuando hayáis completado un trabajo juntos.") }
}

export async function obtenerResenasProfesional(profesionalId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: await textoServidor("No se pudo conectar con la base de datos"), data: [] }

  const { data: resenas, error } = await supabase
    .from("reseñas")
    .select("id, rating, comentario, tipo_proyecto, created_at, votos_utiles, autor_id")
    .eq("profesional_id", profesionalId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: await textoServidor(error.message), data: [] }
  }

  if (resenas && resenas.length > 0) {
    const autorIds = [...new Set(resenas.map(r => r.autor_id))]
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, nombre, apellido, foto_perfil")
      .in("id", autorIds)

    const perfilesMap = new Map((perfiles || []).map(p => [p.id, p]))

    return {
      data: resenas.map(r => ({
        ...r,
        autor: perfilesMap.get(r.autor_id) || { nombre: "Usuario", apellido: "" },
      })),
    }
  }

  return { data: [] }
}
