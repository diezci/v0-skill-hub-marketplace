import fs from 'node:fs'
import assert from 'node:assert/strict'
const dir='.build/e2e-20261014', file=dir+'/root-continuation-events.jsonl'
const read=name=>fs.readFileSync(dir+'/'+name,'utf8')
const proof=JSON.parse(read('eur-nominal-full-proof.json'))
assert.equal(proof.jobState,'completado')
assert.equal(proof.escrowState,'completado')
assert.equal(proof.settlementState,'completada')
assert.equal(proof.transfers,1)
assert.equal(proof.transfer.amount,9000)
assert.equal(proof.transfer.currency,'eur')
assert.equal(proof.transfer.livemode,false)
const nominalFiles=['EUR-nominal-cliente-entregado','EUR-nominal-cliente-completado','EUR-nominal-proveedor-completado']
for(const name of nominalFiles) assert.ok(read('browser/'+name+'.txt').includes('localhost:3200/'))
const events=[]
for(const caseId of ['T-107','T-110']) events.push({
 eventId:'root-EUR-'+caseId+'-CP-nominal',caseId,roleKey:'cliente_particular',level:'browser_e2e',scope:'full',status:'pass',
 resolvesEventIds:caseId==='T-110'?['root-B01-confirm-settlement-blocked']:[],
 assertions:[{name:'Cliente confirma en la interfaz la entrega previamente realizada por el proveedor',pass:true},{name:'Contrato y solicitud completados, una transferencia de 90 EUR al proveedor correcto y liquidación conciliada',pass:true},{name:'Proveedor ve el aviso de pago liberado y el detalle económico completado',pass:true}],
 evidence:[...nominalFiles.map(n=>({layer:'browser',path:'browser/'+n+'.txt'})),{layer:'db',path:'eur-nominal-full-proof.json'},{layer:'api',path:'eur-nominal-charge-settlement.json'}],stepsPending:[],
 limitations:['Contrato previo creado mediante acciones HTTP reales como precondición. Pago, entrega y confirmación ejecutados en navegador. Se conservan sin alterar los registros históricos del sandbox USD.']
})
const after=['EUR-refresh-sin-aviso-obsoleto','EUR-refresh-historial','EUR-refresh-recargado']
for(const name of after){const ax=read('browser/'+name+'.txt');assert.ok(!ax.includes('¡TRABAJO ENTREGADO!'));assert.ok(!ax.includes('button Revisar la entrega'))}
assert.ok(read('browser/EUR-refresh-recargado.txt').includes('Por Confirmar 0'))
assert.ok(read('browser/EUR-refresh-aviso-montado.txt').includes('¡TRABAJO ENTREGADO!'))
events.push({eventId:'root-EUR-stale-delivery-overlay-fixed',caseId:'T-200',roleKey:'cliente_particular',level:'browser_e2e',scope:'partial',status:'pass',resolvesEventIds:['root-EUR-stale-delivery-overlay'],assertions:[{name:'No invita a revisar una entrega después de confirmar y liquidar el mismo contrato',pass:true},{name:'Omitir valoración, cambiar a historial y recargar no restaura la celebración obsoleta',pass:true}],evidence:[{layer:'browser',path:'browser/EUR-refresh-aviso-montado.txt'},...after.map(n=>({layer:'browser',path:'browser/'+n+'.txt'})),{layer:'db',path:'eur-nominal_refresh-full-proof.json'}],stepsPending:['Resto de avisos, acciones y escenarios del caso T-200'],limitations:['Entrega del segundo contrato realizada por acción HTTP como precondición. Confirmación y regresión de la celebración ejecutadas en navegador.']})
for(const e of events){e.at=new Date().toISOString();e.environment={baseUrl:'http://localhost:3200',database:'isolated-local',stripe:'real TEST EUR'};assert.ok(!read('root-continuation-events.jsonl').includes('"eventId":"'+e.eventId+'"'));fs.appendFileSync(file,JSON.stringify(e)+'\n');console.log({eventId:e.eventId,status:e.status,scope:e.scope})}
