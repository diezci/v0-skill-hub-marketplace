import fs from 'node:fs';
import assert from 'node:assert/strict';
const d='.build/e2e-20261014';
const read=n=>JSON.parse(fs.readFileSync(d+'/'+n));
const batch=read('delivery-browser-fixtures.json');
const before=read('browser/CP013-client-failed-checks.json');
const after=read('browser/CP013-client-recovered-checks.json');
const eventsFile=d+'/root-continuation-events.jsonl';
for(const j of batch.jobs) {
 assert.equal(j.failEnabled,false);
 const failed=read(`delivery-browser-${j.pa}-failed.json`), recovered=read(`delivery-browser-${j.pa}-recovered.json`);
 assert.equal(failed.state,'en_progreso');assert.equal(failed.progress,0);assert.equal(failed.history.length,0);assert.equal(failed.notices.length,0);
 assert.equal(recovered.state,'entregado');assert.equal(recovered.progress,100);assert.equal(recovered.history.length,1);assert.equal(recovered.history[0].mensaje,j.message);assert.equal(recovered.notices.length,1);
 assert.equal(before.find(x=>x.alias===j.pa).zeroProgress,true);assert.equal(before.find(x=>x.alias===j.pa).noConfirmation,true);
 for(const field of ['confirmation','historyMessage','pending']) assert.equal(after.find(x=>x.alias===j.pa)[field],true);
 const browserFiles=[`CP013-${j.pa}-error-dom.txt`,`CP013-${j.pa}-reload-failed.txt`,`CP013-${j.pa}-recovered.txt`,'CP013-cliente-failed.txt','CP013-cliente-recovered.txt','CP013-client-failed-checks.json','CP013-client-recovered-checks.json'].map(n=>'browser/'+n);
 assert.ok(fs.readFileSync(d+'/'+browserFiles[0],'utf8').includes(j.message));
 assert.ok(fs.readFileSync(d+'/'+browserFiles[1],'utf8').includes('Entregar Trabajo'));
 assert.ok(fs.readFileSync(d+'/'+browserFiles[2],'utf8').includes('Esperando confirmación del cliente'));
 const event={eventId:'root-CP013-browser-'+j.pa,caseId:'CP-013',roleKey:j.roleKey,level:'browser_e2e',scope:'full',status:'pass',at:new Date().toISOString(),assertions:[{name:'Fallo controlado de historial muestra error y conserva el mensaje; tras recargar ambas partes mantienen el trabajo en progreso sin aviso de entrega',pass:true},{name:'Reintento en navegador crea una sola entrega e historial; ambas partes muestran estado pendiente de confirmación y cliente lee el mensaje',pass:true}],evidence:[...browserFiles.map(path=>({layer:'browser',path})),...['failed','recovered'].map(phase=>({layer:'db',path:`delivery-browser-${j.pa}-${phase}.json`}))],stepsPending:[],limitations:['Pago retenido preparado mediante SQL en contratos sintéticos locales; este caso no prueba Stripe ni la contratación inicial. Se probó cada rol por separado.'],cleanup:{faultInjectionRemoved:true}};
 assert.ok(!fs.readFileSync(eventsFile,'utf8').includes('"eventId":"'+event.eventId+'"'));fs.appendFileSync(eventsFile,JSON.stringify(event)+'\n');console.log({caseId:'CP-013',actor:j.pa,result:'pass'});
}
