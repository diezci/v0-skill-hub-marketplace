import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

function harness(options = {}) {
  const calls = [], inserted = [], emails = []
  const request = { id: 'request', cliente_id: 'client', empresa_id: null, estado: 'abierta', titulo: 'Proyecto local', ubicacion: 'Madrid', presupuesto_min: 1000, presupuesto_max: 2000, categorias: { nombre: 'Fontanería' }, ...options.request }
  const companies = options.companies ?? [{ id: 'company', propietario_id: 'owner', estado_verificacion: 'verificada', servicios: ['Fontanería'], provincias: ['Madrid'], presupuesto_min_interes: 500, presupuesto_max_interes: 5000 }]
  const members = options.members ?? [
    { usuario_id: 'owner', empresa_id: 'company', estado: 'activo', permisos: { presupuestos: true } },
    { usuario_id: 'both', empresa_id: 'company', estado: 'activo', permisos: { presupuestos: true } },
    { usuario_id: 'reader', empresa_id: 'company', estado: 'activo', permisos: { presupuestos: false } },
    { usuario_id: 'revoked', empresa_id: 'company', estado: 'revocado', permisos: { presupuestos: true } },
    { usuario_id: 'deleted', empresa_id: 'company', estado: 'activo', permisos: { presupuestos: true } },
  ]
  const rows = {
    solicitudes: [request], empresas: companies, empresa_miembros: members,
    profesionales: options.professionals ?? [{ id: 'both', categorias_interes: ['Fontanería'], disponible: true, provincias_cobertura: ['Madrid'], presupuesto_min_interes: null, presupuesto_max_interes: null }],
    profiles: options.profiles ?? ['owner','both','reader','revoked','client'].map(id => ({ id, cuenta_eliminada: null })),
  }
  function query(table, admin = false) {
    calls.push([admin ? 'admin' : 'user', table])
    let result = rows[table] || []
    const q = {
      select() { return q },
      eq(key, value) { result = result.filter(row => row[key] === value); return q },
      is(key, value) { result = result.filter(row => row[key] === value); return q },
      in(key, values) { result = result.filter(row => values.includes(row[key])); return q },
      contains(key, values) { result = result.filter(row => values.every(value => row[key]?.includes(value))); return q },
      maybeSingle: async () => ({ data: result[0] || null, error: null }),
      insert: async (values) => { inserted.push(...values); return { error: null } },
      then(resolve, reject) { return Promise.resolve({ data: options.errorTable === table ? null : result, error: options.errorTable === table ? { message: 'private failure' } : null }).then(resolve, reject) },
    }
    return q
  }
  const client = { auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: options.userId || 'client' } } }) }, from: name => query(name) }
  const admin = { from: name => query(name, true) }
  const mocks = {
    'server-only': {}, '@/lib/supabase/server': { createClient: async () => client }, '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/i18n-servidor': { textoServidor: async s => s },
    '@/lib/utils': { formatearRangoPresupuesto: () => '1.000–2.000 €' },
    '@/lib/emails/enviar': { enviarAvisoPorEmail: async email => { emails.push(email) } },
  }
  const files = { '@/lib/empresas/avisos-demanda': 'lib/empresas/avisos-demanda.ts', '@/lib/filtros-notificaciones': 'lib/filtros-notificaciones.ts', '@/lib/notificaciones-contexto': 'lib/notificaciones-contexto.ts' }
  const cache = {}
  function load(file) {
    if (cache[file]) return cache[file]
    const module = { exports: {} }
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    new Function('require', 'module', 'exports', code)(name => { if (name in mocks) return mocks[name]; if (name in files) return load(files[name]); throw Error(`Unexpected import ${name}`) }, module, module.exports)
    return cache[file] = module.exports
  }
  const api = load('app/actions/invitaciones.ts')
  return { run: () => api.buscarYEnviarInvitaciones('request'), inserted, emails, calls }
}

test('company-only owner receives eligible demand; person/company match sends one notice and email', async () => {
  const h = harness(); const result = await h.run()
  assert.equal(result.success, true); assert.equal(result.count, 2)
  assert.deepEqual(h.inserted.map(row => row.usuario_id).sort(), ['both', 'owner'])
  assert.deepEqual(h.emails.map(row => row.usuarioId).sort(), ['both', 'owner'])
  assert.ok(h.inserted.every(row => row.tipo === 'demanda_nueva' && row.link.includes('solicitud=request')))
})

test('company category, province, budget and verification criteria are enforced', async () => {
  const company = { id: 'company', propietario_id: 'owner', estado_verificacion: 'verificada', servicios: ['Fontanería'], provincias: ['Madrid'], presupuesto_min_interes: 500, presupuesto_max_interes: 5000 }
  for (const change of [{ servicios: ['Pintura y decoración'] }, { provincias: ['Bizkaia'] }, { presupuesto_min_interes: 2500 }, { presupuesto_max_interes: 900 }, { estado_verificacion: 'borrador' }]) {
    const h = harness({ professionals: [], companies: [{ ...company, ...change }] }); await h.run(); assert.equal(h.inserted.length, 0)
  }
  const open = harness({ professionals: [], request: { presupuesto_min: null, presupuesto_max: null }, companies: [{ ...company, presupuesto_min_interes: 50000, presupuesto_max_interes: null }] })
  assert.equal((await open.run()).count, 2, 'A convenir remains eligible like personal profiles')
})

test('no personal profile is needed for authorized company operators', async () => {
  const h = harness({ professionals: [] }); assert.equal((await h.run()).count, 2)
})

test('deleted owner closes company notifications, while revoked/deleted/readonly members are never sent alerts', async () => {
  const h = harness({ professionals: [], profiles: [{ id: 'both', cuenta_eliminada: null }] })
  await h.run(); assert.equal(h.inserted.length, 0)
  const revoked = harness({ professionals: [], members: [{ usuario_id: 'owner', empresa_id: 'company', estado: 'revocado', permisos: { presupuestos: true } }] })
  await revoked.run(); assert.equal(revoked.inserted.length, 0)
})

test('a company does not receive its own demands or those personally published by an active member', async () => {
  for (const own of [harness({ request: { empresa_id: 'company' } }), harness({ professionals: [], members: [{ usuario_id: 'client', empresa_id: 'company', estado: 'activo', permisos: { presupuestos: false } }, { usuario_id: 'owner', empresa_id: 'company', estado: 'activo', permisos: { presupuestos: true } }] })]) {
    await own.run(); assert.equal(own.inserted.length, 0)
  }
})

test('unauthenticated, foreign author and closed demand never consult private preferences or send', async () => {
  for (const options of [{ noUser: true }, { userId: 'stranger' }, { request: { estado: 'cerrada' } }]) {
    const h = harness(options); assert.ok((await h.run()).error); assert.equal(h.inserted.length, 0); assert.ok(!h.calls.some(c => c[0] === 'admin'))
  }
})

test('a company preference or permission lookup failure fails closed without partial notifications', async () => {
  for (const errorTable of ['empresas', 'empresa_miembros', 'profiles']) {
    const h = harness({ errorTable }); const result = await h.run(); assert.ok(result.error); assert.doesNotMatch(result.error, /private/); assert.equal(h.inserted.length, 0); assert.equal(h.emails.length, 0)
  }
})
