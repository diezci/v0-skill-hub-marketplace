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

const {huellaAdjuntoSolicitud:fingerprint,guardarReferenciaAdjuntoSolicitud:reference,recuperarReferenciaAdjuntoSolicitud:recover}=exports
const context={usuarioId:'actor-A',envioId:'da7bfcec-a4af-41bf-8809-c94c0cc1715f',origen:'https://diime.invalid'}
const file=new File(['original content'],'plano.pdf',{type:'application/pdf'}),same=new File(['original content'],'plano.pdf',{type:'application/pdf'}),changed=new File(['modified content'],'plano.pdf',{type:'application/pdf'})
const digest=await fingerprint(file),url='https://diime.invalid/api/archivos/4a712101-2f97-435c-9f18-882b3eb6c2ce?nombre=plano.pdf',ref=reference(context,file,digest,url)
assert.ok(ref)
assert.equal(recover([ref],context,same,await fingerprint(same)),url)
assert.equal(recover([ref],context,changed,await fingerprint(changed)),null,'Same name and size with different bytes cannot reuse a reference')
for(const other of [{...context,usuarioId:'actor-B'},{...context,envioId:'7e6fd47d-e44b-4d56-bf31-5e7c121b92b5'},{...context,origen:'https://foreign.invalid'}])assert.equal(recover([ref],other,same,digest),null)
for(const candidate of [url.replace('diime.invalid','foreign.invalid'),url+'&token=secret',url.replace('/api/archivos/','/storage/v1/object/sign/'),url.replace('https://','https://user:password@'),url+'#token'])assert.equal(reference(context,file,digest,candidate),null,'External, credentialed and signed references are not cached')
assert.equal(recover([ref],context,new File(['original content'],'different.pdf',{type:'application/pdf'}),digest),null)
assert.equal(recover([ref],context,new File(['original content'],'plano.pdf',{type:'text/plain'}),digest),null)
assert.equal(save(store,{...draft,envioId:context.envioId,subidas:[ref]},1000),true)
assert.deepEqual(read(store,'actor-A',1001).subidas,[ref])
clear(store,'actor-A');assert.equal(read(store,'actor-A',1001),null)
console.log('PASS exact private upload recovery, changed bytes, user/send/metadata isolation, unsafe URL rejection and reference cleanup')
