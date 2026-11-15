export type EstadoVerificacionProfesional = "pendiente" | "en_revision" | "verificado" | "no_aprobado" | "retirada"

export type SolicitudVerificacionProfesional = {
  id: string
  profesional_id: string
  estado: EstadoVerificacionProfesional
  mensaje: string
  comentario_publico: string | null
  empresa_id: string | null
  solicitada_at: string
  actualizada_at: string
  resuelta_at: string | null
}

export type MiVerificacionProfesional = {
  verificado: boolean
  solicitud: SolicitudVerificacionProfesional | null
  empresa: { id: string; nombre: string } | null
  acreditacion: DatosAcreditacionProfesional | null
  identidadCobrosBloqueada: boolean
  tipoCobrosBloqueado: boolean
}

export type VerificacionAdmin = SolicitudVerificacionProfesional & {
  cuentaStripe: string | null
  nombre: string
  apellido: string
  email: string
  telefono: string | null
  titulo: string | null
  verificado: boolean
  empresa_nombre: string | null
  cargo_empresa: string | null
  acreditacion: DatosAcreditacionProfesional | null
  identidadCobrosBloqueada: boolean
  tipoCobrosBloqueado: boolean
}

export type EventoVerificacionProfesional = {
  id: string
  estado: EstadoVerificacionProfesional
  comentario_publico: string | null
  nota_interna: string | null
  creado_at: string
}

export const etiquetasVerificacion: Record<EstadoVerificacionProfesional, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  verificado: "Verificado por Diime",
  no_aprobado: "Necesita corrección",
  retirada: "Verificación retirada",
}

export type TipoProveedorProfesional = "particular" | "empresa"
export type DocumentoAcreditacionProfesional = {
  categoria: "identidad" | "cualificacion" | "representacion"
  url: string
  nombre: string
}
export type DatosAcreditacionProfesional = {
  tipoProveedor: TipoProveedorProfesional
  nombreLegal: string
  nif: string
  domicilioFiscal: string
  actividad: string
  cualificacion: string
  representanteNombre?: string
  cargoRepresentacion?: string
  documentos: DocumentoAcreditacionProfesional[]
  consentimiento: boolean
}
export type IdentidadProveedorCobros = {
  tipo_proveedor: TipoProveedorProfesional
  nombre_legal: string
  nif: string | null
  domicilio_fiscal: string | null
  verificado: boolean
  version: number
}
