import "server-only"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { enviarPushAUsuario } from "@/lib/push/enviar"

// Escritor interno: solo acciones que ya han autorizado su evento lo llaman.
// No es una server action invocable por el navegador.
export async function crearNotificacion(params: {
  usuarioId: string
  tipo: string
  titulo: string
  mensaje?: string
  link?: string
}) {
  const supabase = await createClient()
  if (!supabase) return
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  // No notificarse a uno mismo.
  if (params.usuarioId === user.id) return

  const admin = createAdminClient()
  if (!admin) {
    console.error("No se pudo crear la notificación: falta el cliente interno")
    return
  }
  // Keep canonical system text in storage so historical and realtime notices
  // follow the viewer's current language. Email and push independently read the
  // recipient's saved language; they never use the actor's request language.
  const { error } = await admin.from("notificaciones").insert({
    usuario_id: params.usuarioId,
    tipo: params.tipo,
    titulo: params.titulo,
    mensaje: params.mensaje ?? params.titulo,
    link: params.link ?? null,
    leida: false,
  })
  if (error) return

  // El mismo aviso, por correo, si es de los que lo merecen. Va aquí porque es
  // el paso por el que ya pasan casi todos los avisos. `enviarAvisoPorEmail` no
  // lanza nunca: si no hay correo configurado o Resend falla, el aviso de la
  // web ya está guardado y la acción que lo provocó sigue adelante.
  const { enviarAvisoPorEmail } = await import("@/lib/emails/enviar")
  await enviarAvisoPorEmail(params)
  await enviarPushAUsuario(params.usuarioId, {
    titulo: params.titulo,
    cuerpo: params.mensaje || "Tienes una novedad en Diime.",
    link: params.link,
    tipo: params.tipo,
  })
}
