import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source=fs.readFileSync(new URL('../components/preferencia-push.tsx',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
const flush=()=>new Promise(r=>setImmediate(r))
function harness({native=true,permission,onRegister}={}){
 const previous=globalThis.window,state=[],effects=[],listeners=new Map();let cursor=0,registers=0,permissionChecks=0
 const win={addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:(n,fn)=>{if(listeners.get(n)===fn)listeners.delete(n)}}
 globalThis.window=win
 const event=detail=>listeners.get('diime:push-state')?.({detail}),noop=()=>null,jsx=(type,props)=>({type,props})
 const deps={react:{useState:init=>{const i=cursor++;state[i]=init;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useEffect:fn=>effects.push(fn),useTransition:()=>[false,fn=>fn()]},'react/jsx-runtime':{jsx,jsxs:jsx},'@/components/idioma-provider':{useT:()=>x=>x},'@capacitor/core':{Capacitor:{isNativePlatform:()=>native}},'@capacitor/push-notifications':{PushNotifications:{checkPermissions:()=>{permissionChecks++;return permission},register:async()=>{registers++;await onRegister?.(event)}}},'lucide-react':Object.fromEntries(['Bell','BellRing','CheckCircle2','Loader2','TriangleAlert'].map(x=>[x,noop])),'@/app/actions/push':{probarNotificacionPush:noop,registrarDispositivoPush:noop},'@/lib/push/client':{guardarTokenPushActual:noop},'@/components/ui/button':{Button:noop},'@/hooks/use-toast':{useToast:()=>({toast:noop})}}
 const exports={};new Function('require','exports',js)(name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name]},exports);exports.PreferenciaPush();const cleanup=effects[0]()
 return{event,state,get registers(){return registers},get permissionChecks(){return permissionChecks},unmount:()=>cleanup?.(),restore:()=>{cleanup?.();if(previous===undefined)delete globalThis.window;else globalThis.window=previous}}
}
test('a registration received while permission is pending is never overwritten as merely granted',async()=>{
 let resolve;const permission=new Promise(r=>resolve=r),h=harness({permission})
 try{h.event({registrado:true});assert.equal(h.state[0],'registered');resolve({receive:'granted'});await flush();assert.equal(h.state[0],'registered');assert.equal(h.registers,1)}finally{h.restore()}
})
test('mount after the global registration event requests the token again and displays its actual registration',async()=>{
 const h=harness({permission:Promise.resolve({receive:'granted'}),onRegister:event=>event({registrado:true})})
 try{await flush();assert.equal(h.registers,1);assert.equal(h.state[0],'registered')}finally{h.restore()}
})
test('unmount before the permission response prevents native registration and state changes',async()=>{
 let resolve;const h=harness({permission:new Promise(r=>resolve=r)})
 try{h.unmount();resolve({receive:'granted'});await flush();assert.equal(h.registers,0);assert.equal(h.state[0],'cargando')}finally{h.restore()}
})
test('denied permission does not request a token',async()=>{
 const h=harness({permission:Promise.resolve({receive:'denied'})});try{await flush();assert.equal(h.state[0],'denied');assert.equal(h.registers,0)}finally{h.restore()}
})
test('browser mode does not call native push APIs',()=>{
 const h=harness({native:false});try{assert.equal(h.state[0],'web');assert.equal(h.permissionChecks,0);assert.equal(h.registers,0)}finally{h.restore()}
})
