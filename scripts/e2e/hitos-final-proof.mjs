// Read-only financial audit after all browser/native captures and server-action settlements.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { hitosContext } from './hitos-context.mjs'

const c = await hitosContext(), fixtures = JSON.parse(fs.readFileSync(c.dir + '/checkout-fixtures.json', 'utf8'))
const expected = {
  unico: { job: 'completado', captured: 1200, transferred: 800, refunded: 0, payments: 1 },
  hitos: { job: 'completado', captured: 5500, transferred: 4500, refunded: 0, payments: 2 },
  parcial: { job: 'en_progreso', captured: 2200, transferred: 1080, refunded: 800, payments: 1 },
  cancelacion: { job: 'cancelado', captured: 2200, transferred: 0, refunded: 2000, payments: 1 },
}
const report = { at: new Date().toISOString(), testOnly: true, sandbox: 'acct_1USOyz3B6hPi56bO', readOnlyAudit: true, jobs: [] }
for (const fixture of fixtures.jobs) {
  const job = await c.row('trabajos', fixture.trabajoId), want = expected[fixture.kind]
  assert.equal(job.estado, want.job)
  const escrows = await c.admin.from('transacciones_escrow').select('*').eq('trabajo_id', job.id).order('created_at')
  assert.ifError(escrows.error); assert.equal(escrows.data.length, want.payments)
  const payments = []
  for (const esc of escrows.data) {
    const [session, charge, transfers, refunds] = await Promise.all([
      c.stripe.checkout.sessions.retrieve(esc.stripe_session_id), c.stripe.charges.retrieve(esc.stripe_charge_id),
      c.stripe.transfers.list({ transfer_group: esc.stripe_transfer_group, limit: 100 }),
      c.stripe.refunds.list({ payment_intent: esc.stripe_payment_intent_id, limit: 100 }),
    ])
    assert.equal(session.livemode, false); assert.equal(session.payment_status, 'paid')
    assert.equal(charge.livemode, false); assert.equal(charge.currency, 'eur')
    assert.equal(esc.liquidacion_estado, 'completada')
    assert.equal(transfers.has_more, false); assert.equal(refunds.has_more, false)
    assert.equal(transfers.data.length, Number(esc.pago_neto_proveedor) > 0 ? 1 : 0)
    assert.equal(refunds.data.length, Number(esc.monto_reembolsado) > 0 ? 1 : 0)
    for (const transfer of transfers.data) {
      assert.equal(transfer.source_transaction, charge.id); assert.equal(transfer.destination, job.proveedor_stripe_account_id)
      assert.equal(transfer.id, esc.stripe_transfer_id); assert.equal(transfer.livemode, false)
      if (esc.hito_id) { assert.equal(transfer.metadata.hito_id, esc.hito_id); assert.equal(transfer.metadata.contrato_id, job.id); assert.equal(transfer.metadata.pago_id, esc.id) }
    }
    for (const refund of refunds.data) { assert.equal(refund.id, esc.stripe_refund_id); assert.equal(refund.status, 'succeeded') }
    const captured = session.amount_total, transferred = transfers.data.reduce((n, t) => n + t.amount, 0), refunded = refunds.data.reduce((n, r) => n + r.amount, 0)
    assert.equal(captured - transferred - refunded, Math.round(Number(esc.retencion_plataforma) * 100))
    payments.push({ escrow: esc.id, milestone: esc.hito_id, session: session.id, paymentIntent: esc.stripe_payment_intent_id, charge: charge.id,
      transferIds: transfers.data.map(t => t.id), refundIds: refunds.data.map(r => r.id), captured, transferred, refunded,
      platformGross: captured - transferred - refunded, threeDSecure: charge.payment_method_details?.card?.three_d_secure || null })
  }
  for (const field of ['captured', 'transferred', 'refunded']) assert.equal(payments.reduce((n, p) => n + p[field], 0), want[field])
  report.jobs.push({ kind: fixture.kind, id: job.id, state: job.estado, payments })
}
report.totals = Object.fromEntries(['captured', 'transferred', 'refunded', 'platformGross'].map(field => [field, report.jobs.flatMap(j => j.payments).reduce((n, p) => n + p[field], 0)]))
const webhookFiles = fs.readdirSync(c.dir).filter(name => /^webhook-.*-proof\.json$/.test(name))
report.webhooks = webhookFiles.map(file => { const proof = JSON.parse(fs.readFileSync(c.dir + '/' + file, 'utf8')); assert.equal(proof.passed, true); return { file, event: proof.actualStripeEvent, type: proof.eventType || 'checkout.session.completed', replays: proof.duplicateReplays } })
assert.equal(report.webhooks.filter(e => e.type === 'checkout.session.completed').length, 5)
assert.equal(report.webhooks.filter(e => e.type === 'refund.updated').length, 2)
const storage = JSON.parse(fs.readFileSync(c.dir + '/storage-private-proof.json', 'utf8'))
assert.equal(storage.passed, true); report.privateStorageProof = 'storage-private-proof.json'
report.passed = true
fs.writeFileSync(c.dir + '/final-financial-proof.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ passed: true, jobs: report.jobs.length, captures: 5, webhooks: report.webhooks.length, totalsCents: report.totals }))
