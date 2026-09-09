"use server"

import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
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
  aceptaTerminos: boolean
  confirmaMayoriaEdad: boolean
}) {
  const supabase = await createClient()
  if (!supabase) return { error: "No se pudo conectar con la base de datos" }
  if (!formData.aceptaTerminos) {
    return { error: "Debes aceptar los Términos y las Normas de la comunidad." }
  }
  if (!formData.confirmaMayoriaEdad) {
    return { error: "Para crear una cuenta debes confirmar que tienes 18 años o más." }
  }

  const registroEmpresa = formData.tipoEntidad === "empresa" ? {
    tokenInvitacion: formData.tokenInvitacion?.trim() || undefined,
    nombreEmpresa: formData.nombreEmpresa?.trim(),
    cif: formData.documento?.trim().toUpperCase(),
    documentoPersonal: formData.documentoPersonal?.trim() || "",
    cargoEmpresa: formData.cargoEmpresa,
    telefono: formData.telefono,
    ubicacion: formData.ubicacion,
  } : null
  if (registroEmpresa && !registroEmpresa.documentoPersonal) {
    return { error: "Indica tu DNI/NIE como persona que representa a la empresa" }
  }
  if (registroEmpresa && !registroEmpresa.tokenInvitacion && (!registroEmpresa.nombreEmpresa || !registroEmpresa.cif)) {
    return { error: "Indica el nombre y CIF de tu empresa o utiliza una invitación" }
  }
  const documentoDeLaPersona = registroEmpresa?.documentoPersonal || formData.documento || null

  const aceptacionLegal = new Date().toISOString()

  // Use NEXT_PUBLIC_SITE_URL for production, fallback to VERCEL_URL, then localhost
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL 
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || "http://localhost:3000"

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      emailRedirectTo: registroEmpresa ? `${siteUrl}/auth/callback?next=/mi-empresa` : `${siteUrl}/auth/callback`,
      data: {
        nombre: formData.nombre,
        apellido: formData.apellido,
        tipo_entidad: formData.tipoEntidad,
        documento: documentoDeLaPersona,
        registro_empresa: registroEmpresa,
        telefono: formData.telefono,
        ubicacion: formData.ubicacion,
        terms_accepted_at: aceptacionLegal,
        terms_version: "2026-08",
        mayor_edad_confirmada_at: aceptacionLegal,
        mayor_edad_version: "18-plus-2026-08",
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

  // Con confirmación por correo todavía no hay sesión: el trigger crea el
  // perfil y la empresa se completa al entrar en Mi Empresa tras verificarlo.
  if (!authData.session) {
    return { data: { success: true, user: authData.user, empresaPendiente: !!registroEmpresa } }
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
        documento: documentoDeLaPersona,
        cargo_empresa: formData.cargoEmpresa || null,
        mayor_edad_confirmada_at: aceptacionLegal,
        mayor_edad_version: "18-plus-2026-08",
      },
      { onConflict: "id" },
    )

  // Profile may already be auto-created by the DB trigger, or RLS may block
  // because email confirmation is required and there's no session yet.
  // We swallow these specific errors silently — the trigger handles the base row.
  // Durante un despliegue escalonado el código puede llegar unos minutos antes
  // que la migración 039. En ese único caso la confirmación ya queda guardada
  // en auth.user_metadata y el trigger existente conserva el perfil base; no se
  // debe presentar como fallido un registro que en realidad se ha creado.
  const faltanColumnasEdad =
    profileError?.code === "PGRST204" &&
    /mayor_edad_(confirmada_at|version)/.test(profileError.message || "")

  if (
    profileError &&
    !profileError.message?.includes("row-level security") &&
    profileError.code !== "23505" &&
    !faltanColumnasEdad
  ) {
    return { error: profileError.message }
  }

  if (registroEmpresa) {
    const { completarRegistroEmpresa } = await import("./empresas")
    const resultado = await completarRegistroEmpresa(registroEmpresa)
    if (resultado.error) {
      // La cuenta ya existe. Conservar el borrador permite corregir un token o
      // reanudar después de verificar el correo sin volver a registrar el email.
      return { data: { success: true, user: authData.user, empresaPendiente: true }, aviso: resultado.error }
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

export async function confirmarMayoriaEdad() {
  const supabase = await createClient()
  if (!supabase) return { error: "No se pudo conectar con la base de datos" }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Debes iniciar sesión" }

  const confirmadoAt = new Date().toISOString()
  const version = "18-plus-2026-08"

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ mayor_edad_confirmada_at: confirmadoAt, mayor_edad_version: version })
    .eq("id", user.id)

  if (profileError) return { error: "No se ha podido guardar la confirmación. Inténtalo de nuevo." }

  const { error: authError } = await supabase.auth.updateUser({
    data: { mayor_edad_confirmada_at: confirmadoAt, mayor_edad_version: version },
  })

  if (authError) return { error: "La confirmación se guardó, pero no se pudo actualizar la sesión." }

  return { data: { confirmadoAt } }
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


export type ConsecuenciasBaja = {
  es_profesional: boolean
  demandas_a_borrar: number
  ofertas_a_retirar: number
  trabajos_proveedor: number
  importe_a_devolver: number
  trabajos_cliente_con_dinero: number
  importe_en_custodia: number
  trabajos_cliente_sin_pagar: number
  disputas_abiertas: number
  trabajos_pendientes: number
  pagos_pendientes: number
}

// Qué le va a pasar EXACTAMENTE a esta persona si se da de baja. Se enseña antes
// de pedir la confirmación: un aviso genérico no sirve cuando lo que está en
// juego es dinero de otro.
export async function consecuenciasDeEliminarMiCuenta() {
  const supabase = await createClient()
  if (!supabase) return { error: "No se pudo conectar con la base de datos" }

  const { data, error } = await supabase.rpc("consecuencias_de_eliminar_mi_cuenta")
  if (error) return { error: error.message }

  const c = data as any
  return {
    data: {
      es_profesional: !!c.es_profesional,
      demandas_a_borrar: Number(c.demandas_a_borrar ?? 0),
      ofertas_a_retirar: Number(c.ofertas_a_retirar ?? 0),
      trabajos_proveedor: Number(c.trabajos_proveedor ?? 0),
      importe_a_devolver: Number(c.importe_a_devolver ?? 0),
      trabajos_cliente_con_dinero: Number(c.trabajos_cliente_con_dinero ?? 0),
      importe_en_custodia: Number(c.importe_en_custodia ?? 0),
      trabajos_cliente_sin_pagar: Number(c.trabajos_cliente_sin_pagar ?? 0),
      disputas_abiertas: Number(c.disputas_abiertas ?? 0),
      trabajos_pendientes: Number(c.trabajos_pendientes ?? 0),
      pagos_pendientes: Number(c.pagos_pendientes ?? 0),
    } satisfies ConsecuenciasBaja,
  }
}

// La baja solo se completa cuando no quedan contratos, disputas o movimientos
// de dinero abiertos. La RPC comprueba todo dentro de la misma transacción;
// una negativa conserva la sesión para que la persona pueda resolverlos.
export async function eliminarMiCuenta() {
  const supabase = await createClient()
  if (!supabase) return { error: "No se pudo conectar con la base de datos" }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Debes iniciar sesión" }

  const { error } = await supabase.rpc("eliminar_mi_cuenta")

  if (error) {
    // Los mensajes de las comprobaciones ya vienen redactados en castellano y
    // dicen qué hay que hacer antes, así que se enseñan tal cual.
    return { error: error.message }
  }

  // La sesión en curso seguiría siendo válida hasta que caducara el token, así
  // que se cierra aquí mismo.
  //
  // `scope: "local"` a propósito: el cierre normal llama al endpoint /logout de
  // Supabase con el token del usuario, y ese usuario acaba de quedar baneado
  // dentro de la función, así que la llamada falla y la cookie se queda puesta
  // (probado: se volvía al inicio con la sesión todavía activa). En local no se
  // llama a nadie, solo se borra la sesión de las cookies, que es lo que hace
  // falta: el acceso ya está cortado en el servidor.
  await supabase.auth.signOut({ scope: "local" })

  // Y por si acaso, se barren a mano las cookies de sesión que hayan quedado.
  const cookieStore = await cookies()
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith("sb-")) cookieStore.delete(c.name)
  }

  return { data: { success: true } }
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
