import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const origin='11111111-1111-4111-8111-111111111111'
const child='22222222-2222-4222-8222-222222222222'
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
function setup({user='operator',children=[],eligible=false,readError=false}={}){
  const state={user,children,eligible,readError},calls=[],exports={}
  const supabase={auth:{getUser:async()=>({data:{user:state.user?{id:state.user}:null}})},rpc:async()=>{calls.push('rpc');return state.eligible?{data:{oferta_origen_id:origin,solicitud_id:'request',empresa_id:'company',empresa_nombre:'QA',titulo:'QA'},error:null}:{data:null,error:{message:'Esta oferta no admite una nueva sustitución'}}},from(table){assert.equal(table,'ofertas');calls.push('read');const filters={};return{select(columns){assert.equal(columns,'id, estado');return this},eq(key,value){filters[key]=value;return this},in(key,value){filters[key]=value;return this},order(){return this},limit(n){assert.equal(n,1);return this},async maybeSingle(){assert.equal(filters.oferta_origen_id,origin);assert.equal(filters.profesional_id,state.user);const found=state.children.find(c=>c.oferta_origen_id===filters.oferta_origen_id&&c.profesional_id===filters.profesional_id&&filters.estado.includes(c.estado));return state.readError?{error:{message:'offline'},data:null}:{error:null,data:found?{id:found.id,estado:found.estado}:null}}}}}
  vm.runInNewContext(compile('app/actions/oferta-sustitucion.ts'),{exports,require(name){if(name==='@/lib/supabase/server')return{createClient:async()=>supabase};if(name==='@/lib/i18n-servidor')return{textoServidor:async x=>x};throw Error(name)}})
  const pageExports={},jsx=(type,props)=>({type,props}),deps={'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'Link'},'next/navigation':{redirect:()=>{throw Error('redirect')}},'@/app/actions/oferta-sustitucion':exports,'@/lib/i18n-servidor':{getT:async()=>({t:x=>x})},'@/components/empresas/oferta-sustitucion':{OfertaSustitucion:'OfferForm'}}
  vm.runInNewContext(compile('app/ofertas/sustituir/[id]/page.tsx'),{exports:pageExports,encodeURIComponent,require:name=>deps[name]})
  return{state,calls,get:()=>exports.obtenerContextoSustitucion(origin),page:()=>pageExports.default({params:Promise.resolve({id:origin})})}
}
function nodes(v,all=[]){if(Array.isArray(v))v.forEach(x=>nodes(x,all));else if(v&&typeof v==='object'){all.push(v);nodes(v.props?.children,all)}return all}
const own={id:child,oferta_origen_id:origin,profesional_id:'operator',estado:'pendiente'}
let n=0;const test=async(name,fn)=>{await fn();console.log('PASS '+name);n++}
await test('RSC revalidation changes eligible form to persisted success without reopening it',async()=>{const h=setup({eligible:true});assert.equal(nodes(await h.page()).filter(n=>n.type==='OfferForm').length,1);h.state.eligible=false;h.state.children.push(own);const tree=await h.page();assert.equal(nodes(tree).filter(n=>n.type==='OfferForm').length,0);assert.equal(nodes(tree).find(n=>n.props?.role==='status').props.children,'Oferta vinculada enviada. El cliente debe aceptar esta nueva propuesta.');assert.equal(nodes(tree).filter(n=>n.props?.role==='alert').length,0)})
await test('Recovery serializes only own child ID and current status',async()=>{const result=await setup({children:[{...own,descripcion:'private terms',archivos:['private-file']}]}).get();assert.deepEqual(JSON.parse(JSON.stringify(result)),{creada:{id:child,estado:'pendiente'}})})
await test('Another authenticated actor never receives this recovery confirmation',async()=>{const h=setup({user:'other',children:[own]});assert.ok((await h.get()).error)})
await test('Expired authentication does not query original or child',async()=>{const h=setup({user:null,children:[own]});assert.equal((await h.get()).codigo,'NO_AUTENTICADO');assert.equal(h.calls.length,0)})
await test('Read failure and closed child do not fabricate success',async()=>{assert.ok((await setup({children:[own],readError:true}).get()).error);assert.ok((await setup({children:[{...own,estado:'rechazada'}]}).get()).error)})
await test('Accepted child confirms its current status instead of asking for another acceptance',async()=>{const tree=await setup({children:[{...own,estado:'aceptada'}]}).page();assert.equal(nodes(tree).find(n=>n.props?.role==='status').props.children,'Oferta vinculada aceptada. Puedes consultar su estado.');assert.equal(nodes(tree).filter(n=>n.type==='OfferForm').length,0)})
console.log(n+' real action/page RSC regressions passed with controlled authenticated transport.')
