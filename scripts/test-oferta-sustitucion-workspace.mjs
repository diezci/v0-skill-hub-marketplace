import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
const member={usuario_id:'owner',nombre:'QA',rol:'principal',estado:'activo',permisos:{encargos:true,presupuestos:true},tiene_perfil_profesional:true}
const op=(id,extra={})=>({id,oferta_origen_id:id==='replacement'?'original':null,titulo:id,descripcion:id,estado:'pendiente',fecha:'2026-10-24',actor_usuario_id:'old-author',actor_nombre:'Old author',precio:100,parte:'cliente',...extra})
async function load({rows=[op('original'),op('replacement'),op('unrelated')],error=false}={}){
  const calls=[],exports={};const supabase={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async()=>error?{data:null,error:{message:'Synthetic RPC failure'}}:{data:{empresa:{id:'company',nombre:'QA'},miembros:[member],invitaciones:[],actividad:[],usuario_id:'owner',es_titular:true,operaciones:{solicitudes:[],ofertas:rows,trabajos:[]}},error:null},from(){calls.push('unexpected select');throw Error('Workspace must retain its existing RPC authorization')}}
  vm.runInNewContext(compile('lib/empresas/production-store.ts'),{exports,require(name){if(name==='server-only')return{};if(name==='react')return{cache:fn=>fn};if(name==='@/lib/supabase/server')return{createClient:async()=>supabase};throw Error(name)}})
  return{result:await exports.espacioEmpresaReal(),calls}
}
function render(espacio,operationId=''){
  const exports={},jsx=(type,props,key)=>({type,props,key}),deps={react:{useState:initial=>[initial,()=>{}],useTransition:()=>[false,fn=>fn()]},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'next/navigation':{useRouter:()=>({refresh(){},push(){}})},'next/link':{default:'Link'},'@/components/idioma-provider':{useT:()=>x=>x,useIdioma:()=>({idioma:'es'})},'@/lib/i18n':{localeDe:()=> 'es-ES'}}
  vm.runInNewContext(compile('components/empresas/operaciones-empresa.tsx'),{exports,Date,Intl,Map,Set,require:name=>deps[name]??new Proxy({},{get:(_t,key)=>String(key)})})
  return exports.OperacionesEmpresa({espacio,operacionInicial:{tipo:'ofertas',id:operationId}})
}
function nodes(value,all=[]){if(Array.isArray(value))value.forEach(v=>nodes(v,all));else if(value&&typeof value==='object'){all.push(value);nodes(value.props?.children,all)}return all}
function text(value){if(value==null||typeof value==='boolean')return'';if(Array.isArray(value))return value.map(text).join(' ');if(typeof value==='object')return text(value.props?.children);return String(value)}
let count=0;const test=async(name,fn)=>{await fn();console.log('PASS '+name);count++}
const {result,calls}=await load()
await test('Workspace maps lineage from the already authorized RPC without an extra SELECT',async()=>{assert.equal(calls.length,0);assert.equal(result.data.operaciones.ofertas.find(o=>o.id==='replacement').ofertaOrigenId,'original')})
await test('Failed workspace RPC cannot show acceptance controls',async()=>{const h=await load({error:true});assert.ok(h.result.error);assert.equal(h.result.data,undefined)})
await test('More than1000 RPC offer rows are mapped without truncation or extra reads',async()=>{const h=await load({rows:Array.from({length:1001},(_,i)=>op('quote-'+i))});assert.equal(h.result.data.operaciones.ofertas.length,1001);assert.equal(h.calls.length,0)})
await test('Empty offers need no additional database query',async()=>{const h=await load({rows:[]});assert.equal(h.calls.length,0);assert.ok(h.result.data)})
await test('Historical original cannot be accepted; child and unrelated quote still can',async()=>{const tree=render(result.data);const cards=nodes(tree).filter(n=>n.type==='Card');for(const [id,expected]of[['original',0],['replacement',1],['unrelated',1]]){const card=cards.find(n=>n.key===id+'-cliente');assert.ok(card);assert.equal(nodes(card).filter(n=>n.type==='AceptarOfertaEmpresa').length,expected)}assert.match(text(tree),/Oferta original conservada como historial/);assert.match(text(tree),/Requiere tu aceptación independiente/)})
await test('Filtering to original does not forget its unshown child',async()=>{const tree=render(result.data,'original');assert.equal(nodes(tree).filter(n=>n.type==='AceptarOfertaEmpresa').length,0);assert.match(text(tree),/Oferta original conservada como historial/)})
await test('Closing child does not make immutable original acceptable again',async()=>{const input=structuredClone(result.data);input.operaciones.ofertas.find(o=>o.id==='replacement').estado='rechazada';const tree=render(input,'original');assert.equal(nodes(tree).filter(n=>n.type==='AceptarOfertaEmpresa').length,0)})
await test('Current management permission remains required for a new child',async()=>{const input=structuredClone(result.data);input.miembroActual.permisos.encargos=false;assert.equal(nodes(render(input)).filter(n=>n.type==='AceptarOfertaEmpresa').length,0)})
console.log(count+' real workspace loader/render regressions passed; transport is controlled, not browser E2E.')
