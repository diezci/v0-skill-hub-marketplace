import assert from 'node:assert/strict'
import { copyPublicPortfolioImages, productionAdapter, sha256, postgresArrayLiteral } from './ops/copiar-imagenes-publicas-legacy.mjs'

const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.from('synthetic image')])
const original = 'https://fixture.public.blob.vercel-storage.com/old.png'
const publicId = '00000000-0000-4000-8000-000000000001'
const privateId = '00000000-0000-4000-8000-000000000002'
const manifest = [{ portfolioId: publicId, sourceHash: sha256(original) }]
const targetPath = `perfiles/public/legacy-${sha256(original)}.png`
const targetUrl = 'https://fixture.public.blob.vercel-storage.com/' + targetPath
function fixture() {
  const record = { id: privateId, legacy_url: original, propietario_id: null, compartido: true, storage_path: 'legacy/file.png', nombre: 'old.png', url: `https://diime.test/api/archivos/${privateId}?nombre=old.png`, tipo: 'image/png', bytes: png.length, sha256: sha256(png) }
  const state = { record, calls: [], images: ['before', original, 'after'], privateBytes: png, sourceBytes: png, publicBytes: png, originalPresent: true, targetPresent: false, concurrent: false, loseResponse: false }
  const io = {
    preflight: async ref => { assert.equal(ref, 'fixture') }, listLegacyMetadata: async () => [state.record],
    listOwnedBlobs: async () => [...(state.originalPresent ? [{ url: original, pathname: 'old.png', size: png.length }] : []), ...(state.targetPresent ? [{ url: targetUrl, pathname: targetPath, size: png.length }] : [])],
    downloadPrivate: async () => state.privateBytes,
    readPortfolio: async id => { assert.equal(id, publicId); return { id, imagenes: [...state.images] } },
    downloadOwnedBlob: async blob => ({ bytes: blob.url === original ? state.sourceBytes : state.publicBytes, type: 'image/png' }),
    putPublic: async (name, bytes) => { assert.equal(name, targetPath); assert.deepEqual(bytes, png); state.calls.push('put'); state.targetPresent = true; if (state.loseResponse) throw Error('response lost') },
    compareAndSwapImages: async (id, previous, next) => { state.calls.push('cas'); assert.equal(id, publicId); if (state.concurrent) { state.images.push('concurrent'); return null } assert.deepEqual(previous, state.images); state.images = next; return { id, imagenes: next } },
  }
  return { state, io, run: options => copyPublicPortfolioImages(io, { manifest, projectRef: 'fixture', siteUrl: 'https://diime.test', ...options }) }
}
let passed = 0
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name) }
await check('dry-run verifies source/private and makes zero mutations', async () => { const f = fixture(); assert.equal((await f.run()).entries[0].status, 'would_copy_or_reuse_and_repoint'); assert.deepEqual(f.state.calls, []) })
await check('copy then verified CAS preserves other images and never deletes', async () => { const f = fixture(); assert.equal((await f.run({ apply: true })).entries[0].status, 'public_copy_verified_and_repointed'); assert.deepEqual(f.state.calls, ['put','cas']); assert.deepEqual(f.state.images, ['before',targetUrl,'after']) })
await check('missing authenticated original prevents copy and edit', async () => { const f = fixture(); f.state.originalPresent = false; assert.equal((await f.run({ apply: true })).entries[0].error, 'SOURCE_NOT_IN_OWNED_INVENTORY'); assert.deepEqual(f.state.calls, []) })
await check('mismatched private copy prevents all writes', async () => { const f = fixture(); f.state.privateBytes = Buffer.from('wrong'); assert.equal((await f.run({ apply: true })).entries[0].error, 'CONTENT_MISMATCH'); assert.deepEqual(f.state.calls, []) })
await check('changed original cannot become a public copy', async () => { const f = fixture(); f.state.sourceBytes = Buffer.from('wrong'); assert.equal((await f.run({ apply: true })).entries[0].error, 'CONTENT_MISMATCH'); assert.deepEqual(f.state.calls, []) })
await check('existing corrupt destination prevents update and overwrite', async () => { const f = fixture(); f.state.targetPresent = true; f.state.publicBytes = Buffer.from('wrong'); assert.equal((await f.run({ apply: true })).entries[0].error, 'CONTENT_MISMATCH'); assert.deepEqual(f.state.calls, []) })
await check('concurrent portfolio change survives failed CAS', async () => { const f = fixture(); f.state.concurrent = true; assert.equal((await f.run({ apply: true })).entries[0].error, 'PORTFOLIO_CONCURRENT_EDIT'); assert.deepEqual(f.state.images, ['before',original,'after','concurrent']) })
await check('lost upload response resumes by inventory and checksum', async () => { const f = fixture(); f.state.loseResponse = true; assert.equal((await f.run({ apply: true })).entries[0].status, 'public_copy_verified_and_repointed') })
await check('preexisting verified copy is reused without overwrite', async () => { const f = fixture(); f.state.targetPresent = true; assert.equal((await f.run({ apply: true })).entries[0].status, 'public_copy_verified_and_repointed'); assert.deepEqual(f.state.calls, ['cas']) })
await check('repeat after original deletion validates private and new public bytes', async () => { const f = fixture(); await f.run({ apply: true }); f.state.calls = []; f.state.originalPresent = false; assert.equal((await f.run({ apply: true })).entries[0].status, 'already_repointed_verified'); assert.deepEqual(f.state.calls, []) })
await check('missing metadata hash and non-PNG bytes fail closed', async () => { const f = fixture(); f.state.record.sha256 = null; assert.equal((await f.run({ apply: true })).entries[0].error, 'VERIFIED_PRIVATE_METADATA_REQUIRED'); const g = fixture(); const bytes = Buffer.from('not an actual png file'); g.state.privateBytes = bytes; g.state.record.sha256 = sha256(bytes); g.state.record.bytes = bytes.length; assert.equal((await g.run({ apply: true })).entries[0].error, 'PNG_REQUIRED') })
await check('reviewed row must still contain original or verified deterministic target', async () => { const f = fixture(); f.state.images = ['user replacement']; assert.equal((await f.run({ apply: true })).entries[0].error, 'PORTFOLIO_REFERENCE_CHANGED'); assert.deepEqual(f.state.calls, []) })
await check('duplicate manifest rejected before access', async () => { const f = fixture(); await assert.rejects(f.run({ manifest: [...manifest, ...manifest] }), /DUPLICATE_MANIFEST_ENTRY/); assert.deepEqual(f.state.calls, []) })
await check('actual adapter CAS scopes only imagenes by id and escaped complete array', async () => {
  const calls = []; const previous = ['https://site.test/a,b', 'quote"', 'slash\\']; const next = ['new']
  const db = { from(table) { calls.push(['from',table]); return { update(values) { calls.push(['update',values]); return this }, eq(key,value) { calls.push(['eq',key,value]); return this }, select() { return this }, async maybeSingle() { return { data: { id: publicId, imagenes: next } } } } } }
  const io = await productionAdapter({ NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', BLOB_READ_WRITE_TOKEN: 'synthetic' }, { supabase: { createClient: () => db }, blob: {} })
  assert.deepEqual(await io.compareAndSwapImages(publicId,previous,next), { id: publicId, imagenes: next })
  assert.deepEqual(calls, [['from','portfolio'],['update',{ imagenes: next }],['eq','id',publicId],['eq','imagenes','{"https://site.test/a,b","quote\\\"","slash\\\\"}']])
  assert.equal(postgresArrayLiteral([]), '{}')
})
await check('actual adapter refuses unlisted URLs, redirects and uses non-overwriting public put', async () => {
  const calls = []
  const io = await productionAdapter({ NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', BLOB_READ_WRITE_TOKEN: 'synthetic' }, { supabase: { createClient: () => ({}) }, blob: { list: async () => ({ blobs: [{ url: original }], hasMore: false }), put: async (...args) => calls.push(args) }, fetch: async (url, options) => { assert.equal(url,original); assert.equal(options.redirect,'error'); return new Response(png,{ headers: { 'content-type':'image/png' } }) } })
  await assert.rejects(io.downloadOwnedBlob({ url: original }), /UNTRUSTED_SOURCE/)
  await io.listOwnedBlobs(); assert.deepEqual((await io.downloadOwnedBlob({ url: original })).bytes,png)
  await assert.rejects(io.downloadOwnedBlob({ url: 'http://127.0.0.1' }), /UNTRUSTED_SOURCE/)
  await io.putPublic(targetPath,png); assert.deepEqual(calls[0][2], { token: 'synthetic', access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'image/png' })
})
console.log(JSON.stringify({ passed, failed: 0, network: false, remoteMutations: false }))
