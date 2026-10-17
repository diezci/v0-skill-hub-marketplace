import assert from 'node:assert/strict'
import {collectorServer,localKey,syntheticAddress} from './local-mail-collector.mjs'
let checks=0
for(const value of ['qa@diime.test','Diime Test <noreply@example.test>','qa@example.com','qa@sub.example']){assert.ok(syntheticAddress(value));checks++}
for(const value of ['user@gmail.com','qa@diime.test,real@gmail.com','qa@diime.test\r\nBcc:real@gmail.com']){assert.throws(()=>syntheticAddress(value));checks++}
const sent=[],recorded=[],server=collectorServer({sendMail:async mail=>sent.push(mail),record:async row=>recorded.push(row)})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const url=`http://127.0.0.1:${server.address().port}`
const send=(body,endpoint='/emails',key=localKey)=>fetch(url+endpoint,{method:'POST',headers:{authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)})
const valid={from:'QA <noreply@example.test>',to:['a@diime.test'],subject:'Prueba local',text:'Prueba'}
try{
 assert.equal((await send(valid,'/emails','wrong')).status,401);checks++
 assert.equal((await send({...valid,to:'real@gmail.com'})).status,400);assert.equal(sent.length,0);checks++
 assert.equal((await send({...valid,attachments:[{path:'http://example.test'}]})).status,400);checks++
 for(const headers of [{'Bcc':'real@gmail.com'},{'List-Unsubscribe':'<https://example.com>'},{'List-Unsubscribe':'<http://localhost:3200>\r\nBcc:real@gmail.com'}]){assert.equal((await send({...valid,headers})).status,400);checks++}
 assert.equal((await send([valid,{...valid,to:'real@gmail.com'}],'/emails/batch')).status,400);assert.equal(sent.length,0);checks++
 const response=await send(valid);assert.equal(response.status,200);assert.match((await response.json()).id,/^[0-9a-f-]{36}$/);assert.equal(sent.length,1);checks++
 assert.equal(sent[0].disableFileAccess,true);assert.equal(sent[0].disableUrlAccess,true);checks++
 assert.equal(recorded[0].transport,'local-http-to-mailpit-smtp');checks++
 const batch=await send([valid,valid],'/emails/batch');assert.equal((await batch.json()).data.length,2);checks++
 const headers={'List-Unsubscribe':'<http://localhost:3200/mi-cuenta#avisos-email>'};assert.equal((await send({...valid,headers})).status,200);assert.deepEqual(sent.at(-1).headers,headers);checks++
 console.log(JSON.stringify({status:'pass',checks,level:'unit-local-transports-not-email-E2E'}))
}finally{await new Promise(resolve=>server.close(resolve))}
