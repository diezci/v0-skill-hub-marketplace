import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
const source=fs.readFileSync('lib/cancelacion-adjuntos.ts','utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const local='http://127.0.0.1:3200/api/archivos/595251b6-84f6-4e9f-b049-649857198cda?nombre=prueba.txt'
const qa={DIIME_QA_PROFILE:'sandbox',DIIME_E2E_LOCAL:'1',NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:3200'}
function validator(env){const box={exports:{},URL,process:{env}};vm.runInNewContext(js,box);return box.exports.validarAdjuntosCancelacion}
let checks=0
function test(name,fn){fn();checks++;console.log('PASS '+name)}
test('Local private attachment works only with all three sandbox gates',()=>{assert.ok(validator(qa)([local]).archivos);for(const key of Object.keys(qa)){const env={...qa};delete env[key];assert.ok(validator(env)([local]).error)}})
test('Production keeps HTTP private links rejected',()=>assert.ok(validator({NEXT_PUBLIC_SITE_URL:'https://diime.es'})([local]).error))
test('Sandbox refuses other ports, hosts and non-file routes',()=>{for(const url of [local.replace(':3200',':3201'),local.replace('127.0.0.1','localhost'),local.replace('/api/archivos/','/api/otro/'),local.replace('595251b6-84f6-4e9f-b049-649857198cda','no-uuid'),'http://evil.test/'+local])assert.ok(validator(qa)([url]).error)})
test('Only HTTPS remains accepted outside sandbox',()=>{assert.ok(validator({})(['https://diime.es/api/archivos/id']).archivos);for(const url of ['javascript:alert(1)','data:text/plain,test','ftp://host/file','no-url','https://user:password@diime.es/file'])assert.ok(validator(qa)([url]).error)})
test('Malformed values return errors and do not throw',()=>{for(const value of [{},'url',[{}],[null],[42]])assert.ok(validator(qa)(value).error)})
test('Deduplication and five-file limit remain enforced',()=>{const v=validator(qa);assert.equal(v([local,' '+local+' ']).archivos.length,1);assert.ok(v(Array.from({length:5},(_,i)=>'https://diime.es/'+i)).archivos);assert.ok(v(Array.from({length:6},(_,i)=>'https://diime.es/'+i)).error);assert.equal(v(undefined).archivos.length,0)})
console.log(JSON.stringify({checks,status:'pass'}))
