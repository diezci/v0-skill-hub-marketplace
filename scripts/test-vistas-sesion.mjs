// Actual AppChrome and Auth SDK; controlled transport, no accounts or network.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{GoTrueClient}=createRequire(require.resolve('@supabase/supabase-js'))('@supabase/auth-js')
function sdkFixture(status=204){
 const storage=new Map(),key='view-session-'+Math.random(),token=Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:'user-A',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic'
 storage.set(key,JSON.stringify({access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:'user-A'}}))
 const sdk=new GoTrueClient({url:'https://auth.invalid',storageKey:key,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async()=>status===204?new Response(null,{status}):new Response(JSON.stringify({msg:'Auth unavailable'}),{status})})
 return {sdk,setStatus:x=>status=x}
}
const authRedirect={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/auth-redirect.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(authRedirect)
function fixture(sdk,{route='/mis-solicitudes',search='',hash='',onExpired,demo=false,logoutRequested=false}={}){
 const slots=[],effects=[],paths=[],listeners=new Map();let index=0,dirty=false,tree,children={type:'PrivateCard',props:{children:'B01 — importe e historial privados'}},mounted=true
 const jsx=(type,props)=>({type,props}),walk=x=>!x?[]:Array.isArray(x)?x.flatMap(walk):typeof x==='object'?[x,...walk(x.props?.children)]:[x]
 const hooks={useState(initial){const i=index++;if(!slots[i])slots[i]={value:initial};return [slots[i].value,v=>{const next=typeof v==='function'?v(slots[i].value):v;if(next!==slots[i].value){slots[i].value=next;dirty=true}}]},useEffect(fn,deps){const i=index++,old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn()})}}}
 const deps={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{usePathname:()=>route},'@/lib/supabase/client':{createClient:()=>({auth:sdk})},'@/lib/auth-logout':{cierreSesionSolicitado:()=>logoutRequested},'@/lib/auth-redirect':authRedirect,'@/components/idioma-provider':{useT:()=>x=>x},'@/hooks/use-viewport-adaptable':{useViewportAdaptable(){}}}
 const module={exports:{}},context={module,exports:module.exports,console,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail}},window:{addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),dispatchEvent:event=>{if(event.type==='diime:sesion-caducada')onExpired?.(event);listeners.get(event.type)?.(event);return true},location:{pathname:route,search,hash,replace:p=>paths.push({path:p,privateVisible:walk(tree).some(x=>x?.type==='PrivateCard')})},scrollTo(){},requestAnimationFrame(){return 1},cancelAnimationFrame(){}},document:{documentElement:{dataset:{}}},require:n=>deps[n]||new Proxy({__esModule:true},{get:(o,k)=>k in o?o[k]:String(k)})}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/app-chrome.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context)
 function render(){if(!mounted)return;index=0;dirty=false;tree=module.exports.AppChrome({children,actorEmpresaLocal:demo?{id:'demo'}:null});effects.splice(0).forEach(f=>f())}
 async function flush(){for(let i=0;i<12;i++){await Promise.resolve();if(dirty)render()}}
 return {paths,reauth:ruta=>context.window.dispatchEvent(new context.CustomEvent('diime:solicitar-reautenticacion',{detail:{ruta}})),get tree(){return tree},hasPrivate:()=>walk(tree).some(x=>x?.type==='PrivateCard'),async mount(){render();await flush()},flush,lateResult(){children={type:'PrivateCard',props:{children:'Respuesta privada tardía'}};render()},unmount(){mounted=false;slots.forEach(s=>s?.cleanup?.())}}
}
let count=0
for(const route of ['/mis-solicitudes','/mis-ofertas','/admin']){
 const auth=sdkFixture(503),f=fixture(auth.sdk,{route,logoutRequested:true});await f.mount();assert.ok(f.hasPrivate());const failed=await auth.sdk.signOut({scope:'local'});assert.ok(failed.error);await f.flush();assert.ok(f.hasPrivate(),'Failed logout preserves view');assert.equal(f.paths.length,0)
 auth.setStatus(204);const success=await auth.sdk.signOut({scope:'local'});assert.ifError(success.error);await f.flush();assert.equal(f.hasPrivate(),false,'Successful logout unmounts private children');assert.deepEqual(f.paths,[{path:'/',privateVisible:false}]);f.lateResult();assert.equal(f.hasPrivate(),false,'Late result cannot remount private data');f.unmount();count++;console.log('PASS '+route+': 503 retains view; successful logout hides before navigation and late result stays hidden')
}
{
 const auth=sdkFixture(),f=fixture(auth.sdk,{demo:true});await f.mount();await auth.sdk.signOut();await f.flush();assert.ok(f.hasPrivate());assert.equal(f.paths.length,0);f.unmount();count++;console.log('PASS company demo does not subscribe to real auth')
}
for(const route of ['/auth/error','/auth/login','/auth/registro']){
 const auth=sdkFixture(),f=fixture(auth.sdk,{route});await f.mount()
 await auth.sdk.signOut({scope:'local'});await f.flush()
 assert.equal(f.paths.length,0,'SIGNED_OUT must not replace a public authentication/recovery page with home')
 assert.ok(f.hasPrivate(),'The child page remains mounted on public auth routes')
 f.unmount();count++;console.log('PASS '+route+': public recovery survives SIGNED_OUT without navigation')
}
for(const logoutRequested of [false,true]){
 const route='/mi-empresa/invitaciones/synthetic-token',auth=sdkFixture(),f=fixture(auth.sdk,{route,logoutRequested})
 await f.mount();assert.ok(f.hasPrivate());await auth.sdk.signOut({scope:'local'});await f.flush()
 const destination=logoutRequested?'/':'/auth/login?next='+encodeURIComponent(route)
 assert.deepEqual(f.paths,[{path:destination,privateVisible:false}],'Lost invitation session preserves return; explicit logout preserves home destination')
 f.lateResult();assert.equal(f.hasPrivate(),false,'Delayed private result cannot remount after either session closure')
 f.unmount();count++;console.log('PASS invitation: '+(logoutRequested?'explicit logout returns home':'lost session preserves login destination'))
}
for(const override of [null,'/demandas?solicitud=owned&reanudarOferta=1','https://foreign.invalid/']){
 const auth=sdkFixture();let saved=false;const f=fixture(auth.sdk,{route:'/demandas',search:'?solicitud=owned',hash:'#formulario',onExpired:event=>{assert.equal(event.type,'diime:sesion-caducada');assert.equal(f.hasPrivate(),true,'Draft owner is still mounted during synchronous save');saved=true;if(override)event.detail.ruta=override}})
 await f.mount();await auth.sdk.signOut({scope:'local'});await f.flush();assert.ok(saved);assert.equal(f.hasPrivate(),false);const next=override===null?'/demandas?solicitud=owned#formulario':override.startsWith('/')?override:'/';assert.deepEqual(f.paths,[{path:'/auth/login?next='+encodeURIComponent(next),privateVisible:false}]);f.unmount();count++
}
for(const sdkFirst of [true,false]){
 const auth=sdkFixture(),target='/demandas?solicitud=owned&reanudarOferta=1',f=fixture(auth.sdk,{route:'/demandas',onExpired:event=>{event.detail.ruta=target}})
 await f.mount();if(!sdkFirst)f.reauth(target);await auth.sdk.signOut({scope:'local'});if(sdkFirst)f.reauth(target);await f.flush();f.reauth('/demandas?solicitud=less-precise');await f.flush()
 assert.deepEqual(f.paths,[{path:'/auth/login?next='+encodeURIComponent(target),privateVisible:false}],'Concurrent Auth and form expiry requests navigate only once and retain their first exact destination');f.lateResult();assert.equal(f.hasPrivate(),false);f.unmount();count++
}
{
 const auth=sdkFixture(),f=fixture(auth.sdk);await f.mount();f.reauth('/mis-solicitudes?solicitud=owned');await f.flush();assert.deepEqual(f.paths,[{path:'/auth/login?next='+encodeURIComponent('/mis-solicitudes?solicitud=owned'),privateVisible:false}],'An unauthenticated form can request login without an SDK event');f.unmount();count++
}
for(const formFirst of [true,false]){
 const auth=sdkFixture(),f=fixture(auth.sdk,{logoutRequested:true});await f.mount();
 if(formFirst){f.reauth('/mis-solicitudes?solicitud=expired');await f.flush();assert.equal(f.paths.length,0,'A pending form must not redirect while explicit logout is in progress')}
 await auth.sdk.signOut({scope:'local'});await f.flush();if(!formFirst){f.reauth('/mis-solicitudes?solicitud=expired');await f.flush()}
 assert.deepEqual(f.paths,[{path:'/',privateVisible:false}],'Explicit logout wins before and after a late form result, without a login navigation');f.unmount();count++
}
console.log(`OK ${count} session-view regressions; expired forms save before unmount and resume a safe exact destination`)
