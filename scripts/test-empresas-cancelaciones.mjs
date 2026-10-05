// Server-action boundary checks; SQL state/identity continuity is covered by PGlite.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const job={ id:'job',solicitud_id:'request',oferta_id:'offer',cliente_id:'original-buyer',profesional_id:'original-provider',empresa_cliente_id:'buyer-company',empresa_proveedora_id:'provider-company',operador_cliente_id:'buyer-operator',operador_proveedor_id:'provider-operator',estado:'en_progreso',titulo:'Trabajo',cancelacion_estado:'pendiente',cancelacion_solicitada_por:'former-buyer',cancelacion_parte_solicitante:'cliente' }
function scenario({user={id:'buyer-operator'},denied=false,denySide=false}={}) {
 const calls=[]
 const session={auth:{getUser:async()=>({data:{user}})}}
 const admin={
   from(table){calls.push(['read',table]);const q={select(fields){assert.ok(!fields.includes('*'));calls.push(['fields',fields]);return q},eq(){return q},maybeSingle:async()=>({data:job})};return q},
   rpc:async(name,args)=>{calls.push(['rpc',name,args]);return{data:{...job,parte_actor:'cliente',stripe_account_id:'must-not-return'}}},
 }
 const deps={
  '@/lib/notificaciones-contexto':{construirLinkNotificacion:()=>'/test'},
  '@/lib/i18n-servidor':{textoServidor:async t=>t},
  '@/lib/supabase/server':{createClient:async()=>session},
  '@/lib/supabase/admin':{createAdminClient:()=>{calls.push(['admin']);return admin}},
  '@/lib/empresas/identidad':{validarActorTrabajoEmpresa:async(_s,id,actor,permission,side)=>{calls.push(['guard',id,actor,permission,side]);return denied||(denySide&&side)?'No tienes permiso':undefined}},
  '@/lib/empresas/notificaciones':{destinatariosOperacionEmpresa:async(_s,_e,operator)=>[operator]},
  '@/lib/notificaciones':{crearNotificacion:async n=>calls.push(['notification',n])},
  'next/cache':{revalidatePath(){}},
  './escrow':{reembolsarPorCancelacion:async id=>{calls.push(['refund',id]);return{reutilizado:false}}},
  '@/lib/flujo-pagos':{cerrarCheckoutsPendientes:async()=>calls.push(['close-checkouts'])},
 }
 const module={exports:{}}
 const code=ts.transpileModule(fs.readFileSync('app/actions/trabajos.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{module,exports:module.exports,URL,Date,Set,require(name){assert.ok(name in deps,`Unexpected dependency ${name}`);return deps[name]}})
 return {actions:module.exports,calls}
}
let count=0
async function test(name,run){await run();count++;console.log(`PASS ${name}`)}
await test('No session or permission reaches privileged reads or mutation',async()=>{
 for(const opts of [{user:null},{denied:true}])for(const action of ['solicitarCancelacion','editarSolicitudCancelacion','retirarSolicitudCancelacion','responderCancelacion']){
  const f=scenario(opts);assert.ok((await f.actions[action]('job','reason')).error);assert.ok(!f.calls.some(c=>c[0]==='admin'))
 }
})
await test('Request/edit/withdraw use actual actor, scoped RPC, and return no contract/Stripe data',async()=>{
 for(const [action,operation]of [['solicitarCancelacion','solicitar'],['editarSolicitudCancelacion','editar'],['retirarSolicitudCancelacion','retirar']]){
  const f=scenario();const r=await f.actions[action]('job','Motivo',['https://example.test/file.pdf']);assert.equal(JSON.stringify(r),'{"data":{"ok":true}}')
  const rpc=f.calls.find(c=>c[0]==='rpc');assert.equal(rpc[1],'diime_gestionar_solicitud_cancelacion');assert.equal(rpc[2].p_actor,'buyer-operator');assert.equal(rpc[2].p_accion,operation)
  assert.equal(f.calls[0][0],'guard');assert.equal(f.calls.find(c=>c[0]==='notification')[1].usuarioId,'provider-operator');assert.equal(f.calls.find(c=>c[0]==='notification')[1].link,'/perfil-empresa')
 }
})
await test('Response denies an actor of the requesting side before financial/dispute mutations',async()=>{
 for(const accept of [true,false]){const f=scenario({denySide:true});assert.ok((await f.actions.responderCancelacion('job',accept,'Motivo')).error);assert.ok(!f.calls.some(c=>['rpc','refund'].includes(c[0])))}
})
await test('Acceptance requires finance permission on opposite contractual side and delegates refund',async()=>{
 const f=scenario({user:{id:'provider-operator'}});assert.ok((await f.actions.responderCancelacion('job',true)).data)
 const guards=f.calls.filter(c=>c[0]==='guard');assert.ok(guards.every(c=>c[3]==='gestionar_cobros'));assert.equal(guards[1][4],'proveedor');assert.ok(f.calls.some(c=>c[0]==='refund'))
 assert.equal(f.calls.find(c=>c[0]==='notification')[1].usuarioId,'buyer-operator')
})
await test('Rejection requires work permission and keeps actual responding actor in dispute RPC',async()=>{
 const f=scenario({user:{id:'provider-operator'}});assert.ok((await f.actions.responderCancelacion('job',false,'No estoy de acuerdo')).data)
 assert.ok(f.calls.filter(c=>c[0]==='guard').every(c=>c[3]==='encargos'))
 const dispute=f.calls.find(c=>c[0]==='rpc'&&c[1]==='diime_abrir_disputa');assert.equal(dispute[2].p_actor,'provider-operator');assert.equal(dispute[2].p_rechazo_cancelacion,true)
})
console.log(`${count} cancellation server-action boundary scenarios passed.`)
