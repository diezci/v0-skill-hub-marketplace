// Fake transport only: no environment credentials, network, emails, or money.
import assert from 'node:assert/strict'
import { migrateAttachments, paginationColumns, exposedEntities, uploadPrivateCopy, parseOptions } from './migrar-adjuntos-privados.mjs'

const sourceUrl = 'https://ownstore.public.blob.vercel-storage.com/Informe%20cliente.pdf'
const sourceBytes = Buffer.from('Private historical attachment fixture')
const options = { projectRef: 'localfixture', siteUrl: 'https://diime.example.test', apply: true }
function fixture() {
  const state = { references: new Map([[sourceUrl, 2]]), records: [], objects: new Map(), calls: [], source: sourceBytes, other: false, keepReference: false }
  const call = (name, value) => state.calls.push({ name, value })
  const io = {
    async preflight(ref) { call('preflight', ref); assert.equal(ref, 'localfixture') },
    async listOwnedBlobs() { call('list'); return [{ url: sourceUrl, size: sourceBytes.length }] },
    async privateReferences() { call('references'); return new Map(state.references) },
    async listLegacyMetadata() { call('metadataList'); return [...state.records] },
    async downloadOwnedBlob(blob) { call('sourceDownload', blob.url); assert.equal(blob.url, sourceUrl); return { bytes: state.source, type: 'application/pdf' } },
    async uploadPrivate(name, bytes) { call('upload', name); if (!state.objects.has(name)) state.objects.set(name, Buffer.from(bytes)) },
    async downloadPrivate(name) { call('privateDownload', name); return state.objects.get(name) },
    async insertMetadataOrReadExisting(record) { call('insert', record.id); const existing = state.records.find(row => row.legacy_url === record.legacy_url); if (existing) return existing; state.records.push(record); return record },
    async replaceReferences(id) { call('replace', id); if (!state.keepReference) state.references.delete(state.records.find(row => row.id === id).legacy_url) },
    async hasOtherReferences(url) { call('otherReferences', url); return state.other },
    async deleteOwnedBlob(blob) { call('delete', blob.url) },
  }
  return { io, state }
}
const count = (state, name) => state.calls.filter(call => call.name === name).length
const status = report => report.entries[0]?.status
let passed = 0
async function check(name, fn) { await fn(); console.log(`PASS ${name}`); passed++ }

await check('Default dry-run inventories owned URLs with zero downloads or mutations', async () => {
  const { io, state } = fixture()
  const report = await migrateAttachments(io, { ...options, apply: false })
  assert.equal(status(report), 'would_copy')
  for (const action of ['sourceDownload', 'upload', 'insert', 'replace', 'delete']) assert.equal(count(state, action), 0)
  assert.equal(JSON.stringify(report).includes(sourceUrl), false)
  assert.equal(state.references.get(sourceUrl), 2)
})
await check('Copy is verified before metadata/reference updates and original is retained by default', async () => {
  const { io, state } = fixture()
  const report = await migrateAttachments(io, options)
  assert.equal(status(report), 'references_migrated_original_retained')
  const record = state.records[0]
  assert.equal(record.propietario_id, null); assert.equal(record.compartido, true)
  assert.equal(record.legacy_url, sourceUrl); assert.equal(record.bytes, sourceBytes.length)
  assert.equal(new URL(record.url).searchParams.get('nombre'), 'Informe cliente.pdf')
  assert.equal(record.nombre, 'Informe cliente.pdf')
  assert.equal(state.references.size, 0); assert.equal(count(state, 'delete'), 0)
  const names = state.calls.map(call => call.name)
  assert.ok(names.indexOf('privateDownload') < names.indexOf('insert'))
  assert.ok(names.lastIndexOf('privateDownload') < names.indexOf('replace'))
})
await check('Deletion requires two explicit flags before even preflight', async () => {
  const { io, state } = fixture()
  await assert.rejects(migrateAttachments(io, { ...options, apply: false, deletePublicOriginals: true }), /DELETE_REQUIRES_APPLY/)
  assert.throws(() => parseOptions(['--delete-public-originals']), /DELETE_REQUIRES_APPLY/)
  assert.deepEqual(parseOptions([]), { apply: false, deletePublicOriginals: false })
  assert.equal(state.calls.length, 0)
})
await check('Explicit deletion verifies both objects afresh and checks all references', async () => {
  const { io, state } = fixture()
  const report = await migrateAttachments(io, { ...options, deletePublicOriginals: true })
  assert.equal(status(report), 'migrated_original_deleted')
  assert.equal(count(state, 'sourceDownload'), 2); assert.equal(count(state, 'delete'), 1)
  const names = state.calls.map(call => call.name)
  assert.deepEqual(names.slice(-3), ['references', 'otherReferences', 'delete'])
})
await check('URLs also used as public images or any other field keep their original', async () => {
  for (const publicField of ['profiles.foto_perfil', 'profiles.foto_portada', 'portfolio.imagenes', 'empresas.logo_url', 'unknown_table.content']) {
    const { io, state } = fixture(); state.other = publicField
    assert.equal(status(await migrateAttachments(io, { ...options, deletePublicOriginals: true })), 'retained_public_or_other_reference')
    assert.equal(count(state, 'delete'), 0)
  }
})
await check('Any remaining private reference blocks original deletion', async () => {
  const { io, state } = fixture(); state.keepReference = true
  assert.equal(status(await migrateAttachments(io, { ...options, deletePublicOriginals: true })), 'retained_private_references_remain')
  assert.equal(count(state, 'delete'), 0)
})
await check('Unlisted URLs, internal addresses and forged Blob hosts never reach download', async () => {
  const { io, state } = fixture()
  state.references = new Map([
    ['http://169.254.169.254/latest/meta-data', 1], ['https://127.0.0.1/secrets', 1],
    ['https://unowned.public.blob.vercel-storage.com/file.pdf', 1],
    ['https://ownstore.public.blob.vercel-storage.com.evil.test/file.pdf', 1],
    [`${sourceUrl}?redirect=http://localhost`, 1],
  ])
  const report = await migrateAttachments(io, { ...options, deletePublicOriginals: true })
  assert.ok(report.entries.every(row => row.status === 'skipped_not_owned_or_missing'))
  assert.equal(count(state, 'sourceDownload'), 0); assert.equal(count(state, 'upload'), 0)
})
await check('Corrupt private copy prevents reference updates and deletion', async () => {
  const { io, state } = fixture(); io.downloadPrivate = async () => Buffer.from('corrupt')
  const report = await migrateAttachments(io, { ...options, deletePublicOriginals: true })
  assert.equal(status(report), 'error_original_retained'); assert.equal(report.entries[0].error, 'PRIVATE_COPY_MISMATCH')
  for (const action of ['insert', 'replace', 'delete']) assert.equal(count(state, action), 0)
})
await check('Interrupted reference replacement resumes with the same metadata and copy', async () => {
  const { io, state } = fixture(); const replace = io.replaceReferences
  io.replaceReferences = async () => { throw Error('Simulated SDK failure contains a secret or URL') }
  const failed = await migrateAttachments(io, options)
  assert.equal(status(failed), 'error_original_retained'); assert.equal(failed.entries[0].error, 'MIGRATION_STEP_FAILED')
  assert.equal(JSON.stringify(failed).includes('secret'), false)
  io.replaceReferences = replace
  assert.equal(status(await migrateAttachments(io, options)), 'references_migrated_original_retained')
  assert.equal(count(state, 'upload'), 1); assert.equal(state.records.length, 1)
})
await check('Interrupted metadata save reuses deterministic storage path without overwrite', async () => {
  const { io, state } = fixture(); const insert = io.insertMetadataOrReadExisting
  io.insertMetadataOrReadExisting = async () => { throw Error('METADATA_INSERT_FAILED') }
  assert.equal(status(await migrateAttachments(io, options)), 'error_original_retained')
  io.insertMetadataOrReadExisting = insert
  assert.equal(status(await migrateAttachments(io, options)), 'references_migrated_original_retained')
  assert.equal(state.objects.size, 1); assert.equal(state.records.length, 1)
})
await check('Later deletion run finds metadata even after private references were all replaced', async () => {
  const { io, state } = fixture()
  await migrateAttachments(io, options)
  assert.equal(state.references.size, 0)
  assert.equal(status(await migrateAttachments(io, { ...options, deletePublicOriginals: true })), 'migrated_original_deleted')
  assert.equal(count(state, 'upload'), 1); assert.equal(count(state, 'delete'), 1)
})
await check('Source mutation during migration prevents destructive cleanup', async () => {
  const { io, state } = fixture(); const read = io.downloadOwnedBlob
  io.downloadOwnedBlob = async blob => { const result = await read(blob); if (count(state, 'sourceDownload') > 1) return { ...result, bytes: Buffer.alloc(sourceBytes.length, 42) }; return result }
  assert.equal(status(await migrateAttachments(io, { ...options, deletePublicOriginals: true })), 'error_original_retained')
  assert.equal(count(state, 'delete'), 0)
})
await check('Wrong project, public bucket or missing migration preflight fails before any write', async () => {
  for (const reason of ['PROJECT_MISMATCH', 'PRIVATE_BUCKET_REQUIRED', 'PRIVATE_MIGRATION_REQUIRED']) {
    const { io, state } = fixture(); io.preflight = async () => { throw Error(reason) }
    await assert.rejects(migrateAttachments(io, options), new RegExp(reason))
    assert.equal(state.calls.length, 0)
  }
})
await check('Existing inconsistent metadata fails closed and does not replace references', async () => {
  const { io, state } = fixture(); await migrateAttachments(io, options)
  state.records[0].url = 'https://other.example.test/api/archivos/bad'; state.calls.length = 0
  const report = await migrateAttachments(io, { ...options, deletePublicOriginals: true })
  assert.equal(report.entries[0].error, 'LEGACY_METADATA_MISMATCH')
  assert.equal(count(state, 'replace'), 0); assert.equal(count(state, 'delete'), 0)
})
await check('Introspection chooses simple and composite primary keys without assuming id', async () => {
  assert.deepEqual(paginationColumns({ properties: { empresa_id: { description: 'Note: This is a Primary Key.<pk/>' }, other: {} } }), ['empresa_id'])
  assert.deepEqual(paginationColumns({ properties: { conversacion_id: { description: '<pk/>' }, usuario_id: { description: '<pk/>' }, leido_hasta: {} } }), ['conversacion_id', 'usuario_id'])
  assert.deepEqual(paginationColumns({ properties: { id: {}, url: {} } }), ['id'])
  assert.throws(() => paginationColumns({ properties: { unknowable: {} } }), /DATABASE_STABLE_KEY_REQUIRED/)
})
await check('Introspection includes Unicode table names and encoded names without ignoring references', async () => {
  assert.deepEqual(exposedEntities({ paths: { '/reseñas': { get: {} }, '/rese%C3%B1as': { get: {} }, '/profiles': { get: {} }, '/rpc/function': { get: {} }, '/': { get: {} } }, definitions: { 'reseñas': {}, profiles: {} } }), ['reseñas', 'profiles'])
  assert.throws(() => exposedEntities({ paths: { '/unknown': { get: {} } }, definitions: {} }), /INCOMPLETE_DATABASE_INTROSPECTION/)
})
await check('Storage 400 Duplicate and lost upload response resume only after exact content verification', async () => {
  for (const error of [{ statusCode: '400', error: 'Duplicate', message: 'The resource already exists' }, { statusCode: '503', message: 'Response lost' }]) {
    const calls = []
    const storage = {
      async upload(name, bytes, options) { calls.push('upload'); assert.equal(options.upsert, false); return { error } },
      async download(name) { calls.push('download'); return { data: new Blob([sourceBytes]), error: null } },
    }
    await uploadPrivateCopy(storage, 'legacy/fixed-id.pdf', sourceBytes, 'application/pdf')
    assert.deepEqual(calls, ['upload', 'download'])
    storage.download = async () => ({ data: new Blob(['different']), error: null })
    await assert.rejects(uploadPrivateCopy(storage, 'legacy/fixed-id.pdf', sourceBytes, 'application/pdf'), /PRIVATE_COPY_MISMATCH/)
    storage.download = async () => ({ data: null, error: { statusCode: '403' } })
    await assert.rejects(uploadPrivateCopy(storage, 'legacy/fixed-id.pdf', sourceBytes, 'application/pdf'), /PRIVATE_UPLOAD_FAILED/)
  }
})
await check('Stored source hash allows resuming missing original without claiming its deletion', async () => {
  const { io, state } = fixture(); await migrateAttachments(io, options)
  io.listOwnedBlobs = async () => []
  state.calls.length = 0
  assert.equal(status(await migrateAttachments(io, options)), 'already_migrated_source_not_listed')
  state.references.set(sourceUrl, 1)
  assert.equal(status(await migrateAttachments(io, options)), 'references_migrated_source_not_listed')
  assert.equal(state.references.size, 0)
  for (const action of ['sourceDownload', 'upload', 'insert', 'delete']) assert.equal(count(state, action), 0)
  state.records[0].sha256 = null
  assert.equal((await migrateAttachments(io, options)).entries[0].error, 'LEGACY_METADATA_HASH_REQUIRED')
  state.records[0].sha256 = '0'.repeat(64)
  assert.equal((await migrateAttachments(io, options)).entries[0].error, 'PRIVATE_COPY_MISMATCH')
})
console.log(`${passed} historical attachment transport scenarios passed; no network or real data.`)
