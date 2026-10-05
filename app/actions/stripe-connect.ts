"use server"

import { textoServidor } from "@/lib/i18n-servidor"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { errorIdentidadCuentaStripe, errorIdentidadCuentaStripeEmpresa } from "@/lib/stripe-connect-identidad"
import { revalidatePath } from "next/cache"

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "")
  if (configured) return configured
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/\/$/, "")
  return vercel ? `https://${vercel}` : "http://localhost:3000"
}
function rutaRetornoSegura(ruta?: string) {
  return ruta?.startsWith("/") && !ruta.startsWith("//") && !ruta.includes("\\") ? ruta : "/cobros"
}
type OpcionesOnboarding = { appNativa?: boolean; volverA?: string }
export type SaldoStripePorMoneda = {
  moneda: string
  disponible: number
  pendiente: number
}

export type EstadoStripeConnect = {
  conectado: boolean
  onboardingCompletado: boolean
  transferenciasHabilitadas: boolean
  payoutsHabilitados: boolean
  requisitosPendientes: string[]
  cuentaPersonalAnterior: boolean
  avisoTitularidad: string | null
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


type ContextoConnect = {
  supabase: any; admin: any; user: { id: string; email?: string }
  id: string; empresaId: string | null; accountId: string | null; nombre: string; email?: string
}

async function comprobarAccesoEmpresa(supabase: any, empresaId: string, gestionar = false): Promise<boolean> {
  const { data: permiso, error } = await supabase.rpc("empresa_comprobar_permiso", { p_empresa_id: empresaId, p_permiso: "ver_cobros" })
  if (error || permiso !== true) return false
  if (!gestionar) return true
  // An Express login can change bank details and legal identity. It is not a
  // read-only finance view, nor a delegated collection-management permission.
  const { data, error: contextoError } = await supabase.rpc("empresa_contexto_actual")
  return !contextoError && data?.id === empresaId && data.es_responsable_principal === true
}

async function usuarioCobros(empresaId?: string, gestionar = false): Promise<ContextoConnect | { error: string }> {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }
  const admin = createAdminClient()
  if (!admin) return { error: "No se pudo preparar la conexión segura de cobros." }
  if (empresaId !== undefined) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empresaId)
      || !await comprobarAccesoEmpresa(supabase, empresaId, gestionar)) {
      return { error: gestionar ? "Solo el responsable principal puede configurar la cuenta bancaria y acceder al panel de la empresa." : "No tienes permiso para consultar los cobros de esta empresa." }
    }
    const [{ data: empresa, error: empresaError }, { data: cuenta, error: cuentaError }] = await Promise.all([
      admin.from("empresas").select("id,nombre,email").eq("id", empresaId).maybeSingle(),
      admin.from("empresa_cuentas_stripe").select("stripe_account_id").eq("empresa_id", empresaId).maybeSingle(),
    ])
    if (empresaError || cuentaError || !empresa) return { error: "No se pudieron consultar los cobros de la empresa." }
    return { supabase, admin, user, id: empresaId, empresaId, accountId: cuenta?.stripe_account_id || null, nombre: empresa.nombre, email: empresa.email || user.email }
  }
  const [{ data: perfil, error: perfilError }, { data: profesional, error }] = await Promise.all([
    supabase.from("profiles").select("id,nombre,apellido").eq("id", user.id).maybeSingle(),
    supabase.from("profesionales").select("id,stripe_account_id").eq("id", user.id).maybeSingle(),
  ])
  if (perfilError || error) return { error: "No se pudo leer tu perfil de cobros." }
  if (!perfil || !profesional) return { error: "Necesitas un perfil profesional antes de configurar cobros." }
  return { supabase, admin, user, id: user.id, empresaId: null, accountId: profesional.stripe_account_id || null, nombre: [perfil.nombre, perfil.apellido].filter(Boolean).join(" "), email: user.email }
}

function estadoCuenta(account: Awaited<ReturnType<typeof stripe.accounts.retrieve>>) {
  return {
    p_onboarding: !account.deleted && !!account.details_submitted,
    p_transferencias: !account.deleted && account.capabilities?.transfers === "active",
    p_payouts: !account.deleted && !!account.payouts_enabled,
    p_requisitos: !account.deleted ? account.requirements?.currently_due || [] : [],
  }
}
function errorIdentidad(account: Awaited<ReturnType<typeof stripe.accounts.retrieve>>, contexto: ContextoConnect) {
  return contexto.empresaId ? errorIdentidadCuentaStripeEmpresa(account, contexto.empresaId) : errorIdentidadCuentaStripe(account, { id: contexto.id })
}
const sinCuenta: EstadoStripeConnect = {
  conectado: false, onboardingCompletado: false, transferenciasHabilitadas: false,
  payoutsHabilitados: false, requisitosPendientes: [], cuentaPersonalAnterior: false,
  avisoTitularidad: null, saldo: null, saldoError: null,
}

async function consultarSaldo(accountId: string) {
    const opcionesCuenta = { stripeAccount: accountId }
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
      ])
      const sumar = (items: Array<{ amount: number; currency: string }>, moneda: string) =>
        items.reduce((total, item) => total + (item.currency === moneda ? item.amount : 0), 0)

      const saldos = Array.from(monedas)
        .map((moneda) => ({
          moneda,
          disponible: sumar(balance.available, moneda),
          pendiente: sumar(balance.pending, moneda),
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

  return { saldo, saldoError: erroresSaldo.length ? `Stripe no ha podido consultar ${erroresSaldo.join(", ")} en este momento.` : null }
}

async function obtenerEstado(empresaId?: string) {
  const contexto = await usuarioCobros(empresaId)
  if ("error" in contexto) return { error: await textoServidor(contexto.error) }
  if (!contexto.accountId) return { data: { ...sinCuenta } }
  try {
    const cuenta = await stripe.accounts.retrieve(contexto.accountId)
    const identidadError = errorIdentidad(cuenta, contexto)
    const estado = estadoCuenta(cuenta)
    const { data: guardado, error } = await contexto.admin.rpc(contexto.empresaId ? "actualizar_estado_cuenta_stripe_empresa" : "actualizar_estado_cuenta_stripe", {
      ...(contexto.empresaId ? { p_empresa_id: contexto.empresaId } : { p_profesional_id: contexto.id, p_empresa_esperada: null }),
      p_account_id: contexto.accountId, ...estado,
      p_onboarding: !identidadError && estado.p_onboarding,
      p_transferencias: !identidadError && estado.p_transferencias,
      p_payouts: !identidadError && estado.p_payouts,
    })
    if (error) throw error
    if (!guardado) throw new Error("La cuenta de cobros ha cambiado. Actualiza el estado para volver a comprobarlo.")
    if (identidadError) return { error: await textoServidor(identidadError) }
    const saldos = await consultarSaldo(contexto.accountId)
    if (contexto.empresaId && !await comprobarAccesoEmpresa(contexto.supabase, contexto.empresaId)) {
      return { error: await textoServidor("Ya no tienes permiso para consultar los cobros de esta empresa.") }
    }
    return { data: { ...sinCuenta, conectado: true, onboardingCompletado: estado.p_onboarding,
      transferenciasHabilitadas: estado.p_transferencias, payoutsHabilitados: estado.p_payouts,
      requisitosPendientes: estado.p_requisitos, ...saldos } satisfies EstadoStripeConnect }
  } catch (error: any) { return { error: await textoServidor(error.message || "No se pudo consultar la cuenta de cobros.") } }
}

export async function obtenerEstadoStripeConnect() { return obtenerEstado() }
export async function obtenerEstadoStripeConnectEmpresa(empresaId: string) { return obtenerEstado(empresaId) }

async function crearOnboarding(opciones: OpcionesOnboarding, empresaId?: string) {
  const contexto = await usuarioCobros(empresaId, true)
  if ("error" in contexto) return { error: await textoServidor(contexto.error) }
  try {
    let accountId = contexto.accountId
    if (!accountId) {
      const empresa = !!contexto.empresaId
      const cuenta = await stripe.accounts.create({
        type: "express", country: "ES", business_type: empresa ? "company" : "individual",
        email: contexto.email || undefined,
        business_profile: { name: contexto.nombre || undefined, product_description: "Servicios profesionales contratados a través de Diime" },
        capabilities: { transfers: { requested: true } },
        metadata: empresa
          ? { diime_proveedor_tipo: "empresa", diime_empresa_id: contexto.id, diime_actor_creacion_id: contexto.user.id }
          : { diime_proveedor_tipo: "personal", diime_profesional_id: contexto.id },
      }, { idempotencyKey: `diime-connect-${empresa ? "empresa" : "personal"}-${contexto.id}` })
      const { data, error } = await contexto.admin.rpc(empresa ? "registrar_cuenta_stripe_empresa" : "registrar_cuenta_stripe_personal", {
        ...(empresa ? { p_empresa_id: contexto.id, p_actor: contexto.user.id } : { p_profesional_id: contexto.id }),
        p_account_id: cuenta.id,
      })
      if (error) throw error
      if (data !== cuenta.id) throw new Error("La cuenta de cobros ha cambiado. Actualiza el estado antes de continuar.")
      accountId = cuenta.id
    }
    const cuenta = await stripe.accounts.retrieve(accountId)
    const identidadError = errorIdentidad(cuenta, contexto)
    if (identidadError) return { error: await textoServidor(identidadError) }
    if (contexto.empresaId && !await comprobarAccesoEmpresa(contexto.supabase, contexto.empresaId, true)) {
      return { error: await textoServidor("Ya no tienes permiso para configurar la cuenta de la empresa.") }
    }
    const parametros = new URLSearchParams({ volver: rutaRetornoSegura(opciones.volverA || (empresaId ? "/mi-empresa?tab=cobros" : "/cobros")) })
    if (opciones.appNativa) parametros.set("native", "1")
    if (empresaId) parametros.set("empresa", empresaId)
    const link = await stripe.accountLinks.create({ account: accountId,
      refresh_url: `${siteUrl()}/stripe/connect/refresh?${parametros}`,
      return_url: `${siteUrl()}/stripe/connect/return?${parametros}`,
      type: "account_onboarding", collection_options: { fields: "eventually_due" },
    })
    if (contexto.empresaId && !await comprobarAccesoEmpresa(contexto.supabase, contexto.empresaId, true)) {
      return { error: await textoServidor("Ya no tienes permiso para acceder al panel de la empresa.") }
    }
    return { data: { url: link.url } }
  } catch (error: any) { return { error: await textoServidor(error.message || "No se pudo iniciar el alta de cobros con Stripe.") } }
}
export async function crearEnlaceOnboardingStripe(opciones: OpcionesOnboarding = {}) { return crearOnboarding(opciones) }
export async function crearEnlaceOnboardingStripeEmpresa(empresaId: string, opciones: OpcionesOnboarding = {}) { return crearOnboarding(opciones, empresaId) }

async function crearDashboard(empresaId?: string) {
  const contexto = await usuarioCobros(empresaId, true)
  if ("error" in contexto) return { error: await textoServidor(contexto.error) }
  if (!contexto.accountId) return { error: await textoServidor("Completa primero el alta de cobros.") }
  try {
    const cuenta = await stripe.accounts.retrieve(contexto.accountId)
    const identidadError = errorIdentidad(cuenta, contexto)
    if (identidadError) return { error: await textoServidor(identidadError) }
    if (contexto.empresaId && !await comprobarAccesoEmpresa(contexto.supabase, contexto.empresaId, true)) {
      return { error: await textoServidor("Ya no tienes permiso para acceder al panel de la empresa.") }
    }
    const link = await stripe.accounts.createLoginLink(contexto.accountId)
    if (contexto.empresaId && !await comprobarAccesoEmpresa(contexto.supabase, contexto.empresaId, true)) {
      return { error: await textoServidor("Ya no tienes permiso para acceder al panel de la empresa.") }
    }
    return { data: { url: link.url } }
  } catch (error: any) { return { error: await textoServidor(error.message || "No se pudo abrir el panel de cobros.") } }
}
export async function crearEnlaceDashboardStripe() { return crearDashboard() }
export async function crearEnlaceDashboardStripeEmpresa(empresaId: string) { return crearDashboard(empresaId) }
export async function refrescarEstadoStripeConnect() {
  const resultado = await obtenerEstadoStripeConnect()
  revalidatePath("/cobros")
  return resultado
}
