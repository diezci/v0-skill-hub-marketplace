/** Post-migration verification only. Imports never access environment or network. */
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const MAX_BYTES = 10 * 1024 * 1024
const hash = value => createHash('sha256').update(value).digest('hex')
const safeError = error => /^[A-Z][A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'READ_VERIFICATION_FAILED'
const publicBlobUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash && /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname) } catch { return false } }
function validRecord(record, site) {
  const canonical = new URL(`/api/archivos/${record.id}`, site); canonical.searchParams.set('nombre', record.nombre)
  return publicBlobUrl(record.legacy_url) && record.propietario_id === null && record.compartido === true &&
    /^[a-f0-9-]{36}$/.test(record.id || '') && record.storage_path?.startsWith('legacy/') &&
    !record.storage_path.split('/').includes('..') && record.url === canonical.href &&
    Number.isInteger(record.bytes) && record.bytes > 0 && record.bytes <= MAX_BYTES && /^[a-f0-9]{64}$/.test(record.sha256 || '')
}
function verifyBytes(bytes, record) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== record.bytes || hash(bytes) !== record.sha256) throw Error('CONTENT_MISMATCH')
}
export async function verifyMigratedAttachments(io, { projectRef, siteUrl, manifest, expectedLegacyCount } = {}) {
  const site = new URL(siteUrl)
  if (!projectRef || site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) throw Error('INVALID_PROJECT_OR_SITE')
  if (!Array.isArray(manifest) || !manifest.length) throw Error('PORTFOLIO_MANIFEST_REQUIRED')
  const keys = new Set()
  for (const item of manifest) {
    const key = item.portfolioId + ':' + item.sourceHash
    if (!/^[a-f0-9-]{36}$/.test(item.portfolioId || '') || !/^[a-f0-9]{64}$/.test(item.sourceHash || '') || keys.has(key)) throw Error('INVALID_PORTFOLIO_MANIFEST')
    keys.add(key)
  }
  if (expectedLegacyCount !== undefined && (!Number.isInteger(expectedLegacyCount) || expectedLegacyCount < 1)) throw Error('INVALID_EXPECTED_COUNT')
  await io.preflight(projectRef)
  const records = await io.listLegacyMetadata()
  const blobs = await io.listOwnedBlobs()
  const owned = new Map(blobs.map(blob => [blob.url, blob]))
  // An absent original is not in the current inventory. Restrict HTTP probes
  // to origins actually proven to belong to this token by its other objects.
  const origins = new Set(blobs.filter(blob => publicBlobUrl(blob.url)).map(blob => new URL(blob.url).origin))
  const report = {
    mode: 'read-only', projectRef, checkedAt: new Date().toISOString(),
    parentReferences: { status: 'not_checked_by_this_script', requiredSql: 'scripts/ops/comprobar-cero-referencias-legacy.sql' },
    entries: [], portfolios: [], errors: [],
  }
  if (!records.length) report.errors.push('NO_LEGACY_METADATA')
  if (expectedLegacyCount !== undefined && records.length !== expectedLegacyCount) report.errors.push('LEGACY_COUNT_MISMATCH')
  if (new Set(records.map(row => row.id)).size !== records.length || new Set(records.map(row => row.legacy_url)).size !== records.length) report.errors.push('DUPLICATE_METADATA')
  for (const record of records) {
    const entry = { sourceHash: hash(record.legacy_url || ''), privateId: record.id, privateCopy: 'not_checked', inventoryAbsent: !owned.has(record.legacy_url), originalHttpStatus: null, errors: [] }
    report.entries.push(entry)
    if (!validRecord(record, site.origin)) { entry.errors.push('INVALID_LEGACY_METADATA'); entry.status = 'failed'; continue }
    try { verifyBytes(await io.downloadPrivate(record.storage_path), record); entry.privateCopy = 'verified_sha256_and_size' }
    catch (error) { entry.privateCopy = 'failed'; entry.errors.push(safeError(error)) }
    if (!entry.inventoryAbsent) entry.errors.push('ORIGINAL_STILL_IN_BLOB_INVENTORY')
    try {
      if (!origins.has(new URL(record.legacy_url).origin)) throw Error('ORIGINAL_STORE_NOT_PROVEN')
      entry.originalHttpStatus = await io.probeOriginal(record.legacy_url)
      if (entry.originalHttpStatus !== 404) entry.errors.push('ORIGINAL_HTTP_NOT_404')
    } catch (error) { entry.errors.push(safeError(error)) }
    entry.status = entry.errors.length ? 'failed' : 'verified'
  }
  for (const item of manifest) {
    const entry = { ...item, httpStatus: null, errors: [] }; report.portfolios.push(entry)
    try {
      const found = records.filter(record => hash(record.legacy_url || '') === item.sourceHash)
      if (found.length !== 1 || !validRecord(found[0], site.origin)) throw Error('PORTFOLIO_METADATA_NOT_VERIFIED')
      const record = found[0]
      if (report.entries.find(row => row.sourceHash === item.sourceHash)?.privateCopy !== 'verified_sha256_and_size') throw Error('PORTFOLIO_PRIVATE_COPY_NOT_VERIFIED')
      const targets = blobs.filter(blob => blob.pathname === `perfiles/public/legacy-${item.sourceHash}.png`)
      if (targets.length !== 1 || !publicBlobUrl(targets[0].url) || targets[0].size !== record.bytes) throw Error('PUBLIC_COPY_NOT_IN_OWNED_INVENTORY')
      const row = await io.readPortfolio(item.portfolioId)
      if (!row || !Array.isArray(row.imagenes) || !row.imagenes.includes(targets[0].url) || row.imagenes.includes(record.legacy_url)) throw Error('PORTFOLIO_REFERENCES_NOT_REPOINTED')
      const response = await io.downloadPublic(targets[0])
      entry.httpStatus = response.status
      if (response.status !== 200 || response.type !== 'image/png' || record.tipo !== 'image/png') throw Error('PUBLIC_PNG_HTTP_NOT_200')
      verifyBytes(response.bytes, record)
      if (!response.bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('PUBLIC_PNG_SIGNATURE_INVALID')
      entry.destinationHash = hash(targets[0].url)
      entry.sha256 = record.sha256
    } catch (error) { entry.errors.push(safeError(error)) }
    entry.status = entry.errors.length ? 'failed' : 'verified'
  }
  report.counts = {
    legacyMetadata: records.length, expectedLegacyCount: expectedLegacyCount ?? null,
    verifiedPrivateCopies: report.entries.filter(row => row.privateCopy === 'verified_sha256_and_size').length,
    originalsAbsentFromInventory: report.entries.filter(row => row.inventoryAbsent).length,
    originalsHttp404: report.entries.filter(row => row.originalHttpStatus === 404).length,
    verifiedLegacyFiles: report.entries.filter(row => row.status === 'verified').length,
    expectedPublicImages: manifest.length, verifiedPublicImages: report.portfolios.filter(row => row.status === 'verified').length,
  }
  report.status = report.errors.length || report.entries.some(row => row.status !== 'verified') || report.portfolios.some(row => row.status !== 'verified') ? 'failed' : 'passed_file_verification'
  return report
}

export async function productionAdapter(env, dependencies = {}) {
  const { createClient } = dependencies.supabase || await import('@supabase/supabase-js')
  const { list } = dependencies.blob || await import('@vercel/blob')
  const request = dependencies.fetch || fetch
  const { NEXT_PUBLIC_SUPABASE_URL: databaseUrl, SUPABASE_SERVICE_ROLE_KEY: key, BLOB_READ_WRITE_TOKEN: token } = env
  if (!databaseUrl || !key || !token) throw Error('MISSING_ENVIRONMENT')
  const base = new URL(databaseUrl)
  if (base.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/i.test(base.hostname) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('INVALID_DATABASE_ORIGIN')
  const db = createClient(base.origin, key, { auth: { persistSession: false, autoRefreshToken: false } })
  let owned = new Set(), knownOriginals = new Set(), origins = new Set()
  async function downloadBytes(response) {
    if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw Error('FILE_TOO_LARGE') }
    const reader = response.body.getReader(); const chunks = []; let length = 0
    try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > MAX_BYTES) { await reader.cancel(); throw Error('FILE_TOO_LARGE') } chunks.push(Buffer.from(value)) } } finally { reader.releaseLock() }
    return Buffer.concat(chunks)
  }
  const fetchOptions = () => ({ redirect: 'error', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) })
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
      const all = []; let lastId, expected
      while (true) {
        let query = db.from('archivos_privados').select('*', { count: 'exact' }).not('legacy_url', 'is', null).order('id').range(0, 99)
        if (lastId) query = query.gt('id', lastId)
        const { data, error, count } = await query
        if (error || !Array.isArray(data) || !Number.isInteger(count)) throw Error('METADATA_READ_FAILED')
        if (expected === undefined) expected = count
        if (count !== expected - all.length) throw Error('METADATA_CHANGED_DURING_SCAN')
        for (const row of data) if (lastId && row.id <= lastId) throw Error('METADATA_PAGINATION_FAILED'); else lastId = row.id
        all.push(...data)
        if (all.length === expected) { knownOriginals = new Set(all.map(row => row.legacy_url)); return all }
        if (!data.length || all.length > expected) throw Error('METADATA_PAGINATION_FAILED')
      }
    },
    async listOwnedBlobs() {
      const result = []; const seen = new Set(); let cursor
      do { const page = await list({ token, limit: 1000, ...(cursor ? { cursor } : {}) }); result.push(...page.blobs); if (!page.hasMore) break; if (!page.cursor || seen.has(page.cursor)) throw Error('BLOB_PAGINATION_FAILED'); seen.add(page.cursor); cursor = page.cursor } while (true)
      owned = new Set(result.map(blob => blob.url)); origins = new Set(result.filter(blob => publicBlobUrl(blob.url)).map(blob => new URL(blob.url).origin)); return result
    },
    async downloadPrivate(name) { const { data, error } = await db.storage.from('adjuntos-privados').download(name); if (error || !data) throw Error('PRIVATE_DOWNLOAD_FAILED'); if (data.size > MAX_BYTES) throw Error('FILE_TOO_LARGE'); return Buffer.from(await data.arrayBuffer()) },
    async probeOriginal(url) {
      if (!knownOriginals.has(url) || !publicBlobUrl(url) || !origins.has(new URL(url).origin)) throw Error('UNTRUSTED_ORIGINAL_PROBE')
      const response = await request(url, fetchOptions()); await response.body?.cancel(); return response.status
    },
    async readPortfolio(id) { const { data, error } = await db.from('portfolio').select('id,imagenes').eq('id', id).single(); if (error) throw Error('PORTFOLIO_READ_FAILED'); return data },
    async downloadPublic(blob) {
      if (!owned.has(blob.url) || !publicBlobUrl(blob.url)) throw Error('UNTRUSTED_PUBLIC_IMAGE')
      const response = await request(blob.url, fetchOptions())
      if (response.status !== 200) { await response.body?.cancel(); return { status: response.status, bytes: null, type: null } }
      return { status: response.status, bytes: await downloadBytes(response), type: (response.headers.get('content-type') || '').split(';')[0] }
    },
  }
}

export function parseOptions(args) {
  const options = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') options.help = true
    else if (args[i] === '--project-ref' && args[i + 1]) options.projectRef = args[++i]
    else if (args[i] === '--manifest' && args[i + 1]) options.manifestPath = args[++i]
    else if (args[i] === '--expected-legacy-count' && args[i + 1]) options.expectedLegacyCount = Number(args[++i])
    else if (args[i] === '--report' && args[i + 1]) options.reportPath = args[++i]
    else throw Error('UNKNOWN_ARGUMENT')
  }
  return options
}
async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) { console.log('Usage: node --env-file=ENV scripts/ops/verificar-adjuntos-migrados.mjs --project-ref REF --manifest FILE [--expected-legacy-count N] [--report FILE]\nRead-only: verifies private SHA256/size, original GET404 plus authenticated inventory absence, and public portfolio GET200/SHA256. Parent zero-reference SQL and user access tests are separate.'); return }
  if (!options.manifestPath) throw Error('PORTFOLIO_MANIFEST_REQUIRED')
  const fs = await import('node:fs/promises')
  const manifest = JSON.parse(await fs.readFile(options.manifestPath, 'utf8'))
  const report = await verifyMigratedAttachments(await productionAdapter(process.env), { ...options, manifest, siteUrl: process.env.NEXT_PUBLIC_SITE_URL })
  if (options.reportPath) { await fs.writeFile(options.reportPath, JSON.stringify(report, null, 2), { mode: 0o600 }); await fs.chmod(options.reportPath, 0o600) }
  console.log(JSON.stringify({ mode: report.mode, status: report.status, counts: report.counts, errors: report.errors }))
  if (report.status !== 'passed_file_verification') process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(safeError(error)); process.exitCode = 1 })
