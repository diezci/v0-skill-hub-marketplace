"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function registrarUsuario(formData: {
  email: string
  password: string
  nombre: string
  apellido: string
  tipoEntidad: "particular" | "empresa"
  // Para un particular es su DNI/NIE. Para una empresa es el CIF de la empresa.
  documento: string
  // DNI/NIE de la PERSONA que registra la empresa y actúa en su nombre. Solo
  // aplica a tipoEntidad "empresa" (en un particular ya lo es `documento`):
  // detrás de una empresa siempre hay alguien que responde de lo que hace.
  documentoPersonal?: string
  cargoEmpresa?: string
  nombreEmpresa?: string
  tokenInvitacion?: string
  telefono?: string
  ubicacion?: string
}) {
  const supabase = await createClient()
  if (!supabase) return { error: "No se pudo conectar con la base de datos" }

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
      // Unirse a una empresa existente con el token de invitación. Va por RPC
      // porque `empresas` tiene RLS: quien usa el token todavía no es su
      // propietario, así que no puede leer la tabla. La función devuelve solo
      // el id de la empresa cuyo token coincide (nunca el CIF ni otros tokens).
      const { data: empresaIdPorToken, error: empresaError } = await supabase.rpc("empresa_id_por_token", {
        p_token: formData.tokenInvitacion,
      })

      if (empresaError || !empresaIdPorToken) {
        return { error: "Token de invitación inválido" }
      }

      empresaId = empresaIdPorToken as string
    } else if (formData.nombreEmpresa) {
      // Create new company
      // Se guardan también contacto y ubicación: son los datos fiscales que
      // luego salen en la factura a nombre de la empresa.
      const { data: newEmpresa, error: empresaError } = await supabase
        .from("empresas")
        .insert({
          nombre: formData.nombreEmpresa,
          cif: formData.documento,
          propietario_id: authData.user.id,
          email: formData.email,
          telefono: formData.telefono || null,
          ubicacion: formData.ubicacion || null,
        })
        .select()
        .single()

      if (empresaError) {
        return { error: "Error al crear la empresa: " + empresaError.message }
      }

      empresaId = newEmpresa.id
    }
  }

  // El documento que se guarda en el perfil es SIEMPRE el de la persona: si se
  // registra una empresa, `documento` es el CIF y el DNI va en documentoPersonal.
  const documentoDeLaPersona =
    formData.tipoEntidad === "empresa" ? formData.documentoPersonal || null : formData.documento || null

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
        documento: documentoDeLaPersona,
        // Vínculo con la empresa en cuyo nombre actúa (antes se calculaba y se
        // descartaba, así que la empresa quedaba huérfana).
        empresa_id: empresaId,
        cargo_empresa: formData.cargoEmpresa || null,
      },
      { onConflict: "id" },
    )

  // Profile may already be auto-created by the DB trigger, or RLS may block
  // because email confirmation is required and there's no session yet.
  // We swallow these specific errors silently — the trigger handles the base row.
  if (profileError && !profileError.message?.includes("row-level security") && profileError.code !== "23505") {
    return { error: profileError.message }
  }

  // El vínculo con la empresa no puede perderse en silencio: si se traga el
  // error de arriba (trigger o RLS), la empresa quedaría huérfana y las facturas
  // no saldrían a su nombre. Se reintenta explícitamente y, si tampoco cuela, se
  // avisa en vez de dejar una cuenta de empresa a medias.
  if (empresaId) {
    const { error: vinculoError } = await supabase
      .from("profiles")
      .update({
        empresa_id: empresaId,
        documento: documentoDeLaPersona,
        cargo_empresa: formData.cargoEmpresa || null,
      })
      .eq("id", authData.user.id)

    if (vinculoError) {
      return {
        error:
          "Tu cuenta se ha creado, pero no se ha podido vincular con la empresa. Inicia sesión y complétalo desde Mi Empresa.",
      }
    }
  }

  return { data: { success: true, user: authData.user } }
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

  const { data: profile } = await supabase.from("profiles").select("empresa_id").eq("id", user.id).single()

  if (!profile?.empresa_id) {
    return { error: "No perteneces a ninguna empresa" }
  }

  const { data, error } = await supabase.from("empresas").select("*").eq("id", profile.empresa_id).single()

  if (error) {
    return { error: error.message }
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

  const { data: profile } = await supabase.from("profiles").select("empresa_id").eq("id", user.id).single()

  if (!profile?.empresa_id) {
    return { error: "No perteneces a ninguna empresa" }
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, nombre, apellido, foto_perfil, fecha_registro")
    .eq("empresa_id", profile.empresa_id)

  if (error) {
    return { error: error.message }
  }

  // El correo de los compañeros de empresa ya no se lee de `profiles`; la RPC lo
  // da a quien comparte empresa, que es exactamente este caso.
  const { data: contactos } = await supabase.rpc("contacto_perfiles", {
    p_ids: (data || []).map((m: any) => m.id),
  })
  const conEmail = (data || []).map((m: any) => ({
    ...m,
    email: (contactos as any[] | null)?.find((c) => c.id === m.id)?.email ?? null,
  }))

  return { data: conEmail }
}
