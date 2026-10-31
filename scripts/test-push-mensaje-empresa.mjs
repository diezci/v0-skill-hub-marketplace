import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const js=ts.transpileModule(fs.readFileSync(new URL('../lib/push/mensaje-empresa.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const exports={};new Function('exports',js)(exports)
const {prepararPushMensajeEmpresa:prepare,entregarPushMensajeEmpresa:deliver}=exports
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const base={id:id(9),conversacion_id:id(10),remitente_id:id(1),contenido:'hola',tipo:'texto',remitente_nombre:'Persona',empresa_nombre:'Empresa'}
test('only unique canonical recipients receive push and the private field is removed',()=>{
 const result=prepare({...base,destinatarios_push:[id(1),id(2),id(2),null,'invalid',id(3)]},id(1))
 assert.deepEqual(result.destinatarios,[id(2),id(3)]);assert.deepEqual(result.publico,base)
 assert.equal(result.aviso.link,`/mensajes?c=${id(10)}`);assert.equal(result.aviso.titulo,'Empresa')
})
test('older database response and invalid conversation fail closed without profile fallbacks',()=>{
 assert.deepEqual(prepare(base,id(1)).destinatarios,[])
 assert.deepEqual(prepare({...base,conversacion_id:'bad',destinatarios_push:[id(2)]},id(1)).destinatarios,[])
})
test('canonical attachment preview and bounded text do not expose file URLs',()=>{
 assert.equal(prepare({...base,tipo:'imagen',archivo_url:'secret'},id(1)).aviso.cuerpo,'📷 Imagen')
 assert.equal(prepare({...base,tipo:'archivo'},id(1)).aviso.cuerpo,'📎 Archivo')
 assert.equal(prepare({...base,contenido:'a'.repeat(200)},id(1)).aviso.cuerpo.length,160)
})
test('one failing device delivery does not abort other recipients and concurrency stays at four',async()=>{
 let active=0,max=0;const seen=[]
 await deliver(Array.from({length:11},(_,i)=>id(i+2)),prepare(base,id(1)).aviso,async recipient=>{
  active++;max=Math.max(max,active);seen.push(recipient);await new Promise(r=>setImmediate(r));active--;if(recipient===id(3))throw Error('offline')
 })
 assert.equal(max,4);assert.equal(seen.length,11);assert.equal(new Set(seen).size,11)
})
