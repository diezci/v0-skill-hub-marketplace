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
async function fixture({paid=true, delivered=false, history=false}={}) {
 const solicitud=(await sql("insert into solicitudes(cliente_id,titulo,descripcion,ubicacion,estado) values($1,'Prueba financiera','Solo datos de prueba','Madrid','abierta') returning id",[customer]))[0].id
 const oferta=(await sql("insert into ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,estado,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,1,'Prueba','pendiente',5,2,5,95) returning id",[solicitud,provider]))[0].id
 const trabajo=(await sql("insert into trabajos(solicitud_id,oferta_id,cliente_id,profesional_id,titulo,precio_acordado,estado) values($1,$2,$3,$4,'Prueba financiera',100,'pendiente_pago') returning id",[solicitud,oferta,customer,provider]))[0].id
 await sql("update ofertas set estado='aceptada' where id=$1",[oferta])
 let old
 const escrow = async state => (await sql("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor_original,comision_proveedor,pago_neto_proveedor,estado,stripe_session_id) values($1,$2,$3,110,100,10,5,5,95,$4,$5) returning id",[trabajo,customer,provider,state,`cs_${randomUUID()}`]))[0].id
 if(history) old=await escrow('cancelado')
 const id=await escrow('pendiente')
 const e=(await sql('select * from transacciones_escrow where id=$1',[id]))[0]
 if(paid) await rpc('diime_confirmar_pago',id,e.stripe_session_id,`pi_${id}`,`ch_${id}`,11000,'eur')
 if(delivered) await sql("update trabajos set estado='entregado' where id=$1",[trabajo])
 return {trabajo,solicitud,oferta,id,old,session:e.stripe_session_id}
}
const finish = e => rpc('diime_finalizar_liquidacion',e.id,e.liquidacion_operacion_id,e.stripe_charge_id,e.monto_reembolsado>0?`re_${e.id}`:null,e.monto_reembolsado>0?'succeeded':null,e.pago_neto_proveedor>0?`tr_${e.id}`:null)
try {
 await check('Dispute selects the captured payment, preserves cancelled history, and withdraws exactly that payment',async()=>{
  const f=await fixture({history:true});const d=await rpc('diime_abrir_disputa',f.trabajo,customer,'Prueba');assert.equal(d.escrow_id,f.id)
  assert.equal((await sql('select estado from transacciones_escrow where id=$1',[f.old]))[0].estado,'cancelado')
  assert.equal(await rpc('diime_retirar_disputa',d.id,customer),'ok')
  assert.equal((await sql('select estado from transacciones_escrow where id=$1',[f.id]))[0].estado,'fondos_retenidos')
 })
 await check('Claiming a resolution prevents withdrawal and contradictory decisions; finalization is retryable',async()=>{
  const f=await fixture({history:true});const d=await rpc('diime_abrir_disputa',f.trabajo,customer,'Prueba')
  const e=await rpc('diime_reclamar_liquidacion',f.id,admin,'disputa',40,d.id,'parcial','Nota original')
  assert.equal(Number(e.comision_proveedor),3);assert.equal(Number(e.pago_neto_proveedor),57)
  assert.equal(await rpc('diime_retirar_disputa',d.id,customer),'liquidacion_iniciada')
  await fails(()=>rpc('diime_reclamar_liquidacion',f.id,admin,'disputa',60,d.id,'parcial','Cambio'))
  const primera=await finish(e);const repetida=await finish(e)
  assert.equal(primera.avisos.length,2);assert.equal(repetida.avisos.length,0)
  const row=(await sql('select estado,resultado from disputas where id=$1',[d.id]))[0];assert.equal(row.estado,'resuelta');assert.equal(row.resultado,'Nota original')
 })
 await check('An admin can finish an existing in-review dispute',async()=>{
  const f=await fixture();const d=await rpc('diime_abrir_disputa',f.trabajo,customer,'Caso en revisión')
  await sql("update disputas set estado='en_revision' where id=$1",[d.id])
  const e=await rpc('diime_reclamar_liquidacion',f.id,admin,'disputa',0,d.id,'proveedor','Revisión terminada');await finish(e)
  assert.equal((await sql('select estado from disputas where id=$1',[d.id]))[0].estado,'resuelta')
 })
 await check('Opening a dispute wins against a stale confirmation',async()=>{
  const f=await fixture({delivered:true});await rpc('diime_abrir_disputa',f.trabajo,customer,'Disputa antes del cobro')
  await fails(()=>rpc('diime_reclamar_liquidacion',f.id,customer,'confirmacion'))
 })
 await check('Claimed confirmation wins against dispute; retry repairs a legacy completed escrow closure',async()=>{
  const f=await fixture({delivered:true});let e=await rpc('diime_reclamar_liquidacion',f.id,customer,'confirmacion')
  await fails(()=>rpc('diime_abrir_disputa',f.trabajo,customer,'Demasiado tarde'))
  // Simulates legacy partial closure: money recorded, job not yet closed.
  await sql("update transacciones_escrow set estado='completado',liquidacion_estado='completada',stripe_transfer_id=$2 where id=$1",[f.id,`tr_${f.id}`])
  e=await rpc('diime_reclamar_liquidacion',f.id,customer,'confirmacion');await finish(e)
  assert.equal((await sql('select estado from trabajos where id=$1',[f.trabajo]))[0].estado,'completado')
 })
 await check('Cancellation blocks new Checkout, requires old attempts closed, and refunds a late payment without reopening job',async()=>{
  const f=await fixture({paid:false});await sql("update trabajos set cancelacion_estado='pendiente',cancelacion_solicitada_por=$2,cancelacion_razon='Prueba' where id=$1",[f.trabajo,customer])
  await rpc('diime_bloquear_checkout',f.trabajo,provider,true)
  await fails(()=>rpc('diime_cerrar_cancelacion',f.trabajo,provider))
  await rpc('diime_cerrar_intento',f.id,f.session);await rpc('diime_cerrar_cancelacion',f.trabajo,provider)
  const result=await rpc('diime_confirmar_pago',f.id,f.session,`pi_${f.id}`,`ch_${f.id}`,11000,'eur');assert.equal(result.tardio,true)
  const e=await rpc('diime_reclamar_liquidacion',f.id,null,'pago_tardio');assert.equal(Number(e.monto_reembolsado),110);await finish(e)
  assert.equal((await sql('select estado from trabajos where id=$1',[f.trabajo]))[0].estado,'cancelado')
  assert.equal((await sql('select estado from solicitudes where id=$1',[f.solicitud]))[0].estado,'abierta')
 })
 await check('Delayed asynchronous payment finishes an accepted cancellation automatically, without reactivating the job',async()=>{
  const f=await fixture({paid:false});await sql("update trabajos set cancelacion_estado='pendiente',cancelacion_solicitada_por=$2,cancelacion_razon='Prueba' where id=$1",[f.trabajo,customer])
  await rpc('diime_bloquear_checkout',f.trabajo,provider,true)
  const result=await rpc('diime_confirmar_pago',f.id,f.session,`pi_${f.id}`,`ch_${f.id}`,11000,'eur');assert.equal(result.tardio,true)
  assert.equal((await sql('select estado from trabajos where id=$1',[f.trabajo]))[0].estado,'pendiente_pago')
  const e=await rpc('diime_reclamar_liquidacion',f.id,null,'pago_tardio');await finish(e)
  assert.equal((await sql('select estado from trabajos where id=$1',[f.trabajo]))[0].estado,'cancelado')
  const duplicate=await rpc('diime_confirmar_pago',f.id,f.session,`pi_${f.id}`,`ch_${f.id}`,11000,'eur');assert.equal(duplicate.tardio,true)
 })
 await check('Late payment of a replaced attempt coexists safely with the one current Checkout',async()=>{
  const f=await fixture({paid:false,history:true});const old=(await sql('select * from transacciones_escrow where id=$1',[f.old]))[0]
  await rpc('diime_confirmar_pago',f.old,old.stripe_session_id,`pi_${f.old}`,`ch_${f.old}`,11000,'eur')
  const e=await rpc('diime_reclamar_liquidacion',f.old,null,'pago_tardio');await finish(e)
  assert.equal((await sql('select estado from transacciones_escrow where id=$1',[f.id]))[0].estado,'pendiente')
 })
 await check('Paid mutual cancellation is recoverable and preserves original commission',async()=>{
  const f=await fixture();await sql("update trabajos set cancelacion_estado='pendiente',cancelacion_solicitada_por=$2,cancelacion_razon='Prueba' where id=$1",[f.trabajo,customer])
  await rpc('diime_bloquear_checkout',f.trabajo,provider,true)
  const e=await rpc('diime_reclamar_liquidacion',f.id,provider,'cancelacion');await finish(e);await finish(e)
  assert.equal((await sql('select estado from trabajos where id=$1',[f.trabajo]))[0].estado,'cancelado')
  assert.equal(Number((await sql('select comision_proveedor_original from transacciones_escrow where id=$1',[f.id]))[0].comision_proveedor_original),5)
 })
 for (const outcome of ['cliente','proveedor']) await check(`Unpaid mediation ${outcome} moves no money and has the correct next state`,async()=>{
  const f=await fixture({paid:false});await rpc('diime_cerrar_intento',f.id,f.session)
  await sql("update trabajos set cancelacion_estado='pendiente',cancelacion_solicitada_por=$2,cancelacion_razon='Prueba' where id=$1",[f.trabajo,customer])
  const d=await rpc('diime_abrir_disputa',f.trabajo,provider,'Oposición',true,[]);assert.equal(d.escrow_id,null)
  await fails(()=>rpc('diime_resolver_mediacion',d.id,admin,'parcial','No debe repartir'))
  await rpc('diime_resolver_mediacion',d.id,admin,outcome,'Mediación sin pago')
  assert.equal((await sql('select estado from trabajos where id=$1',[f.trabajo]))[0].estado,outcome==='cliente'?'cancelado':'pendiente_pago')
  assert.equal((await sql('select estado from transacciones_escrow where id=$1',[f.id]))[0].estado,'cancelado')
 })
 await check('Bank chargeback cannot be withdrawn or resolved through an ordinary Diime refund',async()=>{
  const f=await fixture();const d=await rpc('diime_registrar_contracargo',`pi_${f.id}`,'dp_test')
  assert.equal(await rpc('diime_retirar_disputa',d.id,customer),'contracargo')
  await fails(()=>rpc('diime_reclamar_liquidacion',f.id,admin,'disputa',100,d.id,'cliente','Improcedente'))
 })
 await check('Concurrent withdrawal and admin settlement serialize on the same lock',async()=>{
  const f=await fixture();const d=await rpc('diime_abrir_disputa',f.trabajo,customer,'Carrera real')
  const other=new pg.Client({connectionString:dsn});await other.connect()
  try {
   await sql('begin')
   assert.equal(await rpc('diime_retirar_disputa',d.id,customer),'ok')
   const pending=other.query('select diime_reclamar_liquidacion($1,$2,$3,$4,$5,$6,$7)',[f.id,admin,'disputa',100,d.id,'cliente','Carrera']).then(()=>({ok:true}),error=>({error}))
   // The second connection is already waiting on the first transaction's lock.
   await sql('commit')
   assert.ok((await pending).error)
   assert.equal((await sql('select liquidacion_operacion_id from transacciones_escrow where id=$1',[f.id]))[0].liquidacion_operacion_id,null)
  } finally { await sql('rollback');await other.end() }
 })
 await check('Concurrent settlement claim prevents a withdrawal that read the previous open state',async()=>{
  const f=await fixture();const d=await rpc('diime_abrir_disputa',f.trabajo,customer,'Carrera inversa')
  const other=new pg.Client({connectionString:dsn});await other.connect()
  try {
   await sql('begin')
   await rpc('diime_reclamar_liquidacion',f.id,admin,'disputa',0,d.id,'proveedor','Decisión')
   const pending=other.query('select diime_retirar_disputa($1,$2) result',[d.id,customer])
   await sql('commit')
   assert.equal((await pending).rows[0].result,'liquidacion_iniciada')
  } finally { await sql('rollback');await other.end() }
 })
 await check('Even an authenticated admin cannot bypass the atomic dispute and escrow workflows',async()=>{
  const f=await fixture();const d=await rpc('diime_abrir_disputa',f.trabajo,customer,'Permisos')
  await sql("select set_config('request.jwt.claims', $1, false)",[JSON.stringify({role:'authenticated',sub:admin})])
  await sql('set role authenticated')
  try {
   await fails(()=>sql("update transacciones_escrow set estado='completado' where id=$1",[f.id]))
   await fails(()=>sql("update disputas set estado='resuelta' where id=$1",[d.id]))
   await fails(()=>sql("insert into disputas(trabajo_id,cliente_id,profesional_id,tipo,motivo) values($1,$2,$3,'cliente','Bypass')",[f.trabajo,customer,provider]))
  } finally { await sql('reset role');await sql("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)") }
 })
 await check('Browser roles cannot call the privileged financial RPCs',async()=>{
  await sql('set role authenticated')
  try { await fails(()=>rpc('diime_bloquear_checkout',randomUUID(),customer,true)) } finally { await sql('reset role') }
 })
 console.log(`${passed} payment workflow integration scenarios passed.`)
} finally { await db.end() }
