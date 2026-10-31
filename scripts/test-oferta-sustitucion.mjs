import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=ts.createSourceFile('component.tsx',fs.readFileSync('components/empresas/oferta-sustitucion.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let handler
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='enviar')handler=node.getText(source);ts.forEachChild(node,visit)}visit(source);assert.ok(handler)
const code=ts.transpileModule(handler,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
function harness(){const calls=[],box={contexto:{oferta_origen_id:'original',solicitud_id:'request',empresa_id:'company',precio:999,descripcion:'private negotiation',archivos:['private-file']},precio:'150',plazo:'2',unidad:'dias',descripcion:'Entirely new terms',acepta:true,creada:null,enviando:{current:false},Number,setPending:v=>box.pending=v,setError:v=>box.error=v,setCreada:v=>box.creada=v,crearOferta:async v=>{calls.push(v);return box.response??{data:{id:'replacement'}}}};vm.createContext(box);vm.runInContext(code+';globalThis.submit=enviar',box);return{box,calls,send:()=>box.submit({preventDefault(){}})}}
let n=0;async function test(name,fn){await fn();console.log('PASS '+name);n++}
await test('New terms and lineage are sent explicitly without copying origin files or negotiation',async()=>{const h=harness();await h.send();assert.equal(h.calls.length,1);const p=h.calls[0];assert.equal(p.oferta_origen_id,'original');assert.equal(p.precio,150);assert.equal(p.descripcion,'Entirely new terms');assert.equal(Object.hasOwn(p,'archivos'),false);assert.equal(Object.hasOwn(p,'notas'),false);assert.equal(h.box.creada,'replacement')})
await test('Two synchronous submits share a single in-flight request',async()=>{const h=harness();let release;h.box.crearOferta=async p=>{h.calls.push(p);await new Promise(r=>release=r);return{data:{id:'replacement'}}};const first=h.send();await h.send();assert.equal(h.calls.length,1);release();await first;await h.send();assert.equal(h.calls.length,1)})
await test('Current permission denial preserves the new draft and shows the server error',async()=>{const h=harness();h.box.response={error:'No tienes permiso para sustituir esta oferta'};await h.send();assert.equal(h.box.error,h.box.response.error);assert.equal(h.box.descripcion,'Entirely new terms');assert.equal(h.box.creada,null);assert.equal(h.box.enviando.current,false)})
await test('Transport failure releases the synchronous guard and permits an explicit retry',async()=>{const h=harness();h.box.crearOferta=async()=>{throw Error('network')};await h.send();assert.equal(h.box.pending,false);assert.equal(h.box.enviando.current,false);assert.match(h.box.error,/Vuelve a intentarlo/);h.box.crearOferta=async()=>({data:{id:'retried'}});await h.send();assert.equal(h.box.creada,'retried')})
console.log(n+' real replacement form-handler regressions passed. Database authorization is tested separately.')
