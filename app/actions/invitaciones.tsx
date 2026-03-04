"use server"

import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

interface Proveedor {
  nombre_empresa: string
  email_empresa: string
  descripcion_empresa: string
  sitio_web: string
}

interface SolicitudData {
  id: string
  titulo: string
  descripcion: string
  ubicacion: string
  presupuesto_min?: number
  presupuesto_max?: number
  categoria?: string
}

async function buscarProveedoresConGemini(solicitud: SolicitudData): Promise<Proveedor[]> {
  const prompt = `Eres un asistente experto en encontrar proveedores de servicios en España.

Se ha publicado la siguiente demanda de servicio:
- Título: ${solicitud.titulo}
- Descripción: ${solicitud.descripcion}
- Ubicación: ${solicitud.ubicacion || "España"}
- Presupuesto: ${solicitud.presupuesto_min ? `${solicitud.presupuesto_min}€` : ""}${solicitud.presupuesto_max ? ` - ${solicitud.presupuesto_max}€` : ""}
- Categoría: ${solicitud.categoria || "Servicios generales"}

Tu tarea es identificar 3 empresas o profesionales reales que podrían atender esta demanda.

Responde ÚNICAMENTE con un array JSON válido con exactamente 3 objetos. No incluyas explicaciones, solo el JSON:

[
  {
    "nombre_empresa": "Nombre real de la empresa",
    "email_empresa": "email@empresa.com",
    "descripcion_empresa": "Breve descripción de por qué encaja para este servicio",
    "sitio_web": "https://www.empresa.com"
  }
]

Asegúrate de que los emails sean direcciones de contacto reales o plausibles para empresas de ese sector en esa ubicación.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ""

  // Extraer el JSON del texto (puede venir con ```json ... ```)
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error("Gemini no devolvió un JSON válido")
  }

  const proveedores: Proveedor[] = JSON.parse(jsonMatch[0])
  return proveedores.slice(0, 3)
}

async function enviarEmailInvitacion(
  proveedor: Proveedor,
  solicitud: SolicitudData,
  token: string
): Promise<void> {
  const urlRegistro = `${process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || "https://tu-dominio.com"}/auth/registro?invitacion=${token}&solicitud=${solicitud.id}`

  await resend.emails.send({
    from: "Rilafe <noreply@rilafe.es>",
    to: proveedor.email_empresa,
    subject: `Oportunidad de trabajo: ${solicitud.titulo}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación a presupuestar</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#111827;padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Rilafe</h1>
              <p style="color:#9ca3af;margin:8px 0 0;font-size:14px;">Marketplace de servicios profesionales</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#374151;font-size:16px;margin:0 0 16px;">Hola, <strong>${proveedor.nombre_empresa}</strong>,</p>
              <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Hemos identificado tu empresa como un posible proveedor para una nueva demanda publicada en nuestra plataforma. 
                Te invitamos a registrarte y enviar tu presupuesto.
              </p>

              <!-- Demand box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 8px;font-weight:600;">Demanda publicada</p>
                    <h2 style="color:#111827;font-size:18px;margin:0 0 12px;font-weight:700;">${solicitud.titulo}</h2>
                    <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">${solicitud.descripcion}</p>
                    <table cellpadding="0" cellspacing="0">
                      ${solicitud.ubicacion ? `<tr><td style="padding:2px 0;"><span style="color:#6b7280;font-size:13px;">📍 ${solicitud.ubicacion}</span></td></tr>` : ""}
                      ${solicitud.presupuesto_max ? `<tr><td style="padding:2px 0;"><span style="color:#6b7280;font-size:13px;">💰 Presupuesto hasta ${solicitud.presupuesto_max}€</span></td></tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 28px;">
                Regístrate gratis en Rilafe y podrás ver los detalles completos y enviar tu presupuesto directamente al cliente.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${urlRegistro}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:6px;letter-spacing:0.2px;">
                      Ver demanda y registrarse
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;line-height:1.6;">
                Has recibido este email porque hemos identificado tu empresa como especialista en este tipo de servicio.<br>
                Si no deseas recibir más invitaciones, puedes ignorar este mensaje.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  })
}

export async function buscarYInvitarProveedores(solicitudId: string): Promise<{
  success: boolean
  invitaciones?: number
  error?: string
}> {
  const supabase = await createClient()

  // Obtener datos completos de la solicitud con categoría
  const { data: solicitud, error: solicitudError } = await supabase
    .from("solicitudes")
    .select(`
      id,
      titulo,
      descripcion,
      ubicacion,
      presupuesto_min,
      presupuesto_max,
      categorias (nombre)
    `)
    .eq("id", solicitudId)
    .single()

  if (solicitudError || !solicitud) {
    return { success: false, error: "No se encontró la solicitud" }
  }

  const solicitudData: SolicitudData = {
    id: solicitud.id,
    titulo: solicitud.titulo,
    descripcion: solicitud.descripcion,
    ubicacion: solicitud.ubicacion,
    presupuesto_min: solicitud.presupuesto_min,
    presupuesto_max: solicitud.presupuesto_max,
    categoria: (solicitud.categorias as { nombre: string } | null)?.nombre,
  }

  let proveedores: Proveedor[]
  try {
    proveedores = await buscarProveedoresConGemini(solicitudData)
  } catch (err) {
    return { success: false, error: `Error buscando proveedores con IA: ${err}` }
  }

  let enviados = 0
  for (const proveedor of proveedores) {
    try {
      // Guardar invitación en la BD
      const { data: invitacion, error: insertError } = await supabase
        .from("invitaciones")
        .insert({
          solicitud_id: solicitudId,
          nombre_empresa: proveedor.nombre_empresa,
          email_empresa: proveedor.email_empresa,
          descripcion_empresa: proveedor.descripcion_empresa,
          sitio_web: proveedor.sitio_web,
        })
        .select("token")
        .single()

      if (insertError || !invitacion) continue

      // Enviar email
      await enviarEmailInvitacion(proveedor, solicitudData, invitacion.token)
      enviados++
    } catch (err) {
      console.error(`[v0] Error invitando a ${proveedor.nombre_empresa}:`, err)
    }
  }

  return { success: true, invitaciones: enviados }
}

export async function obtenerInvitacionesPorSolicitud(solicitudId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("invitaciones")
    .select("*")
    .eq("solicitud_id", solicitudId)
    .order("created_at", { ascending: false })

  if (error) return { error: error.message }
  return { data }
}

export async function obtenerTodasLasInvitaciones() {
  const supabase = await createClient()

  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return { error: "No autenticado" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("es_admin")
    .eq("id", user.user.id)
    .single()

  if (!profile?.es_admin) return { error: "No autorizado" }

  const { data, error } = await supabase
    .from("invitaciones")
    .select(`
      *,
      solicitudes (titulo, ubicacion, cliente_id)
    `)
    .order("created_at", { ascending: false })

  if (error) return { error: error.message }
  return { data }
}
