// Disposable local payment-state fixtures for browser fault/recovery checks.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pagosContext} from './pagos-context.mjs';
import {localFixture} from './local-client-fixtures.mjs';
const c=pagosContext('eur'), f=await localFixture('eur');
const file=c.dir+'/delivery-browser-fixtures.json';
const action=process.argv[2];
try {
 if(action==='prepare') {
  assert.ok(!fs.existsSync(file),'Do not duplicate browser fixtures');
  const jobs=[];
  for(const pa of ['PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO']) {
   const j=await c.createJob({ca:'CP2',pa,label:'CP013 browser '+pa});
   await f.db.query("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,estado,fecha_retencion) values($1,$2,$3,110,100,10,10,10,90,'fondos_retenidos',now())",[j.trabajoId,c.fixture.users.CP2.id,c.fixture.users[pa].id]);
   await f.db.query("update trabajos set estado='en_progreso',progreso=0,pago_bloqueado=false where id=$1",[j.trabajoId]);
   await f.db.query("update solicitudes set estado='en_progreso' where id=$1",[j.solicitudId]);
   j.title=(await c.row('solicitudes',j.solicitudId)).titulo;j.roleKey=c.fixture.users[pa].roleKey;j.failEnabled=true;j.message='Entrega recuperable CP013 '+pa;
   jobs.push(j);fs.writeFileSync(file,JSON.stringify({jobs,fixtureOnly:'SQL held-payment state; no Stripe transaction'},null,2));
  }
 }
 const data=JSON.parse(fs.readFileSync(file));
 if(action==='repair-precondition') {
  for(const j of data.jobs) await f.db.query("update solicitudes set estado='en_progreso' where id=$1",[j.solicitudId]);
  console.log('Request state synchronized for disposable SQL payment fixtures');
 } else if(action==='prepare'||action==='release') {
  if(action==='release') {const j=data.jobs.find(j=>j.pa===process.argv[3]);assert.ok(j);j.failEnabled=false;}
  const ids=data.jobs.filter(j=>j.failEnabled).map(j=>{assert.match(j.trabajoId,/^[a-f0-9-]{36}$/);return `'${j.trabajoId}'::uuid`});
  await f.db.query('drop trigger if exists qa_e2e_delivery_browser_fail on public.actualizaciones_trabajo; drop function if exists diime_private.qa_e2e_delivery_browser_fail()');
  if(ids.length) await f.db.query(`create function diime_private.qa_e2e_delivery_browser_fail() returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'QA_BROWSER_HISTORY_FAILURE'; end $$; create trigger qa_e2e_delivery_browser_fail before insert on public.actualizaciones_trabajo for each row when(new.tipo='entrega' and new.trabajo_id=any(array[${ids.join(',')}])) execute function diime_private.qa_e2e_delivery_browser_fail()`);
  fs.writeFileSync(file,JSON.stringify(data,null,2));console.log(data.jobs.map(j=>({alias:j.pa,id:j.trabajoId,failEnabled:j.failEnabled})));
 } else if(action==='state') {
  const alias=process.argv[3], phase=process.argv[4];assert.match(phase,/^[a-z-]+$/);const j=data.jobs.find(j=>j.pa===alias);assert.ok(j);
  const job=await c.row('trabajos',j.trabajoId);
  const history=(await f.db.query('select tipo,mensaje,usuario_id from actualizaciones_trabajo where trabajo_id=$1 order by created_at',[j.trabajoId])).rows;
  const notices=(await f.db.query("select tipo,usuario_id from notificaciones where metadata->>'trabajo_id'=$1 and tipo='trabajo_entregado'",[j.trabajoId])).rows;
  const result={alias,phase,jobId:j.trabajoId,state:job.estado,progress:job.progreso,history,notices,at:new Date().toISOString()};
  fs.writeFileSync(c.dir+`/delivery-browser-${alias}-${phase}.json`,JSON.stringify(result,null,2));console.log(result);
 } else throw Error('Unknown action');
} finally {await f.db.end();}
