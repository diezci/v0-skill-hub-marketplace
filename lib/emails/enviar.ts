import "server-only"

import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { BASE_URL, plantillaEmail, plantillaTexto } from "./plantilla"

// Qué avisos se mandan además por correo.
//
// No todos: el objetivo es que el correo signifique algo. Va por correo lo que
// mueve dinero, compromete trabajo o abre un conflicto; se quedan solo dentro
// de la web el ruido de seguimiento (progreso, imágenes del chat,
// confirmaciones) y los avisos internos de administración (`*_admin`), que ya
// tienen su propio panel.
const AVISOS_POR_EMAIL: Record<string, { boton: string }> = {
  demanda_nueva: { boton: "Ver la demanda" },
  oferta_nueva: { boton: "Ver la oferta" },
  oferta_aceptada: { boton: "Ver el proyecto" },
  oferta_rechazada: { boton: "Ver mis pujas" },
  oferta_actualizada: { boton: "Ver la oferta" },
  trabajo_entregado: { boton: "Revisar la entrega" },
  entrega: { boton: "Revisar la entrega" },
  pago_recibido: { boton: "Ver el pago" },
  pago_liberado: { boton: "Ver el pago" },
  reembolso_emitido: { boton: "Ver el reembolso" },
  cancelacion_solicitada: { boton: "Ver la solicitud" },
  disputa_abierta: { boton: "Ver la disputa" },
  disputa_resuelta: { boton: "Ver la resolución" },
  disputa_ganada: { boton: "Ver la resolución" },
  disputa_perdida: { boton: "Ver la resolución" },
  disputa_retirada: { boton: "Ver el proyecto" },
  incidencia_resuelta: { boton: "Ver la incidencia" },
}

let resendCache: Resend | null = null
function getResend() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!resendCache) resendCache = new Resend(apiKey)
  return resendCache
}

const REMITENTE = process.env.RESEND_FROM || "Diime <avisos@diime.es>"

// Manda por correo un aviso ya creado en la web.
//
// Nunca lanza: si algo falla (falta configuración, Resend responde mal, la
// persona se dio de baja) se registra y se sigue. Un correo no entregado no
// puede tumbar la acción que lo provocó (aceptar una oferta, liberar un pago).
export async function enviarAvisoPorEmail(params: {
  usuarioId: string
  tipo: string
  titulo: string
  mensaje?: string | null
  link?: string | null
}) {
  try {
    const config = AVISOS_POR_EMAIL[params.tipo]
    if (!config) return

    const resend = getResend()
    if (!resend) return

    // La sesión de quien provoca el aviso no puede leer el correo del
    // destinatario (y a menudo no tiene ninguna relación con él: pensemos en
    // avisar de una demanda nueva a los profesionales de esa categoría), así
    // que este dato se lee con la service role key, en el servidor.
    const admin = createAdminClient()
    if (!admin) return

    const { data: perfil } = await admin
      .from("profiles")
      .select("email, nombre, email_notificaciones")
      .eq("id", params.usuarioId)
      .maybeSingle()

    if (!perfil?.email) return
    if (perfil.email_notificaciones === false) return

    const url = params.link ? `${BASE_URL}${params.link}` : BASE_URL
    const contenido = {
      titulo: params.titulo,
      saludo: perfil.nombre ? `Hola, ${perfil.nombre}.` : "Hola.",
      cuerpo: params.mensaje || "Entra en Diime para verlo con detalle.",
      botonTexto: config.boton,
      botonUrl: url,
    }

    const { error } = await resend.emails.send({
      from: REMITENTE,
      to: perfil.email,
      subject: params.titulo,
      html: plantillaEmail(contenido),
      text: plantillaTexto({ ...contenido, botonUrl: url }),
    })

    if (error) console.error("[emails] Resend rechazó el envío:", error)
  } catch (e) {
    console.error("[emails] No se pudo enviar el aviso:", e)
  }
}
