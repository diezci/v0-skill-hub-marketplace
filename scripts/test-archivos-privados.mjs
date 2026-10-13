// Rutas reales con transporte controlado. No usa datos ni servicios remotos.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'
const results = []
function load(file, deps) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => { if (!(name in deps)) throw Error(name); return deps[name] }, console: { error() {} }, File, Response, Uint8Array, URL, process: { env: { NEXT_PUBLIC_SITE_URL: 'https://diime.example.test' } } }, { filename: file })
  return module.exports
}
const files = load('lib/archivos.ts', {})
function fixture(options = {}) {
  const calls = { form: 0, public: [], upload: [], insert: [], remove: [], download: [], rpc: [] }
  const bucket = { upload: async (...args) => { calls.upload.push(args); return { error: options.uploadError } }, remove: async (...args) => { calls.remove.push(args); return {} }, download: async (...args) => { calls.download.push(args); return { error: options.downloadError, data: new Blob(['%PDF-private'], { type: 'application/pdf' }) } } }
  const admin = { storage: { from: name => { assert.equal(name, files.BUCKET_ADJUNTOS); return bucket } }, from: name => { assert.equal(name, 'archivos_privados'); return { insert: async data => { calls.insert.push(data); return { error: options.insertError } } } } }
  const client = { auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: 'user-fixture' } }, error: options.authError }) },
    from: name => { assert.equal(name, 'profiles'); const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: options.missingProfile ? null : { id: 'user-fixture', cuenta_eliminada: options.deleted ? '2026-01-01' : null }, error: options.profileError }) }; return q },
    rpc: async (...args) => { calls.rpc.push(args); return { error: options.rpcError, data: options.denied ? null : { storage_path: 'owner/id.pdf', nombre: options.name || 'documento privado.pdf', tipo: options.mime || 'application/pdf', bytes: 12 } } } }
  const deps = { 'next/server': { NextResponse: Response }, 'node:crypto': { randomUUID }, '@/lib/supabase/server': { createClient: async () => client }, '@/lib/supabase/admin': { createAdminClient: () => options.noAdmin ? null : admin }, '@/lib/archivos': files,
    '@vercel/blob': { put: async (...args) => { calls.public.push(args); return { url: 'https://public.example.test/profile.png' } } } }
  const post = load('app/api/upload/route.ts', deps).POST
  const get = load('app/api/archivos/[id]/route.ts', deps).GET
  return { calls, post: (file = new File(['%PDF-fixture'], 'documento.pdf'), purpose, length = '') => post({ url: 'https://local.example.test/api/upload', headers: new Headers({ 'content-length': length }), formData: async () => { calls.form++; const data = new FormData(); if (file !== null) data.set('file', file); if (purpose) data.set('purpose', purpose); return data } }), get: (id = randomUUID()) => get(new Request('https://diime.example.test'), { params: Promise.resolve({ id }) }) }
}
async function test(name, run) { try { await run(); results.push({ name, status: 'pass' }); console.log('PASS', name) } catch (e) { results.push({ name, status: 'fail', error: e.stack }); console.error('FAIL', name, e.stack) } }
for (const options of [{ anonymous: true }, { authError: Error('Auth outage') }]) await test('Sin sesión válida no lee cuerpo ni sube archivo: ' + Object.keys(options), async () => { const f = fixture(options); assert.equal((await f.post()).status, 401); assert.equal(f.calls.form, 0); assert.equal(f.calls.public.length + f.calls.upload.length, 0) })
for (const options of [{ deleted: true }, { missingProfile: true }, { profileError: Error('DB outage') }]) await test('Cuenta no disponible denegada: ' + Object.keys(options), async () => { const f = fixture(options); assert.equal((await f.post()).status, 403); assert.equal(f.calls.form, 0) })
await test('Documento privado por defecto; propietario, metadatos y URL protegida', async () => { const f = fixture(), r = await f.post(), body = await r.json(); assert.equal(r.status, 200); assert.match(body.url, /^https:\/\/diime.example.test\/api\/archivos\/[a-f\d-]+\?nombre=/); assert.equal(f.calls.public.length, 0); assert.equal(f.calls.upload.length, 1); assert.equal(f.calls.upload[0][2].upsert, false); assert.equal(f.calls.insert[0].propietario_id, 'user-fixture'); assert.equal(f.calls.insert[0].url, body.url); assert.equal(body.type, 'application/pdf') })
await test('Solo imagen pública explícita; MIME validado y prefijo del propietario', async () => { const f = fixture(); const r = await f.post(new File([Uint8Array.from([137,80,78,71,13,10,26,10])], 'foto.png', { type: 'text/html' }), 'imagen_publica'); assert.equal(r.status, 200); assert.equal(f.calls.upload.length, 0); assert.equal(f.calls.public[0][2].contentType, 'image/png'); assert.match(f.calls.public[0][0], /^perfiles\/user-fixture\//) })
for (const [name, file, purpose] of [
  ['PDF no se publica', new File(['%PDF-x'], 'x.pdf'), 'imagen_publica'], ['HTML no se sube', new File(['<script>'], 'x.html')],
  ['SVG no se sube', new File(['<svg>'], 'x.svg')], ['Formato simulado', new File(['MZpayload'], 'x.png')],
  ['Vacío', new File([], 'x.txt')], ['Más de 10MB', new File([new Uint8Array(files.MAX_ARCHIVO_BYTES + 1)], 'x.txt')],
  ['Falta archivo', null], ['Purpose desconocido', new File(['hola'], 'x.txt'), 'public'],
]) await test(name, async () => { const f = fixture(), r = await f.post(file, purpose); assert.equal(r.status, 400); assert.equal(f.calls.upload.length + f.calls.public.length, 0) })
await test('Cuerpo excesivo se rechaza antes de procesarlo', async () => { const f = fixture(); assert.equal((await f.post(undefined, undefined, String(files.MAX_ARCHIVO_BYTES + 1048577))).status, 413); assert.equal(f.calls.form, 0) })
await test('Fallo al registrar revierte el objeto recién subido', async () => { const f = fixture({ insertError: Error('DB') }); assert.equal((await f.post()).status, 500); assert.equal(f.calls.remove.length, 1); assert.equal(f.calls.remove[0][0][0], f.calls.upload[0][0]) })
await test('Fallo storage no crea referencia', async () => { const f = fixture({ uploadError: Error('Storage') }); assert.equal((await f.post()).status, 500); assert.equal(f.calls.insert.length, 0) })
for (const [options, expected] of [[{ anonymous: true }, 401], [{ denied: true }, 404], [{ rpcError: Error('DB') }, 503], [{ noAdmin: true }, 503]]) await test('Descarga denegada sin bytes: ' + Object.keys(options), async () => { const f = fixture(options); assert.equal((await f.get()).status, expected); assert.equal(f.calls.download.length, 0) })
await test('Identificador inválido no consulta ni descarga', async () => { const f = fixture(); assert.equal((await f.get('../secreto')).status, 404); assert.equal(f.calls.rpc.length + f.calls.download.length, 0) })
await test('Descarga autorizada sin caché ni enlace reutilizable; documento como adjunto', async () => { const f = fixture(), r = await f.get(); assert.equal(r.status, 200); assert.equal(await r.text(), '%PDF-private'); assert.match(r.headers.get('cache-control'), /private, no-store/); assert.equal(r.headers.get('vary'), 'Cookie'); assert.match(r.headers.get('content-disposition'), /^attachment;/); assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.match(r.headers.get('content-security-policy'), /sandbox/); assert.equal(f.calls.rpc[0][0], 'archivo_privado_metadata'); assert.equal(f.calls.download.length, 1) })
await test('Imagen autorizada puede mostrarse dentro del chat', async () => { const f = fixture({ mime: 'image/png' }); assert.match((await f.get()).headers.get('content-disposition'), /^inline;/) })
await test('Nombre descargado preserva acentos y codifica comillas/apóstrofos', async () => { const f = fixture({ name: `Plano O’Brian's (1).pdf` }); const r = await f.get(); assert.match(r.headers.get('content-disposition'), /O%E2%80%99Brian%27s%20%281%29/); })
fs.mkdirSync('.build/correcciones-prioritarias-20261012/upload', { recursive: true })
fs.writeFileSync('.build/correcciones-prioritarias-20261012/upload/routes.json', JSON.stringify({ checks: results }, null, 2))
if (results.some(r => r.status !== 'pass')) process.exitCode = 1
