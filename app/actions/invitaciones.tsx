"use server"

import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

interface Proveedor {
  nombre: string
  email: string
  telefono?: string
  web?: string
  razon: string
}

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

  const prompt = `Eres un asistente que busca proveedores de servicios en España.

Necesito encontrar 3 empresas o profesionales REALES que ofrezcan servicios de "${categoria}" en "${ubicacion}" o alrededores.

Contexto del trabajo solicitado: "${descripcion}"

IMPORTANTE: Devuelve SOLO empresas reales con datos de contacto verificables. Si no encuentras empresas reales, inventa nombres de empresas ficticias pero realistas para España con emails genéricos.

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin explicaciones) con este formato exacto:
[
  {
    "nombre": "Nombre de la Empresa",
    "email": "contacto@empresa.com",
    "telefono": "600123456",
    "web": "https://empresa.com",
    "razon": "Breve razón de por qué encaja con el trabajo"
  }
]

Devuelve exactamente 3 proveedores.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
      console.error("[v0] Gemini API error:", response.status)
      return []
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error("[v0] No JSON found in Gemini response")
      return []
    }

    const proveedores = JSON.parse(jsonMatch[0]) as Proveedor[]
    return proveedores.slice(0, 3)
  } catch (error) {
    console.error("[v0] Error calling Gemini:", error)
    return []
  }
}

async function enviarEmailInvitacion(
  proveedor: Proveedor,
  solicitud: {
    id: string
    titulo: string
    descripcion: string
    ubicacion: string
    categoria: string
  },
  token: string
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.error("[v0] RESEND_API_KEY not configured")
    return false
  }

  const registroUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app"}/auth/registro?invitacion=${token}`

  try {
    await resend.emails.send({
      from: "SkillHub <onboarding@resend.dev>",
      to: proveedor.email,
      subject: `Nueva oportunidad de trabajo: ${solicitud.titulo}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
            .job-card { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e5e7eb; }
            .cta-button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>¡Nueva oportunidad de trabajo!</h1>
            </div>
            <div class="content">
              <p>Hola <strong>${proveedor.nombre}</strong>,</p>
              <p>Hemos encontrado un trabajo que podría interesarte en nuestra plataforma SkillHub:</p>
              
              <div class="job-card">
                <h2 style="margin: 0 0 8px 0; color: #1f2937;">${solicitud.titulo}</h2>
                <p style="margin: 0 0 8px 0;"><strong>Ubicación:</strong> ${solicitud.ubicacion}</p>
                <p style="margin: 0 0 8px 0;"><strong>Categoría:</strong> ${solicitud.categoria}</p>
                <p style="margin: 0;">${solicitud.descripcion.substring(0, 200)}${solicitud.descripcion.length > 200 ? "..." : ""}</p>
              </div>
              
              <p><strong>¿Por qué tú?</strong> ${proveedor.razon}</p>
              
              <p>Regístrate gratis en SkillHub para enviar tu presupuesto y conectar con este cliente:</p>
              
              <p style="text-align: center; margin: 24px 0;">
                <a href="${registroUrl}" class="cta-button">Registrarme y presupuestar</a>
              </p>
              
              <p style="color: #6b7280; font-size: 14px;">
                Al registrarte podrás acceder a cientos de solicitudes de trabajo en tu zona.
              </p>
            </div>
            <div class="footer">
              <p>Este email fue enviado por SkillHub. Si no quieres recibir más emails, ignora este mensaje.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    })
    return true
  } catch (error) {
    console.error("[v0] Error sending email:", error)
    return false
  }
}

export async function buscarYEnviarInvitaciones(solicitudId: string) {
  const supabase = await createClient()

  // Get solicitud details
  const { data: solicitud, error: solicitudError } = await supabase
    .from("solicitudes")
    .select(`
      id,
      titulo,
      descripcion,
      ubicacion,
      categoria_id,
      categorias (nombre)
    `)
    .eq("id", solicitudId)
    .single()

  if (solicitudError || !solicitud) {
    console.error("[v0] Error fetching solicitud:", solicitudError)
    return { error: "Solicitud no encontrada" }
  }

  const categoriaNombre = (solicitud.categorias as { nombre: string })?.nombre || "General"

  // Search providers with AI
  const proveedores = await buscarProveedoresConIA(
    categoriaNombre,
    solicitud.ubicacion,
    solicitud.descripcion
  )

  if (proveedores.length === 0) {
    return { error: "No se encontraron proveedores" }
  }

  const resultados = []

  for (const proveedor of proveedores) {
    // Generate unique token
    const token = crypto.randomUUID()

    // Save invitation to database
    const { data: invitacion, error: insertError } = await supabase
      .from("invitaciones")
      .insert({
        solicitud_id: solicitudId,
        nombre_proveedor: proveedor.nombre,
        email_proveedor: proveedor.email,
        telefono_proveedor: proveedor.telefono,
        web_proveedor: proveedor.web,
        razon_match: proveedor.razon,
        token_invitacion: token,
        estado: "pendiente",
      })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] Error saving invitation:", insertError)
      continue
    }

    // Send email
    const emailSent = await enviarEmailInvitacion(
      proveedor,
      {
        id: solicitud.id,
        titulo: solicitud.titulo,
        descripcion: solicitud.descripcion,
        ubicacion: solicitud.ubicacion,
        categoria: categoriaNombre,
      },
      token
    )

    // Update status
    if (emailSent) {
      await supabase
        .from("invitaciones")
        .update({ estado: "enviado", enviado_at: new Date().toISOString() })
        .eq("id", invitacion.id)
    }

    resultados.push({
      proveedor: proveedor.nombre,
      email: proveedor.email,
      enviado: emailSent,
    })
  }

  return { data: resultados }
}

export async function obtenerInvitaciones() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("invitaciones")
    .select(`
      *,
      solicitudes (
        titulo,
        ubicacion
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function reenviarBusqueda(solicitudId: string) {
  return buscarYEnviarInvitaciones(solicitudId)
}
