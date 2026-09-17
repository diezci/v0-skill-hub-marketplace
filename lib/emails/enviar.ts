import "server-only"

import { idiomaDestinatario } from "@/lib/idioma-destinatario"
import { traducirTextoNotificacion } from "@/lib/i18n-notificaciones"
import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { BASE_URL, plantillaEmail, plantillaTexto } from "./plantilla"
import { registrarEventoOperativo } from "@/lib/operaciones"
import { permiteEmail, preferenciasEmailDesdeFila } from "@/lib/preferencias-notificaciones"

// Qué avisos se mandan además por correo.
//
// No todos: el objetivo es que el correo signifique algo. Va por correo lo que
// mueve dinero, compromete trabajo o abre un conflicto; se quedan fuera los
// mensajes e imágenes del chat y los avisos internos de administración
// (`*_admin`), que ya tienen sus propios canales.
const AVISOS_POR_EMAIL: Record<string, { boton: string }> = {
  demanda_nueva: { boton: "Ver la demanda" },
  demanda_actualizada: { boton: "Revisar mi puja" },
  demanda_retirada: { boton: "Ver mis pujas" },
  oferta_nueva: { boton: "Ver la oferta" },
  oferta_aceptada: { boton: "Ver el proyecto" },
  oferta_rechazada: { boton: "Ver mis pujas" },
  oferta_actualizada: { boton: "Ver la oferta" },
  oferta_retirada: { boton: "Ver las ofertas" },
  progreso_trabajo: { boton: "Ver el progreso" },
  trabajo_entregado: { boton: "Revisar la entrega" },
  entrega: { boton: "Revisar la entrega" },
  pago_recibido: { boton: "Ver el pago" },
  pago_liberado: { boton: "Ver el pago" },
  reembolso_emitido: { boton: "Ver el reembolso" },
  cancelacion_solicitada: { boton: "Ver la solicitud" },
  cancelacion_actualizada: { boton: "Revisar la cancelación" },
  cancelacion_retirada: { boton: "Ver el proyecto" },
  cancelacion_aceptada: { boton: "Ver el proyecto" },
  disputa_abierta: { boton: "Ver la disputa" },
  disputa_resuelta: { boton: "Ver la resolución" },
  disputa_ganada: { boton: "Ver la resolución" },
  disputa_perdida: { boton: "Ver la resolución" },
  disputa_retirada: { boton: "Ver el proyecto" },
  incidencia_resuelta: { boton: "Ver la incidencia" },
  perfil_verificado: { boton: "Ver mi perfil" },
  verificacion_retirada: { boton: "Ver mi perfil" },
  verificacion_profesional_actualizada: { boton: "Ver la verificación" },
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

    // La sesión de quien provoca el aviso no puede leer el correo del
    // destinatario (y a menudo no tiene ninguna relación con él: pensemos en
    // avisar de una demanda nueva a los profesionales de esa categoría), así
    // que este dato se lee con la service role key, en el servidor.
    const admin = createAdminClient()
    if (!admin) return

    const [perfilResultado, preferenciasResultado] = await Promise.all([
      admin
        .from("profiles")
        .select("email, nombre, email_notificaciones, cuenta_eliminada")
        .eq("id", params.usuarioId)
        .maybeSingle(),
      admin
        .from("preferencias_notificaciones")
        .select(
          "email_activo, email_oportunidades, email_ofertas, email_proyectos, email_pagos, email_disputas, email_cuenta",
        )
        .eq("usuario_id", params.usuarioId)
        .maybeSingle(),
    ])
    const { data: perfil, error: perfilError } = perfilResultado

    if (perfilError) {
      await registrarEventoOperativo({
        area: "email",
        severidad: "aviso",
        codigo: "destinatario_no_consultable",
        clave: params.tipo,
        mensaje: "No se pudo consultar el destinatario de un aviso por email.",
        contexto: { tipo: params.tipo, codigo: perfilError.code || "unknown" },
      })
      return
    }
    if (preferenciasResultado.error) {
      await registrarEventoOperativo({
        area: "email",
        severidad: "aviso",
        codigo: "preferencias_no_consultables",
        clave: params.tipo,
        mensaje: "No se pudieron consultar las preferencias de un aviso por email.",
        contexto: { tipo: params.tipo, codigo: preferenciasResultado.error.code || "unknown" },
      })
      return
    }
    if (!perfil?.email || perfil.cuenta_eliminada) return
    const preferencias = preferenciasEmailDesdeFila(
      preferenciasResultado.data,
      perfil.email_notificaciones !== false,
    )
    if (!permiteEmail(preferencias, params.tipo)) return

    // La falta de servicio solo es una incidencia cuando hay un correo que
    // enviar; quien desactivó los avisos no necesita inicializar Resend.
    const resend = getResend()
    if (!resend) {
      await registrarEventoOperativo({
        area: "email",
        severidad: "critica",
        codigo: "resend_no_configurado",
        mensaje: "Los avisos por email están desactivados porque falta RESEND_API_KEY.",
      })
      return
    }

    const idioma = await idiomaDestinatario(admin, params.usuarioId)
    const traducirAviso = (texto: string) => traducirTextoNotificacion(idioma, texto, params.tipo)
    const url = params.link ? `${BASE_URL}${params.link}` : BASE_URL
    const contenido = {
      idioma,
      titulo: traducirAviso(params.titulo),
      saludo: perfil.nombre ? `${idioma === "en" ? "Hello" : "Hola"}, ${perfil.nombre}.` : traducirAviso("Hola."),
      cuerpo: traducirAviso(params.mensaje || "Entra en Diime para verlo con detalle."),
      botonTexto: traducirAviso(config.boton),
      botonUrl: url,
    }

    const { error } = await resend.emails.send({
      from: REMITENTE,
      to: perfil.email,
      subject: contenido.titulo,
      html: plantillaEmail(contenido),
      text: plantillaTexto({ ...contenido, botonUrl: url }),
      headers: {
        "List-Unsubscribe": `<${BASE_URL}/mi-cuenta#avisos-email>`,
      },
    })

    if (error) {
      console.error("[emails] Resend rechazó el envío:", error)
      await registrarEventoOperativo({
        area: "email",
        severidad: "aviso",
        codigo: "envio_rechazado",
        clave: params.tipo,
        mensaje: "Resend rechazó un aviso transaccional.",
        contexto: { tipo: params.tipo, motivo: error.name || "resend_error" },
      })
    }
  } catch (e) {
    console.error("[emails] No se pudo enviar el aviso:", e)
    await registrarEventoOperativo({
      area: "email",
      severidad: "aviso",
      codigo: "envio_excepcion",
      clave: params.tipo,
      mensaje: "Se produjo una excepción al enviar un aviso transaccional.",
      contexto: { tipo: params.tipo },
    })
  }
}
