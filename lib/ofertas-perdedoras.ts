import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Cierra las pujas que no han sido elegidas cuando una contratación se consuma
 * (es decir, cuando el cliente paga), y avisa a cada profesional.
 *
 * Antes esto se hacía en dos sitios por separado —confirmarPagoEscrow y el
 * webhook de Stripe— y en ambos las ofertas pasaban a "rechazada" en silencio:
 * el profesional veía su puja cerrada sin haber recibido ninguna notificación.
 * El rechazo manual del cliente (rechazarOferta) sí avisaba, así que el aviso
 * dependía de por dónde se hubiera cerrado la demanda.
 *
 * La oferta ganadora no entra aquí: al aceptarla pasa a "aceptada" y este filtro
 * solo toca las que siguen en "pendiente".
 *
 * Recibe el cliente de Supabase porque los dos llamadores usan uno distinto: la
 * server action va con la sesión del cliente (que por RLS puede actualizar las
 * ofertas de sus propias solicitudes) y el webhook con el cliente admin, donde
 * no hay sesión de usuario.
 */
export async function rechazarYNotificarOfertasPerdedoras(
  // Acepta null porque el createClient del servidor viene tipado como
  // posiblemente nulo en este repo; en ese caso no hay nada que hacer.
  supabase: SupabaseClient | null,
  params: { solicitudId: string; tituloSolicitud?: string | null },
): Promise<{ notificadas: number }> {
  if (!supabase) return { notificadas: 0 }

  const { data: perdedoras } = await supabase
    .from("ofertas")
    .update({ estado: "rechazada", updated_at: new Date().toISOString() })
    .eq("solicitud_id", params.solicitudId)
    .eq("estado", "pendiente")
    .select("id, profesional_id")

  if (!perdedoras?.length) return { notificadas: 0 }

  const titulo = params.tituloSolicitud ?? "una demanda"
  const avisos = perdedoras
    .filter((oferta: any) => oferta.profesional_id)
    .map((oferta: any) => ({
      usuario_id: oferta.profesional_id,
      tipo: "oferta_rechazada",
      titulo: "Tu puja no ha sido seleccionada",
      mensaje: `El cliente ha contratado a otro profesional para "${titulo}". Gracias por participar: puedes seguir pujando en otras demandas.`,
      link: "/mis-ofertas",
      leida: false,
    }))

  if (avisos.length > 0) {
    await supabase.from("notificaciones").insert(avisos)
  }

  return { notificadas: avisos.length }
}
