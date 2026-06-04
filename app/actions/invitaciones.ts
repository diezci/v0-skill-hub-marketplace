"use server"

import { createClient } from "@/lib/supabase/server"

// When a new solicitud is published, notify available professionals so they can
// send an offer. This uses the real "notificaciones" table (the old version
// referenced columns that don't exist and silently failed).
export async function buscarYEnviarInvitaciones(solicitudId: string) {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  // Get the solicitud details
  const { data: solicitud } = await supabase
    .from("solicitudes")
    .select("id, titulo, cliente_id")
    .eq("id", solicitudId)
    .single()

  if (!solicitud) {
    return { error: "Solicitud no encontrada" }
  }

  // Find available professionals (limited to avoid spamming everyone)
  const { data: profesionales } = await supabase
    .from("profesionales")
    .select("id")
    .eq("disponible", true)
    .limit(25)

  if (!profesionales || profesionales.length === 0) {
    return { message: "No hay profesionales disponibles" }
  }

  const notificaciones = profesionales
    .filter((p) => p.id !== solicitud.cliente_id)
    .map((p) => ({
      usuario_id: p.id,
      tipo: "nueva_solicitud",
      titulo: "Nueva solicitud disponible",
      mensaje: `Se ha publicado una nueva solicitud: ${solicitud.titulo}`,
      link: "/demandas",
      leida: false,
    }))

  if (notificaciones.length === 0) {
    return { message: "Sin destinatarios" }
  }

  const { error: insertError } = await supabase.from("notificaciones").insert(notificaciones)

  if (insertError) {
    return { error: insertError.message }
  }

  return {
    success: true,
    count: notificaciones.length,
  }
}
