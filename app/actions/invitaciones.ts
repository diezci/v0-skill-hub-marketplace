"use server"

import { createClient } from "@/lib/supabase/server"

// Function to find matching professionals and send invitations
export async function buscarYEnviarInvitaciones(solicitudId: string) {
  const supabase = await createClient()

  // Get the solicitud details
  const { data: solicitud, error: solicitudError } = await supabase
    .from("solicitudes")
    .select("*, categorias(*)")
    .eq("id", solicitudId)
    .single()

  if (solicitudError || !solicitud) {
    console.error("[v0] Error fetching solicitud:", solicitudError)
    return { error: "Solicitud not found" }
  }

  // Find professionals in the same category
  const { data: profesionales, error: profError } = await supabase
    .from("profiles")
    .select("id, nombre, email, habilidades")
    .eq("tipo_usuario", "profesional")
    .eq("categoria_id", solicitud.categoria_id)
    .limit(10)

  if (profError) {
    console.error("[v0] Error fetching professionals:", profError)
    return { error: profError.message }
  }

  if (!profesionales || profesionales.length === 0) {
    return { message: "No matching professionals found" }
  }

  // Create invitations for each professional
  const invitaciones = profesionales.map((prof) => ({
    solicitud_id: solicitudId,
    profesional_id: prof.id,
    estado: "pendiente",
    created_at: new Date().toISOString(),
  }))

  const { error: insertError } = await supabase
    .from("invitaciones")
    .insert(invitaciones)

  if (insertError) {
    console.error("[v0] Error creating invitations:", insertError)
    return { error: insertError.message }
  }

  return { 
    success: true, 
    count: profesionales.length,
    message: "Invitaciones enviadas a " + profesionales.length + " profesionales"
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
    console.error("[v0] Error fetching invitations:", error)
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
    console.error("[v0] Error updating invitation:", error)
    return { error: error.message }
  }

  return { success: true }
}
