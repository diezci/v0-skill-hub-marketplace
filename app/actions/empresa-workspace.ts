"use server"

import { revalidatePath } from "next/cache"
import { empresaLocalStore, validarCoberturaEmpresa } from "@/lib/empresas/local-store"
import { esEmpresasLocal, obtenerActorEmpresaLocal } from "@/lib/empresas/service"
import type { InputActualizarMiembro, InputMiembro, InputPerfilEmpresa } from "@/lib/empresas/local-store"
import { rpcEmpresa, verificacionReal } from "@/lib/empresas/production-store"
import type { ActorEmpresa, ResultadoEmpresa, RolEmpresa, VerificacionEmpresaAdmin } from "@/lib/empresas/types"

function invalidarEmpresa() {
  revalidatePath("/mi-empresa")
  revalidatePath("/profesionales")
  revalidatePath("/empresa/[id]", "page")
  revalidatePath("/profesional/[id]", "page")
  revalidatePath("/mi-empresa/invitaciones/[token]", "page")
}

async function ejecutarReal<T>(rpc: string, args: Record<string, unknown> = {}): Promise<ResultadoEmpresa<T>> {
  try {
    const resultado = await rpcEmpresa<T>(rpc, args)
    if (!resultado.error) invalidarEmpresa()
    return resultado
  } catch { return { error: "No se pudo completar la operación. Vuelve a intentarlo." } }
}

async function ejecutar<T>(operacion: (actor: ActorEmpresa) => Promise<ResultadoEmpresa<T>>): Promise<ResultadoEmpresa<T>> {
  try {
    const resultado = await operacion(await obtenerActorEmpresaLocal())
    if (!resultado.error) {
      revalidatePath("/mi-empresa")
      revalidatePath("/profesionales")
      revalidatePath("/empresa/[id]", "page")
      revalidatePath("/profesional/[id]", "page")
      revalidatePath("/mi-empresa/invitaciones/[token]", "page")
    }
    return resultado
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo completar la operación local." }
  }
}

export async function guardarPerfilEmpresa(input: InputPerfilEmpresa & { logoUrl?: string }): Promise<ResultadoEmpresa> {
  const cobertura = validarCoberturaEmpresa(input)
  if (cobertura.error) return { error: cobertura.error }
  if (!esEmpresasLocal() && cobertura.data) return ejecutarReal("empresa_editar_perfil_cobertura", {
    p_nombre: input.nombre, p_descripcion: input.descripcion, p_ubicacion: cobertura.data.provincias.join(", "),
    p_sitio_web: input.web, p_logo: input.logoUrl || null, p_servicios: cobertura.data.servicios, p_provincias: cobertura.data.provincias,
  })
  if (!esEmpresasLocal()) return ejecutarReal("empresa_editar_perfil", { p_nombre: input.nombre, p_descripcion: input.descripcion, p_ubicacion: input.ubicacion, p_sitio_web: input.web, p_logo: input.logoUrl || null, p_servicios: input.servicios })
  return ejecutar((actor) => empresaLocalStore.guardarPerfil(actor, input))
}
export async function invitarMiembroEmpresa(input: InputMiembro & { cargo?: string; perfilPublico?: boolean }): Promise<ResultadoEmpresa<{ url: string }>> {
  if (!esEmpresasLocal()) {
    const resultado = await ejecutarReal<{ token: string }>("empresa_crear_invitacion", { p_email: input.email, p_cargo: input.cargo || "", p_rol: input.rol, p_permisos: input.permisos, p_perfil_publico: input.perfilPublico === true })
    return resultado.error ? { error: resultado.error } : { data: { url: `/mi-empresa/invitaciones/${encodeURIComponent(resultado.data!.token)}` } }
  }
  return ejecutar((actor) => empresaLocalStore.invitar(actor, input))
}
export async function actualizarMiembroEmpresa(input: Omit<InputActualizarMiembro, "rol"> & { rol: RolEmpresa; cargo?: string; perfilPublico?: boolean }): Promise<ResultadoEmpresa> {
  if (!esEmpresasLocal()) return ejecutarReal("empresa_actualizar_miembro", { p_usuario_id: input.miembroId, p_cargo: input.cargo || "", p_revocar: false, p_rol: input.rol, p_permisos: input.permisos, p_perfil_publico: input.perfilPublico ?? null })
  if (input.rol === "principal") return { error: "El responsable principal no se modifica desde la demostración." }
  const localInput = { ...input, rol: input.rol }
  return ejecutar((actor) => empresaLocalStore.actualizarMiembro(actor, localInput))
}
export async function revocarMiembroEmpresa(miembroId: string): Promise<ResultadoEmpresa> {
  if (!esEmpresasLocal()) return ejecutarReal("empresa_actualizar_miembro", { p_usuario_id: miembroId, p_cargo: null, p_revocar: true })
  return ejecutar((actor) => empresaLocalStore.revocarMiembro(actor, miembroId))
}
export async function cancelarInvitacionEmpresa(id: string): Promise<ResultadoEmpresa> {
  if (!esEmpresasLocal()) return ejecutarReal("empresa_revocar_invitacion", { p_invitacion_id: id })
  return ejecutar((actor) => empresaLocalStore.cancelarInvitacion(actor, id))
}
export async function aceptarInvitacionEmpresa(token: string): Promise<ResultadoEmpresa> {
  if (!esEmpresasLocal()) {
    const result = await ejecutarReal<string>("empresa_aceptar_invitacion", { p_token: token })
    return result.error ? { error: result.error } : { data: undefined }
  }
  return ejecutar((actor) => empresaLocalStore.aceptarInvitacion(actor, token))
}
export async function solicitarVerificacionEmpresa(formData: FormData): Promise<ResultadoEmpresa> {
  if (!esEmpresasLocal()) {
    const documento = formData.get("documento")
    if (!(documento instanceof File) || documento.size < 6 || documento.size > 5 * 1024 * 1024) return { error: "Adjunta un documento PDF de hasta 5 MB." }
    return ejecutarReal("empresa_solicitar_verificacion", {
      p_metodo: String(formData.get("metodo") || "documental"),
      p_representante_nombre: String(formData.get("representanteNombre") || ""),
      p_cargo_legal: String(formData.get("cargoLegal") || ""),
      p_documento_nombre: documento.name,
      p_documento_base64: Buffer.from(await documento.arrayBuffer()).toString("base64"),
      p_consentimiento: formData.get("consentimiento") === "true",
    })
  }
  return ejecutar(async (actor) => {
    const documento = formData.get("documento")
    if (!(documento instanceof File) || documento.size < 6 || documento.size > 5 * 1024 * 1024) return { error: "Adjunta un documento PDF de hasta 5 MB." }
    return empresaLocalStore.solicitarVerificacion(actor, {
      metodo: formData.get("metodo") as "certificado" | "documental",
      representanteNombre: String(formData.get("representanteNombre") ?? ""),
      cargoLegal: String(formData.get("cargoLegal") ?? ""),
      documentoNombre: documento.name,
      documento: new Uint8Array(await documento.arrayBuffer()),
      consentimiento: formData.get("consentimiento") === "true",
    })
  })
}
export async function revisarVerificacionEmpresa(input: { decision: "verificada" | "requiere_informacion"; nota: string; empresaId?: string }): Promise<ResultadoEmpresa> {
  if (!esEmpresasLocal()) {
    if (!input.empresaId) return { error: "Selecciona la empresa que deseas revisar." }
    const resultado = await ejecutarReal<void>("empresa_revisar_verificacion", { p_empresa_id: input.empresaId, p_decision: input.decision, p_nota: input.nota })
    if (!resultado.error) revalidatePath("/admin/verificaciones-empresas")
    return resultado
  }
  return ejecutar((actor) => empresaLocalStore.revisarVerificacion(actor, input))
}

export async function obtenerVerificacionesEmpresas(): Promise<ResultadoEmpresa<VerificacionEmpresaAdmin[]>> {
  const resultado = await rpcEmpresa<(Parameters<typeof verificacionReal>[0] & { empresa_id: string; empresa_nombre: string; cif: string })[]>("empresa_verificaciones_listar")
  if (resultado.error) return { error: resultado.error }
  return { data: (resultado.data || []).map((row) => ({ ...verificacionReal(row), empresaId: row.empresa_id, empresaNombre: row.empresa_nombre, nif: row.cif })) }
}

export async function descargarVerificacionEmpresa(empresaId: string): Promise<ResultadoEmpresa<{ nombre: string; base64: string }>> {
  const resultado = await rpcEmpresa<{ nombre: string; base64: string } | null>("empresa_verificacion_documento", { p_empresa_id: empresaId })
  if (resultado.error) return { error: resultado.error }
  return resultado.data ? { data: resultado.data } : { error: "No hay documentación disponible para esta empresa." }
}

export async function reasignarTrabajoEmpresa(input: { trabajoId: string; usuarioId: string; parte: "cliente" | "proveedor" }): Promise<ResultadoEmpresa> {
  return ejecutarReal("empresa_reasignar_trabajo", { p_trabajo_id: input.trabajoId, p_usuario_id: input.usuarioId, p_parte: input.parte })
}

export async function actualizarTrabajoEmpresa(input: { trabajoId: string; progreso: number; entregar?: boolean }): Promise<ResultadoEmpresa> {
  return ejecutarReal("empresa_actualizar_trabajo", { p_trabajo_id: input.trabajoId, p_progreso: input.progreso, p_entregar: input.entregar === true })
}
export async function solicitarPresupuestoEmpresa(input: { empresaId: string; titulo: string; descripcion: string }): Promise<ResultadoEmpresa<{ id: string }>> {
  return ejecutar((actor) => empresaLocalStore.solicitarPresupuesto(actor, input))
}
