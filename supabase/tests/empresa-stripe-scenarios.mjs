// Called after the company permissions and independent Stripe migrations.
// Real PostgreSQL assertions on disposable data; never invokes Stripe/network.
export async function testStripeEmpresa({ db, asRole, expectError, one, rpc, check }) {
  const owner = '10000000-0000-4000-8000-000000000001'
  const member = '10000000-0000-4000-8000-000000000002'
  const customer = '10000000-0000-4000-8000-000000000003'
  const delegated = '10000000-0000-4000-8000-000000000004'
  await asRole()
  for (const [i,id] of [owner,member,customer,delegated].entries()) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`stripe-${i}@example.test`])
    await db.query("insert into profiles(id,email,nombre,verificado) values($1,$2,'Stripe test',true)",[id,`stripe-${i}@example.test`])
    await db.query("insert into profesionales(id,titulo,stripe_account_id,stripe_onboarding_completado,stripe_transferencias_habilitadas,stripe_payouts_habilitados) values($1,'Stripe test',$2,true,true,true)",[id,`acct_test_personal_${i}`])
  }
  const company=(await one("insert into empresas(nombre,cif,propietario_id) values('Stripe empresa','B12345678',$1) returning id",[owner])).id
  await db.query("update empresas set estado_verificacion='verificada',verificada=true where id=$1",[company])
  await db.query("insert into empresa_miembros(empresa_id,usuario_id,cargo,origen,rol,permisos) values($1,$2,'Operador','invitacion','miembro','{\"perfil\":false,\"mensajes\":true,\"presupuestos\":true,\"encargos\":true,\"equipo\":false,\"ver_cobros\":true,\"gestionar_cobros\":false}')",[company,member])

  for (const role of ['anon','authenticated']) {
    await asRole(role,role==='authenticated'?owner:null)
    await expectError(()=>db.query('select * from empresa_cuentas_stripe'),/permission denied/,'Stripe account identifiers are not exposed to browser roles')
    await expectError(()=>rpc('registrar_cuenta_stripe_empresa',[company,owner,'acct_test_company']),/permission denied/,'Browser cannot set a company Stripe account')
    await expectError(()=>rpc('registrar_cuenta_stripe_personal',[owner,'acct_test_new_personal']),/permission denied/,'Browser cannot set a personal Stripe account')
  }
  await asRole('service_role')
  await expectError(()=>rpc('registrar_cuenta_stripe_empresa',[company,member,'acct_test_company']),/responsable principal/,'Finance reader cannot register bank identity through service RPC')
  await expectError(()=>rpc('registrar_cuenta_stripe_empresa',[company,owner,'acct_test_personal_0']),/personal/,'Company cannot take over its owner personal account')

  async function createJob(buyerCompany=null,buyer=customer) {
    await asRole('authenticated',buyer)
    const request=(await one("insert into solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion) values($1,$2,'Stripe contrato','Prueba','Madrid') returning id",[buyer,buyerCompany])).id
    await asRole('authenticated',member)
    const offer=(await one("insert into ofertas(solicitud_id,profesional_id,empresa_id,precio,tiempo_estimado,descripcion,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,$3,100,2,'Prueba',5,0,5,95) returning id",[request,member,company])).id
    await asRole('authenticated',buyer)
    return (await one('select private.aceptar_oferta_y_crear_trabajo($1,$2,$3) value',[offer,request,member])).value.trabajo
  }
  const pending=await createJob()
  check(pending.proveedor_cobros_usuario_id===null && pending.proveedor_stripe_account_id===null,'Company awaiting its own Connect never captures owner personal account')
  await asRole('service_role')
  check(await rpc('registrar_cuenta_stripe_empresa',[company,owner,'acct_test_company'])==='acct_test_company','Company registers its own account')
  check(await rpc('registrar_cuenta_stripe_empresa',[company,owner,'acct_test_other'])==='acct_test_company','Concurrent/retried registration cannot replace existing account')
  check((await one('select stripe_account_id from profesionales where id=$1',[owner])).stripe_account_id==='acct_test_personal_0','Company registration preserves owner personal account')
  await expectError(()=>db.query("update empresa_cuentas_stripe set stripe_account_id='acct_test_other' where empresa_id=$1",[company]),/permission denied/,'Service account synchronizer cannot directly replace economic ownership')
  check(await rpc('actualizar_estado_cuenta_stripe_empresa',[company,'acct_test_company',true,true,true,'[]'])===true,'Company state synchronization matches company/account pair')
  check(await rpc('actualizar_estado_cuenta_stripe_empresa',[company,'acct_test_other',true,true,true,'[]'])===false,'Stale Stripe event cannot synchronize another account')
  check(await rpc('actualizar_estado_cuenta_stripe',[owner,'acct_test_personal_0',company,true,true,true,'[]'])===true,'Company affiliation does not disable personal account state')
  await expectError(()=>rpc('empresa_fijar_destino_cobro_trabajo',[pending.id,member,'acct_test_company']),/cliente autorizado/,'Supplier cannot authorize customer payment')
  await expectError(()=>rpc('empresa_fijar_destino_cobro_trabajo',[pending.id,customer,'acct_test_personal_0']),/no pertenece/,'Contract cannot freeze owner personal destination')
  check(await rpc('empresa_fijar_destino_cobro_trabajo',[pending.id,customer,'acct_test_company'])==='acct_test_company','Validated company destination can be frozen before first checkout')
  await expectError(()=>rpc('empresa_fijar_destino_cobro_trabajo',[pending.id,customer,'acct_test_other']),/ya está fijado/,'Frozen destination is never silently replaced')

  const captured=await createJob()
  check(captured.proveedor_stripe_account_id==='acct_test_company' && captured.proveedor_cobros_usuario_id===null,'New contract snapshots company identity independently from owner')
  await asRole()
  await db.query("update profesionales set stripe_account_id='acct_test_personal_changed' where id=$1",[owner])
  await db.query("update trabajos set estado='entregado',progreso=100 where id=$1",[pending.id])
  const escrow=(await one("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor_original,comision_proveedor,pago_neto_proveedor,monto_reembolsado,estado,stripe_payment_intent_id,stripe_charge_id) values($1,$2,$3,110,100,10,5,5,95,0,'fondos_retenidos','pi_company_independent','ch_company_independent') returning id",[pending.id,customer,member])).id
  await db.query("update empresa_miembros set estado='revocado' where empresa_id=$1 and usuario_id=$2",[company,member])
  await asRole('service_role')
  const claim=await rpc('diime_reclamar_liquidacion',[escrow,customer,'confirmacion'])
  check(claim.liquidacion_contexto.destino==='acct_test_company' && claim.liquidacion_contexto.empresa_proveedora_id===company && claim.liquidacion_contexto.proveedor_cobros_usuario_id===null,'Settlement keeps company destination after staff revocation and personal account change')
  check((await rpc('diime_reclamar_liquidacion',[escrow,customer,'confirmacion'])).liquidacion_contexto.destino==='acct_test_company','Settlement retry remains idempotent with frozen destination')
  check(Number(claim.pago_neto_proveedor)===95 && Number(claim.monto_reembolsado)===0,'Ownership separation preserves contracted amounts')
  await asRole()
  await db.query("update empresa_miembros set estado='activo' where empresa_id=$1 and usuario_id=$2",[company,member])

  const buyerCompany=(await one("insert into empresas(nombre,cif,propietario_id) values('Stripe cliente','B87654321',$1) returning id",[customer])).id
  await db.query("update empresas set estado_verificacion='verificada',verificada=true where id=$1",[buyerCompany])
  await db.query("insert into empresa_miembros(empresa_id,usuario_id,cargo,origen,rol,permisos) values($1,$2,'Cobros','invitacion','miembro','{\"perfil\":false,\"mensajes\":true,\"presupuestos\":false,\"encargos\":true,\"equipo\":false,\"ver_cobros\":true,\"gestionar_cobros\":false}')",[buyerCompany,delegated])
  const delegatedJob=await createJob(buyerCompany,customer)
  await asRole('authenticated',customer)
  await rpc('empresa_reasignar_trabajo',[delegatedJob.id,delegated,'cliente'])
  await asRole('authenticated',delegated)
  check(await rpc('empresa_puede_operar_trabajo',[delegatedJob.id,'gestionar_cobros','cliente'])===false,'Assigned operator with read-only finance cannot authorize money')
  await asRole('service_role')
  await expectError(()=>rpc('empresa_fijar_destino_cobro_trabajo',[delegatedJob.id,delegated,'acct_test_company']),/cliente autorizado/,'Privileged payment RPC rechecks granular finance permission')
  await asRole()
  await db.query("update empresa_miembros set permisos=permisos||'{\"gestionar_cobros\":true}'::jsonb where empresa_id=$1 and usuario_id=$2",[buyerCompany,delegated])
  await asRole('authenticated',delegated)
  check(await rpc('empresa_puede_operar_trabajo',[delegatedJob.id,'gestionar_cobros','cliente'])===true,'Assigned operator can pay once authorized for finance')
  await asRole('service_role')
  check(await rpc('empresa_fijar_destino_cobro_trabajo',[delegatedJob.id,delegated,'acct_test_company'])==='acct_test_company','Assigned finance operator prepares original contract without rewriting author')
  check((await one('select cliente_id,actor_contratacion_id from trabajos where id=$1',[delegatedJob.id])).cliente_id===customer,'Delegated payment keeps original contractual customer')
  // Continuity: every financial/cancellation action follows current assignment,
  // while contractual parties and historic human authors remain immutable.
  const cancelJob=await createJob(buyerCompany,customer)
  const paymentJob=await createJob(buyerCompany,customer)
  const refundJob=await createJob(buyerCompany,customer)
  for (const job of [cancelJob,paymentJob,refundJob]) {
    await asRole('authenticated',customer)
    await rpc('empresa_reasignar_trabajo',[job.id,delegated,'cliente'])
    await asRole('authenticated',owner)
    await rpc('empresa_reasignar_trabajo',[job.id,owner,'proveedor'])
  }
  await asRole('authenticated',delegated)
  await expectError(()=>rpc('diime_gestionar_solicitud_cancelacion',[delegatedJob.id,delegated,'solicitar','Motivo',[]]),/permission denied/,'Browser cannot invoke privileged cancellation RPC with a forged actor')
  await asRole('service_role')
  const requested=await rpc('diime_gestionar_solicitud_cancelacion',[delegatedJob.id,delegated,'solicitar','Solicitud cliente',[]])
  check(requested.parte_actor==='cliente' && requested.cancelacion_parte_solicitante==='cliente','Delegated cancellation snapshots contractual side')
  await expectError(()=>rpc('diime_gestionar_solicitud_cancelacion',[delegatedJob.id,owner,'editar','Intrusión',[]]),/Solo la parte/,'Counterparty cannot edit cancellation arguments')
  await asRole()
  await db.query("update empresa_miembros set estado='revocado' where empresa_id=$1 and usuario_id=$2",[buyerCompany,delegated])
  await asRole('service_role')
  await expectError(()=>rpc('diime_gestionar_solicitud_cancelacion',[delegatedJob.id,delegated,'editar','Revocado',[]]),/No tienes permiso/,'Revoked requester loses cancellation editing permission')
  await rpc('diime_gestionar_solicitud_cancelacion',[delegatedJob.id,customer,'editar','Continuación principal',[]])
  check((await one('select cancelacion_solicitada_por,cancelacion_parte_solicitante from trabajos where id=$1',[delegatedJob.id])).cancelacion_solicitada_por===delegated,'Replacement editing preserves the original human requester')
  await rpc('diime_gestionar_solicitud_cancelacion',[delegatedJob.id,customer,'retirar','',[]])
  check((await one('select cancelacion_estado,estado from trabajos where id=$1',[delegatedJob.id])).cancelacion_estado===null,'Current principal can withdraw the prior operator request without closing work')
  await rpc('diime_gestionar_solicitud_cancelacion',[delegatedJob.id,customer,'solicitar','Solicitud nueva',[]])
  await rpc('diime_bloquear_checkout',[delegatedJob.id,owner,false,true])
  const dispute=await rpc('diime_abrir_disputa',[delegatedJob.id,owner,'Oposición proveedor',true,[]])
  check(dispute.tipo==='cliente' && dispute.actor_apertura_id===owner && dispute.parte_actor==='proveedor','Cancellation dispute keeps claimant side and actual responding actor distinct')
  check(dispute.cliente_id===customer && dispute.profesional_id===member,'Dispute does not replace original contractual parties')
  check(await rpc('diime_retirar_disputa',[dispute.id,owner])==='no_autorizado','Counterparty cannot withdraw the claimant dispute')
  check(await rpc('diime_retirar_disputa',[dispute.id,customer])==='ok','Authorized principal can withdraw its side dispute')
  await asRole()
  await db.query("update empresa_miembros set estado='activo',permisos=permisos||'{\"encargos\":false,\"gestionar_cobros\":true}'::jsonb where empresa_id=$1 and usuario_id=$2",[buyerCompany,delegated])
  await db.query("update empresa_miembros set estado='revocado' where empresa_id=$1 and usuario_id=$2",[company,member])
  await db.query("update empresas set estado_verificacion='en_revision',verificada=false where id=$1",[company])
  await asRole('service_role')
  await rpc('diime_gestionar_solicitud_cancelacion',[cancelJob.id,owner,'solicitar','Cancelación proveedor',[]])
  await expectError(()=>rpc('diime_bloquear_checkout',[cancelJob.id,owner,true,false]),/Solo la contraparte/,'Same company cannot accept its own cancellation via another human')
  await rpc('diime_bloquear_checkout',[cancelJob.id,delegated,true,false])
  check((await one('select cancelacion_aceptada_por from trabajos where id=$1',[cancelJob.id])).cancelacion_aceptada_por===delegated,'Finance-only assigned counterparty can accept and records actual actor')
  check((await rpc('diime_cerrar_cancelacion',[cancelJob.id,delegated])).nuevo_cierre===true,'Finance-only operator closes unpaid cancellation despite former provider revocation and company review')
  const payEscrow=(await one("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,actor_pago_id,monto,monto_base,comision_cliente,comision_proveedor_original,comision_proveedor,pago_neto_proveedor,monto_reembolsado,estado,stripe_session_id) values($1,$2,$3,$4,110,100,10,5,5,95,0,'pendiente','cs_continuidad') returning id",[paymentJob.id,customer,member,delegated])).id
  const paid=await rpc('diime_confirmar_pago',[payEscrow,'cs_continuidad','pi_continuidad','ch_continuidad',11000,'eur'])
  check(paid.activado===true && paid.tardio===false,'Payment webhook uses current operators, not revoked original employee')
  check((await one("select usuario_id from actualizaciones_trabajo where trabajo_id=$1 and mensaje like 'Pago recibido%'",[paymentJob.id])).usuario_id===delegated,'Payment activity records the actual human payer')
  check(paid.escrow.cliente_id===customer && paid.escrow.profesional_id===member,'Payment webhook preserves original contractual parties')
  await asRole()
  await db.query("update trabajos set estado='en_progreso' where id=$1",[refundJob.id])
  const refundEscrow=(await one("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor_original,comision_proveedor,pago_neto_proveedor,monto_reembolsado,estado,stripe_payment_intent_id,stripe_charge_id) values($1,$2,$3,110,100,10,5,5,95,0,'fondos_retenidos','pi_refund_continuidad','ch_refund_continuidad') returning id",[refundJob.id,customer,member])).id
  await asRole('service_role')
  await rpc('diime_gestionar_solicitud_cancelacion',[refundJob.id,owner,'solicitar','Proveedor solicita reembolso',[]])
  await rpc('diime_bloquear_checkout',[refundJob.id,delegated,true,false])
  const refund=await rpc('diime_reclamar_liquidacion',[refundEscrow,delegated,'cancelacion'])
  check(Number(refund.monto_reembolsado)===100 && Number(refund.comision_cliente_retenida)===10 && Number(refund.pago_neto_proveedor)===0,'Reassigned finance operator refund keeps service/commission split')
  check(refund.liquidacion_contexto.actor===delegated,'Refund snapshot records the current authorized actor')
  await asRole()
}
