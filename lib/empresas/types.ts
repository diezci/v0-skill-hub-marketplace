export type RolEmpresa = "principal" | "administrador" | "miembro"
export type EstadoVerificacionEmpresa = "borrador" | "en_revision" | "verificada" | "requiere_informacion"
export type PermisoEmpresa = "perfil" | "mensajes" | "presupuestos" | "encargos" | "equipo" | "ver_cobros" | "gestionar_cobros"
export type PermisosEmpresa = Record<PermisoEmpresa, boolean>

export interface EmpresaFicha {
  id: string
  slug: string
  nombre: string
  razonSocial: string
  nif: string
  descripcion: string
  web: string
  ubicacion: string
  servicios: string[]
  logoUrl?: string
  estadoVerificacion: EstadoVerificacionEmpresa
  representanteNombre: string
  cargoLegal: string
}
export interface MiembroEmpresa {
  id: string
  usuarioId: string
  nombre: string
  email: string
  cargo: string
  rol: RolEmpresa
  estado: "activo" | "pendiente" | "revocado"
  permisos: PermisosEmpresa
  perfilPublico: boolean
  bio: string
  habilidades: string[]
}
export type MiembroEmpresaPublico = Pick<MiembroEmpresa, "id" | "usuarioId" | "nombre" | "cargo" | "bio" | "habilidades" | "perfilPublico">
export interface TrabajoEmpresa {
  id: string
  empresaId: string
  titulo: string
  descripcion: string
  categoria: string
  ubicacion: string
  rangoPrecio: string
  fecha: string
  participantesIds: string[]
  imagen?: string
}
export interface ResenaEmpresa {
  id: string
  trabajoId: string
  autor: string
  puntuacion: number
  comentario: string
  fecha: string
}
export interface InvitacionEmpresa {
  id: string
  empresaId: string
  nombre: string
  email: string
  rol: Exclude<RolEmpresa, "principal">
  permisos: PermisosEmpresa
  estado: "pendiente" | "aceptada" | "revocada" | "caducada"
  expiraEn: string
  creadaEn: string
}
export interface SolicitudVerificacionEmpresa {
  id: string
  estado: EstadoVerificacionEmpresa
  metodo: "certificado" | "documental"
  representanteNombre: string
  cargoLegal: string
  responsableUsuarioId: string
  documentoNombre: string
  notaRevision?: string
  creadaEn: string
  revisadaEn?: string
}
export interface ActividadEmpresa {
  id: string
  actorNombre: string
  accion: string
  fecha: string
}
export interface SolicitudPresupuestoEmpresa {
  id: string
  empresaId: string
  empresaRazonSocial: string
  clienteUsuarioId: string
  clienteNombre: string
  titulo: string
  descripcion: string
  responsableUsuarioId: string | null
  creadaEn: string
}
export interface ActorEmpresa {
  id: string
  nombre: string
  email: string
  plataformaAdmin: boolean
}
export interface EmpresaPublica {
  empresa: Omit<EmpresaFicha, "nif" | "representanteNombre" | "cargoLegal">
  miembros: MiembroEmpresaPublico[]
  trabajos: TrabajoEmpresa[]
  resenas: ResenaEmpresa[]
  local: boolean
}
export interface EspacioEmpresa {
  empresa: EmpresaFicha
  miembros: MiembroEmpresa[]
  invitaciones: InvitacionEmpresa[]
  verificacion: SolicitudVerificacionEmpresa | null
  actividad: ActividadEmpresa[]
  solicitudes: SolicitudPresupuestoEmpresa[]
  actor: ActorEmpresa
  miembroActual: MiembroEmpresa | null
  local: boolean
}
export type ResultadoEmpresa<T = void> = { data: T; error?: never } | { error: string; data?: never }

export const PERMISOS_EMPRESA: { clave: PermisoEmpresa; titulo: string; descripcion: string }[] = [
  { clave: "perfil", titulo: "Editar el perfil", descripcion: "Presentación, servicios y web corporativa." },
  { clave: "mensajes", titulo: "Atender solicitudes", descripcion: "Consultar los proyectos asignados y atender al cliente." },
  { clave: "presupuestos", titulo: "Enviar presupuestos", descripcion: "Proponer precios en nombre de la empresa." },
  { clave: "encargos", titulo: "Gestionar encargos", descripcion: "Organizar y asignar los proyectos del equipo." },
  { clave: "equipo", titulo: "Gestionar el equipo", descripcion: "Invitar y gestionar miembros dentro de su nivel de permisos." },
  { clave: "ver_cobros", titulo: "Ver cobros", descripcion: "Consultar los movimientos económicos de la empresa." },
  { clave: "gestionar_cobros", titulo: "Gestionar cobros", descripcion: "Gestionar las operaciones de cobro. La titularidad y la cuenta bancaria corresponden al responsable principal." },
]
export const NOMBRES_ROL_EMPRESA: Record<RolEmpresa, string> = { principal: "Responsable principal", administrador: "Administrador de la cuenta", miembro: "Miembro del equipo" }
export const PERMISOS_MIEMBRO: PermisosEmpresa = { perfil: false, mensajes: true, presupuestos: false, encargos: false, equipo: false, ver_cobros: false, gestionar_cobros: false }
