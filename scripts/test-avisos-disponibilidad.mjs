import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source=readFileSync(new URL('../app/actions/invitaciones.ts',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const people=[
 {id:'eligible',disponible:true,categorias_interes:['Electricidad'],provincias_cobertura:['Ceuta']},
 {id:'unavailable',disponible:false,categorias_interes:['Electricidad'],provincias_cobertura:['Ceuta']},
 {id:'legacy-null',disponible:null,categorias_interes:['Electricidad'],provincias_cobertura:['Ceuta']},
 {id:'deleted',disponible:false,categorias_interes:[],provincias_cobertura:[]},
 {id:'other-category',disponible:true,categorias_interes:['Pintura y decoración'],provincias_cobertura:['Ceuta']},
 {id:'other-province',disponible:true,categorias_interes:['Electricidad'],provincias_cobertura:['Madrid']},
 {id:'owner',disponible:true,categorias_interes:['Electricidad'],provincias_cobertura:['Ceuta']},
]
let assertions=0
for(const active of [true,false]){
 const notifications=[],emails=[],module={exports:{}}
 const current=people.map(p=>({...p,disponible:p.id==='eligible'?active:p.disponible}))
 const client={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from(table){
  let result=table==='profesionales'?current:[{id:'request',cliente_id:'owner',estado:'abierta',titulo:'QA electricidad',ubicacion:'Ceuta',categorias:{nombre:'Electricidad'}}]
  const query={select(){return query},eq(key,value){result=result.filter(p=>p[key]===value);return query},contains(key,values){result=result.filter(p=>values.every(v=>p[key]?.includes(v)));return query},maybeSingle:async()=>({data:result[0]??null,error:null}),then(resolve,reject){return Promise.resolve({data:result,error:null}).then(resolve,reject)}};return query
 }}
 const dependencies={
  '@/lib/supabase/server':{createClient:async()=>client},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({insert:async rows=>{notifications.push(...rows);return{error:null}}})})},
  '@/lib/i18n-servidor':{textoServidor:async text=>text},
  '@/lib/filtros-notificaciones':{encajaEnPresupuestoDeAvisos:()=>true},
  '@/lib/utils':{formatearRangoPresupuesto:()=>'A convenir'},
  '@/lib/notificaciones-contexto':{construirLinkNotificacion:()=>'/demandas?solicitud=request'},
  '@/lib/emails/enviar':{enviarAvisoPorEmail:async data=>emails.push(data)},
 }
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{assert.ok(dependencies[name],name);return dependencies[name]},console},{filename:'app/actions/invitaciones.ts'})
 const result=await module.exports.buscarYEnviarInvitaciones('request')
 assert.deepEqual(notifications.map(n=>n.usuario_id),active?['eligible']:[]);assertions++
 assert.deepEqual(emails.map(n=>n.usuarioId),active?['eligible']:[]);assertions++
 assert.equal(result.success===true,active);assertions++
}
console.log(`OK: ${assertions} assertions; eligible, unavailable, null, deleted, category, province and self exclusions`)
