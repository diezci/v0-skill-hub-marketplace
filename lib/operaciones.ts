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

function asegurarConsulta(nombre: string, resultado: { error: { message?: string } | null }) {
  if (resultado.error) throw new Error(`${nombre}: ${resultado.error.message || "consulta fallida"}`)
}

export async function obtenerResumenOperativo() {
  const admin = createAdminClient()
  if (!admin) throw new Error("Supabase service role no está configurado.")

  const haceQuinceMinutos = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const haceCuatroHoras = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  const haceVeinticuatroHoras = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    eventos,
    webhooksError,
    webhooksAtascados,
    liquidacionesError,
    liquidacionesAtascadas,
    disputasVencidas,
    incidenciasCriticas,
    solicitudesSinOferta,
  ] = await Promise.all([
    admin
      .from("eventos_operativos")
      .select("id, area, severidad, codigo, clave, mensaje, contexto, ocurrencias, ultimo_evento_at")
      .eq("estado", "abierto")
      .order("ultimo_evento_at", { ascending: false })
      .limit(50),
    admin
      .from("stripe_eventos_webhook")
      .select("id, tipo, intentos, ultimo_error, ultimo_intento_at")
      .eq("estado", "error")
      .order("ultimo_intento_at", { ascending: false })
      .limit(25),
    admin
      .from("stripe_eventos_webhook")
      .select("id, tipo, intentos, ultimo_intento_at")
      .eq("estado", "procesando")
      .lt("ultimo_intento_at", haceQuinceMinutos)
      .order("ultimo_intento_at", { ascending: true })
      .limit(25),
    admin
      .from("transacciones_escrow")
      .select("id, trabajo_id, estado, liquidacion_estado, liquidacion_error, updated_at")
      .eq("liquidacion_estado", "error")
      .order("updated_at", { ascending: false })
      .limit(25),
    admin
      .from("transacciones_escrow")
      .select("id, trabajo_id, estado, liquidacion_estado, updated_at")
      .eq("liquidacion_estado", "procesando")
      .lt("updated_at", haceQuinceMinutos)
      .order("updated_at", { ascending: true })
      .limit(25),
    admin
      .from("disputas")
      .select("id, trabajo_id, tipo, created_at")
      .eq("estado", "abierta")
      .lt("created_at", haceVeinticuatroHoras)
      .order("created_at", { ascending: true })
      .limit(25),
    admin
      .from("incidencias")
      .select("id, categoria, prioridad, estado, created_at")
      .eq("prioridad", "critica")
      .in("estado", ["abierta", "en_revision"])
      .order("created_at", { ascending: true })
      .limit(25),
    admin
      .from("solicitudes")
      .select("id, titulo, ubicacion, total_ofertas, created_at")
      .eq("estado", "abierta")
      .eq("total_ofertas", 0)
      .ilike("ubicacion", "%Madrid%")
      .lt("created_at", haceCuatroHoras)
      .order("created_at", { ascending: true })
      .limit(25),
  ])

  for (const [nombre, resultado] of [
    ["eventos operativos", eventos],
    ["webhooks fallidos", webhooksError],
    ["webhooks atascados", webhooksAtascados],
    ["liquidaciones fallidas", liquidacionesError],
    ["liquidaciones atascadas", liquidacionesAtascadas],
    ["disputas vencidas", disputasVencidas],
    ["incidencias críticas", incidenciasCriticas],
    ["solicitudes sin oferta", solicitudesSinOferta],
  ] as const) asegurarConsulta(nombre, resultado)

  const detalle = {
    eventos: eventos.data || [],
    webhooksError: webhooksError.data || [],
    webhooksAtascados: webhooksAtascados.data || [],
    liquidacionesError: liquidacionesError.data || [],
    liquidacionesAtascadas: liquidacionesAtascadas.data || [],
    disputasVencidas: disputasVencidas.data || [],
    incidenciasCriticas: incidenciasCriticas.data || [],
    solicitudesSinOferta: solicitudesSinOferta.data || [],
  }
  const totales = Object.fromEntries(Object.entries(detalle).map(([clave, filas]) => [clave, filas.length]))
  const alertasTecnicas =
    totales.eventos +
    totales.webhooksError +
    totales.webhooksAtascados +
    totales.liquidacionesError +
    totales.liquidacionesAtascadas
  const alertasOperacion = totales.disputasVencidas + totales.incidenciasCriticas + totales.solicitudesSinOferta

  return {
    generadoAt: new Date().toISOString(),
    alertasTecnicas,
    alertasOperacion,
    total: alertasTecnicas + alertasOperacion,
    totales,
    detalle,
  }
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
