// Pure server/Stripe fixtures. No external accounts, requests or money movements.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, dependencies) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, { exports, process: { env: {} }, console,
    require(name) {
      if (name === 'server-only') return {}
      if (name in dependencies) return dependencies[name]
      throw new Error(`Missing fixture: ${name}`)
    },
  }, { filename: file })
  return exports
}

const trabajo = {
  id: 'job', cliente_id: 'customer-employee', profesional_id: 'provider-employee',
  empresa_cliente_id: 'customer-company', empresa_proveedora_id: 'provider-company',
  actor_contratacion_id: 'customer-employee',
  proveedor_cobros_usuario_id: null, proveedor_stripe_account_id: 'acct_company',
}
const account = {
  id: 'acct_company', business_type: 'company', details_submitted: true,
  capabilities: { transfers: 'active' }, payouts_enabled: true,
  metadata: { diime_proveedor_tipo: 'empresa', diime_empresa_id: 'provider-company' },
}
function setup(cuenta = account) {
  const reads = [], movements = [], rpcCalls = []
  const stripe = { accounts: { retrieve: async id => { reads.push(id); return cuenta } } }
  const identidad = load('lib/stripe-connect-identidad.ts', {})
  const cobros = load('lib/empresas/cobros.ts', { '@/lib/stripe': { stripe }, '@/lib/stripe-connect-identidad': identidad })
  const flujo = load('lib/flujo-pagos.ts', {
    '@/lib/empresas/notificaciones': {},
    '@/lib/stripe': { stripe }, '@/lib/empresas/cobros': cobros, '@/lib/ofertas-perdedoras': {},
    '@/lib/stripe-liquidacion': {
      crearTransferGroup: () => 'group',
      ejecutarLiquidacionStripe: async args => { movements.push(args); return { chargeId: 'charge', transferId: 'transfer' } },
    },
  })
  const chain = { update: () => chain, eq: () => chain, neq: async () => ({}) }
  const admin = {
    from: () => chain,
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { ok: true } } },
  }
  return { stripe, cobros, flujo, admin, reads, movements, rpcCalls }
}
const escrow = {
  id: 'escrow', trabajo_id: 'job', profesional_id: 'provider-employee',
  liquidacion_operacion_id: 'confirmacion-escrow', pago_neto_proveedor: 95, monto: 110,
  liquidacion_contexto: {
    destino: 'acct_company', empresa_proveedora_id: 'provider-company', proveedor_cobros_usuario_id: null,
  },
}
let passed = 0
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`) }

await check('Company contract uses its own destination without consulting staff membership', async () => {
  const f = setup()
  const result = await f.cobros.obtenerDestinoCobroTrabajo({ from() { throw Error('Current profile must not be read') } }, trabajo)
  assert.equal(result.destino, 'acct_company'); assert.equal(result.titularId, null); assert.equal(result.empresaId, 'provider-company')
  assert.deepEqual(f.reads, ['acct_company'])
})
await check('A company awaiting Connect reads the company account table, never any professional', async () => {
  const f = setup(); let id
  const query = { select: () => query, eq: (_, value) => { id = value; return query }, maybeSingle: async () => ({ data: { stripe_account_id: 'acct_company' } }) }
  assert.equal((await f.cobros.obtenerDestinoCobroTrabajo({ from: table => { assert.equal(table, 'empresa_cuentas_stripe'); return query } }, { ...trabajo, proveedor_stripe_account_id: null })).destino, 'acct_company')
  assert.equal(id, 'provider-company')
})
await check('An invalid historical company destination is rejected without reading or rewriting the current account', async () => {
  const f = setup({ ...account, business_type: 'individual', metadata: { diime_profesional_id: 'owner' } })
  await assert.rejects(() => f.cobros.obtenerDestinoCobroTrabajo({ from() { throw Error('No fallback allowed') } }, { ...trabajo, proveedor_cobros_usuario_id: 'owner', proveedor_stripe_account_id: 'acct_old_owner' }))
  assert.deepEqual(f.reads, ['acct_old_owner'])
})

for (const [name, override] of [
  ['personal account', { business_type: 'individual', metadata: { diime_profesional_id: 'owner' } }],
  ['another company', { metadata: { diime_profesional_id: 'owner', diime_empresa_id: 'other-company' } }],
  ['employee account', { metadata: { diime_profesional_id: 'provider-employee', diime_empresa_id: 'provider-company' } }],
  ['missing company metadata', { metadata: { diime_profesional_id: 'owner' } }],
  ['deleted account', { deleted: true }],
  ['disabled transfers', { capabilities: { transfers: 'inactive' } }],
]) {
  await check(`New company checkout rejects ${name}`, async () => {
    const f = setup({ ...account, ...override })
    await assert.rejects(() => f.cobros.obtenerDestinoCobroTrabajo(f.admin, trabajo))
    assert.equal(f.movements.length, 0)
  })
}
await check('An independent contract retains its personal account even if the actor later joins a company', async () => {
  const f = setup({ ...account, business_type: 'individual', metadata: { diime_profesional_id: 'provider-employee' } })
  const result = await f.cobros.obtenerDestinoCobroTrabajo(f.admin, { ...trabajo, empresa_proveedora_id: null, proveedor_cobros_usuario_id: 'provider-employee' })
  assert.equal(result.titularId, 'provider-employee')
})
await check('A pre-migration company contract keeps its original professional-owned Connect account without inferring membership', async () => {
  const f = setup({ ...account, metadata: { diime_profesional_id: 'provider-employee', diime_empresa_id: 'historical-company' } })
  const result = await f.cobros.obtenerDestinoCobroTrabajo(f.admin, { ...trabajo, actor_contratacion_id: null, empresa_proveedora_id: null, proveedor_cobros_usuario_id: null })
  assert.equal(result.destino, 'acct_company'); assert.equal(result.titularId, 'provider-employee')
})
await check('New independent contracts cannot use company accounts through the historical exception', async () => {
  const f = setup({ ...account, metadata: { diime_profesional_id: 'provider-employee', diime_empresa_id: 'provider-company' } })
  await assert.rejects(() => f.cobros.obtenerDestinoCobroTrabajo(f.admin, { ...trabajo, empresa_proveedora_id: null, proveedor_cobros_usuario_id: 'provider-employee' }))
})
await check('Company payment requires financial permission on the customer side', async () => {
  const f = setup()
  for (const data of [null, false]) {
    assert.equal(await f.cobros.puedePagarTrabajo({ rpc: async () => ({ data }) }, trabajo, 'customer-employee'), false)
  }
  assert.equal(await f.cobros.puedePagarTrabajo({ rpc: async () => ({ data: true }) }, trabajo, 'customer-employee'), true)
  assert.equal(await f.cobros.puedePagarTrabajo({ rpc: async () => ({ data: false }) }, trabajo, 'unrelated-user'), false)
})
await check('The actual Checkout action rejects a revoked original customer before Stripe or admin mutation', async () => {
  const f = setup()
  const query = { select: () => query, eq: () => query, single: async () => ({ data: trabajo }) }
  const action = load('app/actions/escrow.ts', {
    '@/lib/i18n-servidor': { textoServidor: async s => s },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'customer-employee' } } }) }, rpc: async () => ({ data: null }) }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => query }) },
    '@/lib/stripe': { stripe: f.stripe }, 'next/cache': {}, '@/lib/comisiones': {},
    '@/lib/stripe-liquidacion': {}, '@/lib/flujo-pagos': {}, '@/lib/empresas/cobros': f.cobros, '@/lib/empresas/identidad': {},
  })
  const result = await action.crearPagoEscrow({ trabajo_id: 'job' })
  assert.ok(result.error); assert.equal(result.clientSecret, undefined); assert.equal(f.reads.length, 0)
})
await check('Settlement sends money to the frozen company destination and records owner metadata', async () => {
  const f = setup(); await f.flujo.liquidarPagoReclamado(f.admin, escrow)
  assert.equal(f.movements[0].connectedAccountId, 'acct_company')
  assert.equal(f.movements[0].metadata.proveedor_cobros_usuario_id, undefined)
  assert.equal(f.movements[0].metadata.diime_proveedor_tipo, 'empresa')
  assert.equal(f.movements[0].metadata.empresa_proveedora_id, 'provider-company')
})
await check('Company settlement blocks a personal destination before refund or transfer execution', async () => {
  const f = setup({ ...account, business_type: 'individual' })
  await assert.rejects(() => f.flujo.liquidarPagoReclamado(f.admin, escrow))
  assert.equal(f.movements.length, 0); assert.equal(f.rpcCalls.length, 0)
})
await check('Historical frozen settlement does not infer a new company or replace its destination', async () => {
  const f = setup({ ...account, deleted: true })
  await f.flujo.liquidarPagoReclamado(f.admin, { ...escrow, liquidacion_contexto: { destino: 'acct_historical' } })
  assert.equal(f.reads.length, 0); assert.equal(f.movements[0].connectedAccountId, 'acct_historical')
})
await check('Completed company movements can repair the database closure without requiring a newly active account', async () => {
  const f = setup({ ...account, deleted: true })
  await f.flujo.liquidarPagoReclamado(f.admin, { ...escrow, liquidacion_estado: 'completada', stripe_transfer_id: 'transfer' })
  assert.equal(f.reads.length, 0); assert.equal(f.movements.length, 0); assert.equal(f.rpcCalls.length, 1)
})
await check('Webhook rejects a Checkout whose economic recipient differs from the stored contract', async () => {
  const f = setup()
  const payment = { ...escrow, cliente_id: 'customer-employee', monto: 110, stripe_session_id: 'session' }
  const admin = { from(table) {
    const query = { select: () => query, eq: () => query, single: async () => ({ data: trabajo }), maybeSingle: async () => ({ data: payment }) }
    assert.ok(['trabajos', 'transacciones_escrow'].includes(table)); return query
  } }
  await assert.rejects(() => f.flujo.conciliarSesionPagada(admin, {
    id: 'session', payment_status: 'paid', currency: 'eur', amount_total: 11000,
    metadata: { escrow_id: 'escrow', proveedor_cobros_usuario_id: 'provider-employee', proveedor_stripe_account_id: 'acct_employee', empresa_proveedora_id: 'provider-company' },
  }), /titular de cobros/)
  assert.equal(f.movements.length, 0)
})
console.log(`${passed} company payment scenarios passed without network or money movements.`)
