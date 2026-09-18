"use server"

import { revalidatePath } from "next/cache"
import { empresaLocalStore } from "@/lib/empresas/local-store"
import { obtenerActorEmpresaLocal } from "@/lib/empresas/service"
import type { InputActualizarMiembro, InputMiembro, InputPerfilEmpresa } from "@/lib/empresas/local-store"
import type { ActorEmpresa, ResultadoEmpresa } from "@/lib/empresas/types"

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

export async function guardarPerfilEmpresa(input: InputPerfilEmpresa): Promise<ResultadoEmpresa> {
  return ejecutar((actor) => empresaLocalStore.guardarPerfil(actor, input))
}
export async function invitarMiembroEmpresa(input: InputMiembro): Promise<ResultadoEmpresa<{ url: string }>> {
  return ejecutar((actor) => empresaLocalStore.invitar(actor, input))
}
export async function actualizarMiembroEmpresa(input: InputActualizarMiembro): Promise<ResultadoEmpresa> {
  return ejecutar((actor) => empresaLocalStore.actualizarMiembro(actor, input))
}
export async function revocarMiembroEmpresa(miembroId: string): Promise<ResultadoEmpresa> {
  return ejecutar((actor) => empresaLocalStore.revocarMiembro(actor, miembroId))
}
export async function cancelarInvitacionEmpresa(id: string): Promise<ResultadoEmpresa> {
  return ejecutar((actor) => empresaLocalStore.cancelarInvitacion(actor, id))
}
export async function aceptarInvitacionEmpresa(token: string): Promise<ResultadoEmpresa> {
  return ejecutar((actor) => empresaLocalStore.aceptarInvitacion(actor, token))
}
export async function solicitarVerificacionEmpresa(formData: FormData): Promise<ResultadoEmpresa> {
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
export async function revisarVerificacionEmpresa(input: { decision: "verificada" | "requiere_informacion"; nota: string }): Promise<ResultadoEmpresa> {
  return ejecutar((actor) => empresaLocalStore.revisarVerificacion(actor, input))
}
export async function solicitarPresupuestoEmpresa(input: { empresaId: string; titulo: string; descripcion: string }): Promise<ResultadoEmpresa<{ id: string }>> {
  return ejecutar((actor) => empresaLocalStore.solicitarPresupuesto(actor, input))
}
