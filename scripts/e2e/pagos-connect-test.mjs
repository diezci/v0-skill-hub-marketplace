// Run real local Next actions against Stripe TEST. Does not fake onboarding completion.
import fs from'node:fs'
import path from'node:path'
import assert from'node:assert/strict'
import{parseEnv}from'node:util'
import Stripe from'stripe'
import{createClient}from'@supabase/supabase-js'
import{actionClient,requireLoopback}from'./http-action-client.mjs'
const dir=path.resolve('.build/e2e-20261014'),env=parseEnv(fs.readFileSync(path.join(dir,'.env.supabase-local'),'utf8')),se=parseEnv(fs.readFileSync(path.join(dir,'.env.stripe-test.local'),'utf8'))
const cohort=process.argv[2]||'';assert.match(cohort,/^[a-z0-9-]*$/);const suffix=cohort?`-${cohort}`:''
requireLoopback(env.NEXT_PUBLIC_SUPABASE_URL);if(!se.STRIPE_SECRET_KEY?.startsWith('sk_test_'))throw Error('TEST_KEY_REQUIRED')
const stripe=new Stripe(se.STRIPE_SECRET_KEY);assert.equal((await stripe.balance.retrieve()).livemode,false)
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),fixture=JSON.parse(fs.readFileSync(path.join(dir,`fixture-manifest${suffix}.json`))),credentials=JSON.parse(fs.readFileSync(path.join(dir,`local-credentials${suffix}.json`)))
const checks=[],links=[]
for(const alias of ['PP','PE_TITULAR']){
 const user=credentials.users[alias],company=alias==='PE_TITULAR',c=actionClient({baseUrl:env.NEXT_PUBLIC_SITE_URL,supabaseUrl:env.NEXT_PUBLIC_SUPABASE_URL,anonKey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY});assert.equal(await c.login(user.email,user.password),user.id)
 const route=company?'/mi-empresa':'/cobros';await c.request(route)
 const name=company?'crearEnlaceOnboardingStripeEmpresa':'crearEnlaceOnboardingStripe',args=company?[fixture.companies.proveedor.id]:[]
 const first=await c.call(name,args,{route});if(first.value.error)throw Error(`${alias}: ${first.value.error}`)
 assert.equal(new URL(first.value.data.url).origin,'https://connect.stripe.com')
 const read=()=>company?admin.from('empresa_cuentas_stripe').select('stripe_account_id').eq('empresa_id',fixture.companies.proveedor.id).single():admin.from('profesionales').select('stripe_account_id').eq('id',user.id).single()
 const {data,error}=await read();if(error)throw error;assert.ok(data.stripe_account_id)
 const account=await stripe.accounts.retrieve(data.stripe_account_id);assert.equal(account.type,'express');assert.equal(account.country,'ES');assert.equal(account.business_type,company?'company':'individual');assert.equal(account.metadata[company?'diime_empresa_id':'diime_profesional_id'],company?fixture.companies.proveedor.id:user.id)
 const repeat=await c.call(name,args,{route});assert.ok(repeat.value.data?.url);assert.equal((await read()).data.stripe_account_id,account.id)
 const row={caseId:company?'PA-001':'E-11',caseIds:company?['PA-001']:['E-11','T-018'],roleKey:fixture.users[alias].roleKey,alias,level:'api_e2e_stripe_test',status:'pass',assertion:'Acción real autenticada crea cuenta Express ES de identidad correcta, registra ID DB y reintento conserva cuenta',accountId:account.id,detailsSubmitted:account.details_submitted,payoutsEnabled:account.payouts_enabled,transfers:account.capabilities?.transfers,requirements:account.requirements?.currently_due,limitation:'No cubre formulario Stripe ni completar onboarding; enlaces se guardan solo en fichero0600.'}
 checks.push(row);links.push({alias,accountId:account.id,url:repeat.value.data.url});fs.writeFileSync(path.join(dir,`pagos-connect${suffix}-links.private.json`),JSON.stringify(links,null,2),{mode:0o600});fs.writeFileSync(path.join(dir,`pagos-connect${suffix}-api.json`),JSON.stringify({checks},null,2));console.log(JSON.stringify(row))
}
