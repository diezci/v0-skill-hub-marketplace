"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { errorIdentidadCuentaStripe } from "@/lib/stripe-connect-identidad"
import { revalidatePath } from "next/cache"

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "")
  if (configured) return configured
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/\/$/, "")
  return vercel ? `https://${vercel}` : "http://localhost:3000"
}

function rutaRetornoSegura(ruta?: string) {
  return ruta?.startsWith("/") && !ruta.startsWith("//") ? ruta : "/cobros"
}

type OpcionesOnboarding = {
  appNativa?: boolean
  volverA?: string
}

export type SaldoStripePorMoneda = {
  moneda: string
  disponible: number
  pendiente: number
  instantaneo: number
}

export type EstadoStripeConnect = {
  conectado: boolean
  onboardingCompletado: boolean
  transferenciasHabilitadas: boolean
  payoutsHabilitados: boolean
  requisitosPendientes: string[]
  saldo: {
    saldos: SaldoStripePorMoneda[]
    proximoIngreso: {
      importe: number
      moneda: string
      llegada: number
      estado: string
      metodo: string
    } | null
    proximaDisponibilidad: {
      fecha: number
      moneda: string
    } | null
    calendario: {
      intervalo: "daily" | "manual" | "monthly" | "weekly" | null
      diasSemana: string[]
      diasMes: number[]
      demoraDias: number | null
    } | null
    modoReal: boolean
    actualizadoEn: string
  } | null
  saldoError: string | null
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
    .select("id, nombre, apellido, empresa_id")
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
  const admin = createAdminClient()
  if (!admin) return { error: "No se pudo preparar la conexión segura de cobros." as const }
  return { supabase, admin, user, perfil, profesional }
}

export async function obtenerEstadoStripeConnect() {
  const contexto = await usuarioProfesional()
  if ("error" in contexto) return { error: contexto.error }
  const { admin, perfil, profesional } = contexto

  if (!profesional.stripe_account_id) {
    return {
      data: {
        conectado: false,
        onboardingCompletado: false,
        transferenciasHabilitadas: false,
        payoutsHabilitados: false,
        requisitosPendientes: [] as string[],
        saldo: null,
        saldoError: null,
      } satisfies EstadoStripeConnect,
    }
  }

  try {
    const account = await stripe.accounts.retrieve(profesional.stripe_account_id)
    if ("deleted" in account && account.deleted) {
      const { error: guardarError } = await admin
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
      if (guardarError) throw guardarError
      return {
        data: {
          conectado: false,
          onboardingCompletado: false,
          transferenciasHabilitadas: false,
          payoutsHabilitados: false,
          requisitosPendientes: [] as string[],
          saldo: null,
          saldoError: null,
        } satisfies EstadoStripeConnect,
      }
    }

    const estado = estadoCuenta(account)
    const errorIdentidad = errorIdentidadCuentaStripe(account, perfil)
    if (errorIdentidad) {
      await admin.from("profesionales").update({
        stripe_onboarding_completado: false,
        stripe_transferencias_habilitadas: false,
        stripe_payouts_habilitados: false,
        stripe_estado_actualizado_at: new Date().toISOString(),
      }).eq("id", profesional.id)
      return { error: errorIdentidad }
    }
    const { data: guardado, error: guardarError } = await admin.rpc("actualizar_estado_cuenta_stripe", {
      p_profesional_id: profesional.id,
      p_account_id: profesional.stripe_account_id,
      p_empresa_esperada: perfil.empresa_id,
      p_onboarding: estado.stripe_onboarding_completado,
      p_transferencias: estado.stripe_transferencias_habilitadas,
      p_payouts: estado.stripe_payouts_habilitados,
      p_requisitos: estado.stripe_requisitos_pendientes,
    })
    if (guardarError) throw guardarError
    if (!guardado) return { error: "Tu perfil de cobros ha cambiado. Actualiza el estado para volver a comprobarlo." }

    const opcionesCuenta = { stripeAccount: profesional.stripe_account_id }
    const [resultadoSaldo, resultadoPayouts, resultadoMovimientos, resultadoCalendario] = await Promise.allSettled([
      stripe.balance.retrieve({}, opcionesCuenta),
      stripe.payouts.list({ limit: 100 }, opcionesCuenta),
      stripe.balanceTransactions.list({ limit: 100 }, opcionesCuenta),
      stripe.balanceSettings.retrieve({}, opcionesCuenta),
    ])

    let saldo: EstadoStripeConnect["saldo"] = null
    const erroresSaldo: string[] = []

    if (resultadoSaldo.status === "fulfilled") {
      const balance = resultadoSaldo.value
      const monedas = new Set([
        ...balance.available.map((item) => item.currency),
        ...balance.pending.map((item) => item.currency),
        ...(balance.instant_available || []).map((item) => item.currency),
      ])
      const sumar = (items: Array<{ amount: number; currency: string }>, moneda: string) =>
        items.reduce((total, item) => total + (item.currency === moneda ? item.amount : 0), 0)

      const saldos = Array.from(monedas)
        .map((moneda) => ({
          moneda,
          disponible: sumar(balance.available, moneda),
          pendiente: sumar(balance.pending, moneda),
          instantaneo: sumar(balance.instant_available || [], moneda),
        }))
        .sort((a, b) => {
          if (a.moneda === "eur") return -1
          if (b.moneda === "eur") return 1
          return a.moneda.localeCompare(b.moneda)
        })

      let proximoIngreso: NonNullable<EstadoStripeConnect["saldo"]>["proximoIngreso"] = null
      if (resultadoPayouts.status === "fulfilled") {
        for (const payout of resultadoPayouts.value.data) {
          if (payout.status !== "pending" && payout.status !== "in_transit") continue
          if (!proximoIngreso || payout.arrival_date < proximoIngreso.llegada) {
            proximoIngreso = {
              importe: payout.amount,
              moneda: payout.currency,
              llegada: payout.arrival_date,
              estado: payout.status,
              metodo: payout.method,
            }
          }
        }
      } else {
        erroresSaldo.push("la fecha del próximo ingreso")
      }

      let proximaDisponibilidad: NonNullable<EstadoStripeConnect["saldo"]>["proximaDisponibilidad"] = null
      if (resultadoMovimientos.status === "fulfilled") {
        for (const movimiento of resultadoMovimientos.value.data) {
          if (movimiento.status !== "pending" || movimiento.net <= 0) continue
          if (!proximaDisponibilidad || movimiento.available_on < proximaDisponibilidad.fecha) {
            proximaDisponibilidad = {
              fecha: movimiento.available_on,
              moneda: movimiento.currency,
            }
          }
        }
      } else {
        erroresSaldo.push("la disponibilidad del saldo pendiente")
      }

      let calendario: NonNullable<EstadoStripeConnect["saldo"]>["calendario"] = null
      if (resultadoCalendario.status === "fulfilled") {
        const pagos = resultadoCalendario.value.payments
        calendario = {
          intervalo: pagos.payouts?.schedule?.interval || null,
          diasSemana: pagos.payouts?.schedule?.weekly_payout_days || [],
          diasMes: pagos.payouts?.schedule?.monthly_payout_days || [],
          demoraDias: pagos.settlement_timing?.delay_days ?? null,
        }
      } else {
        erroresSaldo.push("el calendario de ingresos")
      }

      saldo = {
        saldos,
        proximoIngreso,
        proximaDisponibilidad,
        calendario,
        modoReal: balance.livemode,
        actualizadoEn: new Date().toISOString(),
      }
    } else {
      erroresSaldo.push("el saldo")
    }

    return {
      data: {
        conectado: true,
        onboardingCompletado: estado.stripe_onboarding_completado,
        transferenciasHabilitadas: estado.stripe_transferencias_habilitadas,
        payoutsHabilitados: estado.stripe_payouts_habilitados,
        requisitosPendientes: estado.stripe_requisitos_pendientes,
        saldo,
        saldoError:
          erroresSaldo.length > 0
            ? `Stripe no ha podido consultar ${erroresSaldo.join(", ")} en este momento.`
            : null,
      } satisfies EstadoStripeConnect,
    }
  } catch (error: any) {
    return { error: error.message || "No se pudo consultar la cuenta de cobros." }
  }
}

/** Crea/reutiliza una cuenta Express y devuelve un enlace alojado por Stripe. */
export async function crearEnlaceOnboardingStripe(opciones: OpcionesOnboarding = {}) {
  const contexto = await usuarioProfesional()
  if ("error" in contexto) return { error: contexto.error }
  const { admin, user, perfil, profesional } = contexto

  try {
    let accountId = profesional.stripe_account_id as string | null
    if (!accountId) {
      let nombreCobros = [perfil.nombre, perfil.apellido].filter(Boolean).join(" ")
      if (perfil.empresa_id) {
        const { data: empresa, error: empresaError } = await admin.from("empresas")
          .select("nombre").eq("id", perfil.empresa_id).single()
        if (empresaError || !empresa) return { error: "No se pudieron verificar los datos de tu empresa." }
        nombreCobros = empresa.nombre
      }
      const account = await stripe.accounts.create(
        {
          type: "express",
          country: "ES",
          business_type: perfil.empresa_id ? "company" : "individual",
          email: user.email || undefined,
          business_profile: {
            name: nombreCobros || undefined,
            product_description: "Servicios profesionales contratados a través de Diime",
          },
          capabilities: { transfers: { requested: true } },
          metadata: { diime_profesional_id: profesional.id, ...(perfil.empresa_id ? { diime_empresa_id: perfil.empresa_id } : {}) },
        },
        { idempotencyKey: `diime-connect-account-${profesional.id}` },
      )
      accountId = account.id
      const { error } = await admin
        .from("profesionales")
        .update({ stripe_account_id: accountId, ...estadoCuenta(account) })
        .eq("id", profesional.id)
      if (error) throw error
    }

    const cuenta = await stripe.accounts.retrieve(accountId)
    const errorIdentidad = errorIdentidadCuentaStripe(cuenta, perfil)
    if (errorIdentidad) return { error: errorIdentidad }

    const base = siteUrl()
    const parametrosRetorno = new URLSearchParams({ volver: rutaRetornoSegura(opciones.volverA) })
    if (opciones.appNativa) parametrosRetorno.set("native", "1")
    const returnUrl = `${base}/stripe/connect/return?${parametrosRetorno.toString()}`
    const refreshUrl = `${base}/stripe/connect/refresh?${parametrosRetorno.toString()}`
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
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
  const { perfil, profesional } = contexto
  if (!profesional.stripe_account_id) return { error: "Completa primero el alta de cobros." }

  try {
    const cuenta = await stripe.accounts.retrieve(profesional.stripe_account_id)
    const errorIdentidad = errorIdentidadCuentaStripe(cuenta, perfil)
    if (errorIdentidad) return { error: errorIdentidad }
    const link = await stripe.accounts.createLoginLink(profesional.stripe_account_id)
    return { data: { url: link.url } }
  } catch (error: any) {
    return { error: error.message || "No se pudo abrir el panel de cobros." }
  }
}

export async function refrescarEstadoStripeConnect() {
  const resultado = await obtenerEstadoStripeConnect()
  revalidatePath("/cobros")
  return resultado
}
