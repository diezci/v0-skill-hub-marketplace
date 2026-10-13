import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const ID='00000000-0000-4000-8000-000000000001'
function fixture(options={}){
 const calls=[];const pago={id:ID,stripe_refund_id:'re_old',stripe_refund_status:'failed',stripe_payment_intent_id:'pi',stripe_charge_id:'ch',liquidacion_operacion_id:'op',monto_reembolsado:100,liquidacion_estado:'error',...options.pago};
 const refund={id:'re_old',status:'failed',failure_reason:'insufficient_funds',currency:'eur',amount:10000,payment_intent:'pi',charge:'ch',metadata:{liquidacion_operacion_id:'op'},...options.refund};
 const query=data=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data,error:null})};return q};
 const session={auth:{getUser:async()=>({data:{user:options.visitor?null:{id:'admin'}}})},from:()=>query({es_admin:options.nonAdmin?false:true})};
 const admin={from:()=>query(pago),rpc:async(name,args)=>{calls.push({name,args});if(options.changed&&name==='diime_autorizar_reintento_reembolso')return{error:{message:'changed'}};return{data:{...pago,stripe_refund_reintento_de:refund.id},error:null}}};
 const deps={'@/lib/supabase/server':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>{calls.push({name:'privileged'});return admin}},'@/lib/stripe':{stripe:{refunds:{retrieve:async()=>{calls.push({name:'stripe.read'});return refund}},charges:{retrieve:async()=>({disputed:!!options.disputed})}}},'@/lib/i18n-servidor':{textoServidor:async s=>s},'@/lib/notificaciones-contexto':{idNotificacionValido:s=>s===ID},'@/lib/flujo-pagos':{liquidarPagoReclamado:async(_admin,e)=>{calls.push({name:'settle',escrow:e});if(options.settlementError)throw Error('pending')}}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/actions/admin-pagos.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>deps[n]});return{calls,run:(expected='re_old')=>exports.reintentarReembolsoAdmin(ID,expected)};
}
let passed=0;async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
await check('Visitor and nonadmin are rejected before privileged client or Stripe',async()=>{for(const opt of [{visitor:true},{nonAdmin:true}]){const f=fixture(opt);assert.ok((await f.run()).error);assert.equal(f.calls.length,0)}})
await check('Explicit authorization persists current Stripe failure, audit actor and frozen operation before settlement',async()=>{const f=fixture();assert.equal((await f.run()).success,true);assert.deepEqual(f.calls.map(c=>c.name),['privileged','stripe.read','diime_registrar_estado_reembolso','diime_autorizar_reintento_reembolso','settle']);assert.equal(f.calls[3].args.p_actor,'admin');assert.equal(f.calls[3].args.p_refund,'re_old');assert.equal(f.calls[4].escrow.liquidacion_operacion_id,'op')})
await check('Stale button and completed or disputed payment cannot authorize money',async()=>{for(const options of [{pago:{stripe_refund_id:'re_new'}},{pago:{liquidacion_estado:'completada'}},{pago:{stripe_disputa_id:'dp'}}]){const f=fixture(options);assert.ok((await f.run()).error);assert.equal(f.calls.filter(c=>c.name.startsWith('diime_')).length,0)}})
await check('Authoritative pending, succeeded and requires_action states cannot be retried',async()=>{for(const status of ['pending','succeeded','requires_action']){const f=fixture({refund:{status}});assert.ok((await f.run()).error);assert.equal(f.calls.filter(c=>c.name==='settle').length,0)}})
await check('A charge dispute or dispute-related terminal failure blocks authorization',async()=>{for(const options of [{disputed:true},{refund:{failure_reason:'charge_for_pending_refund_disputed'}}]){const f=fixture(options);assert.ok((await f.run()).error);assert.equal(f.calls.filter(c=>c.name.startsWith('diime_')).length,0)}})
await check('Foreign amount, payment, charge, operation or currency cannot substitute a Refund',async()=>{for(const refund of [{amount:9000},{payment_intent:'other'},{charge:'other'},{metadata:{liquidacion_operacion_id:'other'}},{currency:'usd'}]){const f=fixture({refund});assert.ok((await f.run()).error);assert.equal(f.calls.filter(c=>c.name.startsWith('diime_')).length,0)}})
await check('A concurrent state change rejected by SQL prevents settlement',async()=>{const f=fixture({changed:true});assert.ok((await f.run()).error);assert.equal(f.calls.filter(c=>c.name==='settle').length,0)})
await check('Incomplete replacement returns controlled recovery message without claiming success',async()=>{const f=fixture({settlementError:true});const r=await f.run();assert.ok(r.error);assert.equal(r.success,undefined)})
console.log(`${passed} explicit admin refund recovery tests passed (no network).`)
