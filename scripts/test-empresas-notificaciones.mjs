import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source = ts.transpileModule(fs.readFileSync('lib/notificaciones.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const requested={usuarioId:'revoked',tipo:'disputa_abierta',titulo:'Disputa',mensaje:'Detalle privado',metadata:{trabajo_id:'job'}}
async function run(saved, recipients, user={id:'actor'}) {
 const sent=[]
 const admin={from(){return{insert(){return{select(){return{maybeSingle:async()=>({data:saved,error:null})}}}}}}}
 const deps={
  'server-only':{},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/push/enviar':{enviarPushAUsuario:async(id,data)=>sent.push({channel:'push',id,data})},
  '@/lib/emails/enviar':{enviarAvisoPorEmail:async data=>sent.push({channel:'email',id:data.usuarioId,data})},
  '@/lib/empresas/notificaciones':{destinatariosOperacionEmpresa:async(_admin,company,operator,permission)=>{assert.equal(company,'company');return typeof recipients==='function'?recipients(permission):recipients}},
 }
 const module={exports:{}}
 vm.runInNewContext(source,{module,exports:module.exports,console,require(name){assert.ok(name in deps,name);return deps[name]}})
 await module.exports.crearNotificacion(requested)
 return sent
}
const notice={usuario_id:'active-admin',tipo:'disputa_abierta',titulo:'Disputa guardada',mensaje:'Detalle guardado',link:'/perfil-empresa',metadata:{empresa_id:'company'}}
assert.equal((await run(null,[])).length,0,'Suppressed DB notice must not send email or push')
const moved=await run(notice,['active-admin'])
assert.equal(moved.length,2)
assert.ok(moved.every(v=>v.id==='active-admin'&&v.data.titulo==='Disputa guardada'),'External delivery uses persisted recipient and text')
assert.equal((await run(notice,[])).length,0,'Revocation after insert blocks external delivery')
assert.equal((await run(notice,['active-admin'],null)).length,0,'No session cannot send')
assert.equal((await run({...notice,usuario_id:'actor'},['actor'])).length,0,'Redirect to acting admin does not notify self')
const personal=await run({...notice,usuario_id:'personal',metadata:{}},[])
assert.equal(personal.length,2)
assert.ok(personal.every(v=>v.id==='personal'),'Personal delivery is preserved')
await run({...notice,tipo:'reembolso_emitido'},permission=>{assert.equal(permission,'ver_cobros');return []})
console.log('7 persisted-notification delivery checks passed without network or real messages.')
