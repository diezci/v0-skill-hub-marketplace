// Shared by writers and readers. Keep entity IDs in links so email, push and
// the web all open the same work item; never derive a section from a raw URL.
export type NotificacionBase = {
  id: string
  tipo: string
  titulo: string
  mensaje: string | null
  link: string | null
  leida: boolean
  created_at: string
  metadata?: Record<string, unknown> | null
  enlace?: string | null
}

export type NotificacionContextual = NotificacionBase & {
  seccion: string
  solicitud_id: string | null
  trabajo_id: string | null
  oferta_id: string | null
  incidencia_id: string | null
  aspecto: string
  tituloEntidad: string | null
}

export function linkInternoNotificacion(link?: string | null): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || /[\\\s\u0000-\u001f]/.test(link)) return null
  try {
    const url = new URL(link, "https://www.diime.es")
    return url.origin === "https://www.diime.es" ? `${url.pathname}${url.search}${url.hash}` : null
  } catch { return null }
}

export function seccionDeNotificacion(link?: string | null): string {
  const seguro = linkInternoNotificacion(link)
  if (!seguro) return "/notificaciones"
  return new URL(seguro, "https://www.diime.es").pathname.replace(/\/+$/, "") || "/"
}

export function construirLinkNotificacion(params: {
  seccion: string
  solicitudId?: string | null
  trabajoId?: string | null
  ofertaId?: string | null
  aspecto?: string | null
}) {
  const url = new URL(linkInternoNotificacion(params.seccion) || "/notificaciones", "https://www.diime.es")
  for (const [clave, valor] of Object.entries({ solicitud: params.solicitudId, trabajo: params.trabajoId, oferta: params.ofertaId, aspecto: params.aspecto })) {
    if (valor) url.searchParams.set(clave, valor)
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function aspectoDeNotificacion(tipo: string): string {
  if (tipo === "demanda_nueva") return "Nueva solicitud"
  if (tipo.startsWith("oferta_")) return "Puja"
  if (tipo.startsWith("demanda_")) return "Solicitud"
  if (tipo.includes("cancelacion")) return "Cancelación"
  if (tipo.includes("disputa") || tipo === "trabajo_rechazado") return "Disputa"
  if (tipo.includes("pago") || tipo.includes("reembolso")) return "Pago"
  if (tipo.includes("entrega") || tipo === "trabajo_entregado") return "Entrega"
  if (tipo.includes("progreso")) return "Progreso"
  if (tipo.includes("verificacion")) return "Verificación"
  if (tipo.includes("incidencia")) return "Incidencia"
  return "Actualización"
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function idNotificacionValido(id: unknown): id is string { return typeof id === "string" && UUID.test(id) }

export function contextualizarNotificacion(n: NotificacionBase): NotificacionContextual {
  const link = linkInternoNotificacion(n.link) || linkInternoNotificacion(n.enlace) || "/notificaciones"
  const url = new URL(link, "https://www.diime.es")
  const id = (param: string, key: string) => {
    const valor = url.searchParams.get(param) || n.metadata?.[key]
    return idNotificacionValido(valor) ? valor : null
  }
  const solicitud_id = id("solicitud", "solicitud_id")
  const trabajo_id = id("trabajo", "trabajo_id")
  const oferta_id = id("oferta", "oferta_id")
  const incidencia_id = id("incidencia", "incidencia_id")
  const texto = (n.mensaje || "").replace(/\\"/g, '"')
  const tituloEntidad = typeof n.metadata?.titulo_trabajo === "string" ? n.metadata.titulo_trabajo : texto.match(/["“«]([^"”»]+)["”»]/)?.[1] || null
  const aspecto = aspectoDeNotificacion(n.tipo)
  const destino = construirLinkNotificacion({ seccion: link, solicitudId: solicitud_id, trabajoId: trabajo_id, ofertaId: oferta_id, aspecto: url.searchParams.get("aspecto") || n.tipo })
  return { ...n, link: destino, seccion: seccionDeNotificacion(link), solicitud_id, trabajo_id, oferta_id, incidencia_id, aspecto, tituloEntidad }
}

export function enlaceDeAviso(n: NotificacionContextual) {
  const url = new URL(n.link || "/notificaciones", "https://www.diime.es")
  url.searchParams.set("notificacion", n.id)
  return `${url.pathname}${url.search}${url.hash}`
}

export function avisoPerteneceAEntidad(n: NotificacionContextual, entidad: { solicitudId?: string | null; trabajoId?: string | null; ofertaId?: string | null }) {
  // A precise work/bid reference must not highlight a different contract or bid
  // merely because they share the same request.
  if (n.trabajo_id && entidad.trabajoId) return n.trabajo_id === entidad.trabajoId
  if (n.oferta_id && entidad.ofertaId) return n.oferta_id === entidad.ofertaId
  return !!((entidad.solicitudId && n.solicitud_id === entidad.solicitudId) || (entidad.trabajoId && n.trabajo_id === entidad.trabajoId) || (entidad.ofertaId && n.oferta_id === entidad.ofertaId))
}
