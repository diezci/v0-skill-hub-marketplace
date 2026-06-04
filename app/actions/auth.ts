"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function registrarUsuario(formData: {
  email: string
  password: string
  nombre: string
  apellido: string
  tipoEntidad: "particular" | "empresa"
  documento: string
  nombreEmpresa?: string
  tokenInvitacion?: string
  telefono?: string
  ubicacion?: string
}) {
  const supabase = await createClient()
  
  // Use NEXT_PUBLIC_SITE_URL for production, fallback to VERCEL_URL, then localhost
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL 
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || "http://localhost:3000"

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: {
        nombre: formData.nombre,
        apellido: formData.apellido,
        tipo_entidad: formData.tipoEntidad,
        documento: formData.documento,
        telefono: formData.telefono,
        ubicacion: formData.ubicacion,
      },
    },
  })

  if (authError) {
    // Handle specific error cases
    if (authError.message.includes("over_email_send_rate_limit")) {
      return { 
        error: "Has excedido el límite de registros por hora. Por favor espera 1 hora o contacta con soporte para aumentar el límite." 
      }
    }
    if (authError.message.includes("User already registered")) {
      return { error: "Este email ya está registrado. Intenta iniciar sesión." }
    }
    return { error: authError.message }
  }

  if (!authData.user) {
    return { error: "Error al crear usuario" }
  }

  let empresaId: string | null = null

  if (formData.tipoEntidad === "empresa") {
    if (formData.tokenInvitacion) {
      // Join existing company using invitation token
      const { data: empresa, error: empresaError } = await supabase
        .from("empresas")
        .select("id")
        .eq("token_invitacion", formData.tokenInvitacion)
        .single()

      if (empresaError || !empresa) {
        return { error: "Token de invitación inválido" }
      }

      empresaId = empresa.id
    } else if (formData.nombreEmpresa) {
      // Create new company
      const { data: newEmpresa, error: empresaError } = await supabase
        .from("empresas")
        .insert({
          nombre: formData.nombreEmpresa,
          cif: formData.documento,
          propietario_id: authData.user.id,
        })
        .select()
        .single()

      if (empresaError) {
        return { error: "Error al crear la empresa: " + empresaError.message }
      }

      empresaId = newEmpresa.id
    }
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: authData.user.id,
        nombre: formData.nombre,
        apellido: formData.apellido,
        email: formData.email,
        telefono: formData.telefono || null,
        ubicacion: formData.ubicacion || null,
        tipo_usuario: "cliente",
      },
      { onConflict: "id" },
    )

  // Profile may already be auto-created by the DB trigger, or RLS may block
  // because email confirmation is required and there's no session yet.
  // We swallow these specific errors silently — the trigger handles the base row.
  if (profileError && !profileError.message?.includes("row-level security") && profileError.code !== "23505") {
    return { error: profileError.message }
  }

  return { data: { success: true, user: authData.user } }
}

export async function crearPerfilProfesional(formData: {
  titulo: string
  categoria?: string
  bio?: string
  habilidades?: string[]
  tarifaHora?: number
  anosExperiencia?: number
}) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: "Debes iniciar sesión para crear un perfil profesional" }
  }

  // Check if professional profile already exists
  const { data: existing } = await supabase.from("profesionales").select("id").eq("id", user.id).single()

  if (existing) {
    return { error: "Ya tienes un perfil profesional creado" }
  }

  const { error: profError } = await supabase.from("profesionales").insert({
    id: user.id,
    titulo: formData.titulo,
    tarifa_por_hora: formData.tarifaHora || 0,
    años_experiencia: formData.anosExperiencia || 0,
    habilidades: formData.habilidades || [],
    disponible: true,
  })

  if (profError) {
    return { error: profError.message }
  }

  return { data: { success: true } }
}

export async function resetPassword(email: string) {
  const supabase = await createClient()
  
  // Use NEXT_PUBLIC_SITE_URL for production, fallback to VERCEL_URL, then localhost
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL 
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || "http://localhost:3000"

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/actualizar-contrasena`,
  })

  if (error) {
    return { error: error.message }
  }

  return { data: { success: true } }
}

export async function updatePassword(newPassword: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (error) {
    return { error: error.message }
  }

  return { data: { success: true } }
}

export async function signInWithGoogle() {
  const supabase = await createClient()
  
  // Use NEXT_PUBLIC_SITE_URL for production, fallback to VERCEL_URL, then localhost
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL 
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || "http://localhost:3000"

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { data: { url: data.url } }
}

export async function registrarCliente(formData: {
  email: string
  password: string
  fullName: string
  phone?: string
  city: string
}) {
  const [nombre, ...apellidoParts] = formData.fullName.split(" ")
  const apellido = apellidoParts.join(" ")

  return registrarUsuario({
    email: formData.email,
    password: formData.password,
    nombre,
    apellido: apellido || "",
    tipoEntidad: "particular",
    documento: "", // Will need to be added by user later
    telefono: formData.phone,
    ubicacion: formData.city,
  })
}

export async function registrarProfesional(formData: {
  email: string
  password: string
  fullName: string
  category: string
  skills: string
  bio: string
  hourlyRate: string
}) {
  const [nombre, ...apellidoParts] = formData.fullName.split(" ")
  const apellido = apellidoParts.join(" ")

  // First create the user account
  const result = await registrarUsuario({
    email: formData.email,
    password: formData.password,
    nombre,
    apellido: apellido || "",
    tipoEntidad: "particular",
    documento: "", // Will need to be added by user later
  })

  if (result.error) {
    return result
  }

  // Then create the professional profile
  const habilidades = formData.skills.split(",").map((s) => s.trim())

  const profResult = await crearPerfilProfesional({
    titulo: `Profesional de ${formData.category}`,
    habilidades,
    tarifaHora: Number.parseFloat(formData.hourlyRate),
    anosExperiencia: 0,
  })

  if (profResult.error) {
    return profResult
  }

  return result
}

// Company management functions
export async function obtenerEmpresa() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: "Debes iniciar sesión" }
  }

  // Companies are linked by their owner (propietario_id), there is no
  // empresa_id column on profiles.
  const { data, error } = await supabase
    .from("empresas")
    .select("*")
    .eq("propietario_id", user.id)
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }

  if (!data) {
    return { error: "No perteneces a ninguna empresa" }
  }

  return { data }
}

export async function loginConGoogle() {
  const supabase = await createClient()
  
  // Use NEXT_PUBLIC_SITE_URL for production, fallback to VERCEL_URL, then localhost
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL 
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || "http://localhost:3000"
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  if (data.url) {
    redirect(data.url)
  }

  return { success: true }
}

export async function obtenerMiembrosEmpresa() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: "Debes iniciar sesión" }
  }

  // Find the company owned by this user
  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, propietario_id")
    .eq("propietario_id", user.id)
    .maybeSingle()

  if (!empresa) {
    return { error: "No perteneces a ninguna empresa" }
  }

  // There is no team-membership column yet, so the owner is the only member.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nombre, apellido, email, foto_perfil, fecha_registro")
    .eq("id", empresa.propietario_id)

  if (error) {
    return { error: error.message }
  }

  return { data }
}
