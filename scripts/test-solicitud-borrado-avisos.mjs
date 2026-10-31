import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import ts from 'typescript'
const source=readFileSync(new URL('../app/actions/solicitudes.ts',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function fixture({user={id:'owner'},owner='owner',state='abierta',readError=null,deleteError=null,deleted=[{id:'request'}],race=false,historical=[]}={}){
 const calls={order:[],notices:[],emails:[],deletes:0,revalidations:[]}
 const supabase={auth:{getUser:async()=>({data:{user}})},from(table){let remove=false;const q={select(){return q},eq(){return q},in(){return q},delete(){remove=true;return q},maybeSingle:async()=>({data:{cliente_id:owner,estado:state,titulo:'Petición sintética'},error:null}),then(resolve,reject){let result;if(table==='trabajos'){result={data:historical,error:null}}else if(table==='ofertas'){calls.order.push('recipients');result={data:[{profesional_id:'provider-a'},{profesional_id:'provider-a'},{profesional_id:'provider-b'}],error:readError}}else{assert.equal(table,'solicitudes');assert.ok(remove);calls.order.push('delete');calls.deletes++;result={data:race&&calls.deletes>1?[]:deleted,error:deleteError}}return Promise.resolve(result).then(resolve,reject)}};return q}}
 const dependencies={
  '@/lib/notificaciones-contexto':{construirLinkNotificacion:()=>'/mis-ofertas?solicitud=request'},
  '@/lib/i18n-servidor':{textoServidor:async text=>text},
  '@/lib/supabase/admin': { createAdminClient: () => ({ from(table) {
    assert.equal(table, 'notificaciones')
    return { insert: async rows => {
      assert.ok(calls.deletes > 0, 'No notification before actual DELETE response')
      assert.equal(deleteError, null); assert.ok(deleted.length)
      calls.order.push('notices'); calls.notices.push(...rows)
      return { error: null }
    } }
  } }) },
  '@/lib/supabase/server':{createClient:async()=>supabase},'next/cache':{revalidatePath:path=>calls.revalidations.push(path)},
  '@/lib/empresas/identidad':{},'next/server':{},'./invitaciones':{},'@/lib/moderacion':{},'@/lib/categorias':{CATEGORIAS_SERVICIO_NOMBRES:[]},'@/lib/urgencias':{},'@/lib/precios':{},'@/lib/historial-contratos':{},
  '@/lib/emails/enviar':{enviarAvisoPorEmail:async value=>{calls.order.push('email');calls.emails.push(value)}},
 }
 const exports={};new Function('require','exports',compiled)(name=>{assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name]},exports)
 return{calls,remove:()=>exports.eliminarSolicitud('request')}
}
test('successful deletion notifies each former provider once after the confirmed DELETE',async()=>{const f=fixture();assert.equal((await f.remove()).success,true);assert.deepEqual(f.calls.order,['recipients','delete','notices','email','email']);assert.deepEqual(f.calls.notices.map(n=>n.usuario_id),['provider-a','provider-b']);assert.deepEqual(f.calls.emails.map(n=>n.usuarioId),['provider-a','provider-b']);assert.equal(f.calls.revalidations.length,3)})
test('a concurrent contract rejecting DELETE never sends a withdrawal message or email',async()=>{const f=fixture({deleteError:{message:'Contrato concurrente impide borrar'}});assert.equal((await f.remove()).error,'Contrato concurrente impide borrar');assert.deepEqual(f.calls.order,['recipients','delete']);assert.equal(f.calls.notices.length,0);assert.equal(f.calls.emails.length,0);assert.equal(f.calls.revalidations.length,0)})
test('zero affected rows is not a completed deletion and sends no notice',async()=>{const f=fixture({deleted:[]});assert.ok((await f.remove()).error);assert.equal(f.calls.notices.length,0);assert.equal(f.calls.emails.length,0)})
test('two concurrent calls that read the same request only notify for the one that deletes it',async()=>{const f=fixture({race:true}),results=await Promise.all([f.remove(),f.remove()]);assert.equal(results.filter(r=>r.success).length,1);assert.equal(results.filter(r=>r.error).length,1);assert.equal(f.calls.notices.length,2);assert.equal(f.calls.emails.length,2)})
test('recipient query failure preserves the request and sends no claim of deletion',async()=>{const f=fixture({readError:{message:'lectura temporalmente no disponible'}});assert.equal((await f.remove()).error,'lectura temporalmente no disponible');assert.equal(f.calls.deletes,0);assert.equal(f.calls.notices.length,0);assert.equal(f.calls.emails.length,0)})
for(const [label,options]of[['missing session',{user:null}],['foreign actor',{owner:'another-user'}],['closed request',{state:'cerrada'}]])test(label+' is rejected before recipient lookup or DELETE',async()=>{const f=fixture(options);assert.ok((await f.remove()).error);assert.deepEqual(f.calls.order,[]);assert.equal(f.calls.deletes,0)})

test('paid historical request explains copying before any deletion or withdrawal notice',async()=>{const f=fixture({historical:[{transacciones_escrow:[{estado:'reembolsado',fecha_retencion:'2026-10-24T12:00:00Z'}]}]});assert.match((await f.remove()).error,/Publica una copia/);assert.equal(f.calls.deletes,0);assert.equal(f.calls.notices.length,0);assert.equal(f.calls.emails.length,0)})
