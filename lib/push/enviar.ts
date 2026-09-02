import "server-only"

import { createSign } from "node:crypto"
import { connect } from "node:http2"
import { createAdminClient } from "@/lib/supabase/admin"

type PlataformaPush = "ios" | "android"

type AvisoPush = {
  titulo: string
  cuerpo: string
  link?: string | null
  conversacionId?: string | null
  tipo?: string
  badge?: number
}

type ResultadoEnvio = { ok: boolean; permanente?: boolean; detalle?: string }

const base64Url = (valor: string | Buffer) =>
  Buffer.from(valor).toString("base64").replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_")

function firmarJwt(
  cabecera: Record<string, unknown>,
  payload: Record<string, unknown>,
  clave: string,
  formatoEc = false,
) {
  const contenido = `${base64Url(JSON.stringify(cabecera))}.${base64Url(JSON.stringify(payload))}`
  const firma = createSign("SHA256")
  firma.update(contenido)
  firma.end()
  const bytes = firma.sign(formatoEc ? { key: clave, dsaEncoding: "ieee-p1363" } : clave)
  return `${contenido}.${base64Url(bytes)}`
}

let tokenGoogleCache: { valor: string; caduca: number } | null = null

function credencialesFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string }
    if (!data.project_id || !data.client_email || !data.private_key) return null
    return { ...data, private_key: data.private_key.replaceAll("\\n", "\n") }
  } catch {
    return null
  }
}

async function tokenAccesoGoogle() {
  const ahora = Math.floor(Date.now() / 1000)
  if (tokenGoogleCache && tokenGoogleCache.caduca > ahora + 60) return tokenGoogleCache.valor

  const cuenta = credencialesFirebase()
  if (!cuenta) return null
  const assertion = firmarJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: cuenta.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: ahora,
      exp: ahora + 3600,
    },
    cuenta.private_key,
  )

  const respuesta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  })
  if (!respuesta.ok) return null
  const data = (await respuesta.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null
  tokenGoogleCache = { valor: data.access_token, caduca: ahora + (data.expires_in || 3600) }
  return data.access_token
}

async function enviarAndroid(token: string, aviso: AvisoPush): Promise<ResultadoEnvio> {
  const cuenta = credencialesFirebase()
  const acceso = await tokenAccesoGoogle()
  if (!cuenta || !acceso) return { ok: false, detalle: "Firebase no está configurado" }

  const respuesta = await fetch(`https://fcm.googleapis.com/v1/projects/${cuenta.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${acceso}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: aviso.titulo, body: aviso.cuerpo },
        data: {
          tipo: aviso.tipo || "aviso",
          link: aviso.link || "/",
          conversacionId: aviso.conversacionId || "",
        },
        android: {
          priority: "high",
          notification: {
            channel_id: "diime_messages",
            sound: "default",
            icon: "ic_stat_diime",
            color: "#10B981",
            notification_count: aviso.badge,
            tag: aviso.conversacionId ? `conversacion-${aviso.conversacionId}` : undefined,
          },
        },
      },
    }),
  })

  if (respuesta.ok) return { ok: true }
  const texto = await respuesta.text().catch(() => "")
  const permanente = respuesta.status === 404 || texto.includes("UNREGISTERED") || texto.includes("INVALID_ARGUMENT")
  return { ok: false, permanente, detalle: `FCM ${respuesta.status}` }
}

let tokenApnsCache: { valor: string; caduca: number } | null = null
let avisoConfiguracionApnsMostrado = false

function tokenApns() {
  // Key ID y Team ID identifican la cuenta, pero no permiten firmar nada por sí
  // solos. Mantener los valores de Diime como respaldo evita que una variable
  // vacía impida todos los envíos; la clave privada sí debe seguir siendo un
  // secreto exclusivo del servidor.
  const keyId = process.env.APNS_KEY_ID?.trim() || "XZP92D95RP"
  const teamId = process.env.APPLE_TEAM_ID?.trim() || "DKX23L5985"
  const rawKey = process.env.APNS_PRIVATE_KEY?.trim()
  if (!rawKey) {
    if (!avisoConfiguracionApnsMostrado) {
      avisoConfiguracionApnsMostrado = true
      console.warn("[push] apns_config_missing keys=APNS_PRIVATE_KEY")
    }
    return null
  }

  const ahora = Math.floor(Date.now() / 1000)
  if (tokenApnsCache && tokenApnsCache.caduca > ahora + 60) return tokenApnsCache.valor

  const clave = rawKey.replaceAll("\\n", "\n")
  const valor = firmarJwt({ alg: "ES256", kid: keyId }, { iss: teamId, iat: ahora }, clave, true)
  tokenApnsCache = { valor, caduca: ahora + 50 * 60 }
  return valor
}

function peticionApns(host: string, token: string, aviso: AvisoPush): Promise<{ status: number; reason?: string }> {
  const autorizacion = tokenApns()
  if (!autorizacion) return Promise.resolve({ status: 0, reason: "APNs no está configurado" })

  const bundleId = process.env.APNS_BUNDLE_ID?.trim() || "es.diime.app"
  return new Promise((resolve) => {
    const cliente = connect(`https://${host}`)
    let terminado = false
    const limite = setTimeout(() => terminar({ status: 0, reason: "Timeout" }), 9000)
    const terminar = (resultado: { status: number; reason?: string }) => {
      if (terminado) return
      terminado = true
      clearTimeout(limite)
      cliente.close()
      resolve(resultado)
    }
    cliente.setTimeout(8000, () => terminar({ status: 0, reason: "Timeout" }))
    cliente.on("error", () => terminar({ status: 0, reason: "ConnectionError" }))

    const req = cliente.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${autorizacion}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    })
    let status = 0
    let respuesta = ""
    req.setEncoding("utf8")
    req.on("response", (headers) => {
      status = Number(headers[":status"] || 0)
    })
    req.on("data", (trozo) => {
      respuesta += trozo
    })
    req.on("end", () => {
      let reason: string | undefined
      try {
        reason = (JSON.parse(respuesta) as { reason?: string }).reason
      } catch {}
      terminar({ status, reason })
    })
    req.on("error", () => terminar({ status: 0, reason: "RequestError" }))
    req.end(
      JSON.stringify({
        aps: {
          alert: { title: aviso.titulo, body: aviso.cuerpo },
          sound: "default",
          badge: aviso.badge,
          "thread-id": aviso.conversacionId ? `conversacion-${aviso.conversacionId}` : "diime",
        },
        tipo: aviso.tipo || "aviso",
        link: aviso.link || "/",
        conversacionId: aviso.conversacionId || "",
      }),
    )
  })
}

async function enviarIos(token: string, aviso: AvisoPush): Promise<ResultadoEnvio> {
  // Las builds instaladas desde Xcode usan sandbox; TestFlight/App Store usan
  // producción. Probamos el entorno de producción primero y, si el token no
  // pertenece a él, repetimos una sola vez en sandbox.
  const produccion = await peticionApns("api.push.apple.com", token, aviso)
  if (produccion.status === 200) return { ok: true }

  // Un token de una build instalada desde Xcode responde BadDeviceToken en
  // producción y debe probarse en sandbox. Otros errores (por ejemplo,
  // BadTopic o credenciales inválidas) no dicen nada sobre el token y no deben
  // provocar que desactivemos un dispositivo válido.
  if (produccion.reason === "BadDeviceToken") {
    const sandbox = await peticionApns("api.sandbox.push.apple.com", token, aviso)
    if (sandbox.status === 200) return { ok: true }
    const permanente = ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(sandbox.reason || "")
    return { ok: false, permanente, detalle: sandbox.reason || `APNs ${sandbox.status}` }
  }
  return {
    ok: false,
    permanente: produccion.reason === "Unregistered",
    detalle: produccion.reason || `APNs ${produccion.status}`,
  }
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

async function contarPendientesUsuario(admin: AdminClient, usuarioId: string) {
  const [notificaciones, conversaciones] = await Promise.all([
    admin
      .from("notificaciones")
      .select("*", { count: "exact", head: true })
      .eq("usuario_id", usuarioId)
      .eq("leida", false),
    admin
      .from("conversaciones")
      .select("id")
      .or(`participante_1.eq.${usuarioId},participante_2.eq.${usuarioId}`),
  ])

  if (notificaciones.error || conversaciones.error) {
    console.warn(`[push] badge_count_failed recipient=${usuarioId.slice(0, 8)} stage=base`)
    return undefined
  }

  const conversacionIds = (conversaciones.data || []).map((conversacion) => conversacion.id)
  let mensajesNoLeidos = 0
  if (conversacionIds.length > 0) {
    const mensajes = await admin
      .from("mensajes")
      .select("*", { count: "exact", head: true })
      .in("conversacion_id", conversacionIds)
      .eq("leido", false)
      .neq("remitente_id", usuarioId)
    if (mensajes.error) {
      console.warn(`[push] badge_count_failed recipient=${usuarioId.slice(0, 8)} stage=messages`)
      return undefined
    }
    mensajesNoLeidos = mensajes.count || 0
  }

  return Math.max(0, (notificaciones.count || 0) + mensajesNoLeidos)
}

export async function enviarPushAUsuario(usuarioId: string, aviso: AvisoPush) {
  try {
    const admin = createAdminClient()
    if (!admin) {
      console.warn("[push] delivery_skipped reason=server_access_not_configured")
      return { encontrados: 0, enviados: 0, error: "Acceso de servidor no configurado" }
    }

    const { data: dispositivos, error: errorDispositivos } = await admin
      .from("push_devices")
      .select("token, plataforma")
      .eq("usuario_id", usuarioId)
      .eq("activo", true)

    if (errorDispositivos) {
      console.error(
        `[push] device_lookup_failed recipient=${usuarioId.slice(0, 8)} code=${errorDispositivos.code || "unknown"}`,
      )
      return { encontrados: 0, enviados: 0, error: "No se pudieron consultar los dispositivos" }
    }

    if (!dispositivos?.length) {
      console.warn(`[push] delivery_skipped reason=no_registered_devices recipient=${usuarioId.slice(0, 8)}`)
      return { encontrados: 0, enviados: 0, error: "No hay dispositivos registrados" }
    }

    // APNs no incrementa el icono automáticamente. Cada push lleva el total
    // real de avisos y mensajes pendientes para que el badge nunca dependa de
    // cuántos intentos de entrega hubo ni quede atascado en un valor antiguo.
    const badge = await contarPendientesUsuario(admin, usuarioId)
    const avisoConBadge = { ...aviso, badge }

    const resultados = await Promise.all(
      dispositivos.map(async (dispositivo: { token: string; plataforma: PlataformaPush }) => {
        const resultado =
          dispositivo.plataforma === "ios"
            ? await enviarIos(dispositivo.token, avisoConBadge)
            : await enviarAndroid(dispositivo.token, avisoConBadge)
        if (resultado.permanente) {
          await admin.from("push_devices").update({ activo: false }).eq("token", dispositivo.token)
        }
        return resultado
      }),
    )
    const enviados = resultados.filter((resultado) => resultado.ok).length
    const fallos = resultados.map((resultado) => resultado.detalle).filter(Boolean)
    if (enviados === 0) {
      console.warn(
        `[push] delivery_failed recipient=${usuarioId.slice(0, 8)} devices=${dispositivos.length} reasons=${fallos.join("|") || "unknown"}`,
      )
    } else {
      console.info(
        `[push] delivery_ok recipient=${usuarioId.slice(0, 8)} delivered=${enviados}/${dispositivos.length} badge=${badge ?? "unknown"}`,
      )
    }
    return {
      encontrados: dispositivos.length,
      enviados,
      error: enviados > 0 ? undefined : fallos.join(", "),
    }
  } catch (error) {
    // Un push no entregado no puede impedir que el mensaje o la operación que
    // lo provocó se guarde correctamente.
    console.error("[push] No se pudo enviar la notificación:", error)
    return { encontrados: 0, enviados: 0, error: "Error interno al enviar la notificación" }
  }
}
