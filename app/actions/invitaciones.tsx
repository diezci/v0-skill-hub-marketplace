"use server"

import { createClient } from "@/lib/supabase/server"
import { nanoid } from "nanoid"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function crearInvitacion(email: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "No autenticado" }
  }

  // Verificar si el usuario es admin
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()

  if (!profile?.is_admin) {
    return { error: "No tienes permisos para crear invitaciones" }
  }

  // Generar token único
  const token = nanoid(32)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // Expira en 7 días

  // Crear invitación en la base de datos
  const { error: insertError } = await supabase.from("invitaciones").insert({
    email,
    token,
    created_by: user.id,
    expires_at: expiresAt.toISOString(),
  })

  if (insertError) {
    return { error: "Error al crear la invitación" }
  }

  // Enviar email con la invitación
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.diime.es"
  const inviteUrl = `${siteUrl}/auth/registro?token=${token}`

  try {
    await resend.emails.send({
      from: "Diime <noreply@diime.es>",
      to: email,
      subject: "Invitación a Diime - Plataforma de Profesionales",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invitación a Diime</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">¡Estás invitado!</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Hola,</p>
            <p style="font-size: 16px;">Has sido invitado a unirte a <strong>Diime</strong>, la plataforma que conecta profesionales de la construcción y reformas con clientes.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">Aceptar Invitación</a>
            </div>
            <p style="font-size: 14px; color: #666;">Este enlace expira en 7 días.</p>
            <p style="font-size: 14px; color: #666;">Si no esperabas esta invitación, puedes ignorar este email.</p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>© 2024 Diime. Todos los derechos reservados.</p>
          </div>
        </body>
        </html>
      `,
    })
  } catch {
    console.error("Error al enviar email de invitación")
  }

  return { success: true, token }
}

export async function verificarInvitacion(token: string) {
  const supabase = await createClient()

  const { data: invitacion } = await supabase
    .from("invitaciones")
    .select("*")
    .eq("token", token)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .single()

  if (!invitacion) {
    return { valid: false, error: "Invitación no válida o expirada" }
  }

  return { valid: true, email: invitacion.email }
}

export async function marcarInvitacionUsada(token: string) {
  const supabase = await createClient()

  await supabase.from("invitaciones").update({ used: true, used_at: new Date().toISOString() }).eq("token", token)
}

export async function obtenerInvitaciones() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "No autenticado", invitaciones: [] }
  }

  const { data: invitaciones } = await supabase
    .from("invitaciones")
    .select("*, creator:created_by(nombre, email)")
    .order("created_at", { ascending: false })

  return { invitaciones: invitaciones || [] }
}
