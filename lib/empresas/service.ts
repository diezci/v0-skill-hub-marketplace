import "server-only"
import { cookies, headers } from "next/headers"
import { ACTORES_EMPRESA_LOCAL } from "./seed"
import { empresaLocalStore } from "./local-store"
import type { ActorEmpresa, EmpresaPublica, EspacioEmpresa, InvitacionEmpresa, MiembroEmpresaPublico, ResultadoEmpresa } from "./types"

export function esEmpresasLocal(): boolean {
  return process.env.DIIME_EMPRESAS_LOCAL === "1" && process.env.NODE_ENV !== "production"
}

export async function validarAccesoEmpresasLocal(): Promise<void> {
  if (!esEmpresasLocal()) throw new Error("El espacio de empresas de prueba solo está disponible en el entorno local.")
  const host = (await headers()).get("host") ?? ""
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host.toLowerCase())) {
    throw new Error("Esta función local solo se puede abrir desde localhost.")
  }
}

export async function obtenerActorEmpresaLocal(): Promise<ActorEmpresa> {
  await validarAccesoEmpresasLocal()
  const id = (await cookies()).get("diime_empresa_actor")?.value ?? "owner"
  // Una cookie desconocida no crea una identidad ni concede un rol.
  const actor = Object.prototype.hasOwnProperty.call(ACTORES_EMPRESA_LOCAL, id) ? ACTORES_EMPRESA_LOCAL[id] : null
  if (!actor) throw new Error("La identidad local no es válida. Elige una de las cuentas de prueba.")
  return { ...actor }
}

export async function obtenerEmpresaPublica(id: string): Promise<EmpresaPublica | null> {
  if (!esEmpresasLocal()) return null
  try { await validarAccesoEmpresasLocal(); return await empresaLocalStore.publica(id) } catch { return null }
}

export async function obtenerEspacioEmpresa(): Promise<ResultadoEmpresa<EspacioEmpresa>> {
  try { return await empresaLocalStore.espacio(await obtenerActorEmpresaLocal()) }
  catch (error) { return { error: error instanceof Error ? error.message : "No se pudo abrir el espacio de empresa local." } }
}

export async function obtenerEmpleadoEmpresa(usuarioId: string): Promise<{ perfil: MiembroEmpresaPublico; empresa: EmpresaPublica } | null> {
  if (!esEmpresasLocal()) return null
  try { await validarAccesoEmpresasLocal(); return await empresaLocalStore.empleado(usuarioId) } catch { return null }
}

export async function obtenerInvitacionEmpresa(token: string): Promise<ResultadoEmpresa<{ invitacion: InvitacionEmpresa; empresaNombre: string; coincideEmail: boolean }>> {
  try { return await empresaLocalStore.invitacion(await obtenerActorEmpresaLocal(), token) }
  catch (error) { return { error: error instanceof Error ? error.message : "No se pudo abrir esta invitación local." } }
}

export async function obtenerDocumentoVerificacionEmpresaLocal(): Promise<ResultadoEmpresa<{ contenido: Uint8Array; nombre: string }>> {
  try { return await empresaLocalStore.documentoVerificacion(await obtenerActorEmpresaLocal()) }
  catch (error) { return { error: error instanceof Error ? error.message : "No se pudo abrir el documento local." } }
}
