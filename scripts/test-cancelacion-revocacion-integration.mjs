// Local Postgres integration tests. Never connects to a production database.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const { default: pg } = await import(pathToFileURL(process.env.DIIME_TEST_PG_MODULE || `${process.cwd()}/.build/workflow-db/node_modules/pg/lib/index.js`).href)
const dsn = process.env.DIIME_TEST_DATABASE_URL || 'postgresql://postgres:workflow-local-only@127.0.0.1:55439/workflow_payments'
const url = new URL(dsn)
if (!['localhost','127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/workflow_')) throw new Error('Tests require a disposable local workflow_ database')
const db = new pg.Client({ connectionString: dsn }); await db.connect()
const sql = async (text, args = []) => (await db.query(text,args)).rows
const rpc = async (name, ...args) => (await sql(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args))[0].result
const fails = async fn => { let threw=false; try { await fn() } catch { threw=true } assert.ok(threw,'Expected the operation to be rejected') }
let passed=0
const check = async (name, fn) => { await fn(); console.log(`PASS ${name}`); passed++ }
await sql("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)")
const customer=randomUUID(), provider=randomUUID(), admin=randomUUID()
for (const [id,role] of [[customer,'cliente'],[provider,'profesional'],[admin,'admin']]) {
 await sql('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${role}-${id}@example.test`])
 await sql('insert into profiles(id,email,nombre,es_admin) values($1,$2,$3,$4)',[id,`${role}-${id}@example.test`,role,id===admin])
}
await sql("insert into profesionales(id,titulo,stripe_account_id,stripe_transferencias_habilitadas,stripe_payouts_habilitados,stripe_onboarding_completado) values($1,'Pruebas',$2,true,true,true)",[provider,`acct_${provider}`])
async function fixture({paid=true, delivered=false, history=false, base=100, customerFee=10, providerFee=5}={}) {
 const solicitud=(await sql("insert into solicitudes(cliente_id,titulo,descripcion,ubicacion,estado) values($1,'Prueba financiera','Solo datos de prueba','Madrid','abierta') returning id",[customer]))[0].id
 const oferta=(await sql("insert into ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,estado,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,$3,1,'Prueba','pendiente',5,2,$4,$5) returning id",[solicitud,provider,base,providerFee,base-providerFee]))[0].id
 const trabajo=(await sql("insert into trabajos(solicitud_id,oferta_id,cliente_id,profesional_id,titulo,precio_acordado,estado) values($1,$2,$3,$4,'Prueba financiera',$5,'pendiente_pago') returning id",[solicitud,oferta,customer,provider,base]))[0].id
 await sql("update ofertas set estado='aceptada' where id=$1",[oferta])
 let old
 const escrow = async state => (await sql("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor_original,comision_proveedor,pago_neto_proveedor,estado,stripe_session_id) values($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10) returning id",[trabajo,customer,provider,base+customerFee,base,customerFee,providerFee,base-providerFee,state,`cs_${randomUUID()}`]))[0].id
 if(history) old=await escrow('cancelado')
 const id=await escrow('pendiente')
 const e=(await sql('select * from transacciones_escrow where id=$1',[id]))[0]
 if(paid) await rpc('diime_confirmar_pago',id,e.stripe_session_id,`pi_${id}`,`ch_${id}`,Math.round((base+customerFee)*100),'eur')
 if(delivered) await sql("update trabajos set estado='entregado' where id=$1",[trabajo])
 return {trabajo,solicitud,oferta,id,old,session:e.stripe_session_id}
}
const finish = e => rpc('diime_finalizar_liquidacion',e.id,e.liquidacion_operacion_id,e.stripe_charge_id,e.monto_reembolsado>0?`re_${e.id}`:null,e.monto_reembolsado>0?'succeeded':null,e.pago_neto_proveedor>0?`tr_${e.id}`:null)
async function asUser(user,sqlText,args=[]){const c=new pg.Client({connectionString:dsn});await c.connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:user})]);const result=await c.query(sqlText,args);await c.query('commit');return result.rows}finally{await c.end()}}

try{
 const buyerOp=randomUUID(),sellerOp=randomUUID();for(const id of [buyerOp,sellerOp]){await sql('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@example.test`]);await sql('insert into profiles(id,email,nombre) values($1,$2,$3)',[id,`${id}@example.test`,'Operador']);}
 const companies={};for(const [name,owner,member]of [['buyer',customer,buyerOp],['seller',provider,sellerOp]]){const company=(await sql('insert into empresas(nombre,cif,propietario_id) values($1,$2,$3) returning id',[name,`B${randomUUID()}`,owner]))[0].id;companies[name]=company;await sql("update empresas set estado_verificacion='verificada',verificada=true where id=$1",[company]);await sql("insert into empresa_miembros(empresa_id,usuario_id,cargo,origen,rol,permisos) values($1,$2,'Operador','invitacion','miembro','{\"perfil\":true,\"mensajes\":true,\"presupuestos\":true,\"encargos\":true,\"equipo\":false,\"ver_cobros\":true,\"gestionar_cobros\":true}')",[company,member])}
 await rpc('registrar_cuenta_stripe_empresa',companies.seller,provider,'acct_extra_company');await rpc('actualizar_estado_cuenta_stripe_empresa',companies.seller,'acct_extra_company',true,true,true,'[]');
 async function companyJob({withoutEscrow=false}={}){const s=(await asUser(customer,"insert into solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion,estado) values($1,$2,'Empresa local','Prueba','Madrid','abierta') returning id",[customer,companies.buyer]))[0].id;const o=(await asUser(provider,"insert into ofertas(solicitud_id,profesional_id,empresa_id,precio,tiempo_estimado,descripcion,estado,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,$3,100,1,'Empresa','pendiente',5,2,5,95) returning id",[s,provider,companies.seller]))[0].id;const t=(await asUser(customer,'select aceptar_oferta_y_crear_trabajo($1,$2,$3,null) result',[o,s,provider]))[0].result.trabajo;await asUser(customer,'select empresa_reasignar_trabajo($1,$2,$3)',[t.id,buyerOp,'cliente']);await asUser(provider,'select empresa_reasignar_trabajo($1,$2,$3)',[t.id,sellerOp,'proveedor']);if(withoutEscrow)return{t};const e=(await sql("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor_original,comision_proveedor,pago_neto_proveedor,estado,stripe_session_id) values($1,$2,$3,110,100,10,5,5,95,'pendiente',$4) returning id,stripe_session_id",[t.id,customer,provider,`cs_${randomUUID()}`]))[0];await rpc('diime_confirmar_pago',e.id,e.stripe_session_id,`pi_${e.id}`,`ch_${e.id}`,11000,'eur');return{t,e}}

 for(const side of ['cliente','proveedor'])await check('PAY-05 revocar '+side+' después de claim conserva cierre e idempotencia',async()=>{
  await sql("update empresa_miembros set estado='activo' where usuario_id=any($1::uuid[])",[[buyerOp,sellerOp]]);
  const {t,e}=await companyJob();const actor=side==='cliente'?buyerOp:sellerOp,requester=side==='cliente'?sellerOp:buyerOp;
  await rpc('diime_gestionar_solicitud_cancelacion',t.id,requester,'solicitar','Mutuo',[]);await rpc('diime_bloquear_checkout',t.id,actor,true);
  const claim=await rpc('diime_reclamar_liquidacion',e.id,actor,'cancelacion');await sql("update empresa_miembros set estado='revocado' where usuario_id=$1",[actor]);
  await assert.rejects(()=>rpc('diime_cerrar_cancelacion',t.id,actor),error=>error.code==='P0001'&&/Queda un pago por conciliar/.test(error.message));
  await finish(claim);const result=await finish(claim);assert.equal(result.avisos.length,0);
  const saved=(await sql('select t.estado,e.estado escrow,e.liquidacion_estado,e.liquidacion_contexto from trabajos t join transacciones_escrow e on e.trabajo_id=t.id where t.id=$1',[t.id]))[0];assert.equal(saved.estado,'cancelado');assert.equal(saved.escrow,'reembolsado');assert.equal(saved.liquidacion_estado,'completada');assert.equal(saved.liquidacion_contexto.actor,actor);
  assert.deepEqual(await rpc('diime_cerrar_cancelacion',t.id,actor),{ok:true,nuevo_cierre:false});
 });


 for(const side of ['cliente','proveedor'])await check('PAY-05 cierre público sin escrow conserva aceptación '+side+' tras revocación y exige actor exacto',async()=>{
  await sql("update empresa_miembros set estado='activo' where usuario_id=any($1::uuid[])",[[buyerOp,sellerOp]]);
  const {t}=await companyJob({withoutEscrow:true});const actor=side==='cliente'?buyerOp:sellerOp,requester=side==='cliente'?sellerOp:buyerOp;
  await assert.rejects(()=>rpc('diime_cerrar_cancelacion',t.id,actor),error=>error.code==='42501'&&/aceptación fijada/.test(error.message));
  await rpc('diime_gestionar_solicitud_cancelacion',t.id,requester,'solicitar','Sin escrow',[]);
  await rpc('diime_bloquear_checkout',t.id,actor,true);
  await sql("update empresa_miembros set estado='revocado' where usuario_id=any($1::uuid[])",[[actor,requester]]);
  for(const other of [requester,admin,null])await assert.rejects(()=>rpc('diime_cerrar_cancelacion',t.id,other),error=>error.code==='42501'&&/No tienes permiso/.test(error.message));
  assert.equal((await sql('select count(*)::int n from transacciones_escrow where trabajo_id=$1',[t.id]))[0].n,0);
  assert.deepEqual(await rpc('diime_cerrar_cancelacion',t.id,actor),{ok:true,nuevo_cierre:true});
  assert.deepEqual(await rpc('diime_cerrar_cancelacion',t.id,actor),{ok:true,nuevo_cierre:false});
  assert.equal((await sql('select estado,cancelacion_aceptada_por from trabajos where id=$1',[t.id]))[0].cancelacion_aceptada_por,actor);
 });
 await check('A current replacement on the accepting side can finish its durable acceptance',async()=>{
  await sql("update empresa_miembros set estado='activo' where usuario_id=any($1::uuid[])",[[buyerOp,sellerOp]]);
  const {t}=await companyJob({withoutEscrow:true});
  await rpc('diime_gestionar_solicitud_cancelacion',t.id,sellerOp,'solicitar','Sustituto',[]);await rpc('diime_bloquear_checkout',t.id,buyerOp,true);
  await sql("update empresa_miembros set estado='revocado' where usuario_id=$1",[buyerOp]);
  await assert.rejects(()=>rpc('diime_cerrar_cancelacion',t.id,provider),error=>error.code==='42501'&&/No tienes permiso/.test(error.message));
  assert.equal((await rpc('diime_cerrar_cancelacion',t.id,customer)).nuevo_cierre,true);
 });
 for(const side of ['cliente','proveedor'])await check('PAY-05 aceptación '+side+' durable permite primer claim y repetición tras revocación',async()=>{
  await sql("update empresa_miembros set estado='activo' where usuario_id=any($1::uuid[])",[[buyerOp,sellerOp]]);
  const {t,e}=await companyJob();const actor=side==='cliente'?buyerOp:sellerOp,requester=side==='cliente'?sellerOp:buyerOp;
  await rpc('diime_gestionar_solicitud_cancelacion',t.id,requester,'solicitar','Aceptación durable',[]);
  await rpc('diime_bloquear_checkout',t.id,actor,true);
  await sql("update empresa_miembros set estado='revocado' where usuario_id=any($1::uuid[])",[[actor,requester]]);
  for(const other of [requester,admin,null])await assert.rejects(()=>rpc('diime_reclamar_liquidacion',e.id,other,'cancelacion'),error=>error.code==='42501');
  await assert.rejects(()=>rpc('diime_reclamar_liquidacion',e.id,actor,'confirmacion'),error=>error.code==='42501');
  await assert.rejects(()=>rpc('diime_reclamar_liquidacion',e.id,actor,'disputa'),error=>error.code==='P0001'&&/Solo administración/.test(error.message));
  const claim=await rpc('diime_reclamar_liquidacion',e.id,actor,'cancelacion');
  const retry=await rpc('diime_reclamar_liquidacion',e.id,actor,'cancelacion');
  assert.equal(retry.liquidacion_operacion_id,claim.liquidacion_operacion_id);
  assert.equal(retry.liquidacion_contexto.actor,actor);assert.equal(Number(retry.monto_reembolsado),100);
  await assert.rejects(()=>rpc('diime_cerrar_cancelacion',t.id,actor),error=>error.code==='P0001'&&/Queda un pago por conciliar/.test(error.message));
  await finish(claim);assert.equal((await rpc('diime_cerrar_cancelacion',t.id,actor)).nuevo_cierre,false);
 });
 await check('New financial RPCs and private closure deny authenticated and anon sessions',async()=>{
  for(const name of ['public.diime_autorizar_reintento_reembolso(uuid,uuid,text,text)','public.diime_registrar_estado_reembolso(uuid,text,text,text,text,text)','diime_private.cerrar_cancelacion_aceptada(uuid)','public.diime_cerrar_cancelacion(uuid,uuid)','public.diime_reclamar_liquidacion(uuid,uuid,text,numeric,uuid,text,text)'])for(const role of ['anon','authenticated'])assert.equal((await sql('select has_function_privilege($1,$2,$3) allowed',[role,name,'execute']))[0].allowed,false);
  for(const actor of [customer,provider,admin])await fails(()=>asUser(actor,"select diime_autorizar_reintento_reembolso($1,$2,'re_bad','unknown')",[randomUUID(),actor]));
 });
 await check('Revocation before accepting/claiming still rejects the former operator',async()=>{
  await sql("update empresa_miembros set estado='activo' where usuario_id=any($1::uuid[])",[[buyerOp,sellerOp]]);const {t,e}=await companyJob();await rpc('diime_gestionar_solicitud_cancelacion',t.id,sellerOp,'solicitar','Antes de revocar',[]);await sql("update empresa_miembros set estado='revocado' where usuario_id=$1",[buyerOp]);await assert.rejects(()=>rpc('diime_bloquear_checkout',t.id,buyerOp,true),error=>error.code==='42501');await assert.rejects(()=>rpc('diime_reclamar_liquidacion',e.id,buyerOp,'cancelacion'),error=>error.code==='42501');
 });
 await check('Without a confirmed refund finalization cannot close accepted cancellation',async()=>{
  const f=await fixture();await rpc('diime_gestionar_solicitud_cancelacion',f.trabajo,provider,'solicitar','Sin pago devuelto',[]);await rpc('diime_bloquear_checkout',f.trabajo,customer,true);const e=await rpc('diime_reclamar_liquidacion',f.id,customer,'cancelacion');await fails(()=>rpc('diime_finalizar_liquidacion',e.id,e.liquidacion_operacion_id,e.stripe_charge_id,'re_pending','pending',null));assert.equal((await sql('select estado from trabajos where id=$1',[f.trabajo]))[0].estado,'en_progreso');
 });
 await check('Terminal Refund authorization is admin-only, concurrent, audited, and preserves economics',async()=>{
  const f=await fixture();await rpc('diime_gestionar_solicitud_cancelacion',f.trabajo,provider,'solicitar','Reembolso fallido',[]);await rpc('diime_bloquear_checkout',f.trabajo,customer,true);const e=await rpc('diime_reclamar_liquidacion',f.id,customer,'cancelacion');
  await rpc('diime_registrar_estado_reembolso',e.id,e.liquidacion_operacion_id,'re_failed','failed','insufficient_funds',null);
  await sql('update transacciones_escrow set stripe_refund_status=null where id=$1',[e.id]);
  await fails(()=>rpc('diime_autorizar_reintento_reembolso',e.id,admin,'re_failed','insufficient_funds'));
  await rpc('diime_registrar_estado_reembolso',e.id,e.liquidacion_operacion_id,'re_failed','failed','insufficient_funds',null);
  for(const actor of [customer,provider])await fails(()=>rpc('diime_autorizar_reintento_reembolso',e.id,actor,'re_failed','insufficient_funds'));
  await fails(()=>rpc('diime_autorizar_reintento_reembolso',e.id,admin,'re_other','insufficient_funds'));await fails(()=>rpc('diime_autorizar_reintento_reembolso',e.id,admin,'re_failed','charge_for_pending_refund_disputed'));
  await fails(()=>rpc('diime_finalizar_liquidacion',e.id,e.liquidacion_operacion_id,e.stripe_charge_id,'re_unapproved','succeeded',null));
  const secondAdmin=randomUUID();await sql('insert into auth.users(id,email) values($1,$2)',[secondAdmin,`${secondAdmin}@example.test`]);await sql("insert into profiles(id,email,nombre,es_admin) values($1,$2,'Segundo admin',true)",[secondAdmin,`${secondAdmin}@example.test`]);
  const c=new pg.Client({connectionString:dsn});await c.connect();let authorized;try{authorized=await Promise.all([rpc('diime_autorizar_reintento_reembolso',e.id,admin,'re_failed','insufficient_funds'),c.query('select diime_autorizar_reintento_reembolso($1,$2,$3,$4) result',[e.id,secondAdmin,'re_failed','insufficient_funds']).then(r=>r.rows[0].result)])}finally{await c.end()};assert.ok(authorized.every(x=>x.stripe_refund_reintento_de==='re_failed'));
  const audit=await sql('select * from diime_private.reintentos_reembolso where escrow_id=$1',[e.id]);assert.equal(audit.length,1);assert.ok([admin,secondAdmin].includes(audit[0].autorizado_por));assert.equal(audit[0].motivo,'insufficient_funds');
  await fails(()=>sql('update transacciones_escrow set monto_reembolsado=90 where id=$1',[e.id]));
  const pending=await rpc('diime_registrar_estado_reembolso',e.id,e.liquidacion_operacion_id,'re_new','pending',null,'re_failed');assert.equal(pending.stripe_refund_id,'re_new');
  const stale=await rpc('diime_registrar_estado_reembolso',e.id,e.liquidacion_operacion_id,'re_failed','failed','late callback',null);assert.equal(stale.stripe_refund_id,'re_new');assert.equal(stale.stripe_refund_status,'pending');
  await fails(()=>rpc('diime_autorizar_reintento_reembolso',e.id,admin,'re_failed','unknown'));
  await rpc('diime_finalizar_liquidacion',e.id,e.liquidacion_operacion_id,e.stripe_charge_id,'re_new','succeeded',null);
  const oldAfter=await rpc('diime_registrar_estado_reembolso',e.id,e.liquidacion_operacion_id,'re_failed','failed','late callback',null);assert.equal(oldAfter.stripe_refund_id,'re_new');assert.equal(oldAfter.liquidacion_estado,'completada');assert.equal(Number(oldAfter.monto_reembolsado),100);assert.equal(Number(oldAfter.retencion_plataforma),10);
 });
 await check('An unauthorized replacement status cannot overwrite the recorded Refund',async()=>{
  const f=await fixture();await rpc('diime_gestionar_solicitud_cancelacion',f.trabajo,provider,'solicitar','Inmutable',[]);await rpc('diime_bloquear_checkout',f.trabajo,customer,true);const e=await rpc('diime_reclamar_liquidacion',f.id,customer,'cancelacion');await rpc('diime_registrar_estado_reembolso',e.id,e.liquidacion_operacion_id,'re_first','failed','declined',null);
  for(const previous of [null,'re_first','re_fake']){const r=await rpc('diime_registrar_estado_reembolso',e.id,e.liquidacion_operacion_id,'re_intruder','succeeded',null,previous);assert.equal(r.stripe_refund_id,'re_first')}
 });
 console.log(`${passed} payment recovery SQL regressions passed`);
}finally{await db.end()}
