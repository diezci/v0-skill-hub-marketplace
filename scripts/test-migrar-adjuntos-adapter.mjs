// Execute the production adapter with injected SDKs/fetch. No credentials,
// environment variables, network requests or production exports are needed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const raw = fs.readFileSync('scripts/migrar-adjuntos-privados.mjs', 'utf8')
assert.ok(raw.includes('\nasync function main()'))
const source = raw.slice(0, raw.indexOf('\nasync function main()'))
  .replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  .replace("await import('@supabase/supabase-js')", 'deps.supabase')
  .replace("await import('@vercel/blob')", 'deps.blob')
const load = new Function('deps', 'fetch', 'createHash', 'path', 'pathToFileURL', source + '\nreturn { productionAdapter, migrateAttachments };')
const original = 'https://ownstore.public.blob.vercel-storage.com/x.pdf'
const target = 'https://fixture.test/late-reference'
const tables = ['profiles', 'portfolio', 'empresas', 'solicitudes', 'ofertas', 'trabajos', 'actualizaciones_trabajo', 'mensajes', 'empresa_mensajes', 'archivos_privados', 'empresa_cuentas_stripe', 'empresa_chat_lecturas', 'reseñas']
function fixture({ maxRows = 200, changeCount = false } = {}) {
  const schema = {
    paths: Object.fromEntries(tables.map(table => ['/' + table, { get: {} }])),
    definitions: Object.fromEntries(tables.map(table => [table, { properties: { id: { description: '<pk/>' } } }])),
  }
  schema.paths['/rpc/migrar_referencia_archivo_privado'] = { post: {} }
  schema.definitions.archivos_privados.properties.legacy_url = {}
  schema.definitions.archivos_privados.properties.sha256 = {}
  schema.definitions.empresa_cuentas_stripe.properties = { empresa_id: { description: '<pk/>' } }
  schema.definitions.empresa_chat_lecturas.properties = { conversacion_id: { description: '<pk/>' }, usuario_id: { description: '<pk/>' } }
  const data = Object.fromEntries(tables.map(table => [table, []]))
  const state = { queries: [], requests: [], cursors: [], copies: new Map(), mutations: [], listed: [{ url: original, size: 3 }], source: Buffer.from('pdf') }
  const storage = {
    async upload(name, bytes) { state.mutations.push('upload'); state.copies.set(name, Buffer.from(bytes)); return { error: null } },
    async download(name) { return { data: state.copies.has(name) ? new Blob([state.copies.get(name)]) : null, error: null } },
  }
  const db = {
    storage: { getBucket: async () => ({ data: { id: 'adjuntos-privados', public: false } }), from: () => storage },
    from(table) {
      const orders = []
      return {
        select() { return this }, order(key) { orders.push(key); return this },
        async range(start, end) {
          state.queries.push({ table, start, end, orders: [...orders] })
          return { data: (data[table] || []).slice(start, Math.min(end + 1, start + maxRows)), count: (data[table] || []).length + (changeCount && start > 0 ? 1 : 0) }
        },
        insert() { state.mutations.push('insert'); throw Error('Unexpected metadata insert') },
      }
    },
    async rpc(name, { p_id }) {
      state.mutations.push('replace')
      assert.equal(name, 'migrar_referencia_archivo_privado')
      const record = data.archivos_privados.find(row => row.id === p_id)
      for (const row of data.solicitudes) row.archivos = row.archivos.map(url => url === record.legacy_url ? record.url : url)
      return { error: null }
    },
  }
  const deps = {
    supabase: { createClient: () => db },
    blob: {
      async list(options) {
        state.cursors.push(options.cursor)
        return options.cursor ? { blobs: [], hasMore: false } : { blobs: state.listed, hasMore: true, cursor: 'next-page' }
      },
      async del(url, options) { state.mutations.push('delete'); state.deletion = { url, options } },
    },
  }
  const fetch = async (url, options) => {
    state.requests.push({ url, redirect: options.redirect })
    if (url.endsWith('/rest/v1/')) return { ok: true, json: async () => schema }
    assert.equal(url, original)
    return new Response(state.source, { headers: { 'content-type': 'application/pdf' } })
  }
  const runtime = load(deps, fetch, createHash, path, pathToFileURL)
  return { state, data, schema, runtime, async adapter() {
    const io = await runtime.productionAdapter({ NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', BLOB_READ_WRITE_TOKEN: 'synthetic' })
    await io.preflight('fixture')
    return io
  } }
}
let passed = 0
async function check(name, fn) { await fn(); console.log('PASS ' + name); passed++ }

await check('Data API cap 200 still scans all 1001 profiles and preserves a late public image', async () => {
  const f = fixture()
  f.data.profiles = Array.from({ length: 1001 }, (_, index) => ({ id: String(index).padStart(4, '0'), foto_perfil: index === 1000 ? target : null }))
  const io = await f.adapter()
  assert.equal(await io.hasOtherReferences(target), true)
  assert.deepEqual(f.state.queries.filter(q => q.table === 'profiles').map(q => q.start), [0, 200, 400, 600, 800, 1000])
  assert.deepEqual(f.state.mutations, [])
})
await check('Simple and composite primary keys are used in actual database queries', async () => {
  const f = fixture(), io = await f.adapter()
  f.data.empresa_cuentas_stripe = [{ empresa_id: '1', content: target + '/company' }]
  f.data.empresa_chat_lecturas = [{ conversacion_id: '1', usuario_id: '2', content: target + '/chat' }]
  assert.equal(await io.hasOtherReferences(target + '/company'), true)
  assert.equal(await io.hasOtherReferences(target + '/chat'), true)
  assert.deepEqual(f.state.queries.find(q => q.table === 'empresa_cuentas_stripe').orders, ['empresa_id'])
  assert.deepEqual(f.state.queries.find(q => q.table === 'empresa_chat_lecturas').orders, ['conversacion_id', 'usuario_id'])
})
await check('Unicode review table is scanned and its public reference is retained', async () => {
  const f = fixture(), io = await f.adapter()
  f.data.reseñas = [{ id: '1', comentario: target }]
  assert.equal(await io.hasOtherReferences(target), true)
  assert.ok(f.state.queries.some(q => q.table === 'reseñas'))
})
await check('Changed row count aborts instead of accepting an incomplete scan', async () => {
  const f = fixture({ changeCount: true }), io = await f.adapter()
  f.data.profiles = Array.from({ length: 201 }, (_, id) => ({ id }))
  await assert.rejects(io.hasOtherReferences(target), /DATABASE_CHANGED_DURING_SCAN/)
  assert.deepEqual(f.state.mutations, [])
})
await check('Blob inventory follows cursors; only exact owned sources reach fetch, without redirects', async () => {
  const f = fixture(), io = await f.adapter()
  const blobs = await io.listOwnedBlobs()
  assert.deepEqual(f.state.cursors, [undefined, 'next-page'])
  await io.downloadOwnedBlob(blobs[0])
  for (const url of ['https://127.0.0.1/file', 'http://169.254.169.254/latest/meta-data', 'https://unowned.public.blob.vercel-storage.com/x.pdf', original + '?q=1', original + '#fragment']) {
    await assert.rejects(io.downloadOwnedBlob({ url }), /UNTRUSTED_SOURCE/)
  }
  assert.deepEqual(f.state.requests.filter(r => !r.url.endsWith('/rest/v1/')), [{ url: original, redirect: 'error' }])
})
await check('Dry-run through actual adapter performs only inventory and database reads', async () => {
  const f = fixture(), io = await f.adapter()
  f.data.solicitudes = [{ id: '1', archivos: [original] }]
  const result = await f.runtime.migrateAttachments(io, { projectRef: 'fixture', siteUrl: 'https://diime.example.test' })
  assert.equal(result.entries[0].status, 'would_copy')
  assert.deepEqual(f.state.mutations, [])
  assert.ok(f.state.requests.every(r => r.url.endsWith('/rest/v1/')))
})
for (const corrupt of [false, true]) await check(`Missing original resumes only from persisted verified hash (corrupt=${corrupt})`, async () => {
  const f = fixture(), io = await f.adapter()
  f.state.listed = []
  const id = '12345678-1234-1234-1234-123456789abc', bytes = Buffer.from('known private copy')
  const record = { id, propietario_id: null, legacy_url: original, url: `https://diime.example.test/api/archivos/${id}?nombre=x.pdf`, nombre: 'x.pdf', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), compartido: true, storage_path: 'legacy/x.pdf' }
  f.data.archivos_privados.push(record)
  f.data.solicitudes.push({ id: '1', archivos: [original] })
  f.state.copies.set(record.storage_path, corrupt ? Buffer.from('corrupt') : bytes)
  const result = await f.runtime.migrateAttachments(io, { apply: true, deletePublicOriginals: true, projectRef: 'fixture', siteUrl: 'https://diime.example.test' })
  if (corrupt) {
    assert.equal(result.entries[0].error, 'PRIVATE_COPY_MISMATCH')
    assert.deepEqual(f.state.mutations, [])
    assert.deepEqual(f.data.solicitudes[0].archivos, [original])
  } else {
    assert.equal(result.entries[0].status, 'references_migrated_source_not_listed')
    assert.deepEqual(f.state.mutations, ['replace'])
    assert.deepEqual(f.data.solicitudes[0].archivos, [record.url])
  }
  assert.ok(f.state.requests.every(r => r.url.endsWith('/rest/v1/')))
})
await check('Conditional deletion uses the strong ETag from the verified read and refuses absent/weak validators', async () => {
  const f = fixture(), io = await f.adapter()
  const blobs = await io.listOwnedBlobs()
  await assert.rejects(io.deleteOwnedBlob(blobs[0]), /SOURCE_STRONG_ETAG_REQUIRED/)
  await assert.rejects(io.deleteOwnedBlob(blobs[0], 'W/"weak"'), /SOURCE_STRONG_ETAG_REQUIRED/)
  await io.deleteOwnedBlob(blobs[0], '"version-verified"')
  assert.deepEqual(f.state.deletion, { url: original, options: { token: 'synthetic', ifMatch: '"version-verified"' } })
})
console.log(`${passed} production-adapter scenarios passed with injected SDKs/fetch; no network or real data.`)
