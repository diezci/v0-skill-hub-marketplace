// Pure webhook fixtures: no external Stripe accounts, API calls or payments.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
function load(file, deps = {}) {
  const exports = {}
  new Function('require', 'exports', 'process', 'console', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => {
    if (name in deps) return deps[name]
    throw Error(`Unexpected dependency ${name}`)
  }, exports, { env: { STRIPE_WEBHOOK_SECRET: 'synthetic' } }, { error() {} })
  return exports
}
const identity = load('lib/stripe-connect-identidad.ts')
const account = { id: 'acct_profile', business_type: 'company', details_submitted: true, capabilities: { transfers: 'active' }, payouts_enabled: true, metadata: { diime_profesional_id: 'profile', diime_proveedor_tipo: 'profesional_empresa' } }
async function webhook({ type = 'empresa', currentAccount = account, owner = { id: 'profile' }, company = null, identityError = null } = {}) {
  const calls = [], reads = []
  const db = {
    from(table) {
      const q = { insert() { return q }, select() { return q }, update() { return q }, eq(key, value) { reads.push({ table, key, value }); return q },
        maybeSingle: async () => ({ data: table === 'stripe_eventos_webhook' ? { id: 'event' } : table === 'profesionales' ? owner : company }),
        then(resolve) { return Promise.resolve({}).then(resolve) },
      }
      return q
    },
    rpc: async (name, args) => { calls.push({ name, args }); return name === 'identidad_proveedor_cobros' ? { data: type ? { tipo_proveedor: type } : null, error: identityError } : { data: true } },
  }
  const route = load('app/api/stripe/webhook/route.ts', {
    '@/lib/stripe': { stripe: { webhooks: { constructEvent: () => ({ id: 'event', type: 'account.updated', data: { object: { id: account.id, metadata: { diime_profesional_id: 'forged' } } } }) }, accounts: { retrieve: async () => currentAccount } } },
    '@supabase/supabase-js': { createClient: () => db },
    'next/server': { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } },
    '@/lib/flujo-pagos': {}, '@/lib/operaciones': { registrarEventoOperativo: async () => {} },
    '@/lib/stripe-contracargos': {}, '@/lib/stripe-connect-identidad': identity,
  })
  const response = await route.POST({ text: async () => '', headers: { get: () => 'signature' } })
  return { response, calls, reads, update: calls.find(c => c.name === 'actualizar_estado_cuenta_stripe') }
}
let result = await webhook()
assert.equal(result.response.status, 200); assert.equal(result.update.args.p_transferencias, true)
assert.equal(result.update.args.p_profesional_id, 'profile', 'Webhook metadata cannot redirect persisted ownership')
assert.equal(result.calls.find(c => c.name === 'identidad_proveedor_cobros').args.p_profesional_id, 'profile')
for (const currentAccount of [{ ...account, business_type: 'individual' }, { ...account, metadata: { ...account.metadata, diime_profesional_id: 'other' } }, { ...account, metadata: { diime_empresa_id: 'company', diime_proveedor_tipo: 'empresa' } }]) {
  result = await webhook({ currentAccount }); assert.equal(result.update.args.p_transferencias, false)
  assert.equal(result.update.args.p_onboarding, false); assert.equal(result.update.args.p_payouts, false)
}
result = await webhook({ type: 'particular' }); assert.equal(result.update.args.p_transferencias, false, 'Company Stripe metadata does not override persisted individual identity')
result = await webhook({ type: 'particular', currentAccount: { ...account, business_type: 'individual', metadata: { diime_profesional_id: 'profile' } } })
assert.equal(result.update.args.p_transferencias, true, 'Legacy personal metadata remains valid')
for (const options of [{ type: null }, { identityError: { message: 'DB error' } }, { company: { empresa_id: 'company' } }]) {
  result = await webhook(options); assert.equal(result.response.status, 500); assert.equal(result.update, undefined)
}
result = await webhook({ owner: null }); assert.equal(result.response.status, 200); assert.equal(result.calls.length, 0)
console.log('PASS Stripe account webhooks: persisted unified identity, current Stripe state, owner isolation, mismatch disable, fail-closed lookup and legacy personal accounts')
