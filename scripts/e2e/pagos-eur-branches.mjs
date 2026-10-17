// Real HTTP/Stripe TEST checks after the browser pays each separate contract.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {parseEnv} from 'node:util'
import Stripe from 'stripe'
import {pagosContext} from './pagos-context.mjs'
const kind=process.argv[2];assert.ok(['parcial','cancelacion'].includes(kind))
const c=pagosContext('eur'),env=parseEnv(fs.readFileSync(c.dir+'/.env.stripe-test.local','utf8')),stripe=new Stripe(env.STRIPE_SECRET_KEY)
assert.ok(env.STRIPE_SECRET_KEY.startsWith('sk_test_'));assert.equal((await stripe.accounts.retrieve()).id,'acct_1RaOmJKYWwuskZDc');assert.equal((await stripe.balance.retrieve()).livemode,false)
const f=JSON.parse(fs.readFileSync(c.dir+'/pagos-eur-fixtures.json')).jobs.find(j=>j.kind===kind),proof=c.dir+`/eur-${kind}-api-proof.json`
assert.equal((await stripe.checkout.sessions.retrieve(f.sessionId)).payment_status,'paid')
let job=await c.row('trabajos',f.trabajoId),esc=await c.row('transacciones_escrow',f.escrowId)
assert.equal(job.estado,'en_progreso');assert.equal(esc.estado,'fondos_retenidos')
const checks=[],events=[];let detail={};const save=()=>fs.writeFileSync(proof,JSON.stringify({at:new Date().toISOString(),kind,fixture:f,level:'api_e2e',testOnly:true,checks,detail},null,2))
const refunds=()=>stripe.refunds.list({charge:esc.stripe_charge_id,limit:100}),transfers=()=>stripe.transfers.list({transfer_group:`diime_trabajo_${job.id}`,limit:100})
async function check(caseId,alias,label,scope,fn){const r={caseId,alias,roleKey:c.fixture.users[alias].roleKey,label,scope,at:new Date().toISOString()};try{r.observation=await fn();r.pass=true}catch(e){r.pass=false;r.error=e.message;throw e}finally{checks.push(r);save();console.log(r)}}
if(kind==='parcial'){
 const d=c.ok(await c.call('CP','crearDisputa',[{trabajo_id:job.id,motivo:'Discrepancia sintética de alcance: solicito mediación de 40 o 60 euros.'}]),'crearDisputa');detail.disputeId=d.id;save()
 await check('T-137','CP','Disputa pagada congela los fondos y deniega confirmación', 'partial',async()=>{esc=await c.row('transacciones_escrow',f.escrowId);assert.equal(esc.estado,'disputa');assert.equal((await c.row('trabajos',job.id)).estado,'en_disputa');assert.ok((await c.call('CP','confirmarTrabajoCompletado',[job.id])).error);assert.equal((await refunds()).data.length,0);assert.equal((await transfers()).data.length,0);return{funds:esc.estado,refunds:0,transfers:0}})
 await check('T-151','AD','Importes fuera del servicio se rechazan sin movimientos', 'partial',async()=>{for(const amount of [-1,101])assert.ok((await c.call('AD','resolverDisputa',[{disputa_id:d.id,resolucion:'parcial',monto_reembolso:amount,nota:'Importe inválido de prueba'}])).error);assert.equal((await refunds()).data.length,0);assert.equal((await transfers()).data.length,0);return{denied:[-1,101]}})
 await check('T-154','AD','Dos admins con decisiones distintas conservan una sola ganadora, nota y reparto', 'full',async()=>{
  const admins=await Promise.all(['AD','AD2'].map(a=>c.client(a)));for(const a of admins)await a.request('/admin/disputas')
  const proposals=[40,60],answers=await Promise.all(admins.map((client,i)=>client.call('resolverDisputa',[{disputa_id:d.id,resolucion:'parcial',monto_reembolso:proposals[i],nota:`QA EUR reparto ${proposals[i]}`}],{route:'/admin/disputas'}).then(r=>r.value)))
  const winners=answers.map((r,i)=>!r.error?i:-1).filter(i=>i>=0);assert.equal(winners.length,1,JSON.stringify(answers));const win=winners[0],amount=proposals[win]
  esc=await c.row('transacciones_escrow',f.escrowId);assert.equal(Number(esc.monto_reembolsado),amount);assert.equal(esc.liquidacion_contexto.nota,`QA EUR reparto ${amount}`);assert.equal(esc.liquidacion_contexto.actor,c.fixture.users[win===0?'AD':'AD2'].id);assert.equal(esc.liquidacion_estado,'completada');assert.equal((await c.row('disputas',d.id)).estado,'resuelta')
  const rr=await refunds(),tt=await transfers();assert.equal(rr.data.length,1);assert.equal(tt.data.length,1);assert.equal(rr.data[0].amount,amount*100);assert.equal(rr.data[0].status,'succeeded');assert.equal(tt.data[0].amount,(100-amount)*90);assert.equal(tt.data[0].currency,'eur');assert.equal(tt.data[0].source_transaction,esc.stripe_charge_id);assert.equal(tt.data[0].destination,job.proveedor_stripe_account_id);assert.equal(tt.data[0].livemode,false);assert.equal(Number(esc.retencion_plataforma)+Number(esc.monto_reembolsado)+Number(esc.pago_neto_proveedor),110)
  detail.money={refund:amount,providerNet:Number(esc.pago_neto_proveedor),platformRetention:Number(esc.retencion_plataforma),refundId:rr.data[0].id,transferId:tt.data[0].id};return{answers,winner:win===0?'AD':'AD2',...detail.money}
 })
}else{
 c.ok(await c.call('CP','solicitarCancelacion',[job.id,'Cancelación sintética pagada EUR por cambio de fecha.']),'cancelacion');const first=(await c.row('trabajos',job.id)).cancelacion_revision
 c.ok(await c.call('CP','editarSolicitudCancelacion',[job.id,'Cancelación sintética EUR revisada: devolver el servicio y conservar gastos.']),'edit');const revision=(await c.row('trabajos',job.id)).cancelacion_revision
 await check('T-134','PP','Una aceptación obsoleta no reembolsa', 'partial',async()=>{assert.ok((await c.call('PP','responderCancelacion',[job.id,true,'',[],first])).error);assert.equal((await refunds()).data.length,0);assert.equal((await c.row('transacciones_escrow',f.escrowId)).estado,'fondos_retenidos');return{refunds:0}})
 await check('T-121','PP','Dos aceptaciones del acuerdo actual devuelven 100 EUR una sola vez', 'partial',async()=>{const answers=await Promise.all([c.call('PP','responderCancelacion',[job.id,true,'',[],revision]),c.call('PP','responderCancelacion',[job.id,true,'',[],revision])]);assert.ok(answers.some(r=>!r.error),JSON.stringify(answers));esc=await c.row('transacciones_escrow',f.escrowId);job=await c.row('trabajos',job.id);const rr=await refunds();assert.equal(rr.data.length,1);assert.equal(rr.data[0].amount,10000);assert.equal(rr.data[0].status,'succeeded');assert.equal(esc.estado,'reembolsado');assert.equal(esc.liquidacion_estado,'completada');assert.equal(Number(esc.comision_cliente_retenida),10);assert.equal(job.estado,'cancelado');assert.equal((await transfers()).data.length,0);detail.money={refund:100,clientFeeRetained:10,refundId:rr.data[0].id,transfers:0};return{answers,...detail.money}})
 await check('PA-023','AD','Consulta repetida reconcilia el reembolso TEST sin duplicarlo', 'partial',async()=>{for(let i=0;i<3;i++){const r=c.ok(await c.call('AD','comprobarReembolsoAdmin',[esc.id]),'check refund');assert.equal(r.estado,'succeeded');assert.equal(r.importe,100);assert.equal(r.modoReal,false)}assert.equal((await refunds()).data.length,1);return{queries:3,refunds:1,amount:100}})
}
for(const r of checks)events.push({eventId:`root-EUR-${kind}-${r.caseId}-${r.alias}`,caseId:r.caseId,roleKey:r.roleKey,level:'api_e2e',scope:r.scope,status:r.pass?'pass':'fail',at:r.at,environment:{baseUrl:'http://127.0.0.1:3200',stripe:'TEST EUR'},assertions:[{name:r.label,pass:r.pass}],stepsPending:r.scope==='full'?[]:['Resto de variantes originales e interfaz del rol'],evidence:[{layer:'api',path:proof.split('/').at(-1)}]})
for(const e of events)fs.appendFileSync(c.dir+'/root-continuation-events.jsonl',JSON.stringify(e)+'\n')
console.log({kind,checks:checks.length,pass:checks.filter(c=>c.pass).length})
