import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import * as z from 'zod'
const exports={}
new Function('require','exports',ts.transpileModule(fs.readFileSync('lib/borrador-oferta.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(name=>{assert.equal(name,'zod');return z},exports)
const {guardarBorradorOferta:save,leerBorradorOferta:read,borrarBorradorOferta:clear}=exports
const entries=new Map(),store={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)}
const a='0ad7e57c-64de-4782-8246-dfb564d684ac',b='bbf0204b-7c9c-40e7-b70e-65b334d64724',request='ea164e17-4b9b-4ea7-b0bd-4f9486b997ea'
const draft={usuarioId:a,solicitudId:request,empresaId:b,valores:{precio:'125',duracion:'3',unidadTiempo:'dias',descripcion:'Oferta privada que requiere nueva decisión.',materiales:'si'},adjuntos:['presupuesto.pdf']}
assert.equal(save(store,draft),true)
assert.deepEqual(read(store,a,request).valores,draft.valores)
assert.equal(read(store,b,request),null)
assert.equal(read(store,a,b),null)
const key=[...entries.keys()][0],raw=entries.get(key)
for(const changed of [{usuarioId:b},{solicitudId:b},{guardadoAt:Date.now()-86400001},{guardadoAt:Date.now()+60000},{valores:{precio:125}}]){entries.set(key,JSON.stringify({...JSON.parse(raw),...changed}));assert.equal(read(store,a,request),null);assert.equal(entries.has(key),false)}
save(store,draft);clear(store,b,request);assert.ok(read(store,a,request));clear(store,a,request);assert.equal(entries.size,0)
assert.equal(save(null,draft),false)
const denied={getItem(){throw Error('blocked')},setItem(){throw Error('quota')},removeItem(){throw Error('blocked')}}
assert.equal(save(denied,draft),false);assert.equal(read(denied,a,request),null)
console.log('PASS actor/request isolation, expired/malformed data rejection, draft preservation and unavailable storage')
