// Isolated contract preconditions; payment is completed in the real TEST browser.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {parseEnv} from 'node:util'
import Stripe from 'stripe'
import {pagosContext} from './pagos-context.mjs'
const c=pagosContext('eur'),file=c.dir+'/pagos-eur-fixtures.json',env=parseEnv(fs.readFileSync(c.dir+'/.env.stripe-test.local','utf8'))
assert.ok(env.STRIPE_SECRET_KEY.startsWith('sk_test_'))
const stripe=new Stripe(env.STRIPE_SECRET_KEY),account=await stripe.accounts.retrieve()
assert.equal(account.id,'acct_1RaOmJKYWwuskZDc');assert.equal(account.default_currency,'eur');assert.equal((await stripe.balance.retrieve()).livemode,false)
const result=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{at:new Date().toISOString(),cohort:'eur',stripeAccount:account.id,precondition:'Contratos preparados mediante acciones HTTP reales; no prueba de contratación por navegador',jobs:[]}
const save=()=>fs.writeFileSync(file,JSON.stringify(result,null,2),{mode:0o600})
for(const kind of ['nominal','parcial','cancelacion','nominal_refresh']){
 let j=result.jobs.find(x=>x.kind===kind)
 if(!j){j={kind,...await c.createJob({ca:'CP',pa:'PP',label:`EUR ${kind}`})};result.jobs.push(j);save()}
 if(!j.sessionId){const cp=await c.client('CP');const route=`/pago/${j.trabajoId}`;await cp.request(route);const r=(await cp.call('crearPagoEscrow',[{trabajo_id:j.trabajoId}],{route})).value;c.ok(r,'crearPagoEscrow');j.sessionId=r.escrow.stripe_session_id;j.escrowId=r.escrow.id;j.url='http://localhost:3200'+route;save()}
 const s=await stripe.checkout.sessions.retrieve(j.sessionId);assert.equal(s.livemode,false);assert.equal(s.currency,'eur');assert.equal(s.amount_total,11000);j.paymentStatus=s.payment_status;save();console.log({kind,url:j.url,payment:j.paymentStatus})
}
