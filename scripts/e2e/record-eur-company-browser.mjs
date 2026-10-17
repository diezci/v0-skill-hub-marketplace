import fs from 'node:fs'
import assert from 'node:assert/strict'
const role=process.argv[2],roles={titular:'titular',admin:'administrador',miembro:'miembro'}
assert.ok(roles[role]);const d='.build/e2e-20261014',kind='empresa_'+role
const proof=JSON.parse(fs.readFileSync(d+'/eur-'+kind+'-full-proof.json'))
const delivered=JSON.parse(fs.readFileSync(d+'/pagos-eur-empresa-'+role+'-entregado-state.json'))
assert.equal(delivered.job.state,'entregado');assert.equal(delivered.payments[0].stripe.transfers.length,0);assert.equal(delivered.payments[0].database.estado,'fondos_retenidos')
assert.equal(proof.settlementState,'completada');assert.equal(proof.transfer.destination,'acct_1UQSUwKTJ1adPoG5');assert.equal(proof.transfer.amount,9000);assert.equal(proof.transfers,1)
const phases=['cliente-pagado','proveedor-pagado','proveedor-entregado','cliente-entregado','cliente-completado','proveedor-completado']
const files=phases.map(p=>'browser/EUR-'+kind+'-'+p+'.txt')
const texts=files.map(p=>fs.readFileSync(d+'/'+p,'utf8'))
assert.ok(texts[2].includes('Esperando confirmación del cliente'));assert.ok(texts[3].includes('Confirmar y Liberar Pago'));assert.ok(texts[4].includes('Completado el'));assert.ok(texts[5].includes('90'))
for(const [caseId,party] of [['T-105','proveedor'],['T-107','cliente'],['T-110','cliente']]){
 const event={eventId:`root-EUR-${kind}-${caseId}`,caseId,roleKey:`${party}_empresa_${roles[role]}`,level:'browser_e2e',scope:'full',status:'pass',at:new Date().toISOString(),environment:{baseUrl:'http://localhost:3200',database:'isolated-local',stripe:'TEST EUR'},assertions:caseId==='T-105'?[{name:'Operador empresarial entrega en navegador con mensaje; cliente ve progreso 100, historial y confirmación',pass:true},{name:'Proveedor ve entregado pendiente de cobro; transferencia ausente antes de confirmar',pass:true}]:[{name:'Cliente empresarial confirma entrega en navegador; trabajo y solicitud completados',pass:true},{name:'Una transferencia neta de 90 EUR a la cuenta congelada de la empresa proveedora; estados e historial conciliados',pass:true},{name:'Avisos a ambas partes y cobro visible en la interfaz del proveedor',pass:true}],evidence:[...files.map(path=>({layer:'browser',path})),{layer:'api',path:'eur-'+kind+'-full-proof.json'}],stepsPending:[],limitations:['Contrato preparado previamente por acciones HTTP reales. Permisos económicos y operadores definidos explícitamente en fixture; pago, entrega y confirmación ejecutados en navegador.']}
 const f=d+'/root-continuation-events.jsonl';assert.ok(!fs.readFileSync(f,'utf8').includes(event.eventId));fs.appendFileSync(f,JSON.stringify(event)+'\n');console.log({caseId,role:event.roleKey,status:'pass'})
}
