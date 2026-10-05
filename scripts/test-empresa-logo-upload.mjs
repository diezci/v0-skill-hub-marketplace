// Route boundary regression fixtures. No network calls or real Blob uploads.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { File } from 'node:buffer'

const empresa='10000000-0000-4000-8000-000000000001'
const otraEmpresa='10000000-0000-4000-8000-000000000002'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')
const jpeg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,0,255,217])
const webp=Uint8Array.from([...Buffer.from('RIFF'),12,0,0,0,...Buffer.from('WEBPVP8L'),1,0,0,0])
const file=(type='image/png',body=png,name='logo.png')=>new File([body],name,{type})
function scenario(options={}){
 const calls=[];let phase=0;let parsed=0
 const client={
  auth:{getUser:async()=>{
   calls.push(['auth',phase]);const after=phase++>0
   return{data:{user:options.noUser||(after&&options.expired)?null:{id:after&&options.changedUser?'other-user':'actor'}},error:options.authError?{message:'secret auth details'}:null}
  }},
  rpc:async(name,args)=>{
   const after=phase>1;calls.push(['rpc',name,args,after])
   if(after&&options.afterThrow)throw Error('secret token after upload')
   if(name==='empresa_contexto_actual')return{data:options.noCompany?null:{id:after&&options.changedCompany?otraEmpresa:empresa},error:options.contextError?{message:'secret context details'}:null}
   assert.equal(name,'empresa_comprobar_permiso');assert.equal(args.p_permiso,'perfil')
   return{data:!(options.denied||(after&&options.revoked)),error:options.permissionError?{message:'secret permission details'}:null}
  },
 }
 const blob={
  put:async(path,body,opts)=>{calls.push(['put',path,body,opts]);if(options.putError)throw Error('BLOB_READ_WRITE_TOKEN=secret');return{url:'https://store.public.blob.vercel-storage.com/new-logo.png'}},
  del:async url=>{calls.push(['del',url]);if(options.deleteError)throw Error('secret deletion failure')},
 }
 const dependencies={
  '@vercel/blob':blob,'next/server':{NextResponse:Response},
  '@/lib/supabase/server':{createClient:async()=>options.noClient?null:client},
 }
 const module={exports:{}}
 const code=ts.transpileModule(fs.readFileSync('app/api/empresas/logo/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{module,exports:module.exports,File,Uint8Array,FormData,console:{error:message=>calls.push(['log',message])},require(name){assert.ok(name in dependencies,name);return dependencies[name]}})
 async function run({image=file(),expectedCompany,files,headers={},malformed=false}={}){
  const form=new FormData();if(image!==null)form.append('file',image)
  if(files)for(const f of files)form.append('file',f)
  if(expectedCompany!==undefined)form.append('empresaId',expectedCompany)
  const request={headers:new Headers({'content-type':'multipart/form-data; boundary=test',...headers}),formData:async()=>{parsed++;if(malformed)throw Error('malformed');return form}}
  const response=await module.exports.POST(request);return{status:response.status,body:await response.json()}
 }
 return{calls,run,parsed:()=>parsed}
}
let count=0
async function test(name,run){await run();count++;console.log(`PASS ${name}`)}
await test('Session, company and current profile permission are required before parsing or Blob',async()=>{
 for(const opts of [{noClient:true},{noUser:true},{authError:true},{noCompany:true},{contextError:true},{denied:true},{permissionError:true}]){
  const f=scenario(opts),r=await f.run();assert.ok(r.status>=400);assert.equal(f.parsed(),0);assert.ok(!f.calls.some(c=>c[0]==='put'));assert.ok(!JSON.stringify(r).includes('secret'))
 }
})
await test('Each allowed image uses server-derived company path, extension, public access and random suffix',async()=>{
 for(const [mime,bytes,extension]of [['image/png',png,'png'],['image/jpeg',jpeg,'jpg'],['image/webp',webp,'webp']]){
  const f=scenario(),r=await f.run({image:file(mime,bytes,'../../another-company/attack.svg'),expectedCompany:empresa})
  assert.equal(r.status,200);assert.equal(Object.keys(r.body).join(','),'url')
  const put=f.calls.find(c=>c[0]==='put');assert.equal(put[1],`empresas/${empresa}/logo.${extension}`);assert.equal(put[3].access,'public');assert.equal(put[3].addRandomSuffix,true);assert.equal(put[3].contentType,mime)
  assert.equal(f.calls.filter(c=>c[0]==='auth').length,2);assert.equal(f.calls.filter(c=>c[1]==='empresa_comprobar_permiso').length,2);assert.ok(!f.calls.some(c=>c[0]==='del'))
 }
})
await test('A stale editor cannot choose or upload into another company',async()=>{
 const f=scenario(),r=await f.run({expectedCompany:otraEmpresa});assert.equal(r.status,409);assert.ok(!f.calls.some(c=>c[0]==='put'))
})
await test('Missing, empty, duplicate and non-file fields are rejected',async()=>{
 for(const args of [{image:null},{image:file('image/png',[])},{image:'not a file'},{files:[file()]}]){
  const f=scenario(),r=await f.run(args);assert.equal(r.status,400);assert.ok(!f.calls.some(c=>c[0]==='put'))
 }
})
await test('3MB limit is enforced on file and body before expensive parsing',async()=>{
 const over=new Uint8Array(3*1024*1024+1);over.set(png)
 const f=scenario(),r=await f.run({image:file('image/png',over)});assert.equal(r.status,413);assert.ok(!f.calls.some(c=>c[0]==='put'))
 const g=scenario(),r2=await g.run({headers:{'content-length':String(4*1024*1024)}});assert.equal(r2.status,413);assert.equal(g.parsed(),0)
 const exact=new Uint8Array(3*1024*1024);exact.set(png);assert.equal((await scenario().run({image:file('image/png',exact)})).status,200)
})
await test('SVG, unsupported MIME, disguised data and mismatched headers never reach Blob',async()=>{
 for(const image of [file('image/svg+xml','<svg/>'),file('text/plain',png),file('constructor',webp),file('image/png','<svg/>'),file('image/png',jpeg),file('image/jpeg',png),file('image/webp',png),file('image/png',png.subarray(0,8))]){
  const f=scenario(),r=await f.run({image});assert.equal(r.status,415);assert.ok(!f.calls.some(c=>c[0]==='put'))
 }
})
await test('Malformed multipart and wrong request content type return clear 400 errors',async()=>{
 for(const args of [{malformed:true},{headers:{'content-type':'application/json'}}]){const f=scenario(),r=await f.run(args);assert.equal(r.status,400);assert.ok(!f.calls.some(c=>c[0]==='put'))}
})
await test('Revoked permission, session or company change after upload deletes only new blob and exposes no URL',async()=>{
 for(const opts of [{revoked:true},{expired:true},{changedCompany:true},{changedUser:true},{afterThrow:true}]){
  const f=scenario(opts),r=await f.run();assert.ok(r.status>=400);assert.equal(r.body.url,undefined);assert.equal(f.calls.filter(c=>c[0]==='del').length,1);assert.equal(f.calls.find(c=>c[0]==='del')[1],'https://store.public.blob.vercel-storage.com/new-logo.png');assert.ok(!JSON.stringify(r).includes('secret'))
 }
})
await test('Upload and cleanup failures are sanitized and never return a successful logo',async()=>{
 for(const opts of [{putError:true},{revoked:true,deleteError:true}]){const f=scenario(opts),r=await f.run();assert.equal(r.status,500);assert.equal(r.body.url,undefined);assert.ok(!JSON.stringify(r).includes('secret'));assert.ok(f.calls.filter(c=>c[0]==='log').every(c=>!c[1].includes('secret')))}
})
console.log(`${count} company logo upload scenarios passed without network or real uploads.`)
