import fs from 'node:fs'
import assert from 'node:assert/strict'
import {pagosContext} from './pagos-context.mjs'
const c=pagosContext('eur'),company=c.fixture.companies.proveedor.id,other=c.fixture.companies.cliente.id,checks=[]
const file=c.dir+'/eur-company-permissions-proof.json'
const save=()=>fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),environment:'isolated local + Stripe TEST EUR',checks},null,2))
async function check(caseId,alias,name,fn){const item={caseId,alias,roleKey:c.fixture.users[alias].roleKey,name,at:new Date().toISOString()};try{item.result=await fn();item.pass=true}catch(e){item.pass=false;item.error=e.message}checks.push(item);save();console.log({caseId,alias,name,pass:item.pass,error:item.error})}
const invoke=async(alias,name,args)=>{const client=await c.client(alias);await client.request('/mi-empresa');return (await client.call(name,args,{route:'/mi-empresa'})).value}
for(const alias of ['PE_ADMIN','PE_MIEMBRO']){
 const {data:member,error}=await c.admin.from('empresa_miembros').select('*').eq('empresa_id',company).eq('usuario_id',c.fixture.users[alias].id).single();if(error)throw error
 // Fixture permissions only; restore original in finally. Assertions use actor HTTP sessions.
 const update=await c.admin.from('empresa_miembros').update({permisos:{...member.permisos,ver_cobros:true,gestionar_cobros:true}}).eq('empresa_id',company).eq('usuario_id',member.usuario_id);if(update.error)throw update.error
 try{await check('PA-002',alias,'Con permiso económico consulta saldo pero no configura banco ni abre Express',async()=>{
  const state=await invoke(alias,'obtenerEstadoStripeConnectEmpresa',[company]);c.ok(state,'saldo');assert.equal(state.data.conectado,true);assert.equal(state.data.transferenciasHabilitadas,true);assert.ok(state.data.saldo)
  const denied=[]
  for(const name of ['crearEnlaceOnboardingStripeEmpresa','crearEnlaceDashboardStripeEmpresa']){const r=await invoke(alias,name,[company]);assert.match(r.error??'',/Solo el responsable principal/);assert.ok(!r.data);denied.push({action:name,error:r.error})}
  return {precondition:{...member.permisos,ver_cobros:true,gestionar_cobros:true},state:state.data,denied}
 })}finally{const restored=await c.admin.from('empresa_miembros').update({permisos:member.permisos}).eq('empresa_id',company).eq('usuario_id',member.usuario_id);if(restored.error)throw restored.error}
}
await check('PA-003','PE_MIEMBRO','Sin permiso financiero ni empresa propia ni ajena devuelve saldo o identificador',async()=>{
 const results=[];for(const id of [company,other]){const r=await invoke('PE_MIEMBRO','obtenerEstadoStripeConnectEmpresa',[id]);assert.match(r.error??'',/No tienes permiso/);assert.ok(!r.data);assert.ok(!JSON.stringify(r).includes('acct_'));results.push({company:id,error:r.error})}return results
})
for(const item of checks.filter(x=>x.pass)){
 const event={eventId:`root-EUR-${item.caseId}-${item.alias}-company-access`,caseId:item.caseId,roleKey:item.roleKey,level:'api_e2e',scope:'full',status:'pass',at:item.at,assertions:[{name:item.name,pass:true}],evidence:[{layer:'api',path:'eur-company-permissions-proof.json'}],stepsPending:[],limitations:['Prueba HTTP real; evidencia de interfaz registrada aparte. Permisos de fixture restaurados al terminar.']}
 const events=c.dir+'/root-continuation-events.jsonl';assert.ok(!fs.readFileSync(events,'utf8').includes('"eventId":"'+event.eventId+'"'));fs.appendFileSync(events,JSON.stringify(event)+'\n')
}
if(checks.some(x=>!x.pass))process.exitCode=1
