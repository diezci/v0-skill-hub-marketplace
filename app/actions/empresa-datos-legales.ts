"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { esEmpresasLocal, obtenerEspacioEmpresa } from "@/lib/empresas/service"
import { empresaLocalStore } from "@/lib/empresas/local-store"
import { buscarCartociudad, firmarDireccion, verificarDireccion, type DireccionFirmada } from "@/lib/empresas/domicilio"
import type { ResultadoEmpresa } from "@/lib/empresas/types"

function secretoDireccion() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  if (esEmpresasLocal()) {
    const scope = globalThis as typeof globalThis & { __diimeDireccionSecreto?: string }
    return scope.__diimeDireccionSecreto ??= randomBytes(32).toString("hex")
  }
  throw new Error("No se pudo comprobar la dirección. Vuelve a intentarlo.")
}

export async function buscarDireccionEmpresa(consulta: string): Promise<ResultadoEmpresa<DireccionFirmada[]>> {
  try {
    const result = await obtenerEspacioEmpresa()
    if (result.error || !result.data) return { error: result.error || "Debes iniciar sesión" }
    const { empresa, miembroActual, actor } = result.data
    if (!miembroActual?.permisos.perfil && miembroActual?.rol !== "principal") return { error: "No tienes permiso para editar los datos de la empresa." }
    const secreto = secretoDireccion()
    const candidatas = await buscarCartociudad(consulta)
    return { data: candidatas.map((d) => ({ ...d, comprobante: firmarDireccion(d, actor.id, empresa.id, secreto) })) }
  } catch (error) {
    return { error: error instanceof Error && /Escribe la calle/.test(error.message) ? error.message : "El servicio de direcciones no está disponible. Vuelve a intentarlo." }
  }
}

export async function guardarDatosLegalesEmpresa(input: {
  razonSocial: string; cif: string; domicilio: string; comprobante?: string
  anteriores: { razonSocial: string; cif: string; domicilio: string }
}): Promise<ResultadoEmpresa<{ identidadModificada: boolean }>> {
  try {
    if (!input || typeof input.razonSocial !== "string" || typeof input.cif !== "string" || typeof input.domicilio !== "string" || !input.anteriores) return { error: "Revisa los datos de la empresa." }
    const razonSocial = input.razonSocial.trim(), cif = input.cif.replace(/[\s-]/g, "").toUpperCase(), domicilio = input.domicilio.trim()
    if (razonSocial.length < 2 || razonSocial.length > 160 || /[\u0000-\u001f\u007f]/.test(razonSocial) || !/^[A-Z]\d{7}[A-Z0-9]$/.test(cif) || domicilio.length > 500 || /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(domicilio)) return { error: "Revisa la razón social, el formato del CIF y el domicilio." }
    const result = await obtenerEspacioEmpresa()
    if (result.error || !result.data) return { error: result.error || "Debes iniciar sesión" }
    const { empresa, miembroActual, actor } = result.data
    if (!miembroActual?.permisos.perfil && miembroActual?.rol !== "principal") return { error: "No tienes permiso para editar los datos de la empresa." }
    const identidadModificada = razonSocial !== empresa.razonSocial || cif !== empresa.nif
    if (identidadModificada && miembroActual.rol !== "principal") return { error: "Solo el responsable principal puede modificar la razón social o el CIF." }
    if (input.anteriores.razonSocial !== empresa.razonSocial || input.anteriores.cif !== empresa.nif || input.anteriores.domicilio !== (empresa.domicilio || "")) return { error: "Los datos han cambiado. Recarga la página antes de guardar." }
    const comprobada = input.comprobante ? verificarDireccion(input.comprobante, actor.id, empresa.id, domicilio, secretoDireccion()) : null
    if (domicilio !== (empresa.domicilio || "") && domicilio && !comprobada) return { error: "Busca la dirección y selecciona un resultado antes de guardar. La comprobación dura 15 minutos." }
    if (esEmpresasLocal()) {
      const saved = await empresaLocalStore.guardarDatosLegales(actor, { razonSocial, cif, domicilio, anteriores: input.anteriores, comprobada })
      if (saved.error) return { error: saved.error }
    } else {
      const admin = createAdminClient()
      if (!admin) return { error: "No se pudieron guardar los datos de la empresa." }
      const { error } = await admin.rpc("empresa_guardar_datos_legales", {
        p_empresa_id: empresa.id, p_actor_id: actor.id, p_razon_social: razonSocial, p_cif: cif, p_domicilio: domicilio,
        p_anteriores: input.anteriores, p_direccion: comprobada,
      })
      if (error) return { error: error.code === "23505" ? "Este CIF ya está asociado a otra empresa." : error.message }
    }
    revalidatePath("/mi-empresa"); revalidatePath("/mi-empresa/vista-previa"); revalidatePath("/profesionales"); revalidatePath("/empresa/[id]", "page"); revalidatePath("/admin/verificaciones-empresas")
    return { data: { identidadModificada } }
  } catch { return { error: "No se pudieron guardar los datos. Vuelve a intentarlo." } }
}
