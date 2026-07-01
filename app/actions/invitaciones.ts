"use server"

import { createClient } from "@/lib/supabase/server"

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}

// Compara la categoría de la demanda contra el título/habilidades del
// profesional. No hay una taxonomía estricta que los relacione (las
// habilidades son texto libre), así que se usa una coincidencia por texto:
// substring en cualquier dirección, o la raíz de la categoría (p.ej.
// "fontan" cubre tanto "Fontanería" como "Fontanero").
function coincideConCategoria(categoriaNombre: string, titulo: string | null, habilidades: string[] | null) {
  const catNorm = normalizar(categoriaNombre)
  const catRaiz = catNorm.slice(0, Math.min(5, catNorm.length))
  const textos = [titulo || "", ...(habilidades || [])].map(normalizar).filter(Boolean)
  return textos.some((t) => t.includes(catNorm) || catNorm.includes(t) || t.includes(catRaiz))
}

// Al publicarse una demanda, notifica (campana del navbar) a los profesionales
// cuyo título/habilidades encajan con la categoría de la demanda, para que
// puedan pujar cuanto antes.
export async function buscarYEnviarInvitaciones(solicitudId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: solicitud, error: solicitudError } = await supabase
    .from("solicitudes")
    .select("id, titulo, categoria_id, categorias(nombre)")
    .eq("id", solicitudId)
    .maybeSingle()

  if (solicitudError || !solicitud) {
    return { error: "Solicitud no encontrada" }
  }

  const categoriaNombre = (solicitud as any).categorias?.nombre as string | undefined
  if (!categoriaNombre) {
    return { message: "La demanda no tiene categoría; no se notifica a nadie" }
  }

  const { data: profesionales, error: profError } = await supabase
    .from("profesionales")
    .select("id, titulo, habilidades")

  if (profError) {
    return { error: profError.message }
  }
  if (!profesionales || profesionales.length === 0) {
    return { message: "No hay profesionales registrados" }
  }

  const destinatarios = profesionales
    .filter((p) => p.id !== user.id)
    .filter((p) => coincideConCategoria(categoriaNombre, p.titulo, p.habilidades as string[] | null))

  if (destinatarios.length === 0) {
    return { message: "Sin profesionales que coincidan con esta categoría" }
  }

  const { error: insertError } = await supabase.from("notificaciones").insert(
    destinatarios.map((p) => ({
      usuario_id: p.id,
      tipo: "demanda_nueva",
      titulo: "Nueva demanda en tu área",
      mensaje: `Se ha publicado "${solicitud.titulo}" (${categoriaNombre}). Échale un vistazo y envía tu oferta.`,
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
