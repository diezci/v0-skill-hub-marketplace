import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

let cursor=0, dirty=false, tree, observer, disconnected=false, sounds=0
let dialogs=[], notification={id:'paid-1',tipo:'pago_recibido'}
const listeners=new Map(),timers=new Map();let timerId=0
class Element {isConnected=true;closest(){return null}getClientRects(){return [{}]}}
const body=new Element(),documentElement=new Element()
const document={body,documentElement,activeElement:body,querySelectorAll:()=>dialogs,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name)}}
const slots=[], effects=[]
const hooks={
 useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{if(slots[i].value!==value){slots[i].value=value;dirty=true}}]},
 useRef(initial){const i=cursor++;return slots[i]??={current:initial}},
 useMemo(fn){cursor++;return fn()},
 useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((x,j)=>x!==slots[i].deps[j]))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}})},
}
const jsx=(type,props)=>({type,props}),ui=new Proxy({__esModule:true},{get:(o,k)=>k in o?o[k]:String(k)})
const deps={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'@/components/idioma-provider':{useT:()=>x=>x,useIdioma:()=>({idioma:'es'})},'@/lib/i18n-notificaciones':{traducirTextoNotificacion:(_,s)=>s},'@/lib/utils':{cn:()=>''}}
const module={exports:{}}
class AudioContext {constructor(){sounds++}get state(){return 'running'}get currentTime(){return 0}createOscillator(){return{frequency:{value:0},connect(){},start(){},stop(){}}}createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}close(){return Promise.resolve()}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/celebracion-notificacion.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
 module,exports:module.exports,require:name=>deps[name]||ui,
 document,HTMLElement:Element,window:{AudioContext},setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id},clearTimeout(id){timers.delete(id)},
 MutationObserver:class {constructor(fn){observer=fn}observe(){}disconnect(){disconnected=true}},
})
function render(){dirty=false;cursor=0;tree=module.exports.CelebracionNotificacion({notificacion:notification,onClose(){}});effects.splice(0).forEach(fn=>fn())}
function flush(){for(let i=0;i<8;i++){for(const[id,timer]of timers)if(timer.delay===150){timers.delete(id);timer.fn()}if(!dirty)break;render()}assert.equal(dirty,false)}
const walk=node=>Array.isArray(node)?node.flatMap(walk):node&&typeof node==='object'?[node,...walk(node.props?.children)]:[]
const content=()=>walk(tree).find(node=>node.props?.['data-diime-celebracion']==='true')
const dialog=({closed=false,hidden=false,self=false}={})=>({hasAttribute:()=>self,getAttribute:()=>closed?'closed':'open',getClientRects:()=>hidden?[]:[{}]})
dialogs=[dialog()];render();flush();assert.equal(tree,null);assert.equal(sounds,0,'An active delivery form is not interrupted visually or audibly')
dialogs=[];observer();flush();assert.equal(tree.type,'Root');assert.equal(tree.props.open,true);assert.ok(content(),'The queued notice uses the real Radix modal content');assert.equal(sounds,1,'The queued notification appears and sounds when the form closes')
dialogs=[dialog({self:true})];observer();flush();assert.ok(tree,'The celebration never hides itself')
dialogs.push(dialog());observer();flush();assert.equal(tree,null,'A subsequently opened modal also takes priority')
dialogs=[dialog({closed:true}),dialog({hidden:true})];observer();flush();assert.ok(tree);assert.equal(sounds,1,'Resuming the same notice does not repeat its sound')
notification={id:'paid-2',tipo:'pago_recibido'};render();flush();assert.equal(sounds,2,'A different notice can sound normally')
const form=new Element(),input=new Element();input.closest=selector=>selector==='form'?form:null
document.activeElement=input;listeners.get('focusin')({target:input});flush();assert.equal(tree,null,'A focused form defers celebration even without a dialog')
document.activeElement=body;listeners.get('focusin')({target:body});flush();assert.equal(tree,null,'Temporary portal focus on body does not interrupt the active form')
form.isConnected=false;const outside=new Element();document.activeElement=outside;listeners.get('focusin')({target:outside});flush();assert.ok(content());assert.equal(sounds,2,'Returning from the form does not repeat the sound')
for(const slot of slots)slot?.cleanup?.();assert.equal(disconnected,true,'Unmount removes the document observer');assert.equal(listeners.size,0,'Unmount removes the focus listener');assert.ok([...timers.values()].every(t=>t.delay!==150),'Unmount clears the deferred interaction check')
console.log('PASS: queued notifications, modal/form priority, hidden/closed dialogs, sound once and observer/focus cleanup')
