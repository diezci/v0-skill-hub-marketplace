// Fault injection is limited to new disposable contracts in the isolated local DB.
// Payment rows are SQL preconditions, not evidence of a Stripe checkout.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {pagosContext} from './pagos-context.mjs'
import {localFixture} from './local-client-fixtures.mjs'
const phase=process.argv[2];assert.ok(['before','after'].includes(phase))
const c=pagosContext('eur'),f=await localFixture('eur'),run=`delivery-history-${phase}-${Date.now()}`,jobs=[],checks=[]
const trigger='qa_e2e_delivery_history_fail',fn='diime_private.qa_e2e_delivery_history_fail'
try{
 for(const pa of ['PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO']){
  const j=await c.createJob({ca:'CP2',pa,label:run+' '+pa});jobs.push(j)
  await f.db.query("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,estado,fecha_retencion) values($1,$2,$3,110,100,10,10,10,90,'fondos_retenidos',now())",[j.trabajoId,c.fixture.users.CP2.id,c.fixture.users[pa].id])
  await f.db.query("update trabajos set estado='en_progreso',progreso=0,pago_bloqueado=false where id=$1",[j.trabajoId])
 }
 if(phase==='after'){
  for(const alias of ['VIS','CP2','AJ','AD']){
   const actor=await f.client(alias,['/mis-trabajos'])
   const denied=await actor.supabase.rpc('entregar_trabajo_con_historial',{p_trabajo_id:jobs[0].trabajoId,p_mensaje:'Intento no autorizado'})
   assert.equal(denied.error?.code,'42501',alias+' must not use delivery RPC')
  }
  assert.equal((await c.row('trabajos',jobs[0].trabajoId)).estado,'en_progreso')
 }
 const ids=jobs.map(j=>{assert.match(j.trabajoId,/^[a-f0-9-]{36}$/);return `'${j.trabajoId}'::uuid`}).join(',')
 await f.db.query(`create or replace function ${fn}() returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'QA_HISTORY_INSERT_FAILURE'; end $$; create trigger ${trigger} before insert on public.actualizaciones_trabajo for each row when(new.tipo='entrega' and new.trabajo_id=any(array[${ids}])) execute function ${fn}()`)
 for(const j of jobs){
  const response=await c.call(j.pa,'marcarTrabajoEntregado',[j.trabajoId,'Mensaje de entrega que debe conservarse '+run])
  const job=await c.row('trabajos',j.trabajoId)
  const history=(await f.db.query("select id from actualizaciones_trabajo where trabajo_id=$1 and tipo='entrega'",[j.trabajoId])).rows
  const notices=(await f.db.query("select id from notificaciones where metadata->>'trabajo_id'=$1 and tipo='trabajo_entregado'",[j.trabajoId])).rows
  const pass=!!response.error&&job.estado==='en_progreso'&&job.progreso===0&&history.length===0&&notices.length===0
  checks.push({alias:j.pa,roleKey:c.fixture.users[j.pa].roleKey,job:j.trabajoId,responseError:response.error||null,responseReportedSuccess:!!response.data,state:job.estado,progress:job.progreso,deliveryHistory:history.length,deliveryNotices:notices.length,pass})
  console.log({actor:j.pa,controlledFailureAtomic:pass,jobState:job.estado,responseError:response.error||null})
 }
}finally{
 await f.db.query(`drop trigger if exists ${trigger} on public.actualizaciones_trabajo; drop function if exists ${fn}()`)
 if(phase==='after')for(const j of jobs){
  const before=checks.find(x=>x.job===j.trabajoId);if(!before?.pass)continue
  const text='Mensaje recuperado al reintentar '+run
  const pair=await Promise.all([c.call(j.pa,'marcarTrabajoEntregado',[j.trabajoId,text]),c.call(j.pa,'marcarTrabajoEntregado',[j.trabajoId,text])])
  const history=(await f.db.query("select mensaje,usuario_id from actualizaciones_trabajo where trabajo_id=$1 and tipo='entrega'",[j.trabajoId])).rows
  const job=await c.row('trabajos',j.trabajoId)
  before.retry={responses:pair.map(r=>({error:r.error||null,success:!!r.data})),state:job.estado,history}
  before.retryPassed=pair.filter(r=>r.data&&!r.error).length===1&&job.estado==='entregado'&&history.length===1&&history[0].mensaje===text&&history[0].usuario_id===c.fixture.users[j.pa].id
  before.pass&&=before.retryPassed
 }
 await f.db.end()
 const path=run+'.json';fs.writeFileSync(c.dir+'/'+path,JSON.stringify({run,phase,jobs,checks,limitations:['SQL paid-state fixtures, no Stripe calls; real authenticated Next/PostgREST delivery actions. Browser checks registered separately.'],faultTriggerRemoved:true},null,2))
 const events=c.dir+'/root-continuation-events.jsonl'
 for(const r of checks){const e={eventId:`root-${run}-${r.alias}`,caseId:'CP-013',roleKey:r.roleKey,level:'api_e2e',scope:'partial',status:r.pass?'pass':'fail',at:new Date().toISOString(),assertions:[{name:'Fallo de historial no deja entrega sin mensaje ni envía aviso de éxito; el reintento conserva una sola entrega',pass:r.pass}],evidence:[{layer:'api',path}],stepsPending:['Comprobación visual de ambas partes tras fallo y recuperación'],limitations:['Preparación SQL del estado pagado, sin inferir pago real.']};fs.appendFileSync(events,JSON.stringify(e)+'\n')}
 if(checks.some(x=>!x.pass))process.exitCode=1
}
