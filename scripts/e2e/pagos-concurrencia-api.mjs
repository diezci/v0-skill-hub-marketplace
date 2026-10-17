import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{pagosContext}from'./pagos-context.mjs'
const c=pagosContext(),checks=[],jobs=[]
function save(){fs.writeFileSync(path.join(c.dir,'pagos-concurrencia-api.json'),JSON.stringify({checks,jobs,environment:'local-Auth-Next-PostgREST'},null,2))}
for(const alias of ['CP2','CE_TITULAR','CE_ADMIN','CE_MIEMBRO','PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO']){
 const supplier=alias==='PP'||alias.startsWith('PE_'),j=await c.createJob({ca:supplier?'CP2':alias,pa:supplier?alias:'PP',label:`race ${alias}`});jobs.push(j)
 const other=alias===j.ca?j.pa:j.ca,r={caseIds:['T-124','T-134'],caseId:'T-124',roleKey:c.fixture.users[alias].roleKey,alias,at:new Date().toISOString(),level:'api_e2e',assertion:'Dos solicitudes simultáneas: una gana y conserva autor/motivo; retirada contra aceptación: un desenlace coherente sin dinero',observation:{}}
 try{
  const actors=[alias,other],reasons=actors.map(a=>`Cancelación de ${a} en carrera simultánea.`),results=await Promise.all(actors.map((a,i)=>c.call(a,'solicitarCancelacion',[j.trabajoId,reasons[i]])))
  const winners=results.map((value,index)=>({value,index})).filter(r=>!r.value?.error);assert.equal(winners.length,1,JSON.stringify(results));const wi=winners[0].index,winner=actors[wi],responder=actors[1-wi],before=await c.row('trabajos',j.trabajoId);assert.equal(before.cancelacion_solicitada_por,c.fixture.users[winner].id);assert.equal(before.cancelacion_razon,reasons[wi]);r.observation.request={winner,loserError:results[1-wi].error,reasonIntact:true}
  // Company members lack financial permission in this seed: record that denial,
  // and let the owner continue as an explicitly separate actor.
  const acceptor=responder==='CE_MIEMBRO'?'CE_TITULAR':responder==='PE_MIEMBRO'?'PE_TITULAR':responder
  const resolution=await Promise.all([c.call(winner,'retirarSolicitudCancelacion',[j.trabajoId]),c.call(acceptor,'responderCancelacion',[j.trabajoId,true,'',[],before.cancelacion_revision])]);const after=await c.row('trabajos',j.trabajoId),s=await c.row('solicitudes',j.solicitudId),o=await c.row('ofertas',j.ofertaId),e=await c.admin.from('transacciones_escrow').select('id').eq('trabajo_id',j.trabajoId);assert.equal(e.data.length,0);assert.ok(['cancelado','pendiente_pago'].includes(after.estado));assert.notEqual(after.cancelacion_estado,'pendiente');if(after.estado==='cancelado'){assert.equal(s.estado,'abierta');assert.equal(o.estado,'retirada');assert.ok(!resolution[1]?.error)}else{assert.equal(o.estado,'aceptada');assert.ok(!resolution[0]?.error);assert.ok(resolution[1]?.error)}r.observation.response={acceptor,withdraw:resolution[0],accept:resolution[1],finalState:after.estado,cancellation:after.cancelacion_estado,escrows:0};r.status='pass'
 }catch(e){r.status='fail';r.observation.failure=e.message}checks.push(r);save();console.log(JSON.stringify(r))
}
console.log(JSON.stringify({checks:checks.length,pass:checks.filter(r=>r.status==='pass').length,fail:checks.filter(r=>r.status==='fail').length}));if(checks.some(r=>r.status==='fail'))process.exitCode=1
