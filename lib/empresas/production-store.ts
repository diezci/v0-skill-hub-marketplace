import "server-only"
import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import type { EmpresaFicha, EmpresaPublica, EspacioEmpresa, InvitacionEmpresa, MiembroEmpresa, PermisosEmpresa, ResultadoEmpresa, RolEmpresa, EstadoVerificacionEmpresa, OperacionEmpresa, SolicitudVerificacionEmpresa } from "./types"

const SIN_PERMISOS: PermisosEmpresa = { perfil: false, mensajes: false, presupuestos: false, encargos: false, equipo: false, ver_cobros: false, gestionar_cobros: false }


type EmpresaRow = { id: string; nombre: string; razon_social?: string; descripcion?: string; ubicacion?: string; provincias?: string[]; sitio_web?: string; logo?: string; verificada?: boolean; estado_verificacion?: EstadoVerificacionEmpresa; servicios?: string[]; cif?: string; propietario_id?: string; miembros_count?: number; rating_promedio?: number; total_resenas?: number; contacto_usuario_id?: string }
type MiembroRow = { usuario_id: string; nombre?: string; apellido?: string; foto_perfil?: string; cargo?: string; bio?: string; titulo?: string; habilidades?: string[]; estado?: string; es_titular?: boolean; email?: string; rol?: RolEmpresa; permisos?: Partial<PermisosEmpresa>; perfil_publico?: boolean; tiene_perfil_profesional?: boolean }
type InvitacionRow = { id: string; email?: string; cargo: string; estado: InvitacionEmpresa["estado"]; created_at?: string; expira_at: string; rol?: Exclude<RolEmpresa, "principal">; permisos?: Partial<PermisosEmpresa>; perfil_publico?: boolean }
type PublicaRow = { empresa: EmpresaRow; miembros?: MiembroRow[]; portfolio?: Array<{ id: string; trabajo_id?: string; titulo: string; descripcion?: string; categoria?: string; ubicacion?: string; rango_precio?: string; fecha_proyecto?: string; created_at?: string; imagen?: string; participantes_ids?: string[] }>; resenas?: Array<{ id: string; trabajo_id: string; autor: string; rating: number; comentario: string; created_at: string }> }
type WorkspaceRow = { empresa: EmpresaRow; miembros: MiembroRow[]; invitaciones: InvitacionRow[]; actividad: Array<{ id: string; actor_usuario_id: string; actor_nombre: string; accion: string; entidad_tipo?: string; entidad_id?: string; detalle?: Record<string, unknown>; created_at: string }>; es_titular: boolean; usuario_id: string; plataforma_admin?: boolean; verificacion?: VerificacionRow | null; operaciones?: { solicitudes: OperacionRow[]; ofertas: OperacionRow[]; trabajos: OperacionRow[] } }
type VerificacionRow = { id: string; estado: EstadoVerificacionEmpresa; metodo: "certificado" | "documental"; representante_nombre: string; cargo_legal: string; responsable_usuario_id: string; documento_nombre: string; nota_revision?: string; creada_at: string; revisada_at?: string }
type OperacionRow = { id: string; titulo: string; descripcion?: string; estado: string; fecha: string; actor_usuario_id: string; actor_nombre: string; precio?: number; solicitud_id?: string; trabajo_id?: string; parte?: "cliente" | "proveedor"; operador_usuario_id?: string; operador_nombre?: string; progreso?: number; cancelacion_estado?: string | null; cancelacion_parte_solicitante?: "cliente" | "proveedor" | null; cancelacion_razon?: string | null; disputa_actual?: OperacionEmpresa["disputaActual"] }

function ficha(row: EmpresaRow): EmpresaFicha {
  return { id: row.id, slug: row.id, nombre: row.nombre, razonSocial: row.razon_social || row.nombre, nif: row.cif || "", descripcion: row.descripcion || "", web: row.sitio_web || "", ubicacion: row.ubicacion || "", provincias: row.provincias || [], servicios: row.servicios || [], logoUrl: row.logo || undefined, estadoVerificacion: row.estado_verificacion || (row.verificada ? "verificada" : "borrador"), representanteNombre: "", cargoLegal: "" }
}
function miembro(row: MiembroRow): MiembroEmpresa {
  return { id: row.usuario_id, usuarioId: row.usuario_id, nombre: [row.nombre, row.apellido].filter(Boolean).join(" ") || "Profesional", email: row.email || "", cargo: row.cargo || "", rol: row.rol || (row.es_titular ? "principal" : "miembro"), estado: row.estado === "revocado" ? "revocado" : "activo", permisos: { ...SIN_PERMISOS, ...row.permisos }, perfilPublico: row.perfil_publico === true, tienePerfilProfesional: row.tiene_perfil_profesional === true, bio: row.bio || row.titulo || "", habilidades: row.habilidades || [], fotoUrl: row.foto_perfil || undefined }
}
function invitacion(row: InvitacionRow, empresaId: string): InvitacionEmpresa {
  return { id: row.id, empresaId, nombre: row.email || "", email: row.email || "", cargo: row.cargo, rol: row.rol || "miembro", permisos: { ...SIN_PERMISOS, ...row.permisos }, perfilPublico: row.perfil_publico === true, estado: row.estado, expiraEn: row.expira_at, creadaEn: row.created_at || "" }
}
function publica(row: PublicaRow): EmpresaPublica {
  const { nif: _nif, representanteNombre: _representante, cargoLegal: _cargo, ...empresa } = ficha(row.empresa)
  return { empresa, miembros: (row.miembros || []).map((r) => { const { id, usuarioId, nombre, cargo, bio, habilidades, perfilPublico, fotoUrl, tienePerfilProfesional } = miembro({ ...r, perfil_publico: true }); return { id, usuarioId, nombre, cargo, bio, habilidades, perfilPublico, fotoUrl, tienePerfilProfesional } }), trabajos: (row.portfolio || []).map((p) => ({ id: p.id, trabajoId: p.trabajo_id, empresaId: row.empresa.id, titulo: p.titulo, descripcion: p.descripcion || "", categoria: p.categoria || "", ubicacion: p.ubicacion || "", rangoPrecio: p.rango_precio || "", fecha: p.fecha_proyecto || p.created_at || "", participantesIds: p.participantes_ids || [], imagen: p.imagen || undefined })), resenas: (row.resenas || []).map((r) => ({ id: r.id, trabajoId: r.trabajo_id, autor: r.autor, puntuacion: r.rating, comentario: r.comentario, fecha: r.created_at })), local: false, contactoUsuarioId: row.empresa.contacto_usuario_id, miembrosCount: row.empresa.miembros_count, ratingPromedio: row.empresa.rating_promedio, totalResenas: row.empresa.total_resenas }
}

/** Every write uses the authenticated user's JWT; the database checks ownership/membership. */
export async function rpcEmpresa<T>(nombre: string, args: Record<string, unknown> = {}): Promise<ResultadoEmpresa<T>> {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible" }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Debes iniciar sesión", codigo: "NO_AUTENTICADO" }
  const { data, error } = await supabase.rpc(nombre, args)
  if (error) return { error: error.message }
  return { data: data as T }
}

export const empresaPublicaReal = cache(async (id: string): Promise<EmpresaPublica | null> => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc("empresa_perfil_publico", { p_empresa_id: id })
  return !error && data?.empresa ? publica(data as PublicaRow) : null
})

export async function empresasPublicasReales(): Promise<EmpresaPublica[]> {
  const supabase = await createClient()
  if (!supabase) return []
  const { data, error } = await supabase.rpc("empresas_publicas")
  if (error || !Array.isArray(data)) return []
  return (data as EmpresaRow[]).map((empresa) => publica({ empresa }))
}

export async function espacioEmpresaReal(): Promise<ResultadoEmpresa<EspacioEmpresa>> {
  const result = await rpcEmpresa<WorkspaceRow | null>("empresa_workspace")
  if (result.error) return { error: result.error, codigo: result.codigo }
  if (!result.data) return { error: "Todavía no formas parte de una empresa.", codigo: "SIN_EMPRESA" }
  const row = result.data
  const miembros = row.miembros.map(miembro)
  const miembroActual = miembros.find((m) => m.usuarioId === row.usuario_id) || null
  return { data: { empresa: ficha(row.empresa), miembros, miembroActual, actor: { id: row.usuario_id, nombre: miembroActual?.nombre || "", email: miembroActual?.email || "", plataformaAdmin: row.plataforma_admin === true }, invitaciones: row.invitaciones.map((i) => invitacion(i, row.empresa.id)), actividad: row.actividad.map((a) => ({ id: a.id, actorUsuarioId: a.actor_usuario_id, actorNombre: a.actor_nombre, accion: a.accion, fecha: a.created_at, entidadTipo: a.entidad_tipo, entidadId: a.entidad_id, detalle: a.detalle })), verificacion: row.verificacion ? verificacionReal(row.verificacion) : null, solicitudes: [], operaciones: { solicitudes: (row.operaciones?.solicitudes || []).map(operacion), ofertas: (row.operaciones?.ofertas || []).map(operacion), trabajos: (row.operaciones?.trabajos || []).map(operacion) }, local: false } }
}

export async function invitacionEmpresaReal(token: string): Promise<ResultadoEmpresa<{ invitacion: InvitacionEmpresa; empresaNombre: string; coincideEmail: boolean }>> {
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token)) return { error: "Esta invitación ya no está disponible." }
  const result = await rpcEmpresa<{ empresa_id: string; empresa_nombre: string; cargo: string; estado: InvitacionEmpresa["estado"]; expira_at: string; coincide_email: boolean; rol: Exclude<RolEmpresa, "principal">; permisos: PermisosEmpresa; perfil_publico: boolean } | null>("empresa_consultar_invitacion", { p_token: token })
  if (result.error) return { error: result.error, codigo: result.codigo }
  if (!result.data) return { error: "Esta invitación ya no está disponible." }
  const r = result.data
  return { data: { invitacion: invitacion({ id: "", cargo: r.cargo, estado: r.estado, expira_at: r.expira_at, rol: r.rol, permisos: r.permisos, perfil_publico: r.perfil_publico }, r.empresa_id), empresaNombre: r.empresa_nombre, coincideEmail: r.coincide_email } }
}

export async function empleadoEmpresaReal(usuarioId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(usuarioId)) return null
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc("empresa_afiliacion_publica", { p_usuario_id: usuarioId })
  if (error || !data?.empresa_id) return null
  const empresa = await empresaPublicaReal(data.empresa_id)
  const perfil = empresa?.miembros.find((m) => m.usuarioId === usuarioId)
  return empresa && perfil ? { perfil, empresa } : null
}

export function verificacionReal(row: VerificacionRow): SolicitudVerificacionEmpresa {
  return { id: row.id, estado: row.estado, metodo: row.metodo, representanteNombre: row.representante_nombre, cargoLegal: row.cargo_legal, responsableUsuarioId: row.responsable_usuario_id, documentoNombre: row.documento_nombre, notaRevision: row.nota_revision, creadaEn: row.creada_at, revisadaEn: row.revisada_at }
}
function operacion(row: OperacionRow): OperacionEmpresa {
  return { id: row.id, titulo: row.titulo, descripcion: row.descripcion || "", estado: row.estado, fecha: row.fecha, actorUsuarioId: row.actor_usuario_id, actorNombre: row.actor_nombre, precio: row.precio == null ? undefined : Number(row.precio), solicitudId: row.solicitud_id, trabajoId: row.trabajo_id, parte: row.parte, operadorUsuarioId: row.operador_usuario_id, operadorNombre: row.operador_nombre, progreso: row.progreso, cancelacionEstado: row.cancelacion_estado ?? null, cancelacionParteSolicitante: row.cancelacion_parte_solicitante ?? null, cancelacionRazon: row.cancelacion_razon ?? null, disputaActual: row.disputa_actual ?? null }
}
