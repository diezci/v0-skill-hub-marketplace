// Verify an actual Stripe-created Checkout/refund event was delivered by the CLI, then replay its
// original payload with the local test signing secret. Replays are explicitly test-generated.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseEnv } from 'node:util'
import { hitosContext } from './hitos-context.mjs'

const c = await hitosContext(), kind = process.argv[2] || 'hitos', stage = Number(process.argv[3] || 1)
const isRefund = process.argv[4] === 'refund'
const fixture = JSON.parse(fs.readFileSync(c.dir + '/checkout-fixtures.json', 'utf8')).jobs.find(j => j.kind === kind)
assert.ok(fixture)
const sessionId = stage === 1 ? fixture.sessionId : fixture.secondSessionId
const escrowId = stage === 1 ? fixture.escrowId : fixture.secondEscrowId
assert.ok(sessionId); assert.ok(escrowId)
const session = await c.stripe.checkout.sessions.retrieve(sessionId)
assert.equal(session.livemode, false); assert.equal(session.payment_status, 'paid')
let actualEvent
const expectedObject = isRefund ? (await c.row('transacciones_escrow', escrowId)).stripe_refund_id : sessionId
assert.ok(expectedObject)
const eventType = isRefund ? 'refund.updated' : 'checkout.session.completed'
for await (const event of c.stripe.events.list({ type: eventType, created: { gte: session.created }, limit: 100 })) {
  if (event.data.object.id === expectedObject) { actualEvent = event; break }
}
assert.ok(actualEvent, 'Actual Stripe-created event required')
assert.equal(actualEvent.livemode, false)
const beforeEvent = await c.row('stripe_eventos_webhook', actualEvent.id)
assert.equal(beforeEvent.estado, 'completado', 'Original signed transport must complete before replay test')
const beforeEscrow = await c.row('transacciones_escrow', escrowId)
const beforeJob = await c.row('trabajos', fixture.trabajoId)
const body = JSON.stringify(actualEvent)
const secretEnv = parseEnv(fs.readFileSync(c.dir + '/.env.stripe-test.local', 'utf8'))
const secret = secretEnv.DIIME_STRIPE_WEBHOOK_SECRET || secretEnv.STRIPE_WEBHOOK_SECRET
assert.match(secret || '', /^whsec_/)
const post = async signature => {
  const response = await fetch(c.baseUrl + '/api/stripe/webhook', { method: 'POST', body,
    headers: { 'Content-Type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) } })
  return { status: response.status, body: await response.json() }
}
assert.equal((await post(null)).status, 400)
assert.equal((await post('t=1,v1=invalid')).status, 400)
const header = c.stripe.webhooks.generateTestHeaderString({ payload: body, secret })
const replays = await Promise.all([post(header), post(header)])
for (const replay of replays) { assert.equal(replay.status, 200); assert.equal(replay.body.duplicate, true) }
assert.deepEqual(await c.row('stripe_eventos_webhook', actualEvent.id), beforeEvent)
assert.deepEqual(await c.row('transacciones_escrow', escrowId), beforeEscrow)
assert.deepEqual(await c.row('trabajos', fixture.trabajoId), beforeJob)
const report = { at: new Date().toISOString(), testOnly: true, kind, stage, actualStripeEvent: actualEvent.id,
  eventType, actualSession: sessionId, ...(isRefund ? { actualRefund: expectedObject } : {}), originalTransport: 'Stripe CLI forwards signed event to local Next handler',
  originalProcessed: beforeEvent.procesado_at, originalAttempts: beforeEvent.intentos,
  missingSignatureRejected: true, invalidSignatureRejected: true,
  duplicateReplays: 2, replaySignature: 'generated locally with the isolated test webhook secret',
  duplicateResponses: replays, eventEscrowAndJobUnchanged: true, passed: true }
fs.writeFileSync(c.dir + `/webhook-${kind}-${stage}${isRefund ? '-refund' : ''}-proof.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
