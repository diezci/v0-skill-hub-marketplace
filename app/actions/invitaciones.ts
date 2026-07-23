"use server"

import { createClient } from "@/lib/supabase/server"

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}

// La ubicación de una demanda es una provincia del listado (lib/provincias),
// pero en demandas antiguas puede venir con el municipio o con otro formato,
// así que se compara de forma laxa en vez de por igualdad exacta.
function cubreLaZona(ubicacionDemanda: string | null, provincias: string[] | null) {
  if (!provincias || provincias.length === 0) return false
  const ubi = normalizar(ubicacionDemanda || "")
  if (!ubi) return true // demanda sin ubicación: no se descarta a nadie por zona
  return provincias.some((p) => {
    const prov = normalizar(p)
    return ubi.includes(prov) || prov.includes(ubi)
  })
}

// Al publicarse una demanda, avisa (campana del navbar) a los profesionales que
// han declarado trabajar en esa subcategoría Y cubrir esa provincia.
//
// Antes esto se decidía por coincidencia de texto entre la categoría y el
// título/habilidades del profesional (substring o raíz de 5 letras), que
// avisaba a quien no tocaba, dejaba fuera a quien sí, y no miraba la zona. Los
// profesionales que aún no hayan elegido categorías no reciben avisos: es el
// precio de que el aviso sea fiable, y la app se lo reclama de forma visible.
export async function buscarYEnviarInvitaciones(solicitudId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: solicitud, error: solicitudError } = await supabase
    .from("solicitudes")
    .select("id, titulo, ubicacion, categoria_id, categorias(nombre)")
    .eq("id", solicitudId)
    .maybeSingle()

  if (solicitudError || !solicitud) {
    return { error: "Solicitud no encontrada" }
  }

  const categoriaNombre = (solicitud as any).categorias?.nombre as string | undefined
  if (!categoriaNombre) {
    return { message: "La demanda no tiene categoría; no se notifica a nadie" }
  }

  // Filtro por categoría en la propia consulta (índice GIN sobre el array);
  // la zona se comprueba después porque admite coincidencia laxa.
  const { data: profesionales, error: profError } = await supabase
    .from("profesionales")
    .select("id, provincias_cobertura")
    .contains("categorias_interes", [categoriaNombre])

  if (profError) {
    return { error: profError.message }
  }
  if (!profesionales || profesionales.length === 0) {
    return { message: "Ningún profesional ha declarado trabajar en esta categoría" }
  }

  const destinatarios = profesionales
    .filter((p) => p.id !== user.id)
    .filter((p) => cubreLaZona(solicitud.ubicacion, p.provincias_cobertura as string[] | null))

  if (destinatarios.length === 0) {
    return { message: "Sin profesionales que cubran esta categoría y zona" }
  }

  const zona = solicitud.ubicacion ? ` en ${solicitud.ubicacion}` : ""
  const { error: insertError } = await supabase.from("notificaciones").insert(
    destinatarios.map((p) => ({
      usuario_id: p.id,
      tipo: "demanda_nueva",
      titulo: "Nueva demanda en tu área",
      mensaje: `Se ha publicado "${solicitud.titulo}" (${categoriaNombre})${zona}. Échale un vistazo y envía tu oferta.`,
      link: "/demandas",
      leida: false,
    })),
  )

  if (insertError) {
    return { error: insertError.message }
  }

  return {
    success: true,
    count: destinatarios.length,
    message: `Se ha notificado a ${destinatarios.length} profesionales`,
  }
}

// Get invitations for a professional
export async function getInvitacionesProfesional(profesionalId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("invitaciones")
    .select("*, solicitudes(id, titulo, descripcion, presupuesto_min, presupuesto_max, ubicacion, urgencia, categorias(nombre))")
    .eq("profesional_id", profesionalId)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

// Accept or reject an invitation
export async function responderInvitacion(
  invitacionId: string, 
  respuesta: "aceptada" | "rechazada"
) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("invitaciones")
    .update({ 
      estado: respuesta,
      updated_at: new Date().toISOString()
    })
    .eq("id", invitacionId)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
