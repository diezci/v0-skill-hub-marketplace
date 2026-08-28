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

function tokenApns() {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APPLE_TEAM_ID
  const rawKey = process.env.APNS_PRIVATE_KEY
  if (!keyId || !teamId || !rawKey) return null

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

  const bundleId = process.env.APNS_BUNDLE_ID || "es.diime.app"
  return new Promise((resolve) => {
    const cliente = connect(`https://${host}`)
    let terminado = false
    const terminar = (resultado: { status: number; reason?: string }) => {
      if (terminado) return
      terminado = true
      cliente.close()
      resolve(resultado)
    }
    cliente.setTimeout(8000, () => terminar({ status: 0 }))
    cliente.on("error", () => terminar({ status: 0 }))

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
    req.on("error", () => terminar({ status: 0 }))
    req.end(
      JSON.stringify({
        aps: {
          alert: { title: aviso.titulo, body: aviso.cuerpo },
          sound: "default",
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

  if ([400, 403, 410].includes(produccion.status)) {
    const sandbox = await peticionApns("api.sandbox.push.apple.com", token, aviso)
    if (sandbox.status === 200) return { ok: true }
    const permanente = ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(sandbox.reason || "")
    return { ok: false, permanente, detalle: sandbox.reason || `APNs ${sandbox.status}` }
  }
  return { ok: false, detalle: produccion.reason || `APNs ${produccion.status}` }
}

export async function enviarPushAUsuario(usuarioId: string, aviso: AvisoPush) {
  try {
    const admin = createAdminClient()
    if (!admin) return { encontrados: 0, enviados: 0, error: "Acceso de servidor no configurado" }

    const { data: dispositivos } = await admin
      .from("push_devices")
      .select("token, plataforma")
      .eq("usuario_id", usuarioId)
      .eq("activo", true)

    if (!dispositivos?.length) return { encontrados: 0, enviados: 0, error: "No hay dispositivos registrados" }

    const resultados = await Promise.all(
      dispositivos.map(async (dispositivo: { token: string; plataforma: PlataformaPush }) => {
        const resultado =
          dispositivo.plataforma === "ios"
            ? await enviarIos(dispositivo.token, aviso)
            : await enviarAndroid(dispositivo.token, aviso)
        if (resultado.permanente) {
          await admin.from("push_devices").update({ activo: false }).eq("token", dispositivo.token)
        }
        return resultado
      }),
    )
    const enviados = resultados.filter((resultado) => resultado.ok).length
    return {
      encontrados: dispositivos.length,
      enviados,
      error: enviados > 0 ? undefined : resultados.map((resultado) => resultado.detalle).filter(Boolean).join(", "),
    }
  } catch (error) {
    // Un push no entregado no puede impedir que el mensaje o la operación que
    // lo provocó se guarde correctamente.
    console.error("[push] No se pudo enviar la notificación:", error)
    return { encontrados: 0, enviados: 0, error: "Error interno al enviar la notificación" }
  }
}
