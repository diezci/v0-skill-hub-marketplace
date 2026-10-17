// Isolated privacy cohort. Documents and paid-state rows are synthetic fixtures.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {localFixture} from './local-client-fixtures.mjs';import {pagosContext} from './pagos-context.mjs';
const f=await localFixture('privacy'),c=pagosContext('privacy'),run='company-withdrawal-'+Date.now(),checks=[],fixtures=[];
const pdf=Buffer.from('%PDF-1.7\n% Documento sintetico de QA sin identidad real\n%%EOF').toString('base64');
const companies=[{side:'cliente',alias:'CE_TITULAR'},{side:'proveedor',alias:'PE_TITULAR'}].map(x=>({...x,id:f.m.companies[x.side].id}));
const admin=await f.client('AD',[]);let transaction=false;
const check=(name,pass,detail={})=>{checks.push({name,pass,...detail});assert.ok(pass,name);};
async function current(id){return(await f.db.query('select * from diime_private.empresa_verificaciones where empresa_id=$1 order by creada_at desc limit 1',[id])).rows[0];}
async function restore(co){
 const state=(await f.db.query('select estado_verificacion from empresas where id=$1',[co.id])).rows[0].estado_verificacion;
 if(state==='verificada')return;
 if(state!=='en_revision') {const owner=await f.client(co.alias,[]);const r=await owner.supabase.rpc('empresa_solicitar_verificacion',{p_metodo:'documental',p_representante_nombre:'Representante QA ficticio',p_cargo_legal:'Responsable QA',p_documento_nombre:run+'.pdf',p_documento_base64:pdf,p_consentimiento:true});assert.ok(!r.error,r.error?.message);}
 const v=await current(co.id),r=await admin.supabase.rpc('empresa_revisar_verificacion',{p_empresa_id:co.id,p_decision:'verificada',p_nota:'Acreditacion sintetica nueva comprobada por QA',p_verificacion_id:v.id});assert.ok(!r.error,r.error?.message);
}
const requestData=(co,title)=>({empresa_id:co.id,titulo:title,descripcion:'Necesito revisar los enchufes y comprobar la instalación eléctrica de una habitación.',categoria_id:'Electricidad',ubicacion:'Madrid',urgencia:'media'});
try {
 for(const co of companies) {
  const state=(await f.db.query('select estado_verificacion from empresas where id=$1',[co.id])).rows[0];assert.equal(state.estado_verificacion,'verificada');
  let v=await current(co.id);
  if(!v) v=(await f.db.query("insert into diime_private.empresa_verificaciones(empresa_id,estado,metodo,representante_nombre,cargo_legal,responsable_usuario_id,documento_nombre,documento,nota_revision,revisada_por,revisada_at) values($1,'verificada','documental','Representante QA ficticio','Responsable QA',$2,'qa-inicial.pdf',decode($3,'base64'),'Precondicion sintetica de verificacion',$4,now()) returning *",[co.id,f.m.users[co.alias].id,pdf,f.m.users.AD.id])).rows[0];
  assert.equal(v.estado,'verificada');co.initialId=v.id;co.initialNote=v.nota_revision;
  const memberships=(await f.db.query('select usuario_id,rol,estado,permisos from empresa_miembros where empresa_id=$1 order by usuario_id',[co.id])).rows;co.memberships=memberships;
 }
 const paid=await c.createJob({ca:'CE_TITULAR',pa:'PE_TITULAR',label:run+' paid-state'});fixtures.push(paid);
 await f.db.query("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,estado,fecha_retencion) values($1,$2,$3,110,100,10,10,10,90,'fondos_retenidos',now())",[paid.trabajoId,f.m.users.CE_TITULAR.id,f.m.users.PE_TITULAR.id]);
 await f.db.query("update trabajos set estado='en_progreso',pago_bloqueado=false where id=$1",[paid.trabajoId]);await f.db.query("update solicitudes set estado='en_progreso' where id=$1",[paid.solicitudId]);
 const unpaid=await c.createJob({ca:'CE_TITULAR',pa:'PE_TITULAR',label:run+' unpaid'});fixtures.push(unpaid);
 for(const co of companies) {
  const ca=co.side==='cliente'?'CE_TITULAR':'CP2',pa=co.side==='cliente'?'PP':'PE_TITULAR';
  const s=c.ok(await c.call(ca,'crearSolicitud',[{...requestData(co,run+' candidate '+co.side),empresa_id:co.side==='cliente'?co.id:null}]),'candidate request');
  const o=c.ok(await c.call(pa,'crearOferta',[{solicitud_id:s.id,empresa_id:co.side==='proveedor'?co.id:null,precio:100,tiempo_estimado:1,unidad_tiempo:'dias',descripcion:'Revisión eléctrica para la prueba de retirada.',acepta_gastos:true}]),'candidate offer');co.candidate={ca,pa,request:s.id,offer:o.id};
  for(const alias of ['VIS','CP','PP','CE_TITULAR','CE_ADMIN','CE_MIEMBRO','PE_TITULAR','PE_ADMIN','PE_MIEMBRO','AJ','CE_REVOCADO','PE_REVOCADO']) {
   const actor=await f.client(alias,[]),r=await actor.supabase.rpc('empresa_retirar_verificacion',{p_empresa_id:co.id,p_verificacion_id:co.initialId,p_motivo:'Motivo sintetico de prueba'});check(`${co.side}: ${alias} cannot withdraw`,r.error?.code==='42501');
  }
  for(const args of [{p_verificacion_id:randomUUID(),p_motivo:'Motivo valido pero expediente obsoleto'},{p_verificacion_id:co.initialId,p_motivo:'corto'}]) {const r=await admin.supabase.rpc('empresa_retirar_verificacion',{p_empresa_id:co.id,...args});check(co.side+': invalid input denied',r.error?.code==='22023');}
  const attempts=await Promise.all([1,2].map(i=>admin.supabase.rpc('empresa_retirar_verificacion',{p_empresa_id:co.id,p_verificacion_id:co.initialId,p_motivo:`Documentacion sintetica caducada ${i}`})));
  check(co.side+': concurrent withdrawal has one winner',attempts.filter(r=>!r.error).length===1,{responses:attempts.map(r=>({id:r.data,error:r.error?.code||null}))});
  const v=await current(co.id);co.withdrawnId=v.id;
  const original=(await f.db.query('select estado,nota_revision from diime_private.empresa_verificaciones where id=$1',[co.initialId])).rows[0];
  check(co.side+': approval is retained and withdrawal is new',original.estado==='verificada'&&original.nota_revision===co.initialNote&&v.id!==co.initialId&&v.estado==='requiere_informacion');
  const activity=(await f.db.query("select actor_usuario_id,detalle from empresa_actividad where empresa_id=$1 and entidad_id=$2 and accion='Verificación retirada'",[co.id,v.id])).rows;
  check(co.side+': reason and actor audited once',activity.length===1&&activity[0].actor_usuario_id===f.m.users.AD.id&&activity[0].detalle.verificacion_anterior_id===co.initialId);
 }
 for(const co of companies) {
  const r=await c.call(co.alias,'crearSolicitud',[requestData(co,run+' must be denied')]);check(co.side+': new company requests denied',!!r.error);
  const accept=await c.call(co.candidate.ca,'aceptarOferta',[co.candidate.offer]);check(co.side+': new contract denied',!!accept.error);
  const memberships=(await f.db.query('select usuario_id,rol,estado,permisos from empresa_miembros where empresa_id=$1 order by usuario_id',[co.id])).rows;check(co.side+': membership and permissions retained',JSON.stringify(memberships)===JSON.stringify(co.memberships));
  const visitor=await f.client('VIS',[]),publicView=await visitor.supabase.rpc('empresa_perfil_publico',{p_empresa_id:co.id});check(co.side+': public verified profile hidden',!publicView.data);
 }
 const offer=await c.call('PE_TITULAR','crearOferta',[{solicitud_id:companies[0].candidate.request,empresa_id:companies[1].id,precio:95,tiempo_estimado:1,unidad_tiempo:'dias',descripcion:'Intento nuevo tras retirada de verificacion.',acepta_gastos:true}]);check('new provider company offer denied',!!offer.error);
 const progress=await c.call('PE_TITULAR','actualizarProgresoTrabajo',[paid.trabajoId,25,'Avance permitido en contrato previo tras retirada']);check('existing paid contract progress allowed',!!progress.data&&!progress.error);
 const delivery=await c.call('PE_TITULAR','marcarTrabajoEntregado',[paid.trabajoId,'Entrega permitida del contrato previo']);check('existing paid contract delivery allowed',!!delivery.data&&!delivery.error);
 const cancel=await c.call('CE_TITULAR','solicitarCancelacion',[unpaid.trabajoId,'Cancelacion del contrato previo sin pago tras retirada']);check('existing unpaid contract cancellation allowed',!cancel.error,{result:cancel});
 let job=await c.row('trabajos',unpaid.trabajoId);
 if(job.estado!=='cancelado') {const reply=await c.call('PE_TITULAR','responderCancelacion',[job.id,true,'Cierre de prueba',[],job.cancelacion_revision]);check('other company can accept existing cancellation',!reply.error);job=await c.row('trabajos',job.id);}
 check('previous unpaid contract closed',job.estado==='cancelado');
 const owner=await f.client('CE_TITULAR',[]),workspace=await owner.supabase.rpc('empresa_workspace');check('owner sees pending accreditation and existing work',workspace.data?.empresa?.estado_verificacion==='requiere_informacion'&&JSON.stringify(workspace.data).includes(paid.trabajoId));
 // Reaccreditation permits fresh operations and keeps the old dossier obsolete.
 for(const co of companies) {await restore(co);const stale=await admin.supabase.rpc('empresa_retirar_verificacion',{p_empresa_id:co.id,p_verificacion_id:co.initialId,p_motivo:'Intento con expediente anterior'});check(co.side+': old approval cannot withdraw new one',stale.error?.code==='22023');}
 // Hold the same withdrawal function uncommitted and race a real authenticated INSERT.
 const co=companies[0],v=await current(co.id);await f.db.query('BEGIN');transaction=true;
 await f.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.m.users.AD.id,role:'authenticated'})]);
 await f.db.query('select public.empresa_retirar_verificacion($1,$2,$3)',[co.id,v.id,'Retirada concurrente controlada de QA']);
 const blocker=(await f.db.query('select pg_backend_pid() pid')).rows[0].pid;
 let settled=false;const raced=owner.supabase.from('solicitudes').insert({cliente_id:f.m.users.CE_TITULAR.id,empresa_id:co.id,titulo:run+' race',descripcion:'Nueva solicitud que debe esperar a la retirada',categoria_id:f.m.categories.general,ubicacion:'Madrid',estado:'abierta'}).select('id').then(r=>{settled=true;return r});
 let blocked=false;for(let i=0;i<30&&!blocked;i++){blocked=(await f.db.query("select exists(select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))) b",[blocker])).rows[0].b;if(!blocked)await new Promise(r=>setTimeout(r,100));}
 check('new operation waits on withdrawal lock',blocked&&!settled);await f.db.query('COMMIT');transaction=false;const racedResult=await raced;check('new operation rejected after withdrawal commits',racedResult.error?.code==='42501',{error:racedResult.error?.message});
} catch(e) {checks.push({name:'runner',pass:false,error:e.message});process.exitCode=1;console.error(e.message);}
finally {
 if(transaction)await f.db.query('ROLLBACK');
 for(const co of companies)try{await restore(co);}catch(e){checks.push({name:'restore '+co.side,pass:false,error:e.message});process.exitCode=1;}
 fs.writeFileSync(f.dir+'/'+run+'.json',JSON.stringify({run,checks,fixtures,companies:companies.map(({memberships,...co})=>co),limitations:['SQL verified dossiers and paid state; real HTTP/RPC authorization, transactions and state transitions; no real Stripe settlement in this script.'],restored:true},null,2));await f.db.end();console.log({run,checks:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length});
}
