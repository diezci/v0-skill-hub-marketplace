import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {generateKeyPairSync,createSign} from 'node:crypto'
import {EventEmitter} from 'node:events'
import vm from 'node:vm'
import ts from 'typescript'

const key=generateKeyPairSync('ec',{namedCurve:'prime256v1',privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey
function sender(env,responses){
 const hosts=[],source=readFileSync(new URL('../lib/push/enviar.ts',import.meta.url),'utf8')+'\nexport { enviarIos };'
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const module={exports:{}}
 const connect=host=>{hosts.push(host);const client=new EventEmitter();client.close=()=>{};client.setTimeout=()=>{};client.request=()=>{const request=new EventEmitter();request.setEncoding=()=>{};request.end=()=>setImmediate(()=>{const next=responses.shift();assert.ok(next);request.emit('response',{':status':next.status});request.emit('data',JSON.stringify({reason:next.reason}));request.emit('end')});return request};return client}
 vm.runInNewContext(compiled,{module,exports:module.exports,process:{env:{APNS_PRIVATE_KEY:key,APNS_KEY_ID:'QA00000000',APPLE_TEAM_ID:'QA00000000',APNS_BUNDLE_ID:'es.diime.qa.workflow',...env}},Buffer,setTimeout,clearTimeout,console:{warn(){},info(){},error(){}},require:n=>n==='node:crypto'?{createSign}:n==='node:http2'?{connect}:{}},{filename:'lib/push/enviar.ts'})
 return{send:()=>module.exports.enviarIos('0'.repeat(64),{titulo:'QA',cuerpo:'Synthetic'}),hosts}
}
test('QA refuses a production APNs host before making a network connection',async()=>{
 for(const APNS_ENVIRONMENT of [undefined,'production','typo']){const s=sender({DIIME_QA_PROFILE:'sandbox',APNS_ENVIRONMENT},[]);assert.equal((await s.send()).ok,false);assert.equal(s.hosts.length,0)}
})
test('explicit sandbox authentication rejection neither contacts production nor disables a valid device',async()=>{
 const s=sender({DIIME_QA_PROFILE:'sandbox',APNS_ENVIRONMENT:'sandbox'},[{status:403,reason:'InvalidProviderToken'}]);const r=await s.send();assert.equal(r.ok,false);assert.equal(r.permanente,false);assert.equal(r.detalle,'InvalidProviderToken');assert.deepEqual(s.hosts,['https://api.sandbox.push.apple.com'])
})
test('explicit sandbox never retries a bad token against production',async()=>{
 const s=sender({APNS_ENVIRONMENT:'sandbox'},[{status:400,reason:'BadDeviceToken'}]);assert.equal((await s.send()).permanente,true);assert.deepEqual(s.hosts,['https://api.sandbox.push.apple.com'])
})
test('existing automatic routing keeps its production to sandbox fallback',async()=>{
 const s=sender({},[{status:400,reason:'BadDeviceToken'},{status:200}]);assert.equal((await s.send()).ok,true);assert.deepEqual(s.hosts,['https://api.push.apple.com','https://api.sandbox.push.apple.com'])
})
