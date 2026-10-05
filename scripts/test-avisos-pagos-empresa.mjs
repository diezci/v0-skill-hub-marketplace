import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function fixture({company=true,missing=false,recipients=['principal']}={}){
 const calls=[]
 const t={cliente_id:'buyer',profesional_id:'revoked-provider',operador_proveedor_id:'revoked-provider',empresa_proveedora_id:company?'company':null}
 const admin={from(table){assert.equal(table,'trabajos');const q={select(fields){assert.ok(!fields.includes('*'));return q},eq(){return q},maybeSingle:async()=>({data:missing?null:t})};return q}}
 const dependencies={
  'server-only':{},'@/lib/stripe':{},'@/lib/stripe-liquidacion':{},'@/lib/ofertas-perdedoras':{},'@/lib/empresas/cobros':{},
  '@/lib/empresas/notificaciones':{destinatariosOperacionEmpresa:async(_s,e,o,p)=>{calls.push(['recipients',e,o,p]);return recipients}},
  '@/lib/emails/enviar':{enviarAvisoPorEmail:async data=>calls.push(['email',data.usuarioId,data.link])},
  '@/lib/push/enviar':{enviarPushAUsuario:async(id,data)=>calls.push(['push',id,data.link])},
 }
 const module={exports:{}}
 const code=ts.transpileModule(fs.readFileSync('lib/flujo-pagos.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{module,exports:module.exports,require(name){assert.ok(name in dependencies,name);return dependencies[name]}})
 return{calls,admin,send:module.exports.enviarAvisosExternos}
}
const notice={usuario_id:'revoked-provider',tipo:'pago_liberado',titulo:'Pago liberado',mensaje:'95 EUR',link:'/mis-trabajos',metadata:{trabajo_id:'job',parte_destinataria:'proveedor'}}
let n=0
async function test(name,run){await run();n++;console.log(`PASS ${name}`)}
await test('Company payout emails and push go only to authorized current recipients',async()=>{
 const f=fixture();await f.send([notice],f.admin)
 assert.deepEqual(f.calls.filter(x=>x[0]!=='recipients'),[['email','principal','/perfil-empresa'],['push','principal','/perfil-empresa']]);assert.equal(f.calls[0][3],'ver_cobros')
})
await test('Operational paid notice uses work scope without granting financial visibility',async()=>{
 const f=fixture();await f.send([{...notice,tipo:'pago_recibido'}],f.admin);assert.equal(f.calls[0][3],'encargos')
})
await test('No eligible recipient, missing job, or missing privileged context sends nothing',async()=>{
 for(const opts of [{recipients:[]},{missing:true}]){const f=fixture(opts);await f.send([notice],f.admin);assert.ok(!f.calls.some(x=>x[0]==='email'||x[0]==='push'))}
 const f=fixture();await f.send([notice]);assert.equal(f.calls.length,0)
})
await test('Personal contractual notifications keep their original recipient and route',async()=>{
 const f=fixture({company:false});await f.send([notice],f.admin);assert.deepEqual(f.calls,[['email','revoked-provider','/mis-trabajos'],['push','revoked-provider','/mis-trabajos']])
})
await test('Suppressed INSERT nulls and ambiguous company destination do not send details',async()=>{
 const f=fixture();await f.send([null,{...notice,usuario_id:'unknown',metadata:{trabajo_id:'job'}}],f.admin);assert.equal(f.calls.length,0)
})
console.log(`${n} financial external-notice scenarios passed without delivery.`)
