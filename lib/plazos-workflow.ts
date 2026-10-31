import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { cerrarCheckoutsPendientes, enviarAvisosExternos } from "@/lib/flujo-pagos"

export const DIAS_SIN_PAGO = 15
export const DIAS_REVISION_ENTREGA = 7

export async function procesarCaducidadContrato(admin: any, trabajoId: string) {
  const preparar = await admin.rpc("gestionar_plazo_workflow", { p_trabajo: trabajoId, p_accion: "preparar_caducidad" })
  if (preparar.error) throw preparar.error
  if (!preparar.data?.cambio) return preparar.data
  // Close the authoritative Stripe sessions first. A paid session is reconciled;
  // processing remains blocked for retry. Never label either as unpaid expiry.
  await cerrarCheckoutsPendientes(admin, trabajoId)
  const cerrar = await admin.rpc("gestionar_plazo_workflow", { p_trabajo: trabajoId, p_accion: "cerrar_caducidad" })
  if (cerrar.error) throw cerrar.error
  await enviarAvisosExternos(cerrar.data?.avisos, admin)
  return cerrar.data
}

export async function procesarPlazosWorkflow(trabajoIds?: string[]) {
  if (trabajoIds && (trabajoIds.length > 100 || trabajoIds.some(id => !/^[a-f0-9-]{36}$/i.test(id)))) {
    throw new Error("Selecciona como máximo 100 trabajos válidos.")
  }
  if (trabajoIds?.length === 0) return { revisados: 0, caducados: 0, recordatorios: 0, errores: [] }
  const admin = createAdminClient()
  if (!admin) throw new Error("No se pudo conectar con la base de datos.")
  const ahora = Date.now()
  let pendientes = admin.from("trabajos").select("id").eq("estado", "pendiente_pago")
    .lte("created_at", new Date(ahora - DIAS_SIN_PAGO * 86400000).toISOString()).order("created_at").limit(50)
  let entregados = admin.from("trabajos").select("id").eq("estado", "entregado")
    .lte("fecha_entrega", new Date(ahora - DIAS_REVISION_ENTREGA * 86400000).toISOString()).order("fecha_entrega").limit(50)
  if (trabajoIds) { pendientes = pendientes.in("id", trabajoIds); entregados = entregados.in("id", trabajoIds) }
  const [p, e] = await Promise.all([pendientes, entregados])
  if (p.error || e.error) throw p.error || e.error
  const resultado = { revisados: 0, caducados: 0, recordatorios: 0, errores: [] as { trabajoId: string; error: string }[] }
  for (const trabajo of p.data || []) {
    resultado.revisados++
    try { if ((await procesarCaducidadContrato(admin, trabajo.id))?.cambio) resultado.caducados++ }
    catch (error: any) { resultado.errores.push({ trabajoId: trabajo.id, error: error.message || "No se pudo cerrar el intento de pago." }) }
  }
  for (const trabajo of e.data || []) {
    resultado.revisados++
    try {
      const r = await admin.rpc("gestionar_plazo_workflow", { p_trabajo: trabajo.id, p_accion: "recordar_entrega" })
      if (r.error) throw r.error
      if (r.data?.cambio) { resultado.recordatorios++; await enviarAvisosExternos(r.data.avisos, admin) }
    } catch (error: any) { resultado.errores.push({ trabajoId: trabajo.id, error: error.message || "No se pudo registrar el recordatorio." }) }
  }
  return resultado
}
