import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=ts.transpileModule(fs.readFileSync('lib/notificaciones.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
async function scenario({current=['owner'],second=current,insertError=false,suppress=false,session={id:'actor'},redirect=null}={}){
 const inserted=[],sent=[],recipients=[],original={usuario_id:'revoked',tipo:'cancelacion_solicitada',titulo:'Solicitud de cancelación',mensaje:'Detalle privado',link:'/mi-empresa?trabajo=job',metadata:{empresa_id:'company',trabajo_id:'job'}};let authCalls=0,lookups=0
 const admin={from(table){
  assert.equal(table,'notificaciones')
  return {insert(data){
   inserted.push(data);const initial=inserted.length===1
   return {select(){return {maybeSingle:async()=>initial?{data:original,error:null}:{data:suppress?null:{...data,usuario_id:redirect??data.usuario_id},error:insertError?{code:'42501'}:null}}}}
  }}
 }}
 const deps={'server-only':{},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:++authCalls===1?{id:'actor'}:session}})}})},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/empresas/notificaciones':{destinatariosOperacionEmpresa:async(_a,company,operator,permission)=>{recipients.push({company,operator,permission});return ++lookups===1?current:second}},'@/lib/emails/enviar':{enviarAvisoPorEmail:async n=>sent.push({channel:'email',id:n.usuarioId,notice:n})},'@/lib/push/enviar':{enviarPushAUsuario:async(id,n)=>sent.push({channel:'push',id,notice:n})}}
 const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,console,require(n){assert.ok(n in deps,n);return deps[n]}})
 await module.exports.crearNotificacion({usuarioId:'revoked',tipo:original.tipo,titulo:original.titulo,metadata:original.metadata});return{inserted,sent,recipients,authCalls}
}
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS '+name)}
await test('After-commit revocation preserves original and persists current owner before external delivery',async()=>{const r=await scenario();assert.equal(r.inserted.length,2);assert.equal(r.inserted[0].usuario_id,'revoked');assert.equal(r.inserted[1].usuario_id,'owner');assert.equal(r.inserted[1].metadata.trabajo_id,'job');assert.equal(r.sent.length,2);assert.ok(r.sent.every(x=>x.id==='owner'));assert.equal(r.authCalls,2)})
await test('Current recipients are deduplicated and actor never receives own notice',async()=>{const r=await scenario({current:['owner','owner','actor']});assert.equal(r.inserted.length,2);assert.equal(r.sent.length,2)})
await test('A second revocation suppresses external delivery without recursive writes',async()=>{const r=await scenario({second:['replacement']});assert.equal(r.inserted.length,2);assert.equal(r.sent.length,0)})
await test('Insert failure and DB suppression do not dispatch',async()=>{for(const option of [{insertError:true},{suppress:true}]){const r=await scenario(option);assert.equal(r.sent.length,0)}})
await test('Lost or replaced actor session aborts delivery to newly resolved recipient',async()=>{for(const session of [null,{id:'other'}]){const r=await scenario({session});assert.equal(r.sent.length,0)}})
await test('DB redirected recipient is revalidated before any send',async()=>{const r=await scenario({redirect:'replacement',second:['replacement']});assert.ok(r.sent.every(x=>x.id==='replacement'));assert.equal(r.recipients[1].operator,'replacement')})
await test('No current recipient creates no new notice or delivery',async()=>{const r=await scenario({current:[]});assert.equal(r.inserted.length,1);assert.equal(r.sent.length,0)})
await test('Unchanged recipient keeps existing single-notice behavior',async()=>{const r=await scenario({current:['revoked']});assert.equal(r.inserted.length,1);assert.equal(r.sent.length,2)})
console.log(`${checks} meaningful notification race regressions passed without network.`)
