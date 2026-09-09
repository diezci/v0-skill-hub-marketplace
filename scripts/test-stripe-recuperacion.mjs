import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function load(file, dependencies) {
 const exports={}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,require:name=>{if(name==='server-only')return {};if(name in dependencies)return dependencies[name];throw new Error(`Unexpected dependency ${name}`)}})
 return exports
}
function fixture() {
 const refunds=[],transfers=[];let pending=false,failTransfer=false,disputed=false
 const stripe={
  paymentIntents:{retrieve:async()=>({currency:'eur',status:'succeeded',latest_charge:'ch_test',amount:11000,amount_received:11000})},
  charges:{retrieve:async()=>({id:'ch_test',disputed})},
  refunds:{list:async()=>({data:refunds,has_more:false}),retrieve:async id=>({...refunds.find(r=>r.id===id),status:pending?'pending':'succeeded'}),create:async p=>{const r={...p,id:'re_test',status:pending?'pending':'succeeded'};refunds.push(r);return r}},
  transfers:{list:async()=>({data:transfers,has_more:false}),retrieve:async id=>transfers.find(t=>t.id===id),create:async p=>{if(failTransfer)throw Error('Interrupted transfer');const t={...p,id:'tr_test',amount_reversed:0};transfers.push(t);return t}},
 }
 const m=load('lib/stripe-liquidacion.ts',{'@/lib/stripe':{stripe}})
 return {stripe,m,refunds,transfers,setPending:v=>pending=v,setFailTransfer:v=>failTransfer=v,setDisputed:v=>disputed=v}
}
const params={paymentIntentId:'pi_test',chargeId:'ch_test',connectedAccountId:'acct_test',transferGroup:'group_test',montoTotal:110,reembolsoCliente:40,netoProveedor:57,operacionId:'disputa_test',metadata:{escrow_id:'escrow_test'}}
let passed=0
const check=async(name,fn)=>{await fn();passed++;console.log(`PASS ${name}`)}
await check('Pending refund prevents payout, then resumes the same refund',async()=>{
 const f=fixture();f.setPending(true);await assert.rejects(()=>f.m.ejecutarLiquidacionStripe(params));assert.equal(f.transfers.length,0)
 f.setPending(false);await f.m.ejecutarLiquidacionStripe(params);assert.equal(f.refunds.length,1);assert.equal(f.transfers.length,1)
})
await check('Transfer failure after refund resumes without refunding twice',async()=>{
 const f=fixture();f.setFailTransfer(true);await assert.rejects(()=>f.m.ejecutarLiquidacionStripe(params));assert.equal(f.refunds.length,1)
 f.setFailTransfer(false);await f.m.ejecutarLiquidacionStripe(params);assert.equal(f.refunds.length,1);assert.equal(f.transfers.length,1)
})
await check('Database failure after Stripe movements recovers both original movements',async()=>{
 const f=fixture();let closes=0
 const fluent={update:()=>fluent,eq:()=>fluent,neq:async()=>({error:null})}
 const admin={from:()=>fluent,rpc:async()=>++closes===1?{error:Error('Database interrupted')}:{data:{ok:true}}}
 const m=load('lib/flujo-pagos.ts',{'@/lib/stripe':{stripe:f.stripe},'@/lib/stripe-liquidacion':f.m,'@/lib/ofertas-perdedoras':{}})
 const escrow={id:'escrow_test',trabajo_id:'job_test',stripe_payment_intent_id:'pi_test',stripe_charge_id:'ch_test',monto:110,monto_reembolsado:40,pago_neto_proveedor:57,stripe_transfer_group:'group_test',liquidacion_operacion_id:'disputa_test',liquidacion_contexto:{destino:'acct_test',tipo:'disputa'}}
 await assert.rejects(()=>m.liquidarPagoReclamado(admin,escrow));await m.liquidarPagoReclamado(admin,escrow)
 assert.equal(f.refunds.length,1);assert.equal(f.transfers.length,1)
})
await check('Stripe movement recovery scans beyond the first page before creating anything',async()=>{
 const f=fixture();await f.m.ejecutarLiquidacionStripe(params)
 f.stripe.refunds.list=async query=>query.starting_after?{data:f.refunds,has_more:false}:{data:[{id:'re_unrelated',metadata:{}}],has_more:true}
 f.stripe.transfers.list=async query=>query.starting_after?{data:f.transfers,has_more:false}:{data:[{id:'tr_unrelated',metadata:{}}],has_more:true}
 await f.m.ejecutarLiquidacionStripe(params);assert.equal(f.refunds.length,1);assert.equal(f.transfers.length,1)
})
await check('Bank dispute blocks every financial movement',async()=>{
 const f=fixture();f.setDisputed(true);await assert.rejects(()=>f.m.ejecutarLiquidacionStripe(params));assert.equal(f.refunds.length,0);assert.equal(f.transfers.length,0)
})
await check('Different recipient on retry cannot cause a second transfer',async()=>{
 const f=fixture();await f.m.ejecutarLiquidacionStripe(params)
 await assert.rejects(()=>f.m.ejecutarLiquidacionStripe({...params,connectedAccountId:'acct_changed'}));assert.equal(f.transfers.length,1)
})
await check('Expiration racing with a captured payment reconciles instead of cancelling the charge record',async()=>{
 const f=fixture();let reads=0;const calls=[]
 f.stripe.checkout={sessions:{retrieve:async()=>++reads===1?{id:'cs_test',status:'open',payment_status:'unpaid'}:{id:'cs_test',status:'complete',payment_status:'paid',amount_total:11000,currency:'eur',payment_intent:'pi_test',metadata:{escrow_id:'escrow_test'}},expire:async()=>{throw Error('Already paid')}}}
 const escrow={id:'escrow_test',trabajo_id:'job_test',cliente_id:'client',profesional_id:'pro',monto:110,stripe_session_id:'cs_test'}
 const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:escrow}),then:resolve=>resolve({data:[{id:'escrow_test',stripe_session_id:'cs_test'}]})}
 const admin={from:()=>query,rpc:async(name,args)=>{calls.push(name);return {data:{escrow:{...escrow,estado:'completado'},activado:false,tardio:false}}}}
 const m=load('lib/flujo-pagos.ts',{'@/lib/stripe':{stripe:f.stripe},'@/lib/stripe-liquidacion':f.m,'@/lib/ofertas-perdedoras':{}})
 await m.cerrarCheckoutsPendientes(admin,'job_test');assert.deepEqual(calls,['diime_confirmar_pago'])
})
await check('Asynchronous unpaid Checkout remains blocked until Stripe resolves it',async()=>{
 const f=fixture();f.stripe.checkout={sessions:{retrieve:async()=>({id:'cs_test',status:'complete',payment_status:'unpaid'})}}
 const query={select:()=>query,eq:()=>query,then:resolve=>resolve({data:[{id:'escrow_test',stripe_session_id:'cs_test'}]})}
 const admin={from:()=>query,rpc:async()=>{throw Error('Should not mark as cancelled')}}
 const m=load('lib/flujo-pagos.ts',{'@/lib/stripe':{stripe:f.stripe},'@/lib/stripe-liquidacion':f.m,'@/lib/ofertas-perdedoras':{}})
 await assert.rejects(()=>m.cerrarCheckoutsPendientes(admin,'job_test'),/procesando/)
})
console.log(`${passed} isolated Stripe recovery scenarios passed (no network calls).`)
