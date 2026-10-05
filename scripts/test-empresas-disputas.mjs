// Exercises the actual server actions and JWT guard with isolated database fixtures.
// No network requests, notifications or money movements leave this process.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, dependencies) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, { exports, console, require(name) {
    if (name === 'server-only') return {}
    if (name in dependencies) return dependencies[name]
    throw Error(`Missing fixture: ${name}`)
  } }, { filename: file })
  return exports
}

function setup(options = {}) {
  const events = [], notifications = [], invalidations = [], writes = []
  const user = options.unauthenticated ? null : { id: options.actor || 'replacement-customer' }
  const side = options.side || 'cliente'
  const job = {
    titulo: 'Encargo de empresa', estado: 'entregado',
    cliente_id: 'original-customer', profesional_id: 'original-provider',
    empresa_cliente_id: 'customer-company', empresa_proveedora_id: 'provider-company',
    operador_cliente_id: 'replacement-customer', operador_proveedor_id: 'replacement-provider',
    ...options.job,
  }
  const dispute = options.missing ? null : {
    id: 'dispute', trabajo_id: 'job', cliente_id: job.cliente_id, profesional_id: job.profesional_id,
    tipo: options.disputeSide || side, parte_actor: side, escrow_id: 'escrow', ...options.dispute,
  }
  const members = options.members || [
    { empresa_id: 'customer-company', usuario_id: 'replacement-customer', estado: 'activo', rol: 'miembro', permisos: { encargos: true } },
    { empresa_id: 'provider-company', usuario_id: 'replacement-provider', estado: 'activo', rol: 'miembro', permisos: { encargos: true } },
  ]
  const supabase = {
    auth: { getUser: async () => { events.push({ type: 'jwt' }); return { data: { user } } } },
    rpc: async (name, args) => {
      events.push({ type: 'guard', name, args })
      assert.equal(name, 'empresa_puede_operar_trabajo')
      assert.equal(args.p_permiso, 'encargos')
      return { data: !options.denied && (!args.p_parte || args.p_parte === side), error: options.guardError || null }
    },
  }
  function query(table) {
    let columns = '', filters = [], ids = []
    async function result() {
      events.push({ type: 'read', table, columns })
      const rows = table === 'disputas' ? dispute && [dispute]
        : table === 'trabajos' ? options.missingJob ? null : [job]
          : table === 'empresa_miembros' ? members.filter(m => filters.every(([key, value]) => m[key] === value))
            : table === 'empresas' ? [{ propietario_id: 'company-owner' }]
              : table === 'profiles' ? ids.length ? ids.filter(id => !options.deletedProfiles?.includes(id)).map(id => ({ id })) : [{ id: 'platform-admin' }] : null
      return { data: rows?.map(row => Object.fromEntries(columns.split(',').map(key => key.trim()).map(key => [key, row[key]]))) ?? null,
        error: table === 'empresa_miembros' && options.membersError ? { message: 'Unavailable' } : null }
    }
    const chain = {
      select(value) { columns = value; return chain },
      eq(key, value) { filters.push([key, value]); return chain },
      in(key, values) { assert.equal(key, 'id'); ids = values; return chain },
      is(key, value) { assert.equal(key, 'cuenta_eliminada'); assert.equal(value, null); return chain },
      async maybeSingle() { const r = await result(); return { ...r, data: r.data?.[0] ?? null } },
      async insert(data) { writes.push({ table, data }); return { error: null } },
      then(resolve, reject) { return result().then(resolve, reject) },
    }
    return chain
  }
  const admin = {
    from: query,
    async rpc(name, args) {
      events.push({ type: 'mutation', name, args })
      return { data: name === 'diime_retirar_disputa' ? options.withdrawResult || 'ok' : dispute, error: null }
    },
  }
  const identity = load('lib/empresas/identidad.ts', {})
  const recipients = load('lib/empresas/notificaciones.ts', {})
  const actions = load('app/actions/disputes.ts', {
    '@/lib/notificaciones-contexto': { construirLinkNotificacion: data => `${data.seccion}?trabajo=${data.trabajoId}` },
    '@/lib/i18n-servidor': { textoServidor: async text => text },
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/supabase/admin': { createAdminClient: () => { events.push({ type: 'admin' }); return admin } },
    '@/lib/empresas/identidad': identity,
    '@/lib/empresas/notificaciones': recipients,
    'next/cache': { revalidatePath: path => invalidations.push(path) },
    '@/lib/flujo-pagos': { cerrarCheckoutsPendientes: async () => events.push({ type: 'checkout' }) },
    '@/lib/notificaciones': { crearNotificacion: async data => notifications.push(data) },
  })
  return { actions, events, notifications, invalidations, writes, recipients, admin }
}
let passed = 0
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`) }

for (const [action, args] of [
  ['crearDisputa', [{ trabajo_id: 'job', motivo: 'Incidencia' }]],
  ['rechazarEntrega', ['job', 'No se ha completado']],
  ['retirarDisputa', ['dispute']],
]) {
  await check(`${action} denies an unauthenticated caller before privileged access`, async () => {
    const f = setup({ unauthenticated: true })
    assert.equal((await f.actions[action](...args)).codigo, 'NO_AUTENTICADO')
    assert.ok(f.events.every(e => e.type === 'jwt')); assert.equal(f.notifications.length, 0)
  })
}
await check('A revoked original actor cannot open a dispute or read the contract', async () => {
  const f = setup({ actor: 'original-customer', denied: true })
  assert.ok((await f.actions.crearDisputa({ trabajo_id: 'job', motivo: 'Incidencia' })).error)
  assert.ok(!f.events.some(e => ['admin', 'read', 'mutation'].includes(e.type)))
})
await check('A provider cannot reject a customer delivery even with work access', async () => {
  const f = setup({ side: 'proveedor', actor: 'replacement-provider' })
  assert.ok((await f.actions.rechazarEntrega('job', 'Incidencia')).error)
  assert.equal(f.events.find(e => e.type === 'guard').args.p_parte, 'cliente')
  assert.ok(!f.events.some(e => e.type === 'admin'))
})
await check('A reassigned customer rejects delivery with their real actor ID and notifies the current provider', async () => {
  const f = setup()
  assert.ok((await f.actions.rechazarEntrega('job', 'Falta una pieza')).data)
  assert.equal(f.notifications[0].usuarioId, 'replacement-provider')
  assert.match(f.notifications[0].link, /^\/mi-empresa/)
  assert.equal(f.writes.find(w => w.table === 'actualizaciones_trabajo').data.usuario_id, 'replacement-customer')
  assert.ok(f.invalidations.includes('/mi-empresa'))
})
await check('A reassigned provider opens a dispute against the current customer, never the historical author', async () => {
  const f = setup({ side: 'proveedor', actor: 'replacement-provider' })
  assert.ok((await f.actions.crearDisputa({ trabajo_id: 'job', motivo: 'Incidencia' })).data)
  assert.equal(f.notifications[0].usuarioId, 'replacement-customer')
})
await check('Withdrawal reads only the work ID before the JWT permission guard and hides existence from outsiders', async () => {
  const denied = setup({ denied: true }), absent = setup({ missing: true })
  assert.equal((await denied.actions.retirarDisputa('dispute')).error, (await absent.actions.retirarDisputa('dispute')).error)
  const reads = denied.events.filter(e => e.type === 'read')
  assert.equal(reads.length, 1); assert.equal(reads[0].columns, 'trabajo_id')
  assert.ok(!denied.events.some(e => e.type === 'mutation')); assert.equal(denied.notifications.length, 0)
})
await check('The counterparty cannot withdraw a dispute opened by the other contractual side', async () => {
  const f = setup({ side: 'proveedor', disputeSide: 'cliente', actor: 'replacement-provider' })
  assert.ok((await f.actions.retirarDisputa('dispute')).error)
  assert.equal(f.events.filter(e => e.type === 'guard').at(-1).args.p_parte, 'cliente')
  assert.ok(!f.events.some(e => e.type === 'mutation'))
  assert.equal(f.notifications.length, 0)
})
for (const side of ['cliente', 'proveedor']) {
  await check(`A reassigned ${side} can withdraw for their side and notifies the opposite current operator`, async () => {
    const f = setup({ side, actor: side === 'cliente' ? 'replacement-customer' : 'replacement-provider' })
    assert.equal((await f.actions.retirarDisputa('dispute')).success, true)
    assert.equal(f.notifications[0].usuarioId, side === 'cliente' ? 'replacement-provider' : 'replacement-customer')
    assert.match(f.notifications[0].link, /^\/mi-empresa/)
    const mutationIndex = f.events.findIndex(e => e.type === 'mutation')
    assert.ok(!f.events.slice(mutationIndex + 1).some(e => e.type === 'guard'))
    assert.ok(f.events.findIndex(e => e.type === 'guard') < f.events.findIndex(e => e.type === 'read' && e.columns.includes('cliente_id')))
    assert.ok(f.invalidations.includes('/mi-empresa'))
  })
}
await check('Database rejection after concurrent revocation sends no notification', async () => {
  const f = setup({ withdrawResult: 'no_autorizado' })
  assert.ok((await f.actions.retirarDisputa('dispute')).error)
  assert.equal(f.notifications.length, 0); assert.equal(f.invalidations.length, 0)
})
await check('A revoked recipient is replaced by active administrators of that company only', async () => {
  const f = setup({ members: [
    { empresa_id: 'provider-company', usuario_id: 'replacement-provider', estado: 'revocado', rol: 'miembro', permisos: { encargos: true } },
    { empresa_id: 'provider-company', usuario_id: 'active-admin', estado: 'activo', rol: 'administrador', permisos: {} },
    { empresa_id: 'provider-company', usuario_id: 'revoked-admin', estado: 'revocado', rol: 'administrador', permisos: {} },
    { empresa_id: 'unrelated-company', usuario_id: 'unrelated-admin', estado: 'activo', rol: 'principal', permisos: {} },
  ] })
  await f.actions.retirarDisputa('dispute')
  assert.deepEqual(f.notifications.map(n => n.usuarioId), ['active-admin'])
})
await check('Removing work permission also prevents notification to the former operator', async () => {
  const f = setup({ members: [
    { empresa_id: 'provider-company', usuario_id: 'replacement-provider', estado: 'activo', rol: 'miembro', permisos: { encargos: false } },
    { empresa_id: 'provider-company', usuario_id: 'principal', estado: 'activo', rol: 'principal', permisos: {} },
  ] })
  await f.actions.crearDisputa({ trabajo_id: 'job', motivo: 'Incidencia' })
  assert.deepEqual(f.notifications.map(n => n.usuarioId), ['principal'])
})
await check('A failed membership lookup never falls back to a historical recipient', async () => {
  const f = setup({ membersError: true })
  assert.equal((await f.actions.retirarDisputa('dispute')).success, true)
  assert.equal(f.notifications.length, 0)
})
await check('Financial notices require the explicit financial permission even for administrators', async () => {
  const f = setup({ members: [
    { empresa_id: 'provider-company', usuario_id: 'replacement-provider', estado: 'activo', rol: 'administrador', permisos: { encargos: true, ver_cobros: false } },
    { empresa_id: 'provider-company', usuario_id: 'financial-admin', estado: 'activo', rol: 'administrador', permisos: { ver_cobros: true } },
    { empresa_id: 'provider-company', usuario_id: 'other-admin', estado: 'activo', rol: 'administrador', permisos: { ver_cobros: false } },
  ] })
  const recipients = await f.recipients.destinatariosOperacionEmpresa(f.admin, 'provider-company', 'replacement-provider', 'ver_cobros')
  assert.deepEqual(Array.from(recipients), ['financial-admin'])
})
for (const deletedProfiles of [['replacement-provider'], ['company-owner']]) {
  await check(`Deleted account ${deletedProfiles[0]} prevents delivery of company information`, async () => {
    const f = setup({ deletedProfiles })
    await f.actions.crearDisputa({ trabajo_id: 'job', motivo: 'Incidencia' })
    assert.equal(f.notifications.length, 0)
  })
}
await check('Personal contracts retain their personal notification destination', async () => {
  const f = setup({ job: { empresa_proveedora_id: null, operador_proveedor_id: null } })
  await f.actions.crearDisputa({ trabajo_id: 'job', motivo: 'Incidencia' })
  assert.equal(f.notifications[0].usuarioId, 'original-provider')
  assert.match(f.notifications[0].link, /^\/mis-trabajos/)
  assert.ok(!f.events.some(e => e.type === 'read' && e.table === 'empresa_miembros'))
})
console.log(`${passed} company dispute scenarios passed without network or money movements.`)
