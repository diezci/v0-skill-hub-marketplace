export type PreferenciasEmail = {
  emailActivo: boolean
  oportunidades: boolean
  ofertas: boolean
  proyectos: boolean
  pagos: boolean
  disputas: boolean
  cuenta: boolean
}

export type CategoriaEmail = Exclude<keyof PreferenciasEmail, "emailActivo">

export const PREFERENCIAS_EMAIL_POR_DEFECTO: PreferenciasEmail = {
  emailActivo: true,
  oportunidades: true,
  ofertas: true,
  proyectos: true,
  pagos: true,
  disputas: true,
  cuenta: true,
}

export const OPCIONES_EMAIL: Array<{
  clave: CategoriaEmail
  titulo: string
  descripcion: string
  soloProfesionales?: boolean
}> = [
  {
    clave: "oportunidades",
    titulo: "Nuevas solicitudes compatibles",
    descripcion: "Demandas que encajan con tus servicios, provincias y presupuesto.",
    soloProfesionales: true,
  },
  {
    clave: "ofertas",
    titulo: "Ofertas y pujas",
    descripcion: "Nuevas ofertas y cambios en las pujas en las que participas.",
  },
  {
    clave: "proyectos",
    titulo: "Proyectos y entregas",
    descripcion: "Avances, entregas y cambios importantes durante un trabajo.",
  },
  {
    clave: "pagos",
    titulo: "Pagos y reembolsos",
    descripcion: "Cobros confirmados, pagos liberados y devoluciones.",
  },
  {
    clave: "disputas",
    titulo: "Disputas y cancelaciones",
    descripcion: "Aperturas, cambios y resoluciones que requieren atención.",
  },
  {
    clave: "cuenta",
    titulo: "Cuenta y soporte",
    descripcion: "Verificación del perfil y resolución de incidencias.",
  },
]

const CATEGORIA_POR_TIPO: Record<string, CategoriaEmail> = {
  demanda_nueva: "oportunidades",
  demanda_actualizada: "ofertas",
  demanda_retirada: "ofertas",
  oferta_nueva: "ofertas",
  oferta_actualizada: "ofertas",
  oferta_retirada: "ofertas",
  oferta_aceptada: "ofertas",
  oferta_rechazada: "ofertas",
  progreso_trabajo: "proyectos",
  entrega: "proyectos",
  trabajo_entregado: "proyectos",
  pago_recibido: "pagos",
  pago_liberado: "pagos",
  pago_tardio: "pagos",
  reembolso_emitido: "pagos",
  cancelacion: "disputas",
  cancelacion_solicitada: "disputas",
  cancelacion_actualizada: "disputas",
  cancelacion_retirada: "disputas",
  cancelacion_aceptada: "disputas",
  disputa_abierta: "disputas",
  disputa_resuelta: "disputas",
  disputa_ganada: "disputas",
  disputa_perdida: "disputas",
  disputa_retirada: "disputas",
  incidencia_resuelta: "cuenta",
  perfil_verificado: "cuenta",
  verificacion_retirada: "cuenta",
  verificacion_profesional_actualizada: "cuenta",
}

type FilaPreferenciasEmail = {
  email_activo?: unknown
  email_oportunidades?: unknown
  email_ofertas?: unknown
  email_proyectos?: unknown
  email_pagos?: unknown
  email_disputas?: unknown
  email_cuenta?: unknown
} | null

const CLAVES: Array<keyof PreferenciasEmail> = [
  "emailActivo",
  "oportunidades",
  "ofertas",
  "proyectos",
  "pagos",
  "disputas",
  "cuenta",
]

export function sonPreferenciasEmailValidas(valor: unknown): valor is PreferenciasEmail {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false
  const objeto = valor as Record<string, unknown>
  return (
    Object.keys(objeto).length === CLAVES.length && CLAVES.every((clave) => typeof objeto[clave] === "boolean")
  )
}

export function preferenciasEmailDesdeFila(
  fila: FilaPreferenciasEmail,
  emailActivoAnterior = true,
): PreferenciasEmail {
  return {
    emailActivo: typeof fila?.email_activo === "boolean" ? fila.email_activo : emailActivoAnterior,
    oportunidades:
      typeof fila?.email_oportunidades === "boolean"
        ? fila.email_oportunidades
        : PREFERENCIAS_EMAIL_POR_DEFECTO.oportunidades,
    ofertas: typeof fila?.email_ofertas === "boolean" ? fila.email_ofertas : PREFERENCIAS_EMAIL_POR_DEFECTO.ofertas,
    proyectos:
      typeof fila?.email_proyectos === "boolean"
        ? fila.email_proyectos
        : PREFERENCIAS_EMAIL_POR_DEFECTO.proyectos,
    pagos: typeof fila?.email_pagos === "boolean" ? fila.email_pagos : PREFERENCIAS_EMAIL_POR_DEFECTO.pagos,
    disputas:
      typeof fila?.email_disputas === "boolean"
        ? fila.email_disputas
        : PREFERENCIAS_EMAIL_POR_DEFECTO.disputas,
    cuenta: typeof fila?.email_cuenta === "boolean" ? fila.email_cuenta : PREFERENCIAS_EMAIL_POR_DEFECTO.cuenta,
  }
}

export function preferenciasEmailAFila(preferencias: PreferenciasEmail) {
  return {
    email_activo: preferencias.emailActivo,
    email_oportunidades: preferencias.oportunidades,
    email_ofertas: preferencias.ofertas,
    email_proyectos: preferencias.proyectos,
    email_pagos: preferencias.pagos,
    email_disputas: preferencias.disputas,
    email_cuenta: preferencias.cuenta,
  }
}

export function categoriaEmailParaTipo(tipo: string) {
  return CATEGORIA_POR_TIPO[tipo] ?? null
}

export function permiteEmail(preferencias: PreferenciasEmail, tipo: string) {
  const categoria = categoriaEmailParaTipo(tipo)
  return preferencias.emailActivo && !!categoria && preferencias[categoria]
}
