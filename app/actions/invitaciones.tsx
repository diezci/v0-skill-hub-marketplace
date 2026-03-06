"use server"

import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

interface Proveedor {
  nombre: string
  email: string
  web?: string
  telefono?: string
  especialidad?: string
}

// Function to search for providers using Gemini AI
async function buscarProveedoresConIA(
  categoria: string,
  ubicacion: string,
  descripcion: string
): Promise<Proveedor[]> {
  const apiKey = process.env.GEMINI_API_KEY
  
  if (!apiKey) {
    console.error("[v0] GEMINI_API_KEY not configured")
    return []
  }

  const prompt = `Eres un asistente que ayuda a encontrar proveedores de servicios profesionales en España.

Necesito encontrar 3 empresas o profesionales reales que ofrezcan servicios de "${categoria}" en la zona de "${ubicacion}".

Contexto del proyecto: ${descripcion}

Por favor, devuelve EXACTAMENTE un JSON array con 3 proveedores. Cada proveedor debe tener:
- nombre: Nombre de la empresa o profesional
- email: Email de contacto (si no lo encuentras, genera uno plausible basado en el nombre de la empresa)
- web: Sitio web (opcional)
- telefono: Teléfono de contacto (opcional)
- especialidad: Su especialidad principal

IMPORTANTE: Responde SOLO con el JSON array, sin texto adicional ni markdown.

Ejemplo de formato:
[{"nombre":"Empresa Ejemplo","email":"contacto@ejemplo.com","web":"https://ejemplo.com","telefono":"912345678","especialidad":"Reformas integrales"}]`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    )

    if (!response.ok) {
      console.error("[v0] Gemini API error:", response.status, await response.text())
      return []
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    
    // Clean up the response - remove markdown code blocks if present
    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim()

    const proveedores = JSON.parse(cleanedText)
    return Array.isArray(proveedores) ? proveedores.slice(0, 3) : []
  } catch (error) {
    console.error("[v0] Error calling Gemini:", error)
    return []
  }
}

// Function to send invitation email
async function enviarEmailInvitacion(
  proveedor: Proveedor,
  solicitud: {
    titulo: string
    descripcion: string
    ubicacion: string
    presupuesto_min?: number
    presupuesto_max?: number
  },
  token: string
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.error("[v0] RESEND_API_KEY not configured")
    return false
  }

  const registroUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://v0-skill-hub-marketplace.vercel.app"}/auth/registro?invitacion=${token}`

  const presupuestoText =
    solicitud.presupuesto_min && solicitud.presupuesto_max
      ? `${solicitud.presupuesto_min}€ - ${solicitud.presupuesto_max}€`
      : solicitud.presupuesto_min
        ? `Desde ${solicitud.presupuesto_min}€`
        : solicitud.presupuesto_max
          ? `Hasta ${solicitud.presupuesto_max}€`
          : "A convenir"

  try {
    await resend.emails.send({
      from: "SkillHub <noreply@resend.dev>",
      to: proveedor.email,
      subject: `Nueva oportunidad de trabajo: ${solicitud.titulo}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">SkillHub</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Nueva oportunidad de trabajo</p>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="margin-top: 0;">Hola <strong>${proveedor.nombre}</strong>,</p>
            
            <p>Hemos encontrado un proyecto que podría interesarte en nuestra plataforma:</p>
            
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h2 style="margin: 0 0 15px 0; color: #111; font-size: 18px;">${solicitud.titulo}</h2>
              <p style="margin: 0 0 15px 0; color: #666;">${solicitud.descripcion.substring(0, 200)}${solicitud.descripcion.length > 200 ? "..." : ""}</p>
              
              <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                <div>
                  <span style="color: #888; font-size: 12px; text-transform: uppercase;">Ubicación</span>
                  <p style="margin: 5px 0 0 0; font-weight: 500;">${solicitud.ubicacion}</p>
                </div>
                <div>
                  <span style="color: #888; font-size: 12px; text-transform: uppercase;">Presupuesto</span>
                  <p style="margin: 5px 0 0 0; font-weight: 500;">${presupuestoText}</p>
                </div>
              </div>
            </div>
            
            <p>Para enviar tu presupuesto y acceder a este y otros proyectos similares, regístrate gratis en SkillHub:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${registroUrl}" style="background: #10b981; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Registrarme y presupuestar
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">Si ya tienes cuenta, <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://v0-skill-hub-marketplace.vercel.app"}/auth/login" style="color: #10b981;">inicia sesión aquí</a>.</p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
            <p style="margin: 0;">Este email fue enviado por SkillHub.</p>
            <p style="margin: 5px 0 0 0;">Si no deseas recibir más emails, puedes ignorar este mensaje.</p>
          </div>
        </body>
        </html>
      `,
    })
    return true
  } catch (error) {
    console.error("[v0] Error sending email to", proveedor.email, error)
    return false
  }
}

// Main function to search providers and send invitations
export async function buscarYEnviarInvitaciones(solicitudId: string): Promise<{
  success: boolean
  proveedoresEncontrados: number
  emailsEnviados: number
  error?: string
}> {
  const supabase = await createClient()

  // Get solicitud details
  const { data: solicitud, error: solicitudError } = await supabase
    .from("solicitudes")
    .select(`
      *,
      categoria:categorias(nombre)
    `)
    .eq("id", solicitudId)
    .single()

  if (solicitudError || !solicitud) {
    console.error("[v0] Error fetching solicitud:", solicitudError)
    return {
      success: false,
      proveedoresEncontrados: 0,
      emailsEnviados: 0,
      error: "Solicitud not found",
    }
  }

  const categoriaNombre = solicitud.categoria?.nombre || "servicios profesionales"

  // Search for providers using AI
  const proveedores = await buscarProveedoresConIA(
    categoriaNombre,
    solicitud.ubicacion || "España",
    solicitud.descripcion || solicitud.titulo
  )

  if (proveedores.length === 0) {
    return {
      success: true,
      proveedoresEncontrados: 0,
      emailsEnviados: 0,
    }
  }

  let emailsEnviados = 0

  // Process each provider
  for (const proveedor of proveedores) {
    // Generate unique token
    const token = crypto.randomUUID()

    // Save invitation to database
    const { error: insertError } = await supabase.from("invitaciones").insert({
      solicitud_id: solicitudId,
      nombre_proveedor: proveedor.nombre,
      email_proveedor: proveedor.email,
      web_proveedor: proveedor.web,
      telefono_proveedor: proveedor.telefono,
      especialidad: proveedor.especialidad,
      token_invitacion: token,
      estado: "pendiente",
    })

    if (insertError) {
      console.error("[v0] Error saving invitation:", insertError)
      continue
    }

    // Send email
    const emailSent = await enviarEmailInvitacion(
      proveedor,
      {
        titulo: solicitud.titulo,
        descripcion: solicitud.descripcion,
        ubicacion: solicitud.ubicacion,
        presupuesto_min: solicitud.presupuesto_min,
        presupuesto_max: solicitud.presupuesto_max,
      },
      token
    )

    if (emailSent) {
      emailsEnviados++
      // Update invitation status
      await supabase
        .from("invitaciones")
        .update({ estado: "enviada", fecha_envio: new Date().toISOString() })
        .eq("token_invitacion", token)
    }
  }

  return {
    success: true,
    proveedoresEncontrados: proveedores.length,
    emailsEnviados,
  }
}

// Get invitations for admin dashboard
export async function obtenerInvitaciones() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("invitaciones")
    .select(`
      *,
      solicitud:solicitudes(titulo, ubicacion)
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching invitaciones:", error)
    return { error: error.message }
  }

  return { data }
}

// Resend search for a solicitud
export async function reenviarBusqueda(solicitudId: string) {
  return buscarYEnviarInvitaciones(solicitudId)
}
