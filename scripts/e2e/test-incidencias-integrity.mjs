// Real Auth + Next HTTP actions + PostgREST + DB. No production data or messages.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {localFixture} from './local-client-fixtures.mjs';
const f=await localFixture('privacy'),run='incidencias-integrity-'+Date.now(),checks=[],created=[];
const jobs=JSON.parse(fs.readFileSync(f.dir+'/message-notice-integrity-latest.json')).fixtures;
const call=async(a,name,args)=>(await(await f.client(a)).call(name,args,{route:a.startsWith('AD')?'/admin/incidencias':'/incidencias'})).value;
const row=async id=>(await f.db.query('select * from incidencias where id=$1',[id])).rows[0];
const notices=async id=>(await f.db.query("select * from notificaciones where metadata->>'incidencia_id'=$1 order by created_at,id",[id])).rows;
async function check(alias,caseId,name,fn){try{const observed=await fn();checks.push({alias,caseId,name,pass:true,observed});console.log('PASS',alias,caseId,name);}catch(e){checks.push({alias,caseId,name,pass:false,error:e.message});console.log('FAIL',alias,caseId,name,e.message);}}
const ok=r=>{assert.ok(!r.error,JSON.stringify(r));return r.data??r};
async function create(alias,job=null,label='general'){const v=ok(await call(alias,'crearIncidencia',[{asunto:`QA ${run} ${alias} ${label}`,descripcion:'Prueba aislada del sistema de soporte y respuesta pública.',categoria:'tecnico',prioridad:'critica',trabajo_id:job}]));assert.ok(v.id);created.push({alias,id:v.id,label});return v.id;}
let fault=false;
try {
  await check('AD','T-178','Foreign contract association denied over HTTP and direct PostgREST for every actor',async()=>{
    const attempts=[];
    for(const alias of ['CP2','PP2','CE_TITULAR','CE_ADMIN','CE_MIEMBRO','PE_TITULAR','PE_ADMIN','PE_MIEMBRO','AD']){
      const actor=await f.client(alias),payload={asunto:run+' forbidden '+alias,descripcion:'Unrelated contract association',categoria:'tecnico',trabajo_id:jobs[0].trabajoId};
      const action=await call(alias,'crearIncidencia',[payload]);assert.ok(action.error,alias+' action accepted foreign contract');
      const direct=await actor.supabase.from('incidencias').insert({...payload,reportado_por:f.m.users[alias].id}).select('id');assert.ok(direct.error,alias+' direct insert accepted');
      const generic=await create(alias,null,'unlinked');assert.equal((await row(generic)).trabajo_id,null);
      attempts.push({alias,actionError:action.error,directError:direct.error.code,generalReport:generic});
    }
    const adList=ok(await call('AD','obtenerIncidencias',[]));assert.equal(adList.filter(i=>i.asunto.startsWith(run+' forbidden')).length,0);
    return{attempts,foreignReportsReceivedByAdmin:0};
  });
  await check('AD','T-178','Allowed job selector and linked reports agree for eight actual parties',async()=>{
    const allowed=[];
    for(const job of jobs)for(const alias of [job.ca,job.pa]){
      const list=ok(await call(alias,'obtenerTrabajosParaIncidencia',[]));assert.ok(list.some(t=>t.id===job.trabajoId),alias+' missing allowed job');
      const id=await create(alias,job.trabajoId,'linked');assert.equal((await row(id)).trabajo_id,job.trabajoId);allowed.push({alias,id,job:job.trabajoId});
    }
    const stranger=ok(await call('CP2','obtenerTrabajosParaIncidencia',[]));assert.ok(!stranger.some(t=>jobs.some(j=>j.trabajoId===t.id)));
    return{allowed,strangerSeesNone:true};
  });
  for(const alias of ['PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO'])await check(alias,'T-175','Public admin reply visible to reporter during review and after resolution, hidden from third party',async()=>{
    const id=created.find(i=>i.alias===alias&&i.label==='linked')?.id;assert.ok(id);
    const reply='Respuesta pública QA para '+alias+' '+run;
    ok(await call('AD','actualizarIncidencia',[id,{estado:'en_revision',prioridad:'alta',notas_admin:reply}]));
    let own=ok(await call(alias,'obtenerMisIncidencias',[])).find(i=>i.id===id);assert.equal(own.notas_admin,reply);assert.equal(own.estado,'en_revision');
    const third=await f.client('CP2');assert.equal(ok(await call('CP2','obtenerMisIncidencias',[])).filter(i=>i.id===id).length,0);const direct=await third.supabase.from('incidencias').select('*').eq('id',id);assert.ifError(direct.error);assert.deepEqual(direct.data,[]);
    const wrongAdmin=await call(alias,'actualizarIncidencia',[id,{notas_admin:'Forged response'}]);assert.ok(wrongAdmin.error);
    ok(await call('AD','actualizarIncidencia',[id,{estado:'resuelta'}]));own=ok(await call(alias,'obtenerMisIncidencias',[])).find(i=>i.id===id);assert.equal(own.notas_admin,reply);assert.equal(own.estado,'resuelta');
    const n=await notices(id);assert.equal(n.length,1);assert.equal(n[0].usuario_id,f.m.users[alias].id);assert.ok(n[0].mensaje.includes(reply));
    return{id,reply,reviewAndResolutionVisible:true,thirdPartyExcluded:true,notice:n[0].id};
  });
  await check('AD','T-177','Repeated and concurrent closure creates one notice and preserves the original resolution',async()=>{
    const id=await create('PP',null,'idempotency');ok(await call('AD','actualizarIncidencia',[id,{estado:'resuelta',notas_admin:'Respuesta cierre QA'}]));const first=await row(id);
    const results=await Promise.all([call('AD','actualizarIncidencia',[id,{estado:'resuelta'}]),call('AD2','actualizarIncidencia',[id,{estado:'resuelta'}])]);results.forEach(ok);const second=await row(id);
    assert.equal(second.fecha_resolucion.toISOString(),first.fecha_resolucion.toISOString());assert.equal(second.resuelto_por,first.resuelto_por);assert.equal((await notices(id)).length,1);
    ok(await call('AD2','actualizarIncidencia',[id,{notas_admin:'Aclaración pública sin otro aviso'}]));assert.equal((await notices(id)).length,1);assert.equal((await row(id)).fecha_resolucion.toISOString(),first.fecha_resolucion.toISOString());
    return{id,date:first.fecha_resolucion,actor:first.resuelto_por,notices:1};
  });
  await check('AD','T-177','Reopening clears closure metadata; second closure records new actor and one new notice',async()=>{
    const id=created.find(i=>i.label==='idempotency').id;ok(await call('AD2','actualizarIncidencia',[id,{estado:'en_revision'}]));const reopened=await row(id);assert.equal(reopened.resuelto_por,null);assert.equal(reopened.fecha_resolucion,null);
    ok(await call('AD2','actualizarIncidencia',[id,{estado:'cerrada'}]));const closed=await row(id);assert.equal(closed.resuelto_por,f.m.users.AD2.id);assert.ok(closed.fecha_resolucion);assert.equal((await notices(id)).length,2);
    return{id,reopened,closed};
  });
  await check('AD','T-177','Withdrawn critical report stays outside pending counts and cannot be withdrawn twice',async()=>{
    const id=await create('PP',null,'withdrawn');ok(await call('PP','retirarIncidencia',[id]));assert.ok((await call('PP','retirarIncidencia',[id])).error);const r=await row(id);assert.equal(r.estado,'retirada');assert.equal(r.fecha_resolucion,null);assert.equal(r.resuelto_por,null);assert.equal((await notices(id)).length,0);
    const pending=(await f.db.query("select id from incidencias where prioridad='critica' and estado in ('abierta','en_revision')")).rows;assert.ok(!pending.some(x=>x.id===id));return{id,pendingExcludesWithdrawn:true};
  });
  await check('AD','T-176','Admin state, response and notice commit atomically when notification storage fails',async()=>{
    const id=await create('PP',null,'atomic-failure'),before=await row(id);
    await f.db.query(`create function public.qa_incidencia_notice_fault() returns trigger language plpgsql set search_path='' as $$ begin if new.metadata->>'incidencia_id'='${id}' then raise exception 'QA injected notice failure'; end if; return new; end $$; create trigger qa_incidencia_notice_fault before insert on public.notificaciones for each row execute function public.qa_incidencia_notice_fault()`);fault=true;
    try{const response=await call('AD','actualizarIncidencia',[id,{estado:'resuelta',notas_admin:'Should roll back'}]);assert.ok(response.error);assert.deepEqual(await row(id),before);assert.equal((await notices(id)).length,0);}finally{await f.db.query('drop trigger qa_incidencia_notice_fault on public.notificaciones; drop function public.qa_incidencia_notice_fault()');fault=false;}
    const simultaneous=await Promise.all([call('AD','actualizarIncidencia',[id,{estado:'resuelta',notas_admin:'Respuesta única'}]),call('AD2','actualizarIncidencia',[id,{estado:'resuelta',notas_admin:'Respuesta única'}])]);simultaneous.forEach(ok);assert.equal((await notices(id)).length,1);return{id,rollback:true,retryAndRaceNotices:1};
  });
  await check('AD','T-176','Unknown row, malformed patches and forged insert cannot fabricate resolution or report owner',async()=>{
    assert.ok((await call('AD','actualizarIncidencia',[randomUUID(),{estado:'resuelta'}])).error);
    const id=created.find(i=>i.label==='atomic-failure').id,before=await row(id),admin=await f.client('AD');
    for(const patch of [{reportado_por:f.m.users.AD.id},{estado:null},{estado:'fake'},{prioridad:'max'},{notas_admin:null},{notas_admin:'a'.repeat(5001)}]){const r=await admin.supabase.rpc('gestionar_incidencia',{p_id:id,p_cambios:patch});assert.ok(r.error);assert.deepEqual(await row(id),before);}
    const direct=await admin.supabase.from('incidencias').update({reportado_por:f.m.users.AD.id}).eq('id',id);assert.ok(direct.error);
    const reporter=await f.client('PP');const forged=await reporter.supabase.from('incidencias').insert({reportado_por:f.m.users.PP.id,asunto:run+' fabricated closure',descripcion:'Synthetic fixture',categoria:'tecnico',estado:'resuelta',resuelto_por:f.m.users.AD.id,fecha_resolucion:new Date().toISOString(),notas_admin:'Forged administrator'}).select('*').single();assert.ifError(forged.error);assert.equal(forged.data.estado,'abierta');assert.equal(forged.data.resuelto_por,null);assert.equal(forged.data.fecha_resolucion,null);assert.equal(forged.data.notas_admin,null);created.push({alias:'PP',id:forged.data.id,label:'sanitized-insert'});
    for(const alias of ['CP','PP','CE_TITULAR','CE_ADMIN','CE_MIEMBRO','PE_TITULAR','PE_ADMIN','PE_MIEMBRO','CP2','VIS']){const c=await f.client(alias);assert.ok((await c.supabase.rpc('gestionar_incidencia',{p_id:id,p_cambios:{estado:'abierta'}})).error);}
    return{unknownRowRejected:true,invalidPatches:6,unprivilegedActorsDenied:10,forgedClosureSanitized:forged.data.id};
  });
}catch(e){checks.push({alias:'AD',caseId:'runner',name:'setup',pass:false,error:e.stack});console.error(e);process.exitCode=1;}
finally{
 if(fault)await f.db.query('drop trigger if exists qa_incidencia_notice_fault on public.notificaciones; drop function if exists public.qa_incidencia_notice_fault()');await f.db.end();
 fs.writeFileSync(f.dir+'/'+run+'.json',JSON.stringify({run,checks,created,environment:'isolated local real Auth/HTTP/PostgREST/DB; local notification capture',limitations:['No browser pass inferred. Admin list filtering remains a browser step. General reports have no contract by design.']},null,2));
 fs.writeFileSync(f.dir+'/incidencias-integrity-latest.json',JSON.stringify({run,created},null,2));
 for(const alias of ['AD','PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO'])for(const caseId of ['T-175','T-176','T-177','T-178']){const own=checks.filter(x=>x.alias===alias&&x.caseId===caseId);if(!own.length)continue;const pass=own.every(x=>x.pass),full=(caseId==='T-175'&&own.length===1)||(caseId==='T-178'&&own.length===2)||(caseId==='T-177'&&own.length===3);const event={eventId:run+'-'+caseId+'-'+alias,at:new Date().toISOString(),caseId,roleKey:f.m.users[alias].roleKey,level:'api_e2e',scope:full?'full':'partial',status:pass?'pass':'fail',assertions:own,stepsPending:full?[]:['Complete admin UI filters and complete lifecycle in browser'],evidence:[{layer:'api',path:run+'.json'},{layer:'db',path:run+'.json'}],...(pass&&caseId==='T-177'?{resolvesEventIds:['root-incidencias-T177-before']}:{}),...(pass&&caseId==='T-178'?{resolvesEventIds:['root-incidencias-T178-before']}:{})};fs.appendFileSync(f.dir+'/root-continuation-events.jsonl',JSON.stringify(event)+'\n');}
 console.log({run,checks:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length});if(checks.some(x=>!x.pass))process.exitCode=1;
}
