import "server-only"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { errorIdentidadCuentaStripe, errorIdentidadCuentaStripeEmpresa } from "@/lib/stripe-connect-identidad"

export type TrabajoCobros = {
  id: string; cliente_id: string; profesional_id: string
  actor_contratacion_id?: string | null
  empresa_cliente_id?: string | null; empresa_proveedora_id?: string | null
  proveedor_cobros_usuario_id?: string | null; proveedor_stripe_account_id?: string | null
}

/** The RPC checks the current assigned operator and granular financial authority. */
export async function puedePagarTrabajo(supabase: any, trabajo: TrabajoCobros, usuarioId: string) {
  if (!trabajo.empresa_cliente_id) return trabajo.cliente_id === usuarioId
  const { data, error } = await supabase.rpc("empresa_puede_operar_trabajo", {
    p_trabajo_id: trabajo.id, p_permiso: "gestionar_cobros", p_parte: "cliente",
  })
  return !error && data === true
}

/** Contract identity is independent of staff membership and current account settings. */
export function validarCuentaCobroContrato(
  cuenta: Stripe.Account | Stripe.DeletedAccount,
  titularId: string | null,
  empresaId?: string | null,
  contratoHistorico = false,
) {
  if (empresaId) {
    const error = errorIdentidadCuentaStripeEmpresa(cuenta, empresaId)
    if (error) throw new Error(error)
    return
  }
  // Only genuinely pre-snapshot contracts may retain a legacy company account
  // recorded against their original professional. Never infer a company today.
  if (contratoHistorico && !cuenta.deleted && cuenta.business_type === "company"
    && titularId && cuenta.metadata?.diime_profesional_id === titularId) return
  if (!titularId) throw new Error("La contratación no tiene un titular de cobros identificado.")
  const error = errorIdentidadCuentaStripe(cuenta, { id: titularId })
  if (error) throw new Error(error)
}

export async function obtenerDestinoCobroTrabajo(admin: any, trabajo: TrabajoCobros) {
  const empresaId = trabajo.empresa_proveedora_id || null
  const titularId = empresaId ? null : trabajo.proveedor_cobros_usuario_id || trabajo.profesional_id
  let destino = trabajo.proveedor_stripe_account_id
  if (!destino) {
    const { data, error } = empresaId
      ? await admin.from("empresa_cuentas_stripe").select("stripe_account_id").eq("empresa_id", empresaId).maybeSingle()
      : await admin.from("profesionales").select("stripe_account_id").eq("id", titularId).maybeSingle()
    if (error) throw error
    destino = data?.stripe_account_id
  }
  if (!destino) throw new Error("El titular del servicio aún no ha configurado su cuenta de cobros. No se realizará ningún cargo.")
  const cuenta = await stripe.accounts.retrieve(destino)
  const contratoHistorico = !trabajo.actor_contratacion_id && !trabajo.proveedor_cobros_usuario_id && !empresaId
  validarCuentaCobroContrato(cuenta, titularId, empresaId, contratoHistorico)
  if (cuenta.deleted || !cuenta.details_submitted || cuenta.capabilities?.transfers !== "active" || !cuenta.payouts_enabled) {
    throw new Error("La cuenta de cobros del titular del servicio aún no está habilitada. No se realizará ningún cargo.")
  }
  return { destino, titularId, empresaId }
}
