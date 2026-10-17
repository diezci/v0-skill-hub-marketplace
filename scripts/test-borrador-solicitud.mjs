import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import * as z from 'zod'
const exports={}
new Function('require','exports',ts.transpileModule(fs.readFileSync('lib/borrador-solicitud.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(name=>{if(name==='zod')return z;if(name==='@/lib/precios')return{PRECIO_MAX:100000};throw Error(name)},exports)
const {guardarBorradorSolicitud:save,leerBorradorSolicitud:read,borrarBorradorSolicitud:clear,almacenBorradorSolicitud:storage}=exports
const entries=new Map(),store={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)}
const draft={usuarioId:'actor-A',empresaId:'a265f4c1-3162-4061-9739-f0fafbafb516',valores:{category:'Electricidad',title:'Proyecto sin terminar',description:'Descripción todavía pendiente de completar',location:'Madrid',budget:[50,500],urgency:'exacta',neededDate:'2026-10-20'},adjuntos:['foto.png','presupuesto.pdf']}
assert.equal(save(store,draft,1000),true)
assert.deepEqual(read(store,'actor-A',1001).valores,draft.valores)
assert.equal(read(store,'actor-A',1001).empresaId,draft.empresaId)
assert.deepEqual(read(store,'actor-A',1001).adjuntos,draft.adjuntos)
assert.equal(read(store,'actor-B',1001),null,'Another account never restores actor A draft')
const key=entries.keys().next().value,raw=entries.get(key)
entries.set(key,JSON.stringify({...JSON.parse(raw),usuarioId:'actor-B'}))
assert.equal(read(store,'actor-A',1001),null,'Mismatched owner is rejected even at a forged key')
entries.set(key,raw);assert.equal(read(store,'actor-A',1000+86400000),null,'Expired private draft is removed')
assert.equal(entries.size,0)
for(const value of ['{',JSON.stringify({...JSON.parse(raw),guardadoAt:2000}),JSON.stringify({...JSON.parse(raw),valores:{title:3}})]){entries.set(key,value);assert.equal(read(store,'actor-A',1001),null)}
save(store,draft,1000);clear(store,'actor-B');assert.ok(read(store,'actor-A',1001));clear(store,'actor-A');assert.equal(entries.size,0)
assert.equal(save(null,draft),false);assert.equal(read(null,'actor-A'),null)
const denied={getItem(){throw Error('denied')},setItem(){throw Error('quota')},removeItem(){throw Error('denied')}}
assert.equal(save(denied,draft),false);assert.equal(read(denied,'actor-A'),null);clear(denied,'actor-A')
Object.defineProperty(globalThis,'window',{configurable:true,value:{get sessionStorage(){throw Error('SecurityError')}}});assert.equal(storage(),null);delete globalThis.window
console.log('PASS actor isolation, expiry, malformed drafts, company identity, attachment manifest, deletion and unavailable storage')
