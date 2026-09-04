"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { revalidatePath } from "next/cache"

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "")
  if (configured) return configured
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/\/$/, "")
  return vercel ? `https://${vercel}` : "http://localhost:3000"
}

function estadoCuenta(account: Awaited<ReturnType<typeof stripe.accounts.retrieve>>) {
  const requisitos = "requirements" in account ? account.requirements?.currently_due || [] : []
  const transferencias = "capabilities" in account && account.capabilities?.transfers === "active"
  return {
    stripe_onboarding_completado: "details_submitted" in account && !!account.details_submitted,
    stripe_transferencias_habilitadas: transferencias,
    stripe_payouts_habilitados: "payouts_enabled" in account && !!account.payouts_enabled,
    stripe_requisitos_pendientes: requisitos,
    stripe_estado_actualizado_at: new Date().toISOString(),
  }
}

async function usuarioProfesional() {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" as const }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" as const }

  // `profiles.email` no es legible directamente para usuarios autenticados:
  // las columnas personales se sirven mediante RPC (scripts/042-043). Para
  // Connect ya tenemos el correo verificado en `auth.getUser()`, así que pedir
  // esa columna hacía fallar toda la consulta y parecía que no existía la ficha
  // profesional aunque sí estuviera creada.
  const { data: perfil, error: perfilError } = await supabase
    .from("profiles")
    .select("id, nombre, apellido")
    .eq("id", user.id)
    .maybeSingle()
  const { data: profesional, error } = await supabase
    .from("profesionales")
    .select(
      "id, stripe_account_id, stripe_onboarding_completado, stripe_transferencias_habilitadas, stripe_payouts_habilitados, stripe_requisitos_pendientes",
    )
    .eq("id", user.id)
    .maybeSingle()

  if (perfilError) return { error: `No se pudo leer el perfil: ${perfilError.message}` as const }
  if (error) return { error: `No se pudo leer Stripe Connect: ${error.message}` as const }
  if (!perfil || !profesional) return { error: "Necesitas un perfil profesional antes de configurar cobros." as const }
  return { supabase, user, perfil, profesional }
}

export async function obtenerEstadoStripeConnect() {
  const contexto = await usuarioProfesional()
  if ("error" in contexto) return { error: contexto.error }
  const { supabase, profesional } = contexto

  if (!profesional.stripe_account_id) {
    return {
      data: {
        conectado: false,
        onboardingCompletado: false,
        transferenciasHabilitadas: false,
        payoutsHabilitados: false,
        requisitosPendientes: [] as string[],
      },
    }
  }

  try {
    const account = await stripe.accounts.retrieve(profesional.stripe_account_id)
    if ("deleted" in account && account.deleted) {
      await supabase
        .from("profesionales")
        .update({
          stripe_account_id: null,
          stripe_onboarding_completado: false,
          stripe_transferencias_habilitadas: false,
          stripe_payouts_habilitados: false,
          stripe_requisitos_pendientes: [],
          stripe_estado_actualizado_at: new Date().toISOString(),
        })
        .eq("id", profesional.id)
      return { data: { conectado: false, onboardingCompletado: false, transferenciasHabilitadas: false, payoutsHabilitados: false, requisitosPendientes: [] as string[] } }
    }

    const estado = estadoCuenta(account)
    await supabase.from("profesionales").update(estado).eq("id", profesional.id)
    return {
      data: {
        conectado: true,
        onboardingCompletado: estado.stripe_onboarding_completado,
        transferenciasHabilitadas: estado.stripe_transferencias_habilitadas,
        payoutsHabilitados: estado.stripe_payouts_habilitados,
        requisitosPendientes: estado.stripe_requisitos_pendientes,
      },
    }
  } catch (error: any) {
    return { error: error.message || "No se pudo consultar la cuenta de cobros." }
  }
}

/** Crea/reutiliza una cuenta Express y devuelve un enlace alojado por Stripe. */
export async function crearEnlaceOnboardingStripe() {
  const contexto = await usuarioProfesional()
  if ("error" in contexto) return { error: contexto.error }
  const { supabase, user, perfil, profesional } = contexto

  try {
    let accountId = profesional.stripe_account_id as string | null
    if (!accountId) {
      const account = await stripe.accounts.create(
        {
          type: "express",
          country: "ES",
          email: user.email || undefined,
          business_profile: {
            name: [perfil.nombre, perfil.apellido].filter(Boolean).join(" ") || undefined,
            product_description: "Servicios profesionales contratados a través de Diime",
          },
          capabilities: { transfers: { requested: true } },
          metadata: { diime_profesional_id: profesional.id },
        },
        { idempotencyKey: `diime-connect-account-${profesional.id}` },
      )
      accountId = account.id
      const { error } = await supabase
        .from("profesionales")
        .update({ stripe_account_id: accountId, ...estadoCuenta(account) })
        .eq("id", profesional.id)
      if (error) throw error
    }

    const base = siteUrl()
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/stripe/connect/refresh`,
      return_url: `${base}/stripe/connect/return`,
      type: "account_onboarding",
      collection_options: { fields: "eventually_due" },
    })
    return { data: { url: link.url } }
  } catch (error: any) {
    return { error: error.message || "No se pudo iniciar el alta de cobros con Stripe." }
  }
}

/** Enlace de un solo uso al Express Dashboard; nunca se envía por email. */
export async function crearEnlaceDashboardStripe() {
  const contexto = await usuarioProfesional()
  if ("error" in contexto) return { error: contexto.error }
  const { profesional } = contexto
  if (!profesional.stripe_account_id) return { error: "Completa primero el alta de cobros." }

  try {
    const link = await stripe.accounts.createLoginLink(profesional.stripe_account_id)
    return { data: { url: link.url } }
  } catch (error: any) {
    return { error: error.message || "No se pudo abrir el panel de cobros." }
  }
}

export async function refrescarEstadoStripeConnect() {
  const resultado = await obtenerEstadoStripeConnect()
  revalidatePath("/mi-perfil")
  return resultado
}
