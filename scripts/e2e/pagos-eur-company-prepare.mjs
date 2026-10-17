// Contract/permission preconditions only. No browser completion is inferred here.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {parseEnv} from 'node:util'
import Stripe from 'stripe'
import {pagosContext} from './pagos-context.mjs'
const c=pagosContext('eur'),env=parseEnv(fs.readFileSync(c.dir+'/.env.stripe-test.local','utf8'))
assert.ok(env.STRIPE_SECRET_KEY.startsWith('sk_test_'))
const stripe=new Stripe(env.STRIPE_SECRET_KEY);assert.equal((await stripe.balance.retrieve()).livemode,false)
assert.equal((await stripe.accounts.retrieve()).default_currency,'eur')
const file=c.dir+'/pagos-eur-company-fixtures.json'
const result=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{at:new Date().toISOString(),cohort:'eur',precondition:'Contratos mediante acciones reales y permisos de fixture; pagos y flujos aún pendientes de navegador',permissions:[],jobs:[]}
const save=()=>fs.writeFileSync(file,JSON.stringify(result,null,2),{mode:0o600})
for(const alias of ['CE_MIEMBRO','PE_MIEMBRO']){
 const company=c.fixture.companies[alias.startsWith('CE')?'cliente':'proveedor'].id,uid=c.fixture.users[alias].id
 const {data,error}=await c.admin.from('empresa_miembros').select('*').eq('empresa_id',company).eq('usuario_id',uid).single();if(error)throw error
 if(!result.permissions.find(x=>x.alias===alias)){result.permissions.push({alias,company,user:uid,original:data.permisos});save()}
 const r=await c.admin.from('empresa_miembros').update({permisos:{...data.permisos,ver_cobros:true,gestionar_cobros:true}}).eq('empresa_id',company).eq('usuario_id',uid);if(r.error)throw r.error
}
for(const role of ['TITULAR','ADMIN','MIEMBRO']){
 const kind='empresa_'+role.toLowerCase();let j=result.jobs.find(x=>x.kind===kind)
 if(!j){j={kind,...await c.createJob({ca:'CE_'+role,pa:'PE_'+role,label:`EUR ${kind}`})};result.jobs.push(j);save()}
 if(!j.sessionId){const cp=await c.client(j.ca),route=`/pago/${j.trabajoId}`;await cp.request(route);const r=(await cp.call('crearPagoEscrow',[{trabajo_id:j.trabajoId}],{route})).value;c.ok(r,'crearPagoEscrow');j.sessionId=r.escrow.stripe_session_id;j.escrowId=r.escrow.id;j.url='http://localhost:3200'+route;save()}
 const s=await stripe.checkout.sessions.retrieve(j.sessionId);assert.equal(s.livemode,false);assert.equal(s.currency,'eur');assert.equal(s.amount_total,11000);j.paymentStatus=s.payment_status;save();console.log({kind,url:j.url,payment:j.paymentStatus})
}
