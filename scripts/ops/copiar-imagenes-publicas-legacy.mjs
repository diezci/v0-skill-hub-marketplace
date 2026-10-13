/** Explicit operational exception for reviewed public portfolio images. Never deletes originals. */
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const MAX = 10 * 1024 * 1024
export const sha256 = value => createHash('sha256').update(value).digest('hex')
const isOwnedUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.search && !u.hash && /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname) } catch { return false } }
export const postgresArrayLiteral = values => '{' + values.map(value => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}'
const destination = hash => `perfiles/public/legacy-${hash}.png`
function verify(bytes, record) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw Error('CONTENT_MISMATCH')
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('PNG_REQUIRED')
}
function validateManifest(manifest) {
  if (!Array.isArray(manifest) || !manifest.length) throw Error('REVIEWED_MANIFEST_REQUIRED')
  const keys = new Set()
  for (const row of manifest) {
    if (!/^[a-f0-9-]{36}$/.test(row.portfolioId || '') || !/^[a-f0-9]{64}$/.test(row.sourceHash || '')) throw Error('INVALID_MANIFEST')
    const key = row.portfolioId + ':' + row.sourceHash
    if (keys.has(key)) throw Error('DUPLICATE_MANIFEST_ENTRY')
    keys.add(key)
  }
}
export async function copyPublicPortfolioImages(io, { manifest, projectRef, siteUrl, apply = false }) {
  validateManifest(manifest)
  const site = new URL(siteUrl)
  if (!projectRef || site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) throw Error('INVALID_PROJECT_OR_SITE')
  await io.preflight(projectRef)
  const metadata = await io.listLegacyMetadata()
  let blobs = await io.listOwnedBlobs()
  const report = { mode: apply ? 'apply' : 'dry-run', projectRef, entries: [] }
  for (const item of manifest) {
    const entry = { ...item }; report.entries.push(entry)
    try {
      const records = metadata.filter(row => sha256(row.legacy_url || '') === item.sourceHash)
      if (records.length !== 1) throw Error('VERIFIED_PRIVATE_METADATA_REQUIRED')
      const record = records[0]
      const canonical = new URL(`/api/archivos/${record.id}`, site.origin); canonical.searchParams.set('nombre', record.nombre)
      if (!isOwnedUrl(record.legacy_url) || record.propietario_id !== null || record.compartido !== true || !record.storage_path?.startsWith('legacy/') || record.url !== canonical.href || !/^[a-f0-9]{64}$/.test(record.sha256 || '') || !Number.isInteger(record.bytes) || record.bytes < 8 || record.bytes > MAX || record.tipo !== 'image/png') throw Error('VERIFIED_PRIVATE_METADATA_REQUIRED')
      const privateBytes = await io.downloadPrivate(record.storage_path); verify(privateBytes, record)
      const row = await io.readPortfolio(item.portfolioId)
      if (!row || !Array.isArray(row.imagenes) || row.imagenes.some(value => typeof value !== 'string')) throw Error('PORTFOLIO_NOT_FOUND_OR_INVALID')
      const pathname = destination(item.sourceHash)
      let targets = blobs.filter(blob => blob.pathname === pathname)
      if (targets.length > 1) throw Error('DESTINATION_AMBIGUOUS')
      let target = targets[0]
      const hasLegacy = row.imagenes.includes(record.legacy_url)
      if (!hasLegacy && (!target || !row.imagenes.includes(target.url))) throw Error('PORTFOLIO_REFERENCE_CHANGED')
      const source = blobs.find(blob => blob.url === record.legacy_url)
      if (source) {
        const fetched = await io.downloadOwnedBlob(source)
        if (fetched.type !== 'image/png' || source.size !== record.bytes) throw Error('SOURCE_TYPE_OR_SIZE_CHANGED')
        verify(fetched.bytes, record)
      } else if (!target || hasLegacy) throw Error('SOURCE_NOT_IN_OWNED_INVENTORY')
      if (target) {
        if (!isOwnedUrl(target.url)) throw Error('UNTRUSTED_DESTINATION')
        const fetched = await io.downloadOwnedBlob(target)
        if (fetched.type !== 'image/png') throw Error('DESTINATION_TYPE_CHANGED')
        verify(fetched.bytes, record)
      }
      if (!apply) { entry.status = hasLegacy ? 'would_copy_or_reuse_and_repoint' : 'already_repointed_verified'; continue }
      if (!target) {
        try { await io.putPublic(pathname, privateBytes) } catch { /* Lost upload response or duplicate: inventory and bytes decide. */ }
        blobs = await io.listOwnedBlobs()
        targets = blobs.filter(blob => blob.pathname === pathname)
        if (targets.length !== 1 || !isOwnedUrl(targets[0].url)) throw Error('PUBLIC_COPY_NOT_VERIFIED')
        target = targets[0]
        const fetched = await io.downloadOwnedBlob(target)
        if (fetched.type !== 'image/png') throw Error('DESTINATION_TYPE_CHANGED')
        verify(fetched.bytes, record)
      }
      if (hasLegacy) {
        const next = row.imagenes.map(url => url === record.legacy_url ? target.url : url)
        const updated = await io.compareAndSwapImages(row.id, row.imagenes, next)
        if (!updated || JSON.stringify(updated.imagenes) !== JSON.stringify(next)) throw Error('PORTFOLIO_CONCURRENT_EDIT')
        entry.status = 'public_copy_verified_and_repointed'
      } else entry.status = 'already_repointed_verified'
      entry.destination = target.url
      entry.sha256 = record.sha256
    } catch (error) {
      entry.status = 'error_original_retained'
      entry.error = /^[A-Z][A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'PUBLIC_COPY_FAILED'
    }
  }
  report.counts = report.entries.reduce((counts, entry) => ({ ...counts, [entry.status]: (counts[entry.status] || 0) + 1 }), {})
  return report
}

export async function productionAdapter(env, dependencies = {}) {
  const { createClient } = dependencies.supabase || await import('@supabase/supabase-js')
  const { list, put } = dependencies.blob || await import('@vercel/blob')
  const request = dependencies.fetch || fetch
  const { NEXT_PUBLIC_SUPABASE_URL: databaseUrl, SUPABASE_SERVICE_ROLE_KEY: key, BLOB_READ_WRITE_TOKEN: token } = env
  if (!databaseUrl || !key || !token) throw Error('MISSING_ENVIRONMENT')
  const base = new URL(databaseUrl)
  if (base.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/i.test(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('INVALID_DATABASE_ORIGIN')
  const db = createClient(base.origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
  let owned = new Set()
  return {
    async preflight(expected) {
      if (base.hostname !== `${expected}.supabase.co`) throw Error('PROJECT_MISMATCH')
      if (key.split('.').length === 3) {
        let payload; try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()) } catch { throw Error('INVALID_SERVICE_KEY') }
        if (payload.role !== 'service_role' || payload.ref && payload.ref !== expected) throw Error('SERVICE_KEY_PROJECT_MISMATCH')
      }
      const { data, error } = await db.storage.getBucket('adjuntos-privados')
      if (error || data?.id !== 'adjuntos-privados' || data.public !== false) throw Error('PRIVATE_BUCKET_REQUIRED')
    },
    async listLegacyMetadata() {
      const all = []; let countBefore
      for (let offset = 0; ; ) {
        const { data, error, count } = await db.from('archivos_privados').select('*', { count: 'exact' }).not('legacy_url', 'is', null).order('id').range(offset, offset + 99)
        if (error || !Array.isArray(data) || !Number.isInteger(count)) throw Error('METADATA_READ_FAILED')
        if (countBefore !== undefined && countBefore !== count) throw Error('METADATA_CHANGED_DURING_SCAN')
        countBefore = count; all.push(...data)
        if (all.length === count) return all
        if (!data.length || all.length > count) throw Error('METADATA_PAGINATION_FAILED')
        offset += data.length
      }
    },
    async listOwnedBlobs() {
      const result = []; let cursor
      do { const page = await list({ token, limit: 1000, ...(cursor ? { cursor } : {}) }); result.push(...page.blobs); if (!page.hasMore) break; if (!page.cursor || cursor === page.cursor) throw Error('BLOB_PAGINATION_FAILED'); cursor = page.cursor } while (true)
      owned = new Set(result.map(blob => blob.url)); return result
    },
    async downloadOwnedBlob(blob) {
      if (!owned.has(blob.url) || !isOwnedUrl(blob.url)) throw Error('UNTRUSTED_SOURCE')
      const response = await request(blob.url, { redirect: 'error', cache: 'no-store' })
      if (!response.ok || Number(response.headers.get('content-length')) > MAX) throw Error('BLOB_DOWNLOAD_FAILED')
      const reader = response.body.getReader(); const chunks = []; let length = 0
      try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > MAX) { await reader.cancel(); throw Error('BLOB_TOO_LARGE') } chunks.push(Buffer.from(value)) } } finally { reader.releaseLock() }
      return { bytes: Buffer.concat(chunks), type: (response.headers.get('content-type') || '').split(';')[0] }
    },
    async downloadPrivate(name) { const { data, error } = await db.storage.from('adjuntos-privados').download(name); if (error || !data) throw Error('PRIVATE_DOWNLOAD_FAILED'); return Buffer.from(await data.arrayBuffer()) },
    async readPortfolio(id) { const { data, error } = await db.from('portfolio').select('id,imagenes').eq('id', id).single(); if (error) throw Error('PORTFOLIO_READ_FAILED'); return data },
    putPublic: (name, bytes) => put(name, bytes, { token, access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: 'image/png' }),
    async compareAndSwapImages(id, previous, next) {
      const { data, error } = await db.from('portfolio').update({ imagenes: next }).eq('id', id).eq('imagenes', postgresArrayLiteral(previous)).select('id,imagenes').maybeSingle()
      if (error) throw Error('PORTFOLIO_UPDATE_FAILED')
      return data
    },
  }
}

async function main() {
  const options = { apply: false }; const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.apply = true
    else if (args[i] === '--project-ref' && args[i + 1]) options.projectRef = args[++i]
    else if (args[i] === '--manifest' && args[i + 1]) options.manifestPath = args[++i]
    else if (args[i] === '--report' && args[i + 1]) options.reportPath = args[++i]
    else if (args[i] === '--help') { console.log('Usage: node --env-file=ENV scripts/ops/copiar-imagenes-publicas-legacy.mjs --project-ref REF --manifest FILE [--apply] [--report FILE]. Default read-only; never deletes originals.'); return }
    else throw Error('UNKNOWN_ARGUMENT')
  }
  if (!options.manifestPath) throw Error('REVIEWED_MANIFEST_REQUIRED')
  const fs = await import('node:fs/promises')
  const manifest = JSON.parse(await fs.readFile(options.manifestPath, 'utf8'))
  const report = await copyPublicPortfolioImages(await productionAdapter(process.env), { ...options, manifest, siteUrl: process.env.NEXT_PUBLIC_SITE_URL })
  if (options.reportPath) await fs.writeFile(options.reportPath, JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ mode: report.mode, counts: report.counts }))
  if (report.entries.some(entry => entry.status === 'error_original_retained')) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(/^[A-Z][A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'PUBLIC_COPY_ABORTED'); process.exitCode = 1 })
