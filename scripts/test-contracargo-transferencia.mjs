import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=ts.transpileModule(fs.readFileSync('lib/stripe-contracargos.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function fixture(opt={}){
 const e={id:'escrow',trabajo_id:'job',stripe_transfer_id:'tr',stripe_charge_id:'ch',stripe_transfer_group:'group',liquidacion_operacion_id:'op',pago_neto_proveedor:90,liquidacion_contexto:{destino:'acct'}}
 const bank={id:'du',status:'lost',currency:'eur',livemode:false,...opt.bank},transfer={id:'tr',amount:9000,currency:'eur',livemode:false,destination:'acct',source_transaction:'ch',transfer_group:'group',metadata:{escrow_id:'escrow',liquidacion_operacion_id:'op'},amount_reversed:0,...opt.transfer},r={id:'trr',transfer:'tr',amount:9000,currency:'eur',metadata:{stripe_disputa_id:'du',escrow_id:'escrow'}}
 const calls=[],stripe={transfers:{retrieve:async()=>transfer,listReversals:async function*(){for(const v of opt.reversals??[])yield{...r,...v}},createReversal:async(id,body,options)=>{calls.push({id,body,options});return r}}},exports={};vm.runInNewContext(source,{exports,require:n=>n==='@/lib/stripe'?{stripe}:{} });return{calls,run:()=>exports.recuperarTransferenciaContracargo(bank,e,async()=>{if(opt.revoked)throw Error("Revoked during history read")})}
}
let count=0
const test=async(n,f)=>{await f();console.log('PASS '+n);count++}
await test('Verified lost dispute recovers exactly the original net with a stable bank-specific key',async()=>{const f=fixture();assert.equal(await f.run(),'trr');assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.amount,9000);assert.equal(f.calls[0].options.idempotencyKey,'diime-contracargo-du-recuperacion')})
await test('Won or open proceedings never reverse money',async()=>{for(const status of ['won','needs_response']){const f=fixture({bank:{status}});assert.equal(await f.run(),null);assert.equal(f.calls.length,0)}})
await test('Original charge destination amount mode currency group and claim must all match',async()=>{for(const transfer of [{source_transaction:'foreign'},{destination:'foreign'},{amount:8999},{livemode:true},{currency:'usd'},{transfer_group:'foreign'},{metadata:{liquidacion_operacion_id:'other',escrow_id:'escrow'}}]){const f=fixture({transfer});await assert.rejects(f.run);assert.equal(f.calls.length,0)}})
await test('Paginated recorded reversal is recovered without another movement',async()=>{const f=fixture({reversals:[{}],transfer:{amount_reversed:9000}});assert.equal(await f.run(),'trr');assert.equal(f.calls.length,0)})
await test('Ambiguous partial foreign and duplicate recoveries stop without creating money',async()=>{for(const opt of [{transfer:{amount_reversed:1}},{reversals:[{amount:8000}]},{reversals:[{metadata:{stripe_disputa_id:'other'}}]},{reversals:[{},{}]}]){const f=fixture(opt);await assert.rejects(f.run);assert.equal(f.calls.length,0)}})
await test('Revocation during Stripe history reads prevents the following money movement',async()=>{const f=fixture({revoked:true});await assert.rejects(f.run);assert.equal(f.calls.length,0)})
console.log(count+' bank-transfer recovery tests passed; no network')
