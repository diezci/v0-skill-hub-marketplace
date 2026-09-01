"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function obtenerUsuarioParaAdmin(usuarioId: string) {
  if (!UUID_RE.test(usuarioId)) return { error: "Usuario no válido" }

  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "No autenticado" }

  const { data: admin } = await supabase
    .from("profiles")
    .select("es_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (!admin?.es_admin) return { error: "No tienes permiso para ver este perfil" }

  const { data: perfil, error: perfilError } = await supabase
    .from("profiles")
    .select(
      "id, nombre, apellido, foto_perfil, foto_portada, ubicacion, bio, tipo_usuario, verificado, fecha_registro, ultima_conexion, created_at, updated_at, es_admin, empresa_id, cargo_empresa, email_notificaciones, cuenta_eliminada",
    )
    .eq("id", usuarioId)
    .maybeSingle()

  if (perfilError) return { error: perfilError.message }
  if (!perfil) return { error: "Usuario no encontrado" }

  const [contactoRes, profesionalRes, solicitudesRes, ofertasRes, trabajosRes] = await Promise.all([
    supabase.rpc("contacto_perfiles", { p_ids: [usuarioId] }),
    supabase.from("profesionales").select("*").eq("id", usuarioId).maybeSingle(),
    supabase.from("solicitudes").select("id", { count: "exact", head: true }).eq("cliente_id", usuarioId),
    supabase.from("ofertas").select("id", { count: "exact", head: true }).eq("profesional_id", usuarioId),
    supabase
      .from("trabajos")
      .select("id", { count: "exact", head: true })
      .or(`cliente_id.eq.${usuarioId},profesional_id.eq.${usuarioId}`),
  ])

  const contacto = (contactoRes.data as any[] | null)?.[0] ?? null

  let empresa = null
  if (perfil.empresa_id) {
    const { data } = await supabase
      .from("empresas")
      .select("id, nombre, cif, logo, descripcion, ubicacion, telefono, email, sitio_web, verificada")
      .eq("id", perfil.empresa_id)
      .maybeSingle()
    empresa = data ?? null
  }

  return {
    data: {
      ...perfil,
      email: contacto?.email ?? null,
      telefono: contacto?.telefono ?? null,
      documento: contacto?.documento ?? null,
      profesional: profesionalRes.data ?? null,
      empresa,
      actividad: {
        solicitudes: solicitudesRes.count ?? 0,
        ofertas: ofertasRes.count ?? 0,
        trabajos: trabajosRes.count ?? 0,
      },
    },
  }
}

export async function actualizarVerificacionProfesional(profesionalId: string, verificado: boolean) {
  if (!profesionalId || typeof verificado !== "boolean") {
    return { error: "Solicitud de verificación no válida" }
  }

  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "No autenticado" }

  const { data: admin } = await supabase
    .from("profiles")
    .select("es_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (!admin?.es_admin) {
    return { error: "No tienes permiso para verificar profesionales" }
  }

  const { data: profesional, error: profesionalError } = await supabase
    .from("profesionales")
    .select("id")
    .eq("id", profesionalId)
    .maybeSingle()

  if (profesionalError) return { error: profesionalError.message }
  if (!profesional) return { error: "El usuario seleccionado no es profesional" }

  const { data: actualizado, error } = await supabase.rpc("actualizar_verificacion_profesional", {
    p_profesional_id: profesionalId,
    p_verificado: verificado,
  })

  if (error) return { error: error.message }
  if (!actualizado) {
    return {
      error:
        "No se pudo actualizar la verificación. Comprueba que la migración de permisos administrativos esté aplicada.",
    }
  }

  // El cambio principal ya está guardado. El aviso es complementario y no debe
  // deshacer la operación si el canal de notificaciones no está disponible.
  try {
    const { crearNotificacion } = await import("./notificaciones")
    await crearNotificacion({
      usuarioId: profesionalId,
      tipo: verificado ? "perfil_verificado" : "verificacion_retirada",
      titulo: verificado ? "Tu perfil profesional ha sido verificado" : "Se ha retirado la verificación de tu perfil",
      mensaje: verificado
        ? "El equipo de Diime ha verificado tu perfil profesional. La insignia ya aparece en tu perfil."
        : "El equipo de Diime ha retirado la insignia de verificación de tu perfil profesional.",
      link: "/mi-perfil",
    })
  } catch {
    // La verificación ya quedó guardada; un fallo del aviso no debe convertirla
    // en un error para el administrador ni provocar un segundo intento.
  }

  revalidatePath("/admin/usuarios")
  revalidatePath("/profesionales")
  revalidatePath(`/profesional/${profesionalId}`)
  revalidatePath("/mi-perfil")

  return { success: true, verificado }
}
