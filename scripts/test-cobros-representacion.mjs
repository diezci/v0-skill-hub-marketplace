import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, deps = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, Date, URLSearchParams,
    process: { env: { NEXT_PUBLIC_SITE_URL: 'https://example.test' } },
    require(name) { if (!(name in deps)) throw Error(`Unexpected dependency: ${name}`); return deps[name] },
  }, { filename: file })
  return module.exports
}
const identidad = load('lib/stripe-connect-identidad.ts')
const personal = { id: 'acct_personal', metadata: { diime_profesional_id: 'actor' }, business_type: 'individual', details_submitted: true, capabilities: { transfers: 'active' }, payouts_enabled: true, requirements: { currently_due: [] } }

function scenario({ account = personal, empresa = 'empresa-actual', user = { id: 'actor' }, rpcData = true, rpcError = null, balanceError = false } = {}) {
  const calls = []
  const session = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      let target
      const chain = {
        select: () => chain,
        eq(key, value) { assert.equal(key, 'id'); target = value; return chain },
        maybeSingle: async () => {
          assert.equal(target, 'actor')
          return { data: table === 'profiles' ? { id: 'actor', empresa_id: empresa, nombre: 'Persona' } : { id: 'actor', stripe_account_id: 'acct_personal' } }
        },
      }
      return chain
    },
  }
  const admin = {
    rpc: async (name, args) => { calls.push({ op: 'rpc', name, args }); return { data: rpcData, error: rpcError } },
    from: () => { throw Error('No direct writes or account replacement allowed in these scenarios') },
  }
  const read = (op, value) => async (params, options) => {
    calls.push({ op, params, options }); assert.equal(options.stripeAccount, 'acct_personal')
    if (op === 'balance' && balanceError) throw Error('Balance unavailable')
    return value
  }
  const stripe = {
    accounts: {
      retrieve: async id => { calls.push({ op: 'account', id }); assert.equal(id, 'acct_personal'); return account },
      createLoginLink: async id => { calls.push({ op: 'login', id }); assert.equal(id, 'acct_personal'); return { url: 'https://connect.stripe.test/personal' } },
      create: async () => { throw Error('Must never replace the existing account') },
    },
    accountLinks: { create: async args => { calls.push({ op: 'onboarding', args }); return { url: 'https://connect.stripe.test/onboarding' } } },
    balance: { retrieve: read('balance', { available: [{ currency: 'eur', amount: 800 }], pending: [], livemode: true }) },
    payouts: { list: read('payouts', { data: [{ amount: 800, currency: 'eur', arrival_date: 1800360000, status: 'in_transit', method: 'standard' }] }) },
    balanceTransactions: { list: read('transactions', { data: [] }) },
    balanceSettings: { retrieve: read('schedule', { payments: { payouts: { schedule: { interval: 'daily' } } } }) },
  }
  const actions = load('app/actions/stripe-connect.ts', {
    '@/lib/i18n-servidor': { textoServidor: async text => text },
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/stripe': { stripe }, '@/lib/stripe-connect-identidad': identidad, 'next/cache': { revalidatePath() {} },
  })
  return { actions, calls }
}

let count = 0
async function test(name, fn) { await fn(); count++; console.log(`PASS ${name}`) }
await test('La cuenta personal anterior conserva saldo y próximo ingreso, con nuevos cobros de empresa bloqueados', async () => {
  const { actions, calls } = scenario()
  const result = await actions.obtenerEstadoStripeConnect()
  assert.ok(result.data, result.error)
  const d = result.data
  assert.equal(d.cuentaPersonalAnterior, true)
  assert.ok(d.avisoTitularidad.includes('cuenta de Stripe es personal'))
  assert.equal(d.saldo.saldos[0].disponible, 800)
  assert.equal(d.saldo.proximoIngreso.importe, 800)
  assert.equal(d.onboardingCompletado, false)
  assert.equal(d.transferenciasHabilitadas, false)
  assert.equal(d.payoutsHabilitados, false)
  const sync = calls.find(c => c.op === 'rpc')
  assert.equal(sync.name, 'actualizar_estado_cuenta_stripe')
  assert.equal(sync.args.p_profesional_id, 'actor')
  assert.equal(sync.args.p_account_id, 'acct_personal')
  assert.equal(sync.args.p_empresa_esperada, 'empresa-actual')
  for (const key of ['p_onboarding', 'p_transferencias', 'p_payouts']) assert.equal(sync.args[key], false)
  assert.equal(calls.filter(c => ['balance', 'payouts', 'transactions', 'schedule'].includes(c.op)).length, 4)
})
await test('El propietario accede al Dashboard personal sin habilitar onboarding empresarial ni sustituir cuenta', async () => {
  const { actions, calls } = scenario()
  assert.ok((await actions.crearEnlaceDashboardStripe()).data)
  assert.ok((await actions.crearEnlaceOnboardingStripe()).error)
  assert.equal(calls.filter(c => c.op === 'login').length, 1)
  assert.equal(calls.some(c => c.op === 'onboarding'), false)
})
await test('Un particular sin cambio y una empresa coincidente mantienen su flujo activo', async () => {
  for (const s of [scenario({ empresa: null }), scenario({ account: { ...personal, business_type: 'company', metadata: { diime_profesional_id: 'actor', diime_empresa_id: 'empresa-actual' } } })]) {
    const { data, error } = await s.actions.obtenerEstadoStripeConnect()
    assert.ok(data, error)
    assert.equal(data.cuentaPersonalAnterior, false)
    assert.equal(data.avisoTitularidad, null)
    assert.equal(data.transferenciasHabilitadas, true)
    assert.equal(data.onboardingCompletado, true)
    assert.ok((await s.actions.crearEnlaceDashboardStripe()).data)
  }
})
await test('Cuenta ajena, metadatos ausentes, empresa anterior e identidad ambigua no filtran saldo ni enlaces', async () => {
  for (const options of [
    { account: { ...personal, metadata: { diime_profesional_id: 'otro' } } },
    { account: { ...personal, metadata: {} } },
    { account: { ...personal, business_type: 'company', metadata: { diime_profesional_id: 'actor', diime_empresa_id: 'empresa-anterior' } } },
    { empresa: null, account: { ...personal, business_type: 'company', metadata: { diime_profesional_id: 'actor', diime_empresa_id: 'empresa-anterior' } } },
    { account: { ...personal, metadata: { diime_profesional_id: 'actor', diime_empresa_id: 'empresa-actual' } } },
  ]) {
    const { actions, calls } = scenario(options)
    assert.ok((await actions.obtenerEstadoStripeConnect()).error)
    assert.ok((await actions.crearEnlaceDashboardStripe()).error)
    assert.ok((await actions.crearEnlaceOnboardingStripe()).error)
    assert.equal(calls.some(c => ['balance', 'payouts', 'transactions', 'schedule', 'login', 'onboarding'].includes(c.op)), false)
  }
})
await test('Cambiar cuenta o empresa durante la lectura no sincroniza un estado obsoleto ni consulta el saldo', async () => {
  for (const opts of [{ rpcData: false }, { rpcError: { message: 'Concurrent identity change' } }]) {
    const { actions, calls } = scenario(opts)
    assert.ok((await actions.obtenerEstadoStripeConnect()).error)
    assert.equal(calls.some(c => c.op === 'balance'), false)
  }
})
await test('Un fallo de saldo mantiene visible el motivo de titularidad sin inventar importes', async () => {
  const result = await scenario({ balanceError: true }).actions.obtenerEstadoStripeConnect()
  assert.ok(result.data)
  assert.equal(result.data.cuentaPersonalAnterior, true)
  assert.equal(result.data.saldo, null)
  assert.ok(result.data.saldoError)
})
await test('Sin sesión no se consulta ni abre Stripe', async () => {
  const { actions, calls } = scenario({ user: null })
  assert.ok((await actions.obtenerEstadoStripeConnect()).error)
  assert.ok((await actions.crearEnlaceDashboardStripe()).error)
  assert.ok((await actions.crearEnlaceOnboardingStripe()).error)
  assert.equal(calls.length, 0)
})
await test('La excepción de lectura nunca acepta cuentas eliminadas, empresas o propietarios desconocidos', async () => {
  assert.equal(identidad.esCuentaPersonalPropiaStripe(personal, { id: 'actor' }), true)
  for (const account of [{ ...personal, deleted: true }, { ...personal, business_type: 'company' }, { ...personal, business_type: undefined }, { ...personal, metadata: null }]) {
    assert.equal(identidad.esCuentaPersonalPropiaStripe(account, { id: 'actor' }), false)
  }
  assert.ok(identidad.errorIdentidadCuentaStripe(personal, { id: 'actor', empresa_id: 'empresa-actual' }), 'The webhook/new-collection guard remains strict')
})
console.log(`${count} escenarios de cobros y representación verificados; sin red, cuentas nuevas ni movimientos.`)
