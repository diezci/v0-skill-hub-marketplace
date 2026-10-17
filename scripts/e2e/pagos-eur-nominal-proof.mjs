import fs from 'node:fs'
import assert from 'node:assert/strict'
import {parseEnv} from 'node:util'
import Stripe from 'stripe'
import {pagosContext} from './pagos-context.mjs'
const c=pagosContext('eur'),env=parseEnv(fs.readFileSync(c.dir+'/.env.stripe-test.local','utf8')),stripe=new Stripe(env.STRIPE_SECRET_KEY)
assert.ok(env.STRIPE_SECRET_KEY.startsWith('sk_test_'));assert.equal((await stripe.balance.retrieve()).livemode,false)
const kind=process.argv[2]||'nominal'
const company=kind.startsWith('empresa_')
const manifest=process.argv[3]||(company?'pagos-eur-company-fixtures.json':'pagos-eur-fixtures.json')
assert.match(manifest,/^[a-z0-9_-]+\.json$/)
const f=JSON.parse(fs.readFileSync(c.dir+'/'+manifest)).jobs.find(j=>j.kind===kind)
assert.ok(f,'Fixture kind exists')
const job=await c.row('trabajos',f.trabajoId),esc=await c.row('transacciones_escrow',f.escrowId),request=await c.row('solicitudes',f.solicitudId)
assert.equal(job.estado,'completado');assert.equal(request.estado,'completada');assert.equal(esc.estado,'completado');assert.equal(esc.liquidacion_estado,'completada')
assert.equal(Number(esc.monto),110);assert.equal(Number(esc.pago_neto_proveedor),90);assert.equal(Number(esc.retencion_plataforma),20)
const transfers=await stripe.transfers.list({transfer_group:`diime_trabajo_${job.id}`,limit:100});assert.equal(transfers.has_more,false);assert.equal(transfers.data.length,1)
const tr=transfers.data[0];assert.equal(tr.id,esc.stripe_transfer_id);assert.equal(tr.amount,9000);assert.equal(tr.currency,'eur');assert.equal(tr.source_transaction,esc.stripe_charge_id);assert.equal(tr.destination,job.proveedor_stripe_account_id);assert.equal(tr.livemode,false)
if(f.expectedDestination)assert.equal(tr.destination,f.expectedDestination)
const charge=await stripe.charges.retrieve(esc.stripe_charge_id,{expand:['balance_transaction']});assert.equal(charge.balance_transaction.currency,'eur');assert.equal(charge.balance_transaction.exchange_rate,null)
const notes=await c.admin.from('notificaciones').select('id,usuario_id,tipo,mensaje').eq('metadata->>trabajo_id',job.id);assert.ifError(notes.error)
for(const [tipo,alias] of [['pago_recibido',f.pa],['trabajo_entregado',f.ca],['pago_liberado',f.pa]])assert.ok(notes.data.some(n=>n.tipo===tipo&&n.usuario_id===c.fixture.users[alias].id),tipo)
const history=await c.admin.from('actualizaciones_trabajo').select('id,usuario_id,tipo,mensaje,progreso').eq('trabajo_id',job.id);assert.ifError(history.error);assert.equal(history.data.filter(h=>h.tipo==='entrega').length,1)
if(company){assert.equal(esc.actor_pago_id,c.fixture.users[f.ca].id);assert.equal(job.empresa_cliente_id,c.fixture.companies.cliente.id);assert.equal(job.empresa_proveedora_id,c.fixture.companies.proveedor.id);assert.equal(job.actor_contratacion_id,c.fixture.users[f.ca].id);assert.equal(job.operador_cliente_id,c.fixture.users[f.ca].id);assert.equal(job.operador_proveedor_id,c.fixture.users[f.pa].id);assert.equal(tr.destination,'acct_1UQSUwKTJ1adPoG5')}
const result={at:new Date().toISOString(),readOnly:true,fixture:f,jobState:job.estado,requestState:request.estado,escrowState:esc.estado,settlementState:esc.liquidacion_estado,amount:110,providerNet:90,platformRetention:20,transfer:{id:tr.id,destination:tr.destination,currency:tr.currency,amount:tr.amount,source:tr.source_transaction,livemode:tr.livemode},transfers:1,chargeCurrency:charge.balance_transaction.currency,exchangeRate:null,notifications:notes.data,history:history.data}
fs.writeFileSync(c.dir+`/eur-${f.kind}-full-proof.json`,JSON.stringify(result,null,2));console.log({kind:f.kind,status:'passed',transfer:tr.id,amount:90,currency:'eur',notifications:notes.data.length})
