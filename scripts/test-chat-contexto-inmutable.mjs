// Real server-action code with isolated repository doubles; no database or money.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const cp=uid(1),pp=uid(2),aj=uid(3),requestA=uid(11),requestB=uid(12),jobA=uid(21),jobB=uid(22)
const source=ts.transpileModule(fs.readFileSync('app/actions/messages.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const pushModule={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/push/mensaje-empresa.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:pushModule,exports:pushModule.exports,console})
function fixture({conflict=null}={}){
 const store={profiles:[cp,pp,aj].map(id=>({id,es_admin:false,cuenta_eliminada:null})),profesionales:[{id:pp}],solicitudes:[requestA,requestB].map(id=>({id,cliente_id:cp,estado:'abierta',empresa_id:null})),trabajos:[{id:jobA,solicitud_id:requestA,cliente_id:cp,profesional_id:pp},{id:jobB,solicitud_id:requestB,cliente_id:cp,profesional_id:pp}],conversaciones:[],mensajes:[]}
 let serial=100,blocked=false,conflictUsed=false
 const sameContext=(a,b)=>[a.participante_1,a.participante_2].sort().join() === [b.participante_1,b.participante_2].sort().join() && (a.trabajo_id??null)===(b.trabajo_id??null) && (a.trabajo_id || (a.solicitud_id??null)===(b.solicitud_id??null))
 function api(actor){const client={auth:{getUser:async()=>({data:{user:{id:actor}}})},rpc:async name=>({data:name==='interaccion_bloqueada_con'?blocked:null,error:null}),from(table){let filters=[],insert,update;const query={select(){return query},eq(k,v){filters.push(r=>r[k]===v);return query},is(k,v){filters.push(r=>(r[k]??null)===v);return query},or(value){const ids=[...new Set(value.match(/[0-9a-f]{8}-[0-9a-f-]{27}/g))];filters.push(r=>ids.includes(r.participante_1)&&ids.includes(r.participante_2));return query},insert(value){insert=value;return query},update(value){update=value;return query},single(){return exec(true)},maybeSingle(){return exec(true)},then(resolve,reject){return exec(false).then(resolve,reject)}}
 async function exec(one){const rows=store[table];assert.ok(rows,'Unexpected table '+table);if(insert){const value={id:uid(serial++),contexto_archivado:false,...insert,solicitud_id:insert.solicitud_id??null,trabajo_id:insert.trabajo_id??null};if(table==='conversaciones'){if(rows.some(r=>!r.contexto_archivado&&sameContext(r,value)))return{data:null,error:{code:'23505',message:'context duplicate'}};if(conflict&&!conflictUsed){conflictUsed=true;if(conflict==='same-context')rows.push(value);return{data:null,error:{code:'23505',message:'competing insert'}}}}rows.push(value);return{data:{...value},error:null}}const found=rows.filter(r=>filters.every(fn=>fn(r)));if(update)for(const r of found)Object.assign(r,update);if(one&&found.length>1)return{data:null,error:{message:'ambiguous context'}};return{data:one?(found[0]?{...found[0]}:null):found.map(r=>({...r})),error:null}}
 return query}}
 const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,console:{info(){},warn(){}},require(name){if(name==='@/lib/supabase/server')return{createClient:async()=>client};if(name==='@/lib/i18n-servidor')return{textoServidor:async x=>x};if(name==='next/cache')return{revalidatePath(){}};if(name==='next/server')return{after(){throw Error('A personal chat must not enter the company after hook')}};if(name==='@/lib/moderacion')return{errorContenidoProhibido:()=>null};if(name==='@/lib/push/enviar')return{enviarPushAUsuario:async()=>({})};if(name==='@/lib/push/mensaje-empresa')return pushModule.exports;throw Error(name)}});return module.exports}
 return{store,api,setBlocked:v=>{blocked=v}}
}
let count=0
const f=fixture(),client=f.api(cp),provider=f.api(pp),other=f.api(aj)
const open=async(api,params)=>{const r=await api.crearConversacion(params);assert.ok(r.data&&!r.error,r.error);return r.data.id}
const personal=await open(client,{otroUsuarioId:pp}),ra=await open(client,{otroUsuarioId:pp,solicitudId:requestA}),rb=await open(client,{otroUsuarioId:pp,solicitudId:requestB}),ja=await open(client,{otroUsuarioId:pp,trabajoId:jobA}),jb=await open(client,{otroUsuarioId:pp,trabajoId:jobB})
assert.equal(new Set([personal,ra,rb,ja,jb]).size,5);count++
const snapshot=JSON.stringify(f.store.conversaciones)
for(const [params,id]of [[{},personal],[{solicitudId:requestA},ra],[{solicitudId:requestB},rb],[{trabajoId:jobA},ja],[{trabajoId:jobB},jb]])assert.equal(await open(client,{otroUsuarioId:pp,...params}),id)
assert.equal(JSON.stringify(f.store.conversaciones),snapshot);count++
for(const [id,text]of [[personal,'Private context'],[ja,'Job A evidence'],[jb,'Job B evidence']]){const r=await client.enviarMensaje(id,text);assert.equal(r.data.conversacion_id,id)}
assert.deepEqual(f.store.mensajes.map(m=>[m.conversacion_id,m.contenido]),[[personal,'Private context'],[ja,'Job A evidence'],[jb,'Job B evidence']]);count++
assert.ok((await other.crearConversacion({otroUsuarioId:pp,trabajoId:jobA})).error);assert.ok((await other.enviarMensaje(ja,'Foreign injection')).error);count++
f.setBlocked(true);assert.ok((await client.crearConversacion({otroUsuarioId:pp,trabajoId:jobA})).error);assert.ok((await client.enviarMensaje(ja,'Blocked injection')).error);assert.equal(f.store.mensajes.length,3);count++
const race=fixture(),a=race.api(cp),b=race.api(pp),results=await Promise.all([a.crearConversacion({otroUsuarioId:pp,trabajoId:jobA,mensajeInicial:'Initial A'}),b.crearConversacion({otroUsuarioId:cp,trabajoId:jobA,mensajeInicial:'Initial B'})]);assert.ok(results.every(r=>r.data&&!r.error));assert.equal(results[0].data.id,results[1].data.id);assert.equal(race.store.conversaciones.length,1);assert.equal(race.store.mensajes.length,2);count++
const conflict=fixture({conflict:'same-context'}),recovered=await open(conflict.api(cp),{otroUsuarioId:pp,trabajoId:jobA});assert.equal(recovered,conflict.store.conversaciones[0].id);count++
const wrong=fixture({conflict:'other-context'});wrong.store.conversaciones.push({id:uid(300),contexto_archivado:false,participante_1:cp,participante_2:pp,trabajo_id:jobB,solicitud_id:requestB});const denied=await wrong.api(cp).crearConversacion({otroUsuarioId:pp,trabajoId:jobA});assert.ok(denied.error&&!denied.data);assert.equal(wrong.store.conversaciones[0].trabajo_id,jobB);count++
const archived=fixture();archived.store.conversaciones.push({id:uid(400),participante_1:cp,participante_2:pp,trabajo_id:null,solicitud_id:null,contexto_archivado:true});const activePersonal=await open(archived.api(cp),{otroUsuarioId:pp});assert.notEqual(activePersonal,uid(400));assert.equal(archived.store.conversaciones[0].contexto_archivado,true);count++
console.log(`OK ${count} contextual chat unit groups; isolation, retries, concurrent initial messages and denial without real database calls`)
