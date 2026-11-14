import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import ts from 'typescript'
const temp = await mkdtemp(path.join(os.tmpdir(), 'diime-direccion-test-'))
const source = await readFile(new URL('../lib/empresas/domicilio.ts', import.meta.url), 'utf8')
await writeFile(path.join(temp,'domicilio.cjs'), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)
const { candidatosCartociudad, buscarCartociudad, firmarDireccion, verificarDireccion } = createRequire(import.meta.url)(path.join(temp,'domicilio.cjs'))
after(()=>rm(temp,{recursive:true,force:true}))
const portal = { id:'13.PV.MUN_280790752919',type:'portal',address:'CALLE VELAZQUEZ 83, Madrid',postalCode:'28006',province:'Madrid',lat:40.433255,lng:-3.683655,portalNumber:83,noNumber:false }

test('solo portales numerados con coordenadas y código postal se presentan como direcciones comprobables',()=>{
  const valid=candidatosCartociudad([portal])[0]
  assert.equal(valid.domicilio,'CALLE VELAZQUEZ 83, Madrid, 28006, Madrid, España')
  for(const invalid of [null,{}, {...portal,type:'municipio'}, {...portal,noNumber:true}, {...portal,portalNumber:null}, {...portal,lat:NaN}, {...portal,lat:60}, {...portal,postalCode:''}]) assert.deepEqual(candidatosCartociudad([invalid]),[])
})
test('comprobante vinculado al usuario, empresa y domicilio, con caducidad e integridad',()=>{
  const d=candidatosCartociudad([portal])[0], now=1000000000
  const token=firmarDireccion(d,'actor','empresa','secret',now)
  assert.equal(verificarDireccion(token,'actor','empresa',d.domicilio,'secret',now).id,d.id)
  assert.equal(verificarDireccion(token,'ajeno','empresa',d.domicilio,'secret',now),null)
  assert.equal(verificarDireccion(token,'actor','otra',d.domicilio,'secret',now),null)
  assert.equal(verificarDireccion(token,'actor','empresa','Otro domicilio','secret',now),null)
  assert.equal(verificarDireccion(token,'actor','empresa',d.domicilio,'secret',now+900000),null)
  assert.equal(verificarDireccion(token+'x','actor','empresa',d.domicilio,'secret',now),null)
  assert.equal(verificarDireccion(token,'actor','empresa',d.domicilio,'wrong',now),null)
})
test('consulta acotada al proveedor oficial, sin una coincidencia genérica ni resultados inventados',async()=>{
  const result=await buscarCartociudad('Calle Velázquez 83 Madrid',async(url,options)=>{
    assert.equal(url.origin,'https://www.cartociudad.es')
    assert.equal(url.searchParams.get('q'),'Calle Velázquez 83 Madrid')
    assert.equal(options.cache,'no-store')
    return new Response(JSON.stringify([portal]),{status:200})
  })
  assert.equal(result.length,1)
  assert.deepEqual(await buscarCartociudad('Dirección desconocida 99',async()=>new Response('[]',{status:200})),[])
  await assert.rejects(()=>buscarCartociudad('Calle Velázquez 83 Madrid',async()=>new Response('',{status:503})),/no está disponible/)
  await assert.rejects(()=>buscarCartociudad('corto',async()=>assert.fail('no request')),/calle/)
})
