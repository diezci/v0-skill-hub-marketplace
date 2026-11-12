import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function compile(file, dependencies = {}) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: module.exports, module, console, Date, URL, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
    return dependencies[name]
  } })
  return module.exports
}
const domain = compile('lib/hitos.ts')
const entregas = compile('lib/entregas.ts')
const ids = {
  trabajo: '10000000-0000-4000-8000-000000000001', hito: '10000000-0000-4000-8000-000000000002',
  escrow: '10000000-0000-4000-8000-000000000003', cliente: '10000000-0000-4000-8000-000000000004',
  pro: '10000000-0000-4000-8000-000000000005',
}
function fixture(options = {}) {
  const calls = [], created = [], closed = [], conciliated = [], liquidated = [], queries = []
  let checks = 0
  const trabajo = { id: ids.trabajo, titulo: 'Contrato completo', precio_acordado: 12000, modalidad_pago: 'hitos', cliente_id: ids.cliente, profesional_id: ids.pro }
  const escrow = { id: ids.escrow, trabajo_id: ids.trabajo, hito_id: ids.hito, monto: 2640, monto_base: 2400, comision_cliente: 240, comision_proveedor: 240, pago_neto_proveedor: 2160, cliente_id: ids.cliente, profesional_id: ids.pro, actor_pago_id: ids.cliente, stripe_transfer_group: `diime_${ids.trabajo}_${ids.hito}`, ...options.escrow }
  let savedSession = options.session
  const sessionFor = params => ({ id: 'cs_hito', status: 'open', payment_status: 'unpaid', currency: 'eur', amount_total: 264000, client_secret: 'cs_hito_secret', metadata: params.metadata, ...options.sessionOverride })
  const supabase = {
    auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: ids.cliente } } }) },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: { version: 2 } } },
  }
  const admin = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      if (options.reserveError && name === 'preparar_pago_hito') return { error: { message: options.reserveError } }
      return { data: escrow }
    },
    from(table) {
      const query = { table, filters: [], values: null }; queries.push(query)
      const builder = {
        select() { return this }, eq(key, value) { query.filters.push([key, value]); return this }, or(value) { query.or = value; return this },
        update(values) { query.values = values; return this },
        async single() { return { data: trabajo } },
        async maybeSingle() { return { data: options.saveFails && query.values ? null : query.values ? { id: escrow.id, stripe_session_id: query.values.stripe_session_id } : escrow } },
      }
      return builder
    },
  }
  const actions = compile('app/actions/hitos.ts', {
    'next/cache': { revalidatePath() {} }, '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/stripe': { stripe: { checkout: { sessions: {
      create: async (params, opts) => { created.push({ params, opts }); savedSession = sessionFor(params); return savedSession },
      retrieve: async () => savedSession,
      expire: async id => { closed.push(id); return { status: 'expired' } },
    } } } },
    '@/lib/empresas/cobros': {
      puedePagarTrabajo: async () => { checks++; return !(options.deny || options.revoke && checks > 1) },
      obtenerDestinoCobroTrabajo: async () => ({ destino: 'acct_pro', titularId: ids.pro }),
    },
    '@/lib/empresas/identidad': { validarActorTrabajoEmpresa: async () => options.deny ? 'Sin permiso' : null },
    '@/lib/flujo-pagos': { conciliarSesionPagada: async (...args) => conciliated.push(args), liquidarPagoReclamado: async (...args) => liquidated.push(args) },
    '@/lib/entregas': entregas, '@/lib/moderacion': { errorContenidoProhibido: () => null }, '@/lib/hitos': domain,
    '@/lib/hitos-avisos': { notificarCambioHitos: async () => {} },
  })
  return { actions, calls, created, closed, conciliated, liquidated, queries }
}

test('charges only the selected stage and returns only the customer financial breakdown', async () => {
  const f = fixture()
  const result = await f.actions.pagarHito(ids.trabajo, ids.hito)
  assert.equal(result.error, undefined)
  assert.equal(result.desglose.totalCliente, 2640)
  assert.equal(result.desglose.comisionProveedor, undefined)
  assert.equal(result.escrow.pago_neto_proveedor, undefined)
  assert.equal(f.created[0].params.line_items[0].price_data.unit_amount, 264000)
  assert.equal(f.created[0].params.metadata.hito_id, ids.hito)
  assert.equal(f.created[0].params.payment_intent_data.metadata.contrato_id, ids.trabajo)
  assert.equal(f.created[0].params.payment_intent_data.transfer_group, `diime_${ids.trabajo}_${ids.hito}`)
  assert.equal(f.calls.find(x => x.name === 'preparar_pago_hito').args.p_actor, ids.cliente)
})

test('concurrent recovery uses the same idempotency key and byte-identical Stripe parameters', async () => {
  const f = fixture()
  await Promise.all([f.actions.pagarHito(ids.trabajo, ids.hito), f.actions.pagarHito(ids.trabajo, ids.hito)])
  assert.equal(f.created.length, 2)
  assert.equal(f.created[0].opts.idempotencyKey, `diime-hito-checkout-${ids.escrow}`)
  assert.equal(JSON.stringify(f.created[0]), JSON.stringify(f.created[1]))
})

test('no charge or client secret for anonymous, unauthorized, invalid or stale plan', async () => {
  for (const options of [{ anonymous: true }, { deny: true }, { reserveError: 'El plan ha cambiado' }]) {
    const f = fixture(options)
    const result = await f.actions.pagarHito(ids.trabajo, ids.hito)
    assert.ok(result.error)
    assert.equal(f.created.length, 0)
    assert.equal(result.clientSecret, undefined)
  }
  const f = fixture()
  assert.ok((await f.actions.pagarHito('bad', ids.hito)).error)
  assert.equal(f.calls.length, 0)
})

test('revoked authority or lost database write expires the payable link', async () => {
  for (const options of [{ revoke: true }, { saveFails: true }]) {
    const f = fixture(options)
    const result = await f.actions.pagarHito(ids.trabajo, ids.hito)
    assert.ok(result.error)
    assert.equal(result.clientSecret, undefined)
    assert.deepEqual(f.closed, ['cs_hito'])
    assert.ok(f.calls.some(x => x.name === 'diime_cerrar_intento' && x.args.p_escrow === ids.escrow))
  }
})

test('paid session is reconciled instead of authorizing another charge', async () => {
  const f = fixture({ escrow: { stripe_session_id: 'cs_paid' }, session: { id: 'cs_paid', status: 'complete', payment_status: 'paid' } })
  const result = await f.actions.pagarHito(ids.trabajo, ids.hito)
  assert.equal(result.codigo, 'CHECKOUT_CERRADO')
  assert.equal(f.created.length, 0)
  assert.equal(f.conciliated.length, 1)
})

test('mismatching financial amount or contract metadata never reveals a session', async () => {
  for (const sessionOverride of [{ amount_total: 1320000 }, { metadata: { hito_id: ids.escrow } }]) {
    const f = fixture({ sessionOverride })
    const result = await f.actions.pagarHito(ids.trabajo, ids.hito)
    assert.match(result.error, /no coincide/)
    assert.equal(result.clientSecret, undefined)
  }
})

test('approval selects the exact milestone and uses the durable settlement claim', async () => {
  const f = fixture()
  assert.equal((await f.actions.aprobarHito(ids.trabajo, ids.hito)).success, true)
  assert.ok(f.queries.some(q => q.filters.some(([key, value]) => key === 'hito_id' && value === ids.hito)))
  assert.equal(f.calls.find(c => c.name === 'diime_reclamar_liquidacion').args.p_escrow, ids.escrow)
  assert.equal(f.liquidated.length, 1)
  assert.equal(f.queries.some(q => q.table === 'trabajos' && q.values?.estado === 'completado'), false)
})

test('negotiation transmits the exact reviewed version; invalid drafts cannot reach the database', async () => {
  const f = fixture()
  assert.ok((await f.actions.proponerPlanOferta(ids.trabajo, { version: 3, modalidad: 'hitos', hitos: [] })).error)
  assert.equal(f.calls.length, 0)
  await f.actions.responderPlanHitos(ids.trabajo, 5, true)
  assert.equal(f.calls[0].name, 'responder_plan_trabajo')
  assert.equal(f.calls[0].args.p_version, 5)
  assert.equal(f.calls[0].args.p_aceptar, true)
})

test('closing an unpaid checkout permits plan editing without a refund or transfer', async () => {
  const f = fixture({ escrow: { stripe_session_id: 'cs_pending' }, session: { id: 'cs_pending', status: 'open', payment_status: 'unpaid' } })
  assert.equal((await f.actions.cerrarPagoHito(ids.trabajo, ids.hito)).success, true)
  assert.deepEqual(f.closed, ['cs_pending'])
  assert.equal(f.calls.find(c => c.name === 'diime_cerrar_intento').args.p_session, 'cs_pending')
  assert.equal(f.liquidated.length, 0)
})

test('closing a processing or paid checkout cannot erase its financial obligation', async () => {
  for (const status of ['processing', 'paid']) {
    const f = fixture({ escrow: { stripe_session_id: 'cs_processing' }, session: { id: 'cs_processing', status: 'complete', payment_status: status === 'paid' ? 'paid' : 'unpaid' } })
    assert.ok((await f.actions.cerrarPagoHito(ids.trabajo, ids.hito)).error)
    assert.equal(f.calls.some(c => c.name === 'diime_cerrar_intento'), false)
    assert.equal(f.conciliated.length, status === 'paid' ? 1 : 0)
    assert.equal(f.closed.length, 0)
  }
})
