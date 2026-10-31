type MensajeEmpresa = Record<string, unknown>
type Aviso = { titulo: string; cuerpo: string; link: string; conversacionId: string; tipo: string }
type Entrega = (usuarioId: string, aviso: Aviso) => Promise<unknown>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Recipients come from the same authorized transaction that saved the message.
// Never infer company access from a profile lookup or expose this internal list.
export function prepararPushMensajeEmpresa(mensaje: MensajeEmpresa, remitenteId: string) {
  const { destinatarios_push: raw, ...publico } = mensaje
  const destinatarios = Array.isArray(raw)
    ? [...new Set(raw.filter((id): id is string => typeof id === "string" && uuid.test(id) && id !== remitenteId))]
    : []
  const conversacionId = typeof mensaje.conversacion_id === "string" ? mensaje.conversacion_id : ""
  const preview = mensaje.tipo === "imagen" ? "📷 Imagen" : mensaje.tipo === "archivo" ? "📎 Archivo" : String(mensaje.contenido ?? "")
  const aviso: Aviso = {
    titulo: String(mensaje.empresa_nombre || mensaje.remitente_nombre || "Nuevo mensaje de empresa"),
    cuerpo: preview.slice(0, 160),
    link: `/mensajes?c=${conversacionId}`,
    conversacionId,
    tipo: "mensaje",
  }
  return { publico, destinatarios: uuid.test(conversacionId) ? destinatarios : [], aviso }
}

export async function entregarPushMensajeEmpresa(destinatarios: string[], aviso: Aviso, entregar: Entrega) {
  for (let inicio = 0; inicio < destinatarios.length; inicio += 4) {
    const resultados = await Promise.allSettled(destinatarios.slice(inicio, inicio + 4).map(id => entregar(id, aviso)))
    if (resultados.some(resultado => resultado.status === "rejected")) console.warn("[push] company_message_delivery_failed")
  }
}
