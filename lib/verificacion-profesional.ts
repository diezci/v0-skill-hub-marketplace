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
}

export type VerificacionAdmin = SolicitudVerificacionProfesional & {
  nombre: string
  apellido: string
  email: string
  telefono: string | null
  titulo: string | null
  verificado: boolean
  empresa_nombre: string | null
  cargo_empresa: string | null
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
