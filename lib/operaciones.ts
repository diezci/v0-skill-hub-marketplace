import "server-only"

import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"

export type AreaOperativa = "stripe" | "liquidaciones" | "email" | "push" | "moderacion" | "sistema"
export type SeveridadOperativa = "aviso" | "critica"

export async function registrarEventoOperativo(params: {
  area: AreaOperativa
  severidad: SeveridadOperativa
  codigo: string
  clave?: string
  mensaje: string
  contexto?: Record<string, string | number | boolean | null>
}) {
  const admin = createAdminClient()
  if (!admin) return
  const { error } = await admin.rpc("registrar_evento_operativo", {
    p_area: params.area,
    p_severidad: params.severidad,
    p_codigo: params.codigo,
    p_clave: params.clave || "global",
    p_mensaje: params.mensaje,
    p_contexto: params.contexto || {},
  })
  if (error && error.code !== "PGRST202" && error.code !== "42P01") {
    console.error("[operaciones] No se pudo registrar el evento:", error.message)
  }
}

export const CATEGORIAS_OPERATIVAS = ["eventos", "webhooksError", "webhooksAtascados", "liquidacionesError", "liquidacionesAtascadas", "disputasVencidas", "incidenciasCriticas", "solicitudesSinOferta"] as const
export type CategoriaOperativa = typeof CATEGORIAS_OPERATIVAS[number]
type FilaOperativa = { id: string; [campo: string]: unknown }

function consultaOperativa(admin: NonNullable<ReturnType<typeof createAdminClient>>, categoria: CategoriaOperativa, ahora: number) {
  const haceQuinceMinutos = new Date(ahora - 15 * 60 * 1000).toISOString()
  const haceCuatroHoras = new Date(ahora - 4 * 60 * 60 * 1000).toISOString()
  const haceVeinticuatroHoras = new Date(ahora - 24 * 60 * 60 * 1000).toISOString()
  // Exact count is independent of page length; the ID is a deterministic tie-breaker.
  switch (categoria) {
    case "eventos": return admin.from("eventos_operativos").select("id, area, severidad, codigo, clave, mensaje, contexto, ocurrencias, ultimo_evento_at", { count: "exact" }).eq("estado", "abierto").order("ultimo_evento_at", { ascending: false }).order("id")
    case "webhooksError": return admin.from("stripe_eventos_webhook").select("id, tipo, intentos, ultimo_error, ultimo_intento_at", { count: "exact" }).eq("estado", "error").order("ultimo_intento_at", { ascending: false }).order("id")
    case "webhooksAtascados": return admin.from("stripe_eventos_webhook").select("id, tipo, intentos, ultimo_intento_at", { count: "exact" }).eq("estado", "procesando").lt("ultimo_intento_at", haceQuinceMinutos).order("ultimo_intento_at").order("id")
    case "liquidacionesError": return admin.from("transacciones_escrow").select("id, trabajo_id, estado, liquidacion_estado, liquidacion_error, updated_at", { count: "exact" }).eq("liquidacion_estado", "error").order("updated_at", { ascending: false }).order("id")
    case "liquidacionesAtascadas": return admin.from("transacciones_escrow").select("id, trabajo_id, estado, liquidacion_estado, updated_at", { count: "exact" }).eq("liquidacion_estado", "procesando").lt("updated_at", haceQuinceMinutos).order("updated_at").order("id")
    case "disputasVencidas": return admin.from("disputas").select("id, trabajo_id, tipo, estado, created_at, responsable_id, asignada_at, responsable:profiles!disputas_responsable_id_fkey(nombre, apellido, es_admin)", { count: "exact" }).in("estado", ["abierta", "en_revision"]).lt("created_at", haceVeinticuatroHoras).order("created_at").order("id")
    case "incidenciasCriticas": return admin.from("incidencias").select("id, categoria, prioridad, estado, created_at", { count: "exact" }).eq("prioridad", "critica").in("estado", ["abierta", "en_revision"]).order("created_at").order("id")
    case "solicitudesSinOferta": return admin.from("solicitudes").select("id, titulo, ubicacion, total_ofertas, created_at", { count: "exact" }).eq("estado", "abierta").eq("total_ofertas", 0).ilike("ubicacion", "%Madrid%").lt("created_at", haceCuatroHoras).order("created_at").order("id")
  }
}

export async function obtenerDetalleOperativo(categoria: CategoriaOperativa, desde = 0, ahora = Date.now()) {
  const admin = createAdminClient()
  if (!admin) throw new Error("Supabase service role no está configurado.")
  const resultado = await consultaOperativa(admin, categoria, ahora).range(desde, desde + 24)
  if (resultado.error) throw new Error(`${categoria}: ${resultado.error.message || "consulta fallida"}`)
  // A missing count is an unavailable observation, never an all-clear.
  if (resultado.count == null) throw new Error(`${categoria}: no se pudo contar el total.`)
  return { filas: (resultado.data || []) as FilaOperativa[], total: resultado.count }
}

export async function obtenerResumenOperativo() {
  const ahora = Date.now()
  const resultados = await Promise.all(CATEGORIAS_OPERATIVAS.map(categoria => obtenerDetalleOperativo(categoria, 0, ahora)))
  const detalle = Object.fromEntries(CATEGORIAS_OPERATIVAS.map((categoria, i) => [categoria, resultados[i].filas])) as Record<CategoriaOperativa, FilaOperativa[]>
  const totales = Object.fromEntries(CATEGORIAS_OPERATIVAS.map((categoria, i) => [categoria, resultados[i].total])) as Record<CategoriaOperativa, number>
  const alertasTecnicas = totales.eventos + totales.webhooksError + totales.webhooksAtascados + totales.liquidacionesError + totales.liquidacionesAtascadas
  const alertasOperacion = totales.disputasVencidas + totales.incidenciasCriticas + totales.solicitudesSinOferta
  return { generadoAt: new Date(ahora).toISOString(), alertasTecnicas, alertasOperacion, total: alertasTecnicas + alertasOperacion, totales, detalle }
}

export async function enviarAlertaOperativaDiaria() {
  const resumen = await obtenerResumenOperativo()
  if (resumen.total === 0) return { enviado: false, motivo: "sin_alertas", resumen }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    await registrarEventoOperativo({
      area: "email",
      severidad: "critica",
      codigo: "resend_no_configurado",
      mensaje: "No se pudo enviar el resumen operativo porque falta RESEND_API_KEY.",
    })
    throw new Error("RESEND_API_KEY no está configurado.")
  }

  const destinatario = process.env.OPERATIONS_ALERT_EMAIL || "contacto@diime.es"
  const remitente = process.env.RESEND_FROM || "Diime <avisos@diime.es>"
  const filas = [
    ["Eventos técnicos", resumen.totales.eventos],
    ["Webhooks Stripe fallidos", resumen.totales.webhooksError],
    ["Webhooks atascados", resumen.totales.webhooksAtascados],
    ["Liquidaciones fallidas", resumen.totales.liquidacionesError],
    ["Liquidaciones atascadas", resumen.totales.liquidacionesAtascadas],
    ["Disputas con más de 24 h", resumen.totales.disputasVencidas],
    ["Incidencias críticas", resumen.totales.incidenciasCriticas],
    ["Solicitudes de Madrid sin oferta tras 4 h", resumen.totales.solicitudesSinOferta],
  ].filter(([, total]) => Number(total) > 0)
  const listaTexto = filas.map(([nombre, total]) => `- ${nombre}: ${total}`).join("\n")
  const listaHtml = filas.map(([nombre, total]) => `<li><strong>${nombre}</strong>: ${total}</li>`).join("")
  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: remitente,
    to: destinatario,
    subject: `[Diime] ${resumen.total} alerta${resumen.total === 1 ? "" : "s"} operativa${resumen.total === 1 ? "" : "s"}`,
    text: `Hay elementos que requieren revisión:\n\n${listaTexto}\n\nAbre https://www.diime.es/admin/operaciones`,
    html: `<p>Hay elementos que requieren revisión:</p><ul>${listaHtml}</ul><p><a href="https://www.diime.es/admin/operaciones">Abrir operaciones</a></p>`,
  })

  if (error) {
    const motivo = error.message || error.name || "resend_error"
    console.error("[operaciones] Resend rechazó el resumen operativo.", {
      nombre: error.name,
      mensaje: error.message,
    })
    await registrarEventoOperativo({
      area: "email",
      severidad: "critica",
      codigo: "resumen_operativo_fallido",
      mensaje: "Resend rechazó el resumen operativo diario.",
      contexto: { motivo: motivo.slice(0, 500) },
    })
    throw new Error(`Resend rechazó el resumen operativo: ${motivo}`)
  }

  return { enviado: true, resumen }
}
