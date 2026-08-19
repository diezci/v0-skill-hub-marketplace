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
}) {
  const supabase = await createClient()
  if (!supabase) return { error: "No se pudo conectar con la base de datos" }
  if (!formData.aceptaTerminos) {
    return { error: "Debes aceptar los Términos y las Normas de la comunidad." }
  }

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
        terms_accepted_at: new Date().toISOString(),
        terms_version: "2026-08",
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
    } satisfies ConsecuenciasBaja,
  }
}

// Baja de la cuenta a petición de la propia persona.
//
// Apple no acepta en la App Store (guía 5.1.1(v)) que el borrado haya que
// pedírselo a soporte: tiene que poder completarlo el usuario desde la app.
//
// El orden importa: primero se cierra el dinero (reembolsos de Stripe y avisos a
// la otra parte, que tienen que salir de aquí y no de la base de datos), y solo
// al final se llama a `eliminar_mi_cuenta()` (scripts/046), que es lo que corta
// el acceso. Si se hiciera al revés, el usuario quedaría baneado a mitad y los
// reembolsos se quedarían sin hacer.
//
// Lo que NO se borra —nombre, NIF, dirección, correo, y los trabajos y facturas
// cerrados— está explicado en scripts/046: la otra parte tiene que poder
// reclamar contra alguien con nombre y apellidos.
export async function eliminarMiCuenta() {
  const supabase = await createClient()
  if (!supabase) return { error: "No se pudo conectar con la base de datos" }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Debes iniciar sesión" }

  const { crearNotificacion } = await import("./notificaciones")
  const { reembolsarPorCancelacion } = await import("./escrow")

  const { data: perfil } = await supabase
    .from("profiles")
    .select("nombre, apellido")
    .eq("id", user.id)
    .maybeSingle()
  const quienSeVa = `${perfil?.nombre ?? ""} ${perfil?.apellido ?? ""}`.trim() || "El otro usuario"

  const { data: trabajosVivos } = await supabase
    .from("trabajos")
    .select("id, titulo, estado, cliente_id, profesional_id")
    .or(`cliente_id.eq.${user.id},profesional_id.eq.${user.id}`)
    .in("estado", ["pendiente_pago", "en_progreso", "entregado"])

  for (const t of trabajosVivos ?? []) {
    const titulo = t.titulo ?? "un trabajo"

    if (t.profesional_id === user.id) {
      // Se va el proveedor: el trabajo no lo va a hacer nadie, así que se
      // cancela y el cliente recupera hasta el último euro (incluida la
      // comisión: no llegó a prestarse ningún servicio).
      const refund = await reembolsarPorCancelacion(t.id)
      if ((refund as any)?.error) {
        return {
          error: `No se ha podido devolver el dinero de "${titulo}". No se ha dado de baja la cuenta; inténtalo de nuevo o escríbenos.`,
        }
      }

      await supabase
        .from("trabajos")
        .update({ estado: "cancelado", updated_at: new Date().toISOString() })
        .eq("id", t.id)

      const devuelto = Number((refund as any)?.reembolso ?? 0)
      await crearNotificacion({
        usuarioId: t.cliente_id,
        tipo: "trabajo_cancelado",
        titulo: "El profesional se ha dado de baja",
        mensaje:
          devuelto > 0
            ? `${quienSeVa} ha cerrado su cuenta, así que "${titulo}" queda cancelado y se te devuelven ${devuelto.toFixed(2)}€. El reembolso tarda unos días en verse en tu banco.`
            : `${quienSeVa} ha cerrado su cuenta, así que "${titulo}" queda cancelado. No habías llegado a pagar nada.`,
        link: "/mis-solicitudes",
      })
      continue
    }

    // Se va el cliente.
    if (t.estado === "pendiente_pago") {
      // Todavía no había pagado: no hay dinero de por medio, se cancela y ya.
      await supabase
        .from("trabajos")
        .update({ estado: "cancelado", updated_at: new Date().toISOString() })
        .eq("id", t.id)

      await crearNotificacion({
        usuarioId: t.profesional_id,
        tipo: "trabajo_cancelado",
        titulo: "El cliente se ha dado de baja",
        mensaje: `${quienSeVa} ha cerrado su cuenta antes de pagar, así que "${titulo}" queda cancelado.`,
        link: "/mis-trabajos",
      })
      continue
    }

    // Hay dinero en custodia y el cliente ya no está para confirmar la entrega.
    // No se toca: lo decide Diime caso por caso, porque el trabajo puede estar
    // hecho (y habría que pagar al proveedor) o a medias.
    await crearNotificacion({
      usuarioId: t.profesional_id,
      tipo: "revision_diime",
      titulo: "El cliente se ha dado de baja: lo revisa Diime",
      mensaje: `${quienSeVa} ha cerrado su cuenta y ya no puede confirmar la recepción de "${titulo}". El dinero sigue retenido en custodia y Diime decidirá qué hacer con él. Te avisaremos.`,
      link: "/mis-trabajos",
    })

    await supabase.from("incidencias").insert({
      reportado_por: user.id,
      asunto: `Baja de cliente con pago en custodia: ${titulo}`,
      descripcion:
        `El cliente ${quienSeVa} ha cerrado su cuenta con el trabajo "${titulo}" en estado "${t.estado}" y el pago retenido en custodia. ` +
        `Nadie va a confirmar la recepción, así que hay que decidir a mano si se libera al proveedor o se reembolsa.`,
      categoria: "pago",
      prioridad: "alta",
      trabajo_id: t.id,
      usuario_reportado: null,
    })
  }

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
