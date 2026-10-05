// Server-action regression fixtures; no network, new real accounts or money.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function load(file, deps = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, Date, URLSearchParams, process: { env: { NEXT_PUBLIC_SITE_URL: 'https://example.test' } }, require(name) { if (!(name in deps)) throw Error(`Unexpected dependency: ${name}`); return deps[name] } }, { filename: file })
  return module.exports
}
const identidad = load('lib/stripe-connect-identidad.ts')
const empresa = '00000000-0000-4000-8000-000000000010'
const personal = { id: 'acct_personal', metadata: { diime_profesional_id: 'actor' }, business_type: 'individual', details_submitted: true, capabilities: { transfers: 'active' }, payouts_enabled: true, requirements: { currently_due: [] } }
const company = { ...personal, id: 'acct_company', business_type: 'company', metadata: { diime_empresa_id: empresa, diime_proveedor_tipo: 'empresa' } }
function scenario({ account = personal, companyAccount = company, user = { id: 'actor', email: 'actor@example.test' }, canRead = true, principal = true, revokeAt = null, rpcData = true, balanceError = false } = {}) {
  const calls = [], accounts = new Map()
  if (account) accounts.set(account.id, account)
  if (companyAccount) accounts.set(companyAccount.id, companyAccount)
  let allowed = canRead
  function chain(data) { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data }) }; return q }
  const session = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table) { return chain(table === 'profiles' ? { id: 'actor', nombre: 'Persona', empresa_id: empresa } : { id: 'actor', stripe_account_id: account?.id || null }) },
    rpc: async (name, args) => {
      calls.push({ op: 'permission', name, args })
      return { data: name === 'empresa_comprobar_permiso' ? allowed : { id: empresa, es_responsable_principal: principal } }
    },
  }
  const admin = {
    from(table) { assert.ok(['empresas', 'empresa_cuentas_stripe'].includes(table)); return chain(table === 'empresas' ? { id: empresa, nombre: 'Empresa', email: 'company@example.test' } : companyAccount ? { stripe_account_id: companyAccount.id } : null) },
    rpc: async (name, args) => { calls.push({ op: 'rpc', name, args }); return { data: name.startsWith('registrar_') ? args.p_account_id : rpcData } },
  }
  const read = (op, value) => async (_, options) => {
    calls.push({ op, account: options.stripeAccount })
    if (op === 'balance' && balanceError) throw Error('Balance unavailable')
    if (revokeAt === op) allowed = false
    return value
  }
  const stripe = {
    accounts: {
      retrieve: async id => { calls.push({ op: 'account', id }); if (revokeAt === 'account') allowed = false; return accounts.get(id) },
      create: async (params, options) => { calls.push({ op: 'create', params, options }); const c = { ...personal, ...params, id: params.business_type === 'company' ? 'acct_company_new' : 'acct_personal_new' }; accounts.set(c.id, c); return c },
      createLoginLink: async id => { calls.push({ op: 'login', id }); if (revokeAt === 'login') allowed = false; return { url: 'https://connect.stripe.test/dashboard' } },
    },
    accountLinks: { create: async args => { calls.push({ op: 'onboarding', args }); if (revokeAt === 'onboarding') allowed = false; return { url: 'https://connect.stripe.test/onboarding' } } },
    balance: { retrieve: read('balance', { available: [{ currency: 'eur', amount: 800 }], pending: [], livemode: true }) },
    payouts: { list: read('payouts', { data: [{ amount: 800, currency: 'eur', arrival_date: 1800360000, status: 'in_transit', method: 'standard' }] }) },
    balanceTransactions: { list: read('transactions', { data: [] }) },
    balanceSettings: { retrieve: read('schedule', { payments: { payouts: { schedule: { interval: 'daily' } } } }) },
  }
  const actions = load('app/actions/stripe-connect.ts', { '@/lib/i18n-servidor': { textoServidor: async text => text }, '@/lib/supabase/server': { createClient: async () => session }, '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/stripe': { stripe }, '@/lib/stripe-connect-identidad': identidad, 'next/cache': { revalidatePath() {} } })
  return { actions, calls }
}
let count = 0
async function test(name, fn) { await fn(); count++; console.log(`PASS ${name}`) }
await test('Membership leaves personal payments and personal onboarding independent', async () => {
  const f = scenario(); const result = await f.actions.obtenerEstadoStripeConnect()
  assert.ok(result.data, result.error); assert.equal(result.data.transferenciasHabilitadas, true)
  assert.equal(result.data.cuentaPersonalAnterior, false); assert.equal(result.data.saldo.saldos[0].disponible, 800)
  assert.ok((await f.actions.crearEnlaceOnboardingStripe()).data)
  assert.ok((await f.actions.crearEnlaceDashboardStripe()).data)
  assert.equal(f.calls.some(c => c.op === 'permission'), false)
  assert.ok(f.calls.filter(c => c.account).every(c => c.account === 'acct_personal'))
})
await test('Company balance belongs to company account even when principal has personal Connect', async () => {
  const f = scenario(); const result = await f.actions.obtenerEstadoStripeConnectEmpresa(empresa)
  assert.ok(result.data, result.error); assert.equal(result.data.transferenciasHabilitadas, true)
  assert.ok(f.calls.filter(c => c.account).every(c => c.account === 'acct_company'))
  assert.equal(f.calls.find(c => c.op === 'rpc').name, 'actualizar_estado_cuenta_stripe_empresa')
})
await test('Read-only company finance access does not issue onboarding or Express dashboard links', async () => {
  const f = scenario({ principal: false })
  assert.ok((await f.actions.obtenerEstadoStripeConnectEmpresa(empresa)).data)
  assert.ok((await f.actions.crearEnlaceOnboardingStripeEmpresa(empresa)).error)
  assert.ok((await f.actions.crearEnlaceDashboardStripeEmpresa(empresa)).error)
  assert.equal(f.calls.some(c => ['create','login','onboarding'].includes(c.op)), false)
})
await test('Missing permission, unauthenticated calls and invalid company ids never reach Stripe', async () => {
  for (const opts of [{ canRead: false }, { user: null }]) {
    const f = scenario(opts)
    for (const action of ['obtenerEstadoStripeConnectEmpresa','crearEnlaceOnboardingStripeEmpresa','crearEnlaceDashboardStripeEmpresa']) assert.ok((await f.actions[action](empresa)).error)
    assert.equal(f.calls.some(c => c.op === 'account'), false)
  }
  const f = scenario(); assert.ok((await f.actions.obtenerEstadoStripeConnectEmpresa('invalid')).error)
  assert.equal(f.calls.length, 0)
})
await test('New company account has company ownership metadata and a separate idempotency key', async () => {
  const f = scenario({ companyAccount: null })
  assert.ok((await f.actions.crearEnlaceOnboardingStripeEmpresa(empresa)).data)
  const c = f.calls.find(c => c.op === 'create')
  assert.equal(c.params.business_type, 'company'); assert.equal(c.params.metadata.diime_empresa_id, empresa)
  assert.equal(c.params.metadata.diime_profesional_id, undefined)
  assert.equal(c.options.idempotencyKey, `diime-connect-empresa-${empresa}`)
  assert.equal(f.calls.find(c => c.op === 'rpc').name, 'registrar_cuenta_stripe_empresa')
  const link = f.calls.find(c => c.op === 'onboarding')
  assert.ok(link.args.refresh_url.includes(`empresa=${empresa}`))
})
await test('Personal onboarding never creates a company account because the actor is a member', async () => {
  const f = scenario({ account: null })
  assert.ok((await f.actions.crearEnlaceOnboardingStripe()).data)
  const c = f.calls.find(c => c.op === 'create')
  assert.equal(c.params.business_type, 'individual'); assert.equal(c.params.metadata.diime_empresa_id, undefined)
  assert.equal(c.options.idempotencyKey, 'diime-connect-personal-actor')
  assert.equal(f.calls.find(c => c.op === 'rpc').name, 'registrar_cuenta_stripe_personal')
})
await test('Unknown, legacy owner, other company and deleted company accounts expose no money or links', async () => {
  for (const override of [{ deleted: true }, { business_type: 'individual' }, { metadata: { diime_empresa_id: empresa, diime_profesional_id: 'actor' } }, { metadata: { diime_empresa_id: 'other', diime_proveedor_tipo: 'empresa' } }, { metadata: {} }]) {
    const f = scenario({ companyAccount: { ...company, ...override } })
    assert.ok((await f.actions.obtenerEstadoStripeConnectEmpresa(empresa)).error)
    assert.ok((await f.actions.crearEnlaceDashboardStripeEmpresa(empresa)).error)
    assert.ok((await f.actions.crearEnlaceOnboardingStripeEmpresa(empresa)).error)
    assert.equal(f.calls.some(c => ['balance','login','onboarding','create'].includes(c.op)), false)
  }
})
await test('Permission revoked during Stripe read or link creation suppresses all returned financial data/links', async () => {
  for (const revokeAt of ['account', 'balance']) assert.ok((await scenario({ revokeAt }).actions.obtenerEstadoStripeConnectEmpresa(empresa)).error)
  assert.ok((await scenario({ revokeAt: 'login' }).actions.crearEnlaceDashboardStripeEmpresa(empresa)).error)
  assert.ok((await scenario({ revokeAt: 'onboarding' }).actions.crearEnlaceOnboardingStripeEmpresa(empresa)).error)
})
await test('Concurrent account change is not synchronized as a valid account or shown', async () => {
  const f = scenario({ rpcData: false }); assert.ok((await f.actions.obtenerEstadoStripeConnect()).error)
  assert.equal(f.calls.some(c => c.op === 'balance'), false)
})
await test('Balance errors are explicit and never synthesized as zero', async () => {
  const { data } = await scenario({ balanceError: true }).actions.obtenerEstadoStripeConnectEmpresa(empresa)
  assert.equal(data.saldo, null); assert.ok(data.saldoError)
})
await test('A legacy company stored as personal remains untouched and blocked pending ownership reconciliation', async () => {
  const f = scenario({ account: { ...company, id: 'acct_personal' } })
  assert.ok((await f.actions.obtenerEstadoStripeConnect()).error)
  assert.ok((await f.actions.crearEnlaceOnboardingStripe()).error)
  assert.equal(f.calls.some(c => c.op === 'create'), false)
})
console.log(`${count} independent Connect ownership/authorization scenarios passed.`)
