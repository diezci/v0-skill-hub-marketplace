/** Historical attachments: dry-run by default. No remote work occurs on import. */
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

export const PRIVATE_FIELDS = {
  solicitudes: ['archivos'], ofertas: ['archivos'],
  trabajos: ['archivos', 'cancelacion_adjuntos_solicitante', 'cancelacion_adjuntos_respuesta'],
  actualizaciones_trabajo: ['archivos'], mensajes: ['archivo_url'], empresa_mensajes: ['archivo_url'],
}
const BUCKET = 'adjuntos-privados'
const MAX_BYTES = 10 * 1024 * 1024
const digest = value => createHash('sha256').update(value).digest('hex')
function privateUrl(origin, id, name) {
  const result = new URL(`/api/archivos/${id}`, origin)
  result.searchParams.set('nombre', name)
  return result.href
}
export function paginationColumns(definition) {
  const properties = definition?.properties || {}
  const primary = Object.entries(properties).filter(([, value]) => /<pk\/>|Primary Key/i.test(value.description || '')).map(([name]) => name)
  if (primary.length) return primary
  if (properties.id) return ['id']
  // Refuse deletion when an exposed view has no provable stable key.
  throw Error('DATABASE_STABLE_KEY_REQUIRED')
}
export function exposedEntities(schema) {
  const entities = []
  for (const [route, methods] of Object.entries(schema.paths || {})) {
    if (!/^\/[^/]+$/.test(route) || !methods.get) continue
    let name
    try { name = decodeURIComponent(route.slice(1)) } catch { throw Error('INCOMPLETE_DATABASE_INTROSPECTION') }
    if (!schema.definitions?.[name]) throw Error('INCOMPLETE_DATABASE_INTROSPECTION')
    entities.push(name)
  }
  return [...new Set(entities)]
}
function stableId(value) {
  const b = createHash('sha1').update(`diime-private-attachment:${value}`).digest().subarray(0, 16)
  b[6] = (b[6] & 15) | 80; b[8] = (b[8] & 63) | 128
  const h = b.toString('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}
function ownedPublicUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname) && !u.hash && !u.search }
  catch { return false }
}
function ensureCopy(source, copied) {
  if (!copied || copied.length !== source.length || digest(copied) !== digest(source)) throw Error('PRIVATE_COPY_MISMATCH')
}
function validateMetadata(record, legacy, siteOrigin) {
  if (record.legacy_url !== legacy || record.propietario_id !== null || record.compartido !== true ||
    !Number.isInteger(record.bytes) || record.bytes < 1 || record.bytes > MAX_BYTES ||
    record.url !== privateUrl(siteOrigin, record.id, record.nombre) || !record.storage_path.startsWith('legacy/')) throw Error('LEGACY_METADATA_MISMATCH')
  if (!/^[a-f0-9]{64}$/.test(record.sha256 || '')) throw Error('LEGACY_METADATA_HASH_REQUIRED')
}
export async function uploadPrivateCopy(storage, name, bytes, type) {
  const { error } = await storage.upload(name, bytes, { contentType: type, upsert: false })
  if (!error) return
  // Storage may return 400 Duplicate, 409, or a lost response after a successful
  // upload. Never infer success from the error label and never overwrite.
  const existing = await storage.download(name)
  if (existing.error || !existing.data) throw Error('PRIVATE_UPLOAD_FAILED')
  ensureCopy(bytes, Buffer.from(await existing.data.arrayBuffer()))
}

/** Dependency-injected engine used by the transport regression tests. */
export async function migrateAttachments(io, { apply = false, deletePublicOriginals = false, projectRef, siteUrl } = {}) {
  if (deletePublicOriginals && !apply) throw Error('DELETE_REQUIRES_APPLY')
  if (!projectRef) throw Error('EXPECTED_PROJECT_REQUIRED')
  const site = new URL(siteUrl)
  if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) throw Error('INVALID_SITE_ORIGIN')
  await io.preflight(projectRef)
  const blobs = new Map((await io.listOwnedBlobs()).map(blob => [blob.url, blob]))
  const references = await io.privateReferences()
  // Previously copied rows must remain candidates on a later deletion-only run.
  const existing = new Map((await io.listLegacyMetadata()).map(row => [row.legacy_url, row]))
  const candidates = new Set([...references.keys(), ...existing.keys()])
  const report = { mode: apply ? 'apply' : 'dry-run', projectRef, deletionRequested: deletePublicOriginals, entries: [] }
  for (const legacy of candidates) {
    const entry = { sourceHash: digest(legacy), privateReferences: references.get(legacy) || 0 }
    report.entries.push(entry)
    const sourceListed = ownedPublicUrl(legacy) && blobs.has(legacy)
    const listed = blobs.get(legacy)
    let record = existing.get(legacy)
    if (!sourceListed && !record) { entry.status = 'skipped_not_owned_or_missing'; continue }
    if (sourceListed && (listed.size < 1 || listed.size > MAX_BYTES)) { entry.status = 'skipped_size'; continue }
    if (!apply) { entry.status = !sourceListed ? 'would_verify_metadata_source_not_listed' : record ? 'would_resume' : 'would_copy'; continue }
    try {
      if (!sourceListed) {
        // A stored source hash permits resuming after deletion. Inventory absence
        // may also mean another store/token, so never report a confirmed deletion.
        validateMetadata(record, legacy, site.origin)
        const copied = await io.downloadPrivate(record.storage_path)
        if (!copied || copied.length !== record.bytes || digest(copied) !== record.sha256) throw Error('PRIVATE_COPY_MISMATCH')
        await io.replaceReferences(record.id)
        if (((await io.privateReferences()).get(legacy) || 0) > 0) throw Error('LEGACY_REFERENCES_REMAIN')
        entry.privateId = record.id
        entry.status = entry.privateReferences > 0 ? 'references_migrated_source_not_listed' : 'already_migrated_source_not_listed'
        continue
      }
      // Only an exact URL from the token-authenticated inventory reaches this adapter.
      const source = await io.downloadOwnedBlob(listed)
      if (source.bytes.length !== listed.size || !source.type) throw Error('SOURCE_CHANGED_OR_INVALID')
      if (!record) {
        const id = stableId(`${projectRef}:${legacy}`)
        const extension = path.extname(new URL(legacy).pathname).toLowerCase()
        const suffix = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '.bin'
        const storagePath = `legacy/${id}${suffix}`
        await io.uploadPrivate(storagePath, source.bytes, source.type)
        ensureCopy(source.bytes, await io.downloadPrivate(storagePath))
        let nombre = path.basename(new URL(legacy).pathname) || id
        try { nombre = decodeURIComponent(nombre) } catch {}
        nombre = nombre.slice(0, 180)
        record = await io.insertMetadataOrReadExisting({
          id, propietario_id: null, storage_path: storagePath, url: privateUrl(site.origin, id, nombre),
          legacy_url: legacy, nombre, tipo: source.type, bytes: source.bytes.length, sha256: digest(source.bytes), compartido: true,
        })
      }
      validateMetadata(record, legacy, site.origin)
      if (record.bytes !== source.bytes.length || record.sha256 !== digest(source.bytes)) throw Error('LEGACY_METADATA_MISMATCH')
      ensureCopy(source.bytes, await io.downloadPrivate(record.storage_path))
      await io.replaceReferences(record.id)
      entry.privateId = record.id
      entry.status = 'references_migrated_original_retained'
      if (!deletePublicOriginals) continue
      // Read both objects again; neither an old upload nor stale metadata proves a safe deletion.
      const current = await io.downloadOwnedBlob(listed)
      ensureCopy(source.bytes, current.bytes)
      ensureCopy(current.bytes, await io.downloadPrivate(record.storage_path))
      const remaining = await io.privateReferences()
      if ((remaining.get(legacy) || 0) > 0) { entry.status = 'retained_private_references_remain'; continue }
      // Conservatively protect a URL found in ANY other exposed table/column,
      // including public image fields and text/JSON references we cannot classify.
      if (await io.hasOtherReferences(legacy)) { entry.status = 'retained_public_or_other_reference'; continue }
      if (!current.etag || current.etag.startsWith('W/')) throw Error('SOURCE_STRONG_ETAG_REQUIRED')
      await io.deleteOwnedBlob(listed, current.etag)
      entry.status = 'migrated_original_deleted'
    } catch (error) {
      entry.status = 'error_original_retained'
      entry.error = /^[A-Z][A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'MIGRATION_STEP_FAILED'
      // Never print SDK errors, source URLs, file contents, headers or credentials.
    }
  }
  report.counts = report.entries.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {})
  return report
}

export function parseOptions(args) {
  const options = { apply: false, deletePublicOriginals: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.apply = true
    else if (args[i] === '--delete-public-originals') options.deletePublicOriginals = true
    else if (args[i] === '--project-ref' && args[i+1]) options.projectRef = args[++i]
    else if (args[i] === '--report' && args[i+1]) options.reportPath = args[++i]
    else if (args[i] === '--help') options.help = true
    else throw Error('UNKNOWN_ARGUMENT')
  }
  if (options.deletePublicOriginals && !options.apply) throw Error('DELETE_REQUIRES_APPLY')
  return options
}

async function productionAdapter(env) {
  const { createClient } = await import('@supabase/supabase-js')
  const { list, del } = await import('@vercel/blob')
  const { NEXT_PUBLIC_SUPABASE_URL: databaseUrl, SUPABASE_SERVICE_ROLE_KEY: key, BLOB_READ_WRITE_TOKEN: token } = env
  if (!databaseUrl || !key || !token) throw Error('MISSING_ENVIRONMENT')
  const base = new URL(databaseUrl)
  if (base.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/i.test(base.hostname) || base.username || base.password) throw Error('INVALID_DATABASE_ORIGIN')
  const db = createClient(base.origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
  let entities = []
  let definitions = {}
  let allowed = new Map()
  async function rows(table, columns = '*') {
    const all = []; let expectedCount
    for (let offset = 0; ; ) {
      let query = db.from(table).select(columns, { count: 'exact' })
      for (const column of paginationColumns(definitions[table])) query = query.order(column)
      const { data, error, count } = await query.range(offset, offset + 499)
      if (error || !Array.isArray(data) || !Number.isInteger(count)) throw Error('DATABASE_READ_FAILED')
      if (expectedCount !== undefined && expectedCount !== count) throw Error('DATABASE_CHANGED_DURING_SCAN')
      expectedCount = count
      all.push(...data)
      if (all.length === count) return all
      if (!data.length || all.length > count) throw Error('DATABASE_PAGINATION_FAILED')
      // Respect projects whose Data API max_rows is lower than our page size.
      offset += data.length
    }
  }
  const readPrivate = async () => {
    const found = new Map()
    for (const [table, fields] of Object.entries(PRIVATE_FIELDS)) {
      for (const row of await rows(table, ['id', ...fields].join(','))) for (const field of fields) {
        const values = Array.isArray(row[field]) ? row[field] : [row[field]]
        for (const value of values) if (typeof value === 'string' && value.startsWith('https://') && !value.includes('/api/archivos/')) found.set(value, (found.get(value) || 0) + 1)
      }
    }
    return found
  }
  const storage = db.storage.from(BUCKET)
  return {
    async preflight(expected) {
      if (base.hostname !== `${expected}.supabase.co`) throw Error('PROJECT_MISMATCH')
      if (key.split('.').length === 3) {
        let payload; try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()) } catch { throw Error('INVALID_SERVICE_KEY') }
        if (payload.role !== 'service_role' || (payload.ref && payload.ref !== expected)) throw Error('SERVICE_KEY_PROJECT_MISMATCH')
      }
      const { data: bucket, error } = await db.storage.getBucket(BUCKET)
      if (error || !bucket || bucket.public !== false || bucket.id !== BUCKET) throw Error('PRIVATE_BUCKET_REQUIRED')
      // Introspection is read-only; do not invoke a mutating RPC just to test existence.
      const schemaResponse = await fetch(`${base.origin}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' }, redirect: 'error' })
      if (!schemaResponse.ok) throw Error('DATABASE_INTROSPECTION_REQUIRED')
      const schema = await schemaResponse.json()
      if (!schema.paths?.['/rpc/migrar_referencia_archivo_privado']?.post || !schema.definitions?.archivos_privados?.properties?.legacy_url || !schema.definitions?.archivos_privados?.properties?.sha256) throw Error('PRIVATE_MIGRATION_REQUIRED')
      definitions = schema.definitions
      entities = exposedEntities(schema)
      for (const table of ['profiles', 'portfolio', 'empresas', ...Object.keys(PRIVATE_FIELDS)]) if (!entities.includes(table)) throw Error('INCOMPLETE_DATABASE_INTROSPECTION')
      await rows('archivos_privados', 'id,legacy_url,storage_path,url,propietario_id,bytes,tipo,sha256,compartido')
    },
    async listOwnedBlobs() {
      const blobs = []; let cursor
      do { const result = await list({ token, limit: 1000, ...(cursor ? { cursor } : {}) }); blobs.push(...result.blobs); if (!result.hasMore) break; if (!result.cursor || cursor === result.cursor) throw Error('BLOB_PAGINATION_FAILED'); cursor = result.cursor } while (true)
      allowed = new Map(blobs.map(blob => [blob.url, blob])); return blobs
    },
    privateReferences: readPrivate,
    listLegacyMetadata: async () => (await rows('archivos_privados')).filter(row => row.legacy_url),
    async downloadOwnedBlob(blob) {
      if (!allowed.has(blob.url) || !ownedPublicUrl(blob.url)) throw Error('UNTRUSTED_SOURCE')
      const response = await fetch(blob.url, { redirect: 'error', cache: 'no-store' })
      if (!response.ok) throw Error('SOURCE_DOWNLOAD_FAILED')
      if (Number(response.headers.get('content-length')) > MAX_BYTES) throw Error('SOURCE_TOO_LARGE')
      const reader = response.body.getReader(); const chunks = []; let length = 0
      try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > MAX_BYTES) { await reader.cancel(); throw Error('SOURCE_TOO_LARGE') } chunks.push(Buffer.from(value)) } } finally { reader.releaseLock() }
      return { bytes: Buffer.concat(chunks), type: (response.headers.get('content-type') || 'application/octet-stream').split(';')[0], etag: response.headers.get('etag') }
    },
    uploadPrivate: (name, bytes, type) => uploadPrivateCopy(storage, name, bytes, type),
    async downloadPrivate(name) { const { data, error } = await storage.download(name); if (error || !data) throw Error('PRIVATE_DOWNLOAD_FAILED'); return Buffer.from(await data.arrayBuffer()) },
    async insertMetadataOrReadExisting(record) {
      const { data, error } = await db.from('archivos_privados').insert(record).select('*').single()
      if (!error) return data
      if (error.code !== '23505') throw Error('METADATA_INSERT_FAILED')
      const existing = await db.from('archivos_privados').select('*').eq('legacy_url', record.legacy_url).single()
      if (existing.error || !existing.data) throw Error('METADATA_CONFLICT')
      return existing.data
    },
    async replaceReferences(id) { const { error } = await db.rpc('migrar_referencia_archivo_privado', { p_id: id }); if (error) throw Error('REFERENCE_MIGRATION_FAILED') },
    async hasOtherReferences(url) {
      for (const table of entities) {
        if (table === 'archivos_privados') continue
        for (const row of await rows(table)) for (const [field, value] of Object.entries(row)) {
          if (PRIVATE_FIELDS[table]?.includes(field)) continue
          if (JSON.stringify(value)?.includes(url)) return true
        }
      }
      return false
    },
    async deleteOwnedBlob(blob, etag) {
      if (!allowed.has(blob.url) || !ownedPublicUrl(blob.url)) throw Error('UNTRUSTED_SOURCE')
      if (typeof etag !== 'string' || !etag || etag.startsWith('W/')) throw Error('SOURCE_STRONG_ETAG_REQUIRED')
      await del(blob.url, { token, ifMatch: etag })
    },
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) { console.log('Usage: node --env-file=.env.local scripts/migrar-adjuntos-privados.mjs --project-ref REF [--apply] [--delete-public-originals] [--report PATH]\nDefault: read-only inventory. --apply copies and changes private references. Deletion requires both flags.'); return }
  const report = await migrateAttachments(await productionAdapter(process.env), { ...options, siteUrl: process.env.NEXT_PUBLIC_SITE_URL })
  if (options.reportPath) { const fs = await import('node:fs/promises'); await fs.writeFile(options.reportPath, JSON.stringify(report, null, 2), { mode: 0o600 }) }
  console.log(JSON.stringify({ mode: report.mode, projectRef: report.projectRef, counts: report.counts }))
  if (report.entries.some(row => row.status === 'error_original_retained' || row.status.startsWith('blocked_'))) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(/^[A-Z][A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'MIGRATION_ABORTED'); process.exitCode = 1 })
