// T-195/T-196: each actor exercises real HTTP, Auth, PostgREST and DB invariants.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {localFixture} from './local-client-fixtures.mjs';
import {pagosContext} from './pagos-context.mjs';
const f=await localFixture('privacy'),c=pagosContext('privacy');
const run='message-notice-integrity-'+Date.now(),checks=[],fixtures=[];
const pairs=[['CP','PP'],['CE_TITULAR','PE_TITULAR'],['CE_ADMIN','PE_ADMIN'],['CE_MIEMBRO','PE_MIEMBRO']];
const id=a=>f.m.users[a].id;
async function check(alias,caseId,name,fn){try{checks.push({alias,roleKey:f.m.users[alias].roleKey,caseId,name,pass:true,observed:await fn()});console.log('PASS',alias,caseId,name);}catch(e){checks.push({alias,roleKey:f.m.users[alias].roleKey,caseId,name,pass:false,error:e.message});console.log('FAIL',alias,caseId,name,e.message);}}
async function message(actor,conversation,text){const r=await(await f.client(actor)).request('/api/mensajes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversacionId:conversation,contenido:text})});return{status:r.status,value:await r.json()};}
async function row(table,key){return(await f.db.query(`select * from public.${table} where id=$1`,[key])).rows[0];}
try {
  const cp2=await f.client('CP2'),foreign=(await cp2.call('crearConversacion',[{otroUsuarioId:id('PP2')}],{route:'/mensajes'})).value;
  assert.ok(foreign.data?.id,JSON.stringify(foreign));
  const foreignMessage=await message('CP2',foreign.data.id,run+' foreign private message');assert.equal(foreignMessage.status,200);
  for(const [ca,pa] of pairs){
    const job=await c.createJob({ca,pa,label:run+' contractual fixture'});const company=ca!=='CP';
    const sender=await f.client(ca),conversation=company?(await sender.call('crearConversacionTrabajoEmpresa',[job.trabajoId],{route:'/mensajes'})).value:(await sender.call('crearConversacion',[{otroUsuarioId:id(pa),solicitudId:job.solicitudId}],{route:'/mensajes'})).value;
    assert.ok(conversation.data?.id,JSON.stringify(conversation));
    const table=company?'empresa_mensajes':'mensajes',conv=conversation.data.id;
    const fixture={...job,conversationId:conv,table};fixtures.push(fixture);
    for(const [alias,other] of [[ca,pa],[pa,ca]]){
      const actor=await f.client(alias),sent=await message(other,conv,run+' message received by '+alias);
      assert.equal(sent.status,200,JSON.stringify(sent));const received=sent.value.data.id;
      await check(alias,'T-195','Foreign chat cannot be read, changed, deleted or injected',async()=>{
        const initial=await row('mensajes',foreignMessage.value.data.id);
        const read=(await actor.call('obtenerMensajes',[foreign.data.id],{route:'/mensajes'})).value;assert.ok(read.error);assert.deepEqual(read.data,[]);
        const direct=await actor.supabase.from('mensajes').select('*').eq('conversacion_id',foreign.data.id);assert.ifError(direct.error);assert.deepEqual(direct.data,[]);
        const send=await message(alias,foreign.data.id,'Forbidden foreign message '+run);assert.equal(send.status,400);
        const changed=await actor.supabase.from('mensajes').update({contenido:'Forbidden edit',leido:true}).eq('id',initial.id).select('id');assert.ok(changed.error||changed.data.length===0);
        const removed=await actor.supabase.from('mensajes').delete().eq('id',initial.id).select('id');assert.ok(removed.error||removed.data.length===0);
        assert.deepEqual(await row('mensajes',initial.id),initial);return{foreignActionDenied:true,directRows:0,sendStatus:send.status,unchanged:true};
      });
      await check(alias,'T-195','Received content, sender, attachment and conversation remain immutable even combined with read flag',async()=>{
        const initial=await row(table,received),attempts=[];
        for(const patch of [{contenido:'Forged '+run},{remitente_id:id(alias)},{archivo_url:'https://example.test/forged.pdf',archivo_nombre:'forged.pdf'},{conversacion_id:foreign.data.id},{tipo:'imagen'}]){
          const r=await actor.supabase.from(table).update({...patch,...(!company?{leido:true}:{})}).eq('id',received).select('id');assert.ok(r.error||r.data.length===0,JSON.stringify({patch,result:r}));assert.deepEqual(await row(table,received),initial);attempts.push({fields:Object.keys(patch),error:r.error?.code||null,affected:r.data?.length||0});
        }
        const spoof=await actor.supabase.from(table).insert({conversacion_id:conv,remitente_id:id(other),contenido:'Spoofed '+run,...(company?{remitente_nombre:'Forged identity'}:{})}).select('id');assert.ok(spoof.error);return{attempts,spoofDenied:spoof.error.code,unchanged:true};
      });
      await check(alias,'T-195','Reading changes only recipient read state; sender cannot rewrite or mark their own message',async()=>{
        const initial=await row(table,received);
        const listed=(await actor.call('obtenerMensajes',[conv],{route:'/mensajes'})).value;assert.ok(!listed.error,JSON.stringify(listed));assert.ok(listed.data.some(m=>m.id===received));
        const after=await row(table,received);
        if(company){assert.deepEqual(after,initial);const read=(await f.db.query('select leido_hasta from empresa_chat_lecturas where conversacion_id=$1 and usuario_id=$2',[conv,id(alias)])).rows[0];assert.ok(new Date(read.leido_hasta)>=new Date(initial.created_at));}
        else {assert.equal(after.leido,true);const {leido:a,...unchangedAfter}=after,{leido:b,...unchangedBefore}=initial;assert.deepEqual(unchangedAfter,unchangedBefore);const reset=await actor.supabase.from(table).update({leido:false}).eq('id',received).select('id');assert.ok(reset.error||reset.data.length===0);}
        const own=await message(alias,conv,run+' own sender '+alias);assert.equal(own.status,200);const ownInitial=await row(table,own.value.data.id);const ownUpdate=await actor.supabase.from(table).update(company?{contenido:'Changed own content'}:{leido:true}).eq('id',ownInitial.id).select('id');assert.ok(ownUpdate.error||ownUpdate.data.length===0);assert.deepEqual(await row(table,ownInitial.id),ownInitial);return{recipientCanRead:true,contentPreserved:true,ownUpdateDenied:true,readModel:company?'per-user watermark':'received-message read flag'};
      });
      await check(alias,'T-196','Payment, verification and administrative notices cannot be fabricated for self or others',async()=>{
        const marker='Forged notice '+run+' '+alias,attempts=[];
        for(const tipo of ['pago_liberado','verificacion_aprobada','disputa_resuelta'])for(const user of [id(alias),id(other),id('AD')]){
          const r=await actor.supabase.from('notificaciones').insert({usuario_id:user,tipo,titulo:marker,mensaje:'No legitimate event',link:'/admin/pagos',metadata:{trabajo_id:job.trabajoId}}).select('id');assert.ok(r.error);attempts.push({type:tipo,recipient:user,error:r.error.code});
        }
        assert.equal((await f.db.query('select count(*)::int n from notificaciones where titulo=$1',[marker])).rows[0].n,0);
        return{attempts,persisted:0};
      });
    }
  }
} catch(e){checks.push({caseId:'runner',name:'fixture setup',pass:false,error:e.stack});process.exitCode=1;console.error(e.message);}
finally {
  await f.db.end();
  fs.writeFileSync(f.dir+'/'+run+'.json',JSON.stringify({run,checks,fixtures,environment:'real isolated local Auth / HTTP / PostgREST / DB',limitations:['Fixtures are real unpaid contracts; no Stripe payment in this batch. Each company role exercises the company chat; personal roles exercise personal messages. No browser coverage claimed.']},null,2));
  fs.writeFileSync(f.dir+'/message-notice-integrity-latest.json',JSON.stringify({run,fixtures},null,2));
  const expected={'T-195':3,'T-196':1};
  for(const alias of pairs.flat())for(const caseId of Object.keys(expected)){
    const own=checks.filter(x=>x.alias===alias&&x.caseId===caseId);if(!own.length)continue;
    const full=own.length===expected[caseId],pass=own.every(x=>x.pass);
    const event={eventId:run+'-'+caseId+'-'+alias,at:new Date().toISOString(),caseId,roleKey:f.m.users[alias].roleKey,level:'api_e2e',scope:full?'full':'partial',status:pass?'pass':'fail',assertions:own,stepsPending:full?[]:['Complete remaining explicit checks'],evidence:[{layer:'api',path:run+'.json'},{layer:'db',path:run+'.json'}],limitations:['Direct API cases; no browser pass inferred.']};fs.appendFileSync(f.dir+'/root-continuation-events.jsonl',JSON.stringify(event)+'\n');
  }
  const failed=checks.filter(x=>!x.pass).length;console.log({run,checks:checks.length,passed:checks.length-failed,failed});if(failed)process.exitCode=1;
}
