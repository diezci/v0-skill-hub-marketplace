import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'

// Executes the actual server action with an authenticated, RLS-shaped client.
const source=ts.transpileModule(readFileSync(new URL('../app/actions/messages.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const plain=value=>JSON.parse(JSON.stringify(value))
const base={id:'thread',empresarial:true,participante_1:'client',participante_2:'provider',empresa_1_id:'company',empresa_2_id:null,mi_rol:'cliente',rol_otro:'proveedor',solicitud_id:'request',trabajo_id:null,puede_escribir:true,unread_count:2}
function scenario({conversations=[base],requests=[{id:'request',titulo:'Proyecto visible',estado:'abierta'}],jobs=[],authenticated=true,rpcError=null,readError=null}={}){
 const reads=[]
 const supabase={auth:{getUser:async()=>({data:{user:authenticated?{id:'operator'}:null}})},rpc:async name=>name==='usuarios_incompatibles'?{data:[]}:{data:conversations,error:rpcError},from(table){
  const q={select(columns){assert.ok(!/\*/.test(columns));return q},or(){return q},order:async()=>({data:[]}),async in(column,ids){assert.equal(column,'id');assert.ok(['solicitudes','trabajos'].includes(table));reads.push({table,ids:[...ids]});return{data:(table==='solicitudes'?requests:jobs).filter(row=>ids.includes(row.id)),error:readError}}};return q
 }}
 const module={exports:{}};runInNewContext(source,{module,exports:module.exports,require(name){if(name==='@/lib/supabase/server')return{createClient:async()=>supabase};if(name==='@/lib/i18n-servidor')return{textoServidor:async text=>text};return{}},console})
 return{run:()=>module.exports.obtenerConversaciones(),reads}
}
let checks=0
const open=scenario(),a=plain(await open.run());assert.deepEqual(a.data[0].proyecto,{titulo:'Proyecto visible',estado:'abierta'});checks++
const {proyecto,...identity}=a.data[0];assert.deepEqual(identity,base);checks++
assert.deepEqual(open.reads,[{table:'solicitudes',ids:['request']}]);checks++
const contract=scenario({conversations:[{...base,trabajo_id:'job'}],jobs:[{id:'job',titulo:'Contrato vigente',estado:'en_progreso',progreso:50}]});assert.deepEqual(plain((await contract.run()).data[0].proyecto),{titulo:'Contrato vigente',estado:'en_progreso',progreso:50});checks++
const dedup=scenario({conversations:[base,{...base,id:'second'}]});await dedup.run();assert.deepEqual(dedup.reads,[{table:'solicitudes',ids:['request']}]);checks++
const denied=scenario({requests:[]});assert.equal((await denied.run()).data[0].proyecto,null);checks++
const inaccessible=scenario({requests:[{id:'foreign',titulo:'Secret',estado:'abierta'}]});assert.equal((await inaccessible.run()).data[0].proyecto,null);checks++
const noContext=scenario({conversations:[{...base,solicitud_id:null}]});assert.equal((await noContext.run()).data[0].proyecto,null);assert.equal(noContext.reads.length,0);checks+=2
const failed=scenario({readError:{message:'RLS read unavailable'}});assert.equal((await failed.run()).error,'RLS read unavailable');checks++
const revoked=scenario({conversations:[]});assert.deepEqual(plain((await revoked.run()).data),[]);assert.equal(revoked.reads.length,0);checks+=2
const rpcFailure=scenario({rpcError:{message:'Access revoked'}});assert.equal((await rpcFailure.run()).error,'Access revoked');assert.equal(rpcFailure.reads.length,0);checks+=2
const anon=scenario({authenticated:false});assert.equal((await anon.run()).codigo,'NO_AUTENTICADO');assert.equal(anon.reads.length,0);checks+=2
console.log(`OK: ${checks} comprobaciones de contexto empresarial con el handler real; identidad, RLS, errores y ausencia de acceso, sin red.`)
