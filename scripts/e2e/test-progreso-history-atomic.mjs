// Real Next HTTP boundary and disposable local SQL payment preconditions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pagosContext} from './pagos-context.mjs';
import {localFixture} from './local-client-fixtures.mjs';
const phase=process.argv[2];assert.ok(['before','after'].includes(phase));
const c=pagosContext('eur'),f=await localFixture('eur'),run=`progress-history-${phase}-${Date.now()}`,jobs=[],checks=[];
try {
 for(const pa of ['PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO']) {
  const j=await c.createJob({ca:'CP2',pa,label:run+' '+pa});jobs.push(j);
  await f.db.query("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,estado,fecha_retencion) values($1,$2,$3,110,100,10,10,10,90,'fondos_retenidos',now())",[j.trabajoId,c.fixture.users.CP2.id,c.fixture.users[pa].id]);
  await f.db.query("update trabajos set estado='en_progreso',progreso=0,pago_bloqueado=false where id=$1",[j.trabajoId]);
  await f.db.query("update solicitudes set estado='en_progreso' where id=$1",[j.solicitudId]);
  const boundaries=[];
  for(const value of [-1,101,25.5,NaN,Infinity,-Infinity]) {
   const r=await c.call(pa,'actualizarProgresoTrabajo',[j.trabajoId,value,'Invalid progress']);
   boundaries.push({input:String(value),rejected:!!r.error,state:(await c.row('trabajos',j.trabajoId)).progreso});
  }
  checks.push({alias:pa,roleKey:c.fixture.users[pa].roleKey,job:j.trabajoId,boundaries,boundariesPassed:boundaries.every(x=>x.rejected&&x.state===0)});
 }
 if(phase==='after') {
  for(const j of jobs) {
   const actor=await f.client(j.pa,['/mis-trabajos']);
   for(const value of [-1,101,25.5,'NaN','Infinity','-Infinity',null]) {
    const r=await actor.supabase.rpc('actualizar_progreso_con_historial',{p_trabajo_id:j.trabajoId,p_progreso:value,p_mensaje:'Intento directo inválido'});
    assert.equal(r.error?.code,'22023',j.pa+' RPC must reject '+value);
   }
  }
  for(const alias of ['VIS','CP2','AJ','AD','PE_REVOCADO']) {
   const actor=await f.client(alias,['/mis-trabajos']);
   const r=await actor.supabase.rpc('actualizar_progreso_con_historial',{p_trabajo_id:jobs[0].trabajoId,p_progreso:50,p_mensaje:'Intento ajeno'});
   assert.equal(r.error?.code,'42501',alias+' must not use progress RPC');
  }
 }
 const ids=jobs.map(j=>{assert.match(j.trabajoId,/^[a-f0-9-]{36}$/);return `'${j.trabajoId}'::uuid`});
 await f.db.query(`create function diime_private.qa_e2e_progress_fail() returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'QA_PROGRESS_HISTORY_FAILURE'; end $$; create trigger qa_e2e_progress_fail before insert on public.actualizaciones_trabajo for each row when(new.tipo='progreso' and new.trabajo_id=any(array[${ids.join(',')}])) execute function diime_private.qa_e2e_progress_fail()`);
 for(const j of jobs) {
  const r=await c.call(j.pa,'actualizarProgresoTrabajo',[j.trabajoId,75,'Comentario conservado '+run]);
  const job=await c.row('trabajos',j.trabajoId);
  const history=(await f.db.query('select mensaje,progreso from actualizaciones_trabajo where trabajo_id=$1',[j.trabajoId])).rows;
  const notices=(await f.db.query("select id from notificaciones where metadata->>'trabajo_id'=$1 and tipo='progreso_trabajo'",[j.trabajoId])).rows;
  const check=checks.find(x=>x.alias===j.pa);
  Object.assign(check,{error:r.error||null,state:job.estado,progress:job.progreso,history,notices:notices.length,atomicPassed:!!r.error&&job.progreso===0&&history.length===0&&notices.length===0});
  check.pass=check.boundariesPassed&&check.atomicPassed;console.log({actor:j.pa,invalidInputsRejected:check.boundariesPassed,historyAtomic:check.atomicPassed});
 }
} finally {
 await f.db.query('drop trigger if exists qa_e2e_progress_fail on public.actualizaciones_trabajo; drop function if exists diime_private.qa_e2e_progress_fail()');
 if(phase==='after')for(const j of jobs) {
  const check=checks.find(x=>x.alias===j.pa);if(!check?.atomicPassed)continue;
  const messages=[];
  for(const n of [0,25,75,100]) {const message=`Progreso ${n} ${run}`;const r=await c.call(j.pa,'actualizarProgresoTrabajo',[j.trabajoId,n,message]);assert.ok(!r.error,r.error);messages.push(message);}
  const job=await c.row('trabajos',j.trabajoId),history=(await f.db.query("select mensaje,progreso from actualizaciones_trabajo where trabajo_id=$1 and tipo='progreso' order by created_at",[j.trabajoId])).rows;
  check.recovery={state:job.estado,progress:job.progreso,history};check.recoveryPassed=job.estado==='en_progreso'&&job.progreso===100&&history.length===4&&history.every((h,i)=>h.mensaje===messages[i]);check.pass&&=check.recoveryPassed;
 }
 await f.db.end();const path=run+'.json';fs.writeFileSync(c.dir+'/'+path,JSON.stringify({run,phase,jobs,checks,faultTriggerRemoved:true},null,2));
 for(const r of checks)fs.appendFileSync(c.dir+'/root-continuation-events.jsonl',JSON.stringify({eventId:'root-'+run+'-'+r.alias,caseId:'T-097',roleKey:r.roleKey,level:'api_e2e',scope:'full',status:r.pass?'pass':'fail',at:new Date().toISOString(),assertions:[{name:'Fuera de rango, fracciones, NaN e infinitos se rechazan sin modificar progreso',pass:r.boundariesPassed},{name:'Fallo del historial revierte progreso y evita aviso de éxito; recuperación conserva comentarios',pass:!!r.atomicPassed&&(phase!=='after'||!!r.recoveryPassed)}],evidence:[{layer:'api',path}],stepsPending:[],limitations:['Estado pagado preparado mediante SQL local; solicitudes enviadas a Next con codificador React Flight real, incluido NaN. Navegador se registra aparte.']})+'\n');
 if(checks.some(x=>!x.pass))process.exitCode=1;
}
