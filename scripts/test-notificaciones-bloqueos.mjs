import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=ts.transpileModule(fs.readFileSync(new URL('../app/actions/notificaciones.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function scenario({blocked=['blocked'],rpcError=false,conversationsError=false,user='actor',reversed=false}={}){
 const calls=[],conversations=[{id:'hidden',participante_1:reversed?'blocked':'actor',participante_2:reversed?'actor':'blocked'},{id:'visible',participante_1:'other',participante_2:'actor'}]
 const messages=[{id:'private-newest',conversacion_id:'hidden',contenido:'blocked private preview',remitente_id:'blocked',leido:false,created_at:'2026-10-23T12:00:00Z'},{id:'allowed',conversacion_id:'visible',contenido:'allowed preview',remitente_id:'other',leido:false,created_at:'2026-10-23T11:00:00Z'},{id:'own',conversacion_id:'visible',remitente_id:'actor',leido:false},{id:'read',conversacion_id:'visible',remitente_id:'other',leido:true}]
 const notice={id:'n',usuario_id:'actor',leida:false,tipo:'support',seccion:'/mi-cuenta',tituloEntidad:null}
 const supabase={auth:{getUser:async()=>({data:{user:user?{id:user}:null}})},rpc:async name=>{calls.push({rpc:name});assert.equal(name,'usuarios_incompatibles');return{data:blocked,error:rpcError?{code:'42501'}:null}},from(table){
  calls.push({table});const filters=[],options={};let fields,single=false,limit=null,range=null
  const q={select(f,o){fields=f;Object.assign(options,o);return q},eq(k,v){filters.push(x=>x[k]===v);return q},neq(k,v){filters.push(x=>x[k]!==v);return q},in(k,ids){calls.push({table,in:k,ids:[...ids]});filters.push(x=>ids.includes(x[k]));return q},or(){return q},order(){return q},range(a,b){range=[a,b];return q},limit(n){limit=n;return q},maybeSingle(){single=true;return q},then(resolve,reject){return Promise.resolve().then(()=>{
   if(table==='conversaciones'){assert.ok(fields.includes('participante_1')&&fields.includes('participante_2'));if(conversationsError)return{data:null,error:{code:'42501'}}}
   const rows=table==='notificaciones'?[notice]:table==='conversaciones'?conversations:table==='mensajes'?messages:table==='profiles'?[{id:'other',nombre:'Allowed',apellido:'Sender'},{id:'blocked',nombre:'Blocked',apellido:'Sender'}]:[]
   let data=rows.filter(x=>filters.every(f=>f(x)));const count=data.length;if(range)data=data.slice(range[0],range[1]+1);if(limit)data=data.slice(0,limit)
   return{data:options.head?null:single?data[0]??null:data,count:options.count?count:null,error:null}
  }).then(resolve,reject)}};return q
 }}
 const deps={'@/lib/supabase/server':{createClient:async()=>supabase},'@/lib/i18n-servidor':{textoServidor:async s=>s},'next/cache':{},'@/lib/notificaciones-contexto':{contextualizarNotificacion:n=>n,construirLinkNotificacion:()=>'/mi-cuenta'},'@/lib/preferencias-notificaciones':{}}
 const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,console,URL,require(n){assert.ok(n in deps,n);return deps[n]}})
 return{read:()=>module.exports.obtenerResumenNotificaciones(),calls,messages,unblock:()=>{blocked=[]}}
}
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS '+name)}
await test('Both participant orientations exclude blocked count and newest private preview',async()=>{for(const reversed of [false,true]){const s=scenario({reversed}),r=await s.read();assert.equal(r.mensajesNoLeidos,1);assert.equal(r.ultimoMensajeNoLeido.id,'allowed');assert.equal(r.ultimoMensajeNoLeido.preview,'allowed preview');assert.equal(r.ultimoMensajeNoLeido.remitente,'Allowed Sender');assert.ok(s.calls.filter(c=>c.table==='mensajes'&&c.in).every(c=>JSON.stringify(c.ids)==='["visible"]'))}})
await test('Unblock restores historic unread without deleting or acknowledging anything',async()=>{const s=scenario(),before=JSON.stringify(s.messages);await s.read();s.unblock();const r=await s.read();assert.equal(r.mensajesNoLeidos,2);assert.equal(r.ultimoMensajeNoLeido.id,'private-newest');assert.equal(JSON.stringify(s.messages),before)})
await test('All incompatible counterparts produce no message query or preview',async()=>{const s=scenario({blocked:['blocked','other']}),r=await s.read();assert.equal(r.mensajesNoLeidos,0);assert.equal(r.ultimoMensajeNoLeido,null);assert.ok(!s.calls.some(c=>c.table==='mensajes'))})
await test('RPC failure returns controlled error before reading conversations or bodies',async()=>{const s=scenario({rpcError:true}),r=await s.read();assert.equal(r.error,'No se pudieron cargar las notificaciones');assert.equal(r.ultimoMensajeNoLeido,null);assert.ok(!s.calls.some(c=>['conversaciones','mensajes','profiles'].includes(c.table)))})
await test('Conversation read error fails closed before message body reads',async()=>{const s=scenario({conversationsError:true}),r=await s.read();assert.ok(r.error);assert.ok(!s.calls.some(c=>c.table==='mensajes'))})
await test('Regular notices retain their count and section independently from personal block filter',async()=>{const r=await scenario().read();assert.equal(r.noLeidas,1);assert.equal(r.notificaciones[0].id,'n');assert.equal(r.porSeccion['/mi-cuenta'],1)})
await test('No company RPC, company ledger or company message path is changed by personal summary',async()=>{const s=scenario();await s.read();assert.deepEqual(s.calls.filter(c=>c.rpc).map(c=>c.rpc),['usuarios_incompatibles']);assert.ok(!s.calls.some(c=>c.table?.startsWith('empresa_')))})
await test('Unauthenticated summary exposes no messages and performs no lookup',async()=>{const s=scenario({user:null}),r=await s.read();assert.equal(r.mensajesNoLeidos,0);assert.equal(r.ultimoMensajeNoLeido,null);assert.equal(s.calls.length,0)})
console.log(`${checks} notification block regressions passed without network.`)
