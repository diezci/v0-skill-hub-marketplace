// Read/reconcile the genuine asynchronous TEST failure. A browser drives retry;
// this script never creates a replacement refund or fabricates Stripe events.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { parseEnv } from 'node:util'
import Stripe from 'stripe'
import { pagosContext } from './pagos-context.mjs'
const c=pagosContext(),e=parseEnv(fs.readFileSync(c.dir+'/.env.stripe-test.local','utf8'))
const key=e.DIIME_STRIPE_SECRET_KEY||e.STRIPE_SECRET_KEY
assert.ok(key.startsWith('sk_test_'))
const stripe=new Stripe(key),fixture=JSON.parse(fs.readFileSync(c.dir+'/pagos-paid-batch-fixtures.json')).jobs.find(x=>x.kind==='refund_failed')
const escrow=await c.row('transacciones_escrow',fixture.escrowId),job=await c.row('trabajos',fixture.trabajoId)
assert.ok(escrow.stripe_refund_id)
const refund=await stripe.refunds.retrieve(escrow.stripe_refund_id)
assert.equal((await stripe.charges.retrieve(escrow.stripe_charge_id)).livemode,false)
const refunds=await stripe.refunds.list({charge:escrow.stripe_charge_id,limit:100})
const result={at:new Date().toISOString(),fixture,realStripe:true,readOnly:true,refund:{id:refund.id,status:refund.status,amount:refund.amount,failureReason:refund.failure_reason},local:{state:escrow.estado,liquidation:escrow.liquidacion_estado,refundStatus:escrow.stripe_refund_status,jobState:job.estado,split:{refund:escrow.monto_reembolsado,fee:escrow.comision_cliente_retenida,net:escrow.pago_neto_proveedor},claim:escrow.liquidacion_operacion_id},refunds:refunds.data.map(r=>({id:r.id,status:r.status,amount:r.amount,predecessor:r.metadata.reintento_de??null})),checks:[]}
if(['failed','canceled'].includes(refund.status)) {
 assert.equal(escrow.stripe_refund_status,refund.status,'Wait for the real signed webhook or use the admin reconciliation UI')
 assert.equal(escrow.liquidacion_estado,'error')
 assert.equal(escrow.estado,'liquidando')
 assert.equal(escrow.fecha_reembolso,null)
 assert.equal(job.estado,'cancelado','Financial failure must not reopen the cancelled service')
 result.checks.push({name:'Real asynchronous refund failure is visible and actionable, with cancelled service preserved',pass:true})
} else result.pending='Stripe has not returned a terminal failure for the current refund; no failure or completed recovery is claimed.'
assert.equal(Number(escrow.monto_reembolsado),100)
assert.equal(Number(escrow.comision_cliente_retenida),10)
assert.equal(Number(escrow.pago_neto_proveedor),0)
assert.equal(escrow.stripe_transfer_id,null)
result.checks.push({name:'Original split is unchanged and no provider transfer exists',pass:true})
fs.writeFileSync(c.dir+'/pagos-refund-failed-resume.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
