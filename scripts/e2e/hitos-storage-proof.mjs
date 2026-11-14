import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServerClient } from '@supabase/ssr'

/** Upload/download uses the same authenticated endpoints and signed Storage upload as the UI.
 * The QA HTTPS proxy certificate is trusted only through NODE_EXTRA_CA_CERTS. */
export async function entregarConArchivos(c, trabajoId, hitoId, contractRoute) {
  assert.ok(process.env.NODE_EXTRA_CA_CERTS, 'The local QA CA must be explicitly trusted by this test process')
  const origin = 'https://127.0.0.1:3216', clients = new Map()
  async function secureClient(alias) {
    if (clients.has(alias)) return clients.get(alias)
    const jar = new Map(), user = c.credentials.users[alias]
    const supabase = createServerClient(c.env.NEXT_PUBLIC_SUPABASE_URL, c.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false }, cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: entries => entries.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)),
      },
    })
    const login = await supabase.auth.signInWithPassword({ email: user.email, password: user.password })
    assert.ifError(login.error); assert.equal(login.data.user.id, user.id)
    const request = async (route, options = {}) => {
      const url = new URL(route, origin); assert.equal(url.origin, origin)
      return fetch(url, { ...options, redirect: 'manual', headers: {
        Cookie: Array.from(jar, ([name, value]) => `${name}=${value}`).join('; '), ...options.headers,
      } })
    }
    const result = { request, supabase }; clients.set(alias, result); return result
  }
  async function upload(alias, name, content) {
    const client = await secureClient(alias), file = new File([content], name, { type: 'text/plain' })
    const prepared = await client.request('/api/upload/iniciar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: name, bytes: file.size }) })
    const reserved = await prepared.json()
    assert.equal(prepared.status, 200, reserved.error); assert.ok(reserved.id && reserved.path && reserved.token)
    const uploaded = await client.supabase.storage.from('adjuntos-privados').uploadToSignedUrl(reserved.path, reserved.token, file, { contentType: 'text/plain', upsert: false })
    assert.ifError(uploaded.error)
    const confirmed = await client.request('/api/upload/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reserved.id }) })
    const result = await confirmed.json(); assert.equal(confirmed.status, 200, result.error)
    assert.equal(new URL(result.url).origin, origin, 'Next must use the local HTTPS SITE_URL for the actual private file link')
    const own = await client.request(result.url); assert.equal(own.status, 200); assert.equal(await own.text(), content)
    return { id: reserved.id, url: result.url, name, content, bytes: file.size }
  }
  async function read(alias, file, expected) {
    const response = await (await secureClient(alias)).request(file.url)
    assert.equal(response.status, expected)
    assert.match(response.headers.get('cache-control') || '', /private.*no-store/)
    if (expected === 200) assert.equal(await response.text(), file.content)
  }
  const delivery = await upload('PP', `entrega-hito-${hitoId}.txt`, 'Evidencia sintética QA. Revisión de enchufes e informe de diagnóstico completados.\n')
  await read('CP', delivery, 404)
  c.ok(await c.call('PP', 'entregarHito', [trabajoId, hitoId, { mensaje: 'Informe entregado con evidencia privada de la revisión.', archivos: [delivery.url] }], contractRoute), 'deliver actual private file')
  await read('CP', delivery, 200); await read('CP2', delivery, 404)
  assert.equal((await fetch(delivery.url)).status, 401)
  const rejection = await upload('CP', `cambios-hito-${hitoId}.txt`, 'Evidencia sintética QA. Falta añadir el resultado de la comprobación final.\n')
  await read('PP', rejection, 404)
  c.ok(await c.call('CP', 'solicitarCambiosHito', [trabajoId, hitoId, 'Añade la comprobación final indicada en el documento adjunto.', [rejection.url]], contractRoute), 'request changes with actual file')
  assert.equal((await c.row('trabajos_hitos', hitoId)).estado, 'cambios_solicitados')
  await read('PP', rejection, 200); await read('CP2', rejection, 404)
  c.ok(await c.call('PP', 'entregarHito', [trabajoId, hitoId, { mensaje: 'Comprobación final incorporada; evidencia disponible para revisión.', archivos: [delivery.url] }], contractRoute), 'resubmit private evidence')
  const stage = await c.row('trabajos_hitos', hitoId)
  assert.equal(stage.estado, 'entregado'); assert.deepEqual(stage.archivos_entrega, [delivery.url])
  const history = await c.admin.from('actualizaciones_trabajo').select('tipo,archivos').eq('trabajo_id', trabajoId).eq('hito_id', hitoId)
  assert.ifError(history.error)
  assert.ok(history.data.some(h => h.archivos?.includes(delivery.url)))
  assert.ok(history.data.some(h => h.archivos?.includes(rejection.url)))
  const proof = { at: new Date().toISOString(), testOnly: true, realStorage: true, actualSignedUploads: true, actualAuthenticatedHttp: true,
    verifiedTls: true, caScope: 'This test process only; certificate validation remains enabled', trabajoId, hitoId,
    files: [delivery, rejection].map(({ content, ...file }) => file),
    ownerRead: true, otherPartyBeforeAttachmentDenied: true, participantAfterAttachmentRead: true,
    outsiderReadDenied: true, anonymousReadDenied: true, deliveryRejectionResubmissionHistoryVerified: true, passed: true }
  fs.writeFileSync(c.dir + '/storage-private-proof.json', JSON.stringify(proof, null, 2) + '\n')
  return proof
}
