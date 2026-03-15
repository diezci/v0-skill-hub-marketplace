"use server"

import { createClient } from "@/lib/supabase/server"

interface Proveedor {
  nombre: string
  email: string
  telefono?: string
  web?: string
  especialidad?: string
}

interface InvitacionResult {
  proveedor: Proveedor
  enviado: boolean
  error?: string
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

  const prompt = `Eres un asistente que busca empresas y profesionales reales en España.

Necesito encontrar 3 proveedores de servicios para este proyecto:
- Categoría: ${categoria}
- Ubicación: ${ubicacion}
- Descripción del proyecto: ${descripcion}

Busca empresas o profesionales REALES que ofrezcan estos servicios en esa zona de España.
Intenta encontrar información de contacto real (email, teléfono, web).

IMPORTANTE: Responde SOLO con un JSON válido, sin markdown ni explicaciones.
El formato debe ser exactamente:
[
  {
    "nombre": "Nombre de la empresa",
    "email": "email@ejemplo.com",
    "telefono": "+34 XXX XXX XXX",
    "web": "https://ejemplo.com",
    "especialidad": "Su especialidad principal"
  }
]

Si no encuentras información real de contacto para alguna empresa, inventa un email plausible basado en el nombre de la empresa (ej: info@nombreempresa.com).
Devuelve exactamente 3 proveedores.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
    categoria: string
    ubicacion: string
    descripcion: string
  },
  token: string
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY

  if (!resendKey) {
    console.error("[v0] RESEND_API_KEY not configured")
    return false
  }

  const registroUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://diime.es"}/auth/registro?invitacion=${token}`

  const htmlContent = [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "</head>",
    '<body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">',
    '<div style="background: #059669; padding: 30px; border-radius: 10px 10px 0 0;">',
    '<h1 style="color: white; margin: 0; font-size: 24px;">Nuevo proyecto en tu zona</h1>',
    "</div>",
    '<div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">',
    `<p>Hola <strong>${proveedor.nombre}</strong>,</p>`,
    "<p>Hemos encontrado un proyecto que podría interesarte en <strong>Diime</strong>:</p>",
    '<div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">',
    `<h2 style="margin: 0 0 10px 0; color: #1f2937; font-size: 18px;">${solicitud.titulo}</h2>`,
    `<p style="margin: 5px 0; color: #6b7280;"><strong>Categoría:</strong> ${solicitud.categoria}</p>`,
    `<p style="margin: 5px 0; color: #6b7280;"><strong>Ubicación:</strong> ${solicitud.ubicacion}</p>`,
    `<p style="margin: 15px 0 0 0; color: #374151;">${solicitud.descripcion.substring(0, 200)}${solicitud.descripcion.length > 200 ? "..." : ""}</p>`,
    "</div>",
    "<p>El cliente está buscando profesionales como tú para presupuestar este trabajo.</p>",
    '<div style="text-align: center; margin: 30px 0;">',
    `<a href="${registroUrl}" style="background: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Registrarme y presupuestar</a>`,
    "</div>",
    '<p style="color: #6b7280; font-size: 14px;">Registrarte es gratis y solo te llevará 2 minutos.</p>',
    "</div>",
    '<div style="background: #1f2937; padding: 20px; border-radius: 0 0 10px 10px; text-align: center;">',
    '<p style="color: #9ca3af; margin: 0; font-size: 12px;">Diime - Conectamos profesionales con clientes</p>',
    "</div>",
    "</body>",
    "</html>",
  ].join("\n")

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Diime <onboarding@resend.dev>",
        to: [proveedor.email],
        subject: `Nuevo proyecto de ${solicitud.categoria} en ${solicitud.ubicacion}`,
        html: htmlContent,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("[v0] Resend API error:", errorData)
      return false
    }

    return true
  } catch (error) {
    console.error("[v0] Error sending email:", error)
    return false
  }
}

export async function buscarYEnviarInvitaciones(
  solicitudId: string
): Promise<{ success: boolean; invitaciones: InvitacionResult[] }> {
  const supabase = await createClient()

  const { data: solicitud, error: solicitudError } = await supabase
    .from("solicitudes")
    .select(`
      id,
      titulo,
      descripcion,
      ubicacion,
      categorias (nombre)
    `)
    .eq("id", solicitudId)
    .single()

  if (solicitudError || !solicitud) {
    console.error("[v0] Error fetching solicitud:", solicitudError)
    return { success: false, invitaciones: [] }
  }

  const categoria = (solicitud.categorias as { nombre: string } | null)?.nombre || "Servicios generales"

  const proveedores = await buscarProveedoresConIA(
    categoria,
    solicitud.ubicacion || "España",
    solicitud.descripcion || solicitud.titulo
  )

  if (proveedores.length === 0) {
    return { success: false, invitaciones: [] }
  }

  const resultados: InvitacionResult[] = []

  for (const proveedor of proveedores) {
    const token = crypto.randomUUID()

    const { error: insertError } = await supabase.from("invitaciones").insert({
      solicitud_id: solicitudId,
      nombre_proveedor: proveedor.nombre,
      email_proveedor: proveedor.email,
      telefono_proveedor: proveedor.telefono,
      web_proveedor: proveedor.web,
      especialidad: proveedor.especialidad,
      token,
      estado: "pendiente",
    })

    if (insertError) {
      console.error("[v0] Error saving invitation:", insertError)
      resultados.push({ proveedor, enviado: false, error: insertError.message })
      continue
    }

    const enviado = await enviarEmailInvitacion(
      proveedor,
      {
        id: solicitud.id,
        titulo: solicitud.titulo,
        categoria,
        ubicacion: solicitud.ubicacion || "España",
        descripcion: solicitud.descripcion || "",
      },
      token
    )

    await supabase
      .from("invitaciones")
      .update({
        estado: enviado ? "enviado" : "error",
        ...(enviado ? { enviado_at: new Date().toISOString() } : {}),
      })
      .eq("token", token)

    resultados.push({ proveedor, enviado })
  }

  return {
    success: resultados.some((r) => r.enviado),
    invitaciones: resultados,
  }
}

export async function obtenerInvitaciones() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("invitaciones")
    .select(`*, solicitudes (titulo, categorias (nombre))`)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[v0] Error fetching invitations:", error)
    return { error: error.message }
  }

  return { data }
}

export async function reenviarBusqueda(solicitudId: string) {
  return buscarYEnviarInvitaciones(solicitudId)
}
