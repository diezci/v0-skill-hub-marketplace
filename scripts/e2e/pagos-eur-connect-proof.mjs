import fs from 'node:fs'
import assert from 'node:assert/strict'
import {parseEnv} from 'node:util'
import Stripe from 'stripe'
import {pagosContext} from './pagos-context.mjs'
const c=pagosContext('eur'), env=parseEnv(fs.readFileSync(c.dir+'/.env.stripe-test.local','utf8'))
assert.ok(env.STRIPE_SECRET_KEY.startsWith('sk_test_'))
const stripe=new Stripe(env.STRIPE_SECRET_KEY)
assert.equal((await stripe.balance.retrieve()).livemode,false)
const empresaId=c.fixture.companies.proveedor.id
const read=async()=>{const r=await c.admin.from('empresa_cuentas_stripe').select('*').eq('empresa_id',empresaId).single();if(r.error)throw r.error;return r.data}
const before=await read(),account=await stripe.accounts.retrieve(before.stripe_account_id)
assert.equal(account.type,'express');assert.equal(account.country,'ES');assert.equal(account.business_type,'company');assert.equal(account.metadata.diime_empresa_id,empresaId)
assert.equal(account.details_submitted,true);assert.equal(account.payouts_enabled,true);assert.equal(account.capabilities.transfers,'active');assert.deepEqual(account.requirements.currently_due,[])
const personal=await c.row('profesionales',c.fixture.users.PP.id)
assert.notEqual(account.id,personal.stripe_account_id)
const owner=await c.client('PE_TITULAR');await owner.request('/mi-empresa')
const state=(await owner.call('obtenerEstadoStripeConnectEmpresa',[empresaId],{route:'/mi-empresa'})).value
c.ok(state,'estado empresa');assert.equal(state.data.onboardingCompletado,true);assert.equal(state.data.transferenciasHabilitadas,true);assert.equal(state.data.payoutsHabilitados,true)
const links=[]
for(const name of ['crearEnlaceOnboardingStripeEmpresa','crearEnlaceOnboardingStripeEmpresa','crearEnlaceDashboardStripeEmpresa']){
 const r=(await owner.call(name,[empresaId],{route:'/mi-empresa'})).value
 c.ok(r,name);assert.ok(r.data.url.startsWith('https://connect.stripe.com/'));assert.equal((await read()).stripe_account_id,account.id)
 links.push({name,url:r.data.url})
}
fs.writeFileSync(c.dir+'/eur-empresa-links.private.json',JSON.stringify(links,null,2),{mode:0o600})
const result={at:new Date().toISOString(),company:empresaId,accountId:account.id,type:account.type,businessType:account.business_type,country:account.country,detailsSubmitted:account.details_submitted,payoutsEnabled:account.payouts_enabled,transfers:account.capabilities.transfers,requirements:account.requirements.currently_due,personalAccountSeparate:true,repeatedOnboardingRetainsId:true,dashboardGrantedToOwner:true,applicationState:state.data,database:await read()}
fs.writeFileSync(c.dir+'/eur-empresa-onboarding-proof.json',JSON.stringify(result,null,2));console.log({company:empresaId,account:account.id,companyOnboarding:'passed',repeat:'same account',mode:'TEST EUR'})
