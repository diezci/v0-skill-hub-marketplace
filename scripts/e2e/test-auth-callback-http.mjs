import fs from'node:fs';import assert from'node:assert/strict';
const base='http://localhost:3200',dir='.build/e2e-20261014',run='auth-callback-http-'+Date.now(),checks=[];
for(const destination of ['/mis-solicitudes?estado=abierta#solicitud-prueba','https://example.com','//example.com','/\\example.com','/\nexample.com']){
 const safe=destination==='/mis-solicitudes?estado=abierta#solicitud-prueba'?destination:'/';
 for(const code of ['invalid','invalid','']){
  const url=new URL('/auth/callback',base);url.searchParams.set('next',destination);if(code)url.searchParams.set('code',code);
  const response=await fetch(url,{redirect:'manual'});assert.equal(response.status,307);const target=new URL(response.headers.get('location'),base);assert.equal(target.origin,base);assert.equal(target.pathname,'/auth/error');assert.equal(target.searchParams.get('next'),safe);
  const page=await fetch(target,{redirect:'manual'});assert.equal(page.status,200);const body=await page.text();assert.ok(body.includes('El enlace no es válido, ha caducado o ya se ha utilizado'));assert.ok(body.includes('/auth/login?next='+encodeURIComponent(safe)));assert.ok(body.includes('/auth/recuperar-contrasena'));
  checks.push({destination,code,pass:true,status:response.status,errorPage:target.pathname,safeReturn:safe,clearRecovery:true});
 }
}
fs.writeFileSync(dir+'/'+run+'.json',JSON.stringify({run,checks,scope:'Actual local Next HTTP callback and rendered recovery HTML; no cookies, OAuth provider or real code exchange'},null,2));
for(const caseId of ['CP-008','CP-028'])fs.appendFileSync(dir+'/root-continuation-events.jsonl',JSON.stringify({eventId:run+'-'+caseId,at:new Date().toISOString(),caseId,roleKey:'visitante',level:'api_e2e',scope:'partial',status:'pass',assertions:[{name:'Actual invalid, repeated-invalid and missing-code callbacks reject external/backslash/control destinations, preserve internal query/hash and show recovery links',pass:true}],evidence:[{layer:'api',path:run+'.json'}],limitations:['Successful browser login and previously used real authorization code remain to be exercised; no OAuth account flow inferred.']})+'\n');
console.log('PASS',checks.length,'HTTP callback/recovery checks',run);
