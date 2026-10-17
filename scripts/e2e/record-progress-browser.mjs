import fs from 'node:fs';import assert from 'node:assert/strict';
const d='.build/e2e-20261014',read=n=>JSON.parse(fs.readFileSync(d+'/'+n)),batch=read('progress-browser-fixtures.json'),client=read('browser/T095-client-checks.json'),api=read(batch.source),out=d+'/root-continuation-events.jsonl';
for(const j of batch.jobs) {
 assert.equal(j.failEnabled,false);assert.ok(api.checks.find(x=>x.alias===j.pa).pass);
 const failed=read(`progress-browser-${j.pa}-failed.json`),recovered=read(`progress-browser-${j.pa}-recovered.json`),final=read(`progress-browser-${j.pa}-final.json`);
 assert.equal(failed.progreso,100);assert.equal(failed.history.length,4);assert.equal(failed.notices.length,4);
 assert.equal(recovered.progreso,25);assert.equal(recovered.history.length,5);assert.equal(recovered.notices.length,5);assert.equal(recovered.history.at(-1).mensaje,j.message);
 assert.equal(final.progreso,75);assert.equal(final.estado,'en_progreso');assert.equal(final.history.length,6);assert.equal(final.notices.length,6);assert.equal(final.history.at(-1).mensaje,'Avance al 75 por ciento T095 '+j.pa);
 for(const key of ['progress75','firstComment','secondComment','dated'])assert.equal(client.find(x=>x.alias===j.pa)[key],true);
 const errorFile=`browser/T097-${j.pa}-error-dom.txt`,error=fs.readFileSync(d+'/'+errorFile,'utf8');assert.ok(error.includes('QA_BROWSER_PROGRESS_FAILURE'));assert.ok(error.includes(j.message));
 const files=[errorFile,`browser/T097-${j.pa}-recovered25.txt`,`browser/T095-${j.pa}-proveedor75.txt`,'browser/T095-cliente-historial.txt','browser/T095-client-checks.json'];
 for(const caseId of ['T-095','T-097']) {
  const event={eventId:`root-${caseId}-browser-${j.pa}`,caseId,roleKey:j.roleKey,level:'browser_e2e',scope:'full',status:'pass',at:new Date().toISOString(),assertions:caseId==='T-095'?[{name:'Guardar 25 y 75 por ciento con comentario en navegador conserva ambos mensajes, fechas y avisos; cliente y proveedor ven el mismo progreso',pass:true}]:[{name:'Entradas inválidas por HTTP/Flight y RPC son rechazadas; fallo del historial en navegador muestra error, conserva formulario y revierte porcentaje sin enviar aviso',pass:true},{name:'El mismo formulario se reintenta sin volver a escribir el comentario y guarda exactamente una actualización',pass:true}],evidence:[...files.map(path=>({layer:'browser',path})),{layer:'api',path:batch.source},...['failed','recovered','final'].map(p=>({layer:'db',path:`progress-browser-${j.pa}-${p}.json`}))],stepsPending:[],limitations:['Contrato pagado preparado en SQL local. NaN, fracciones y fuera de rango enviados por llamadas HTTP reales porque la interfaz limita el slider; fallo y recuperación ejecutados en navegador.'],cleanup:{faultInjectionRemoved:true}};
  assert.ok(!fs.readFileSync(out,'utf8').includes('"eventId":"'+event.eventId+'"'));fs.appendFileSync(out,JSON.stringify(event)+'\n');console.log({caseId,actor:j.pa,result:'pass'});
 }
}
