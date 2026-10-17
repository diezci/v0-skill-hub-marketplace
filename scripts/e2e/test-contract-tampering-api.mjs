// Direct Auth/PostgREST/RPC attempts on each actor's own contract, not an ajeno-only test.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {localFixture} from './local-client-fixtures.mjs';
const f=await localFixture('privacy'),run='contract-tampering-'+Date.now(),checks=[];
const fixtures=JSON.parse(fs.readFileSync(f.dir+'/message-notice-integrity-latest.json')).fixtures;
const manifest=JSON.parse(fs.readFileSync('.next/server/server-reference-manifest.json'));
const absentActions=['actualizarEstadoTrabajo','cancelarTrabajo','actualizarEstadoOferta'].filter(name=>!Object.values(manifest.node).some(e=>e.exportedName===name));
async function row(id){return(await f.db.query('select * from trabajos where id=$1',[id])).rows[0];}
async function check(alias,caseId,name,fn){try{checks.push({alias,roleKey:f.m.users[alias].roleKey,caseId,name,pass:true,observed:await fn()});console.log('PASS',alias,caseId,name);}catch(e){checks.push({alias,roleKey:f.m.users[alias].roleKey,caseId,name,pass:false,error:e.message});console.log('FAIL',alias,caseId,name,e.message);}}
try {
  assert.equal(fixtures.length,4);
  const otherRequest=await f.request('CP2',run+' unrelated existing request');
  for(const job of fixtures){
    assert.equal((await row(job.trabajoId)).estado,'pendiente_pago');
    for(const phase of ['pendiente_pago','en_progreso']){
      if(phase==='en_progreso'){
        // Paid-state fixture without Stripe: only test storage/transition guards.
        await f.db.query("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,estado,fecha_retencion) values($1,$2,$3,110,100,10,10,10,90,'fondos_retenidos',now())",[job.trabajoId,f.m.users[job.ca].id,f.m.users[job.pa].id]);
        await f.db.query("update trabajos set estado='en_progreso',pago_bloqueado=false where id=$1",[job.trabajoId]);
        await f.db.query("update solicitudes set estado='en_progreso' where id=$1",[job.solicitudId]);
      }
      for(const alias of [job.ca,job.pa]){
        const actor=await f.client(alias),before=await row(job.trabajoId);
        await check(alias,'T-199','Contract terms and destination cannot change in '+phase,async()=>{
          const attempts=[];
          for(const patch of [{precio_acordado:1.01},{profesional_id:f.m.users.PP2.id},{cliente_id:f.m.users.CP2.id},{solicitud_id:otherRequest},{proveedor_stripe_account_id:'acct_QAForgedDestination'}]){
            const r=await actor.supabase.from('trabajos').update(patch).eq('id',job.trabajoId).select('id');assert.ok(r.error||r.data.length===0,JSON.stringify({patch,result:r}));assert.deepEqual(await row(job.trabajoId),before);attempts.push({fields:Object.keys(patch),error:r.error?.code||null,affected:r.data?.length||0});
          }
          return{phase,ownContract:job.trabajoId,attempts,unchanged:true};
        });
        await check(alias,'T-198','Generic SQL state changes and forged contractual RPC are denied in '+phase,async()=>{
          const attempts=[];
          for(const estado of ['completado','cancelado','entregado']){
            const r=await actor.supabase.from('trabajos').update({estado}).eq('id',job.trabajoId).select('id');assert.ok(r.error||r.data.length===0);assert.deepEqual(await row(job.trabajoId),before);attempts.push({estado,error:r.error?.code||null,affected:r.data?.length||0});
          }
          const forged=await actor.supabase.rpc('aceptar_oferta_y_crear_trabajo',{p_oferta_id:job.ofertaId,p_solicitud_id:otherRequest,p_profesional_id:f.m.users.PP2.id,p_fecha_estimada_fin:null});assert.ok(forged.error);assert.deepEqual(await row(job.trabajoId),before);
          return{phase,attempts,forgedRpcDenied:forged.error.code,genericActionsNotExposed:absentActions};
        });
      }
    }
  }
}catch(e){checks.push({caseId:'runner',name:'fixture setup',pass:false,error:e.stack});process.exitCode=1;console.error(e.message);}
finally {
  await f.db.end();
  fs.writeFileSync(f.dir+'/'+run+'.json',JSON.stringify({run,checks,fixtures,absentActions,limitations:['Auth, HTTP and PostgreSQL real; paid state is a synthetic SQL precondition, no real Stripe movements. Generic legacy actions are not exported in the production build, so those invocations are not claimed as executed.']},null,2));
  for(const alias of fixtures.flatMap(j=>[j.ca,j.pa]))for(const caseId of ['T-199','T-198']){
    const own=checks.filter(x=>x.alias===alias&&x.caseId===caseId);if(!own.length)continue;
    const full=caseId==='T-199'&&own.length===2;
    fs.appendFileSync(f.dir+'/root-continuation-events.jsonl',JSON.stringify({eventId:run+'-'+caseId+'-'+alias,at:new Date().toISOString(),caseId,roleKey:f.m.users[alias].roleKey,level:'api_e2e',scope:full?'full':'partial',status:own.every(x=>x.pass)?'pass':'fail',assertions:own,evidence:[{layer:'api',path:run+'.json'},{layer:'db',path:run+'.json'}],stepsPending:full?[]:['Named legacy generic actions are absent from the compiled HTTP surface; remaining offer-state variant and compatible UI transitions are not claimed here.']})+'\n');
  }
  const failed=checks.filter(x=>!x.pass).length;console.log({run,checks:checks.length,passed:checks.length-failed,failed});if(failed)process.exitCode=1;
}
