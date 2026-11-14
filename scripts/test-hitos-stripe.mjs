import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, deps) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, setTimeout, require: name => {
      if (name === 'server-only') return {}
      if (name in deps) return deps[name]
      if (name === '@/lib/empresas/notificaciones') return {}
      if (name === '@/lib/empresas/cobros') return {}
      throw Error(`Unexpected dependency: ${name}`)
    },
  })
  return exports
}
const metadata = { type: 'diime_pago_protegido', contrato_id: 'job', trabajo_id: 'job', hito_id: 'milestone-1', escrow_id: 'payment-1', cliente_id: 'client', profesional_id: 'provider' }
function fixture() {
  const calls = [], transfers = [], refunds = []
  const escrow = { id: 'payment-1', trabajo_id: 'job', hito_id: 'milestone-1', cliente_id: 'client', profesional_id: 'provider', monto: 55, monto_base: 50, stripe_session_id: 'cs_1', stripe_transfer_group: 'group_hito_1', stripe_payment_intent_id: 'pi_1', stripe_charge_id: 'ch_1', monto_reembolsado: 0, pago_neto_proveedor: 45, liquidacion_operacion_id: 'confirmacion-payment-1', liquidacion_contexto: { tipo: 'confirmacion', destino: 'acct_1' } }
  const session = { id: 'cs_1', payment_status: 'paid', currency: 'eur', amount_total: 5500, payment_intent: 'pi_1', metadata: { ...metadata } }
  const intent = { id: 'pi_1', latest_charge: 'ch_1', status: 'succeeded', currency: 'eur', amount: 5500, amount_received: 5500, metadata: { ...metadata } }
  let failFinalize = false
  const stripe = {
    paymentIntents: { retrieve: async () => { calls.push('retrieve-intent'); return intent } },
    charges: { retrieve: async () => ({ id: 'ch_1', disputed: false }) },
    transfers: { list: async () => ({ data: transfers, has_more: false }), retrieve: async id => transfers.find(t => t.id === id), create: async params => { const t = { ...params, id: 'tr_1', amount_reversed: 0 }; transfers.push(t); return t } },
    refunds: { list: async () => ({ data: refunds, has_more: false }), retrieve: async id => refunds.find(r => r.id === id), create: async params => { const r = { ...params, id: 're_1', status: 'succeeded' }; refunds.push(r); return r } },
  }
  const query = { select: () => query, eq: () => query, update: () => query, neq: () => query, maybeSingle: async () => ({ data: escrow }), then: resolve => resolve({ data: [], error: null }) }
  const admin = { from: () => query, rpc: async (name, args) => {
    calls.push({ name, args })
    if (name === 'diime_finalizar_liquidacion' && failFinalize) { failFinalize = false; return { error: Error('DB response lost') } }
    return { data: { escrow: { ...escrow, estado: 'completado' }, activado: false, tardio: false, avisos: [] } }
  } }
  const settlement = load('lib/stripe-liquidacion.ts', { '@/lib/stripe': { stripe } })
  const flow = load('lib/flujo-pagos.ts', { '@/lib/stripe': { stripe }, '@/lib/stripe-liquidacion': settlement, '@/lib/ofertas-perdedoras': {} })
  return { escrow, session, intent, stripe, admin, flow, transfers, refunds, calls, failFinalize: () => { failFinalize = true } }
}
let passed = 0
async function check(name, body) { await body(); passed++; console.log(`PASS ${name}`) }
await check('captured milestone commits only the identified escrow through the shared RPC', async () => {
  const f = fixture(); await f.flow.conciliarSesionPagada(f.admin, f.session, 'client')
  const commit = f.calls.find(c => c.name === 'diime_confirmar_pago')
  assert.equal(commit.args.p_escrow, 'payment-1'); assert.equal(commit.args.p_total, 5500)
})
await check('another milestone, contract or payment in session metadata never commits', async () => {
  for (const key of ['hito_id', 'contrato_id', 'trabajo_id', 'escrow_id']) {
    const f = fixture(); f.session.metadata[key] = 'other'
    await assert.rejects(() => f.flow.conciliarSesionPagada(f.admin, f.session), /no coincide/)
    assert.equal(f.calls.filter(c => c.name).length, 0)
  }
})
await check('missing milestone identity on a PaymentIntent cannot confirm an equal-value payment', async () => {
  const f = fixture(); f.intent.metadata = {}
  await assert.rejects(() => f.flow.conciliarSesionPagada(f.admin, f.session), /no coincide/)
  assert.equal(f.calls.filter(c => c.name).length, 0)
})
await check('unpaid async Checkout, changed amount and wrong customer cannot start work', async () => {
  for (const mutation of [f => f.session.payment_status = 'unpaid', f => f.session.amount_total = 5400, f => f.intent.status = 'processing']) {
    const f = fixture(); mutation(f)
    await assert.rejects(() => f.flow.conciliarSesionPagada(f.admin, f.session))
    assert.equal(f.calls.filter(c => c.name).length, 0)
  }
  const f = fixture(); await assert.rejects(() => f.flow.conciliarSesionPagada(f.admin, f.session, 'outsider'), /permiso/)
})
await check('legacy one-time payments do not require milestone metadata', async () => {
  const f = fixture(); delete f.escrow.hito_id
  f.session.metadata = { escrow_id: f.escrow.id }; f.intent.metadata = {}
  await f.flow.conciliarSesionPagada(f.admin, f.session)
  assert.equal(f.calls.filter(c => c.name === 'diime_confirmar_pago').length, 1)
})
await check('milestone metadata cannot reinterpret a one-time ledger row', async () => {
  const f = fixture(); delete f.escrow.hito_id
  await assert.rejects(() => f.flow.conciliarSesionPagada(f.admin, f.session), /modalidad/)
  assert.equal(f.calls.filter(c => c.name).length, 0)
})
await check('transfer recovery preserves all milestone IDs after DB interruption without duplicate money', async () => {
  const f = fixture(); f.failFinalize()
  await assert.rejects(() => f.flow.liquidarPagoReclamado(f.admin, f.escrow), /DB response lost/)
  await f.flow.liquidarPagoReclamado(f.admin, f.escrow)
  assert.equal(f.transfers.length, 1); assert.equal(f.refunds.length, 0)
  const t = f.transfers[0]
  assert.equal(t.source_transaction, 'ch_1'); assert.equal(t.amount, 4500)
  assert.equal(t.metadata.contrato_id, 'job'); assert.equal(t.metadata.hito_id, 'milestone-1')
  assert.equal(t.metadata.pago_id, 'payment-1'); assert.equal(t.metadata.liquidacion_operacion_id, 'confirmacion-payment-1')
})
await check('a late milestone payment refunds its own charge once without transferring anything', async () => {
  const f = fixture(); f.escrow.monto_reembolsado = 55; f.escrow.pago_neto_proveedor = 0
  f.escrow.liquidacion_operacion_id = 'pago-tardio-payment-1'; f.escrow.liquidacion_contexto = { tipo: 'pago_tardio', destino: null }
  await f.flow.liquidarPagoReclamado(f.admin, f.escrow); await f.flow.liquidarPagoReclamado(f.admin, f.escrow)
  assert.equal(f.refunds.length, 1); assert.equal(f.refunds[0].amount, 5500); assert.equal(f.transfers.length, 0)
  assert.equal(f.refunds[0].metadata.hito_id, 'milestone-1')
})
console.log(`${passed} milestone Stripe reconciliation scenarios passed (local stubs, no network).`)
