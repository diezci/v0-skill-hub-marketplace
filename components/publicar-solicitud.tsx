import { createClient } from "@/lib/supabase/server"
import SolicitudServicioForm from "@/components/solicitud-servicio-form"
import { SolicitudServicioAcceso } from "@/components/solicitud-servicio-acceso"

export default async function PublicarSolicitud() {
  const supabase = await createClient()
  const resultado = await supabase?.auth.getUser().catch(() => null)
  const usuario = resultado?.error ? null : resultado?.data.user

  // El cuestionario no se envía al navegador de un visitante, tampoco al
  // acceder directamente al ancla /#publicar-demanda.
  if (!usuario || usuario.is_anonymous) return <SolicitudServicioAcceso embedded />

  return <SolicitudServicioForm key={usuario.id} usuarioId={usuario.id} embedded />
}
