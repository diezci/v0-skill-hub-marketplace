// Invoked by empresas-equipo.test.mjs against its disposable PostgreSQL fixture.
export async function testCobros({ db, asRole, ids, expectError, one, rpc, check }) {
  await asRole('authenticated', ids.client)
  await expectError(() => rpc('empresa_fijar_destino_cobro_trabajo', [ids.job, ids.client, 'acct_owner']), /permission denied/, 'Cliente no invoca RPC privilegiada destino')
  await asRole('service_role')
  await expectError(() => rpc('empresa_fijar_destino_cobro_trabajo', [ids.job, ids.client, 'acct_owner']), /equipo activo/, 'No inicia nuevo Checkout cuando proveedor empleado ya fue revocado')
  check((await one('select proveedor_stripe_account_id from trabajos where id=$1', [ids.job])).proveedor_stripe_account_id === 'acct_owner', 'Baja proveedor no redirige destino contractual existente')
  await expectError(() => rpc('empresa_fijar_destino_cobro_trabajo', [ids.job, ids.outsider, 'acct_owner']), /Solo el cliente/, 'Service role no autoriza actor ajeno')

  // Reactivate only through the public invitation workflow.
  await asRole('authenticated', ids.owner)
  const invitation = await rpc('empresa_crear_invitacion', ['member@example.test', 'Arquitecto'])
  await asRole('authenticated', ids.member)
  await rpc('empresa_aceptar_invitacion', [invitation.token])
  await asRole('service_role')
  await expectError(() => rpc('empresa_fijar_destino_cobro_trabajo', [ids.job, ids.client, 'acct_member']), /ya está fijado/, 'No sustituye destinatario congelado por cuenta empleado')

  async function createJob({ customer = ids.client, provider = ids.member, buyerCompany = null, supplierCompany = ids.company } = {}) {
    await asRole('authenticated', customer)
    const request = (await one("insert into solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion) values($1,$2,'Prueba cobros empresa','Sintético','Madrid') returning id", [customer, buyerCompany])).id
    await asRole('authenticated', provider)
    const offer = (await one("insert into ofertas(solicitud_id,profesional_id,empresa_id,precio,tiempo_estimado,descripcion,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,$3,100,2,'Prueba',5,0,5,95) returning id", [request, provider, supplierCompany])).id
    await asRole('authenticated', customer)
    return (await one('select private.aceptar_oferta_y_crear_trabajo($1,$2,$3) value', [offer, request, provider])).value.trabajo
  }
  async function addHeldPayment(job) {
    await asRole()
    await db.query("update trabajos set estado='entregado',progreso=100 where id=$1", [job.id])
    return (await one("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor_original,comision_proveedor,pago_neto_proveedor,monto_reembolsado,estado,stripe_payment_intent_id,stripe_charge_id) values($1,$2,$3,110,100,10,5,5,95,0,'fondos_retenidos','pi_company_test','ch_company_test') returning id", [job.id, job.cliente_id, job.profesional_id])).id
  }

  await asRole()
  await db.query('update profesionales set stripe_account_id=null where id=$1', [ids.owner])
  const delayed = await createJob()
  check(delayed.proveedor_cobros_usuario_id === ids.owner && delayed.proveedor_stripe_account_id === null, 'Contrato empresa conserva titular aunque Connect no esté listo')
  await asRole()
  await db.query("update profesionales set stripe_account_id='acct_company_ready' where id=$1", [ids.owner])
  await asRole('service_role')
  await expectError(() => rpc('empresa_fijar_destino_cobro_trabajo', [delayed.id, ids.client, 'acct_member']), /no pertenece/, 'No puede congelar cuenta empleado en contrato empresa')
  check(await rpc('empresa_fijar_destino_cobro_trabajo', [delayed.id, ids.client, 'acct_company_ready']) === 'acct_company_ready', 'Destino configurado después se fija antes del pago')
  check((await one('select proveedor_stripe_account_id from trabajos where id=$1', [delayed.id])).proveedor_stripe_account_id === 'acct_company_ready', 'Destino queda persistido en contrato')

  const payment = await addHeldPayment(delayed)
  await asRole()
  await db.query("update profesionales set stripe_account_id='acct_owner_later' where id=$1", [ids.owner])
  await asRole('authenticated', ids.owner)
  await rpc('empresa_actualizar_miembro', [ids.member, null, true])
  await asRole('service_role')
  const settlement = await rpc('diime_reclamar_liquidacion', [payment, ids.client, 'confirmacion'])
  check(settlement.liquidacion_contexto.destino === 'acct_company_ready', 'Liquidación no sigue cambios posteriores Connect ni cuenta empleado')
  check(settlement.liquidacion_contexto.empresa_proveedora_id === ids.company && settlement.liquidacion_contexto.proveedor_cobros_usuario_id === ids.owner, 'Liquidación congela identidad económica empresa y titular')
  check(Number(settlement.pago_neto_proveedor) === 95, 'Liquidación conserva importes acordados')
  check((await rpc('diime_reclamar_liquidacion', [payment, ids.client, 'confirmacion'])).liquidacion_contexto.destino === 'acct_company_ready', 'Reintento mantiene destino e identidad ya fijados')

  // Revoked company customers cannot use a privileged money RPC with the old actor id.
  await asRole('authenticated', ids.owner)
  const secondInvite = await rpc('empresa_crear_invitacion', ['member@example.test', 'Arquitecto'])
  await asRole('authenticated', ids.member)
  await rpc('empresa_aceptar_invitacion', [secondInvite.token])
  const buyerJob = await createJob({ customer: ids.member, provider: ids.client, buyerCompany: ids.company, supplierCompany: null })
  const buyerPayment = await addHeldPayment(buyerJob)
  const unpaidBuyerJob = await createJob({ customer: ids.member, provider: ids.client, buyerCompany: ids.company, supplierCompany: null })
  await asRole('authenticated', ids.owner)
  await rpc('empresa_actualizar_miembro', [ids.member, null, true])
  await asRole('service_role')
  await expectError(() => rpc('empresa_fijar_destino_cobro_trabajo', [unpaidBuyerJob.id, ids.member, 'acct_client']), /baja de la empresa/, 'Baja cliente impide Checkout con admin RPC')
  await expectError(() => rpc('diime_reclamar_liquidacion', [buyerPayment, ids.member, 'confirmacion']), /baja de la empresa/, 'Baja cliente impide liberar fondos con admin RPC')
  await expectError(() => rpc('diime_reclamar_liquidacion', [buyerPayment, ids.member, 'cancelacion']), /baja de la empresa/, 'Baja cliente impide reembolso con admin RPC')
  check((await one('select liquidacion_operacion_id from transacciones_escrow where id=$1', [buyerPayment])).liquidacion_operacion_id === null, 'Rechazos no reclaman liquidación ni cambian fondos')

  const invoice = async (jobId) => (await db.query('select * from public.facturacion_trabajo($1)', [jobId])).rows
  await asRole('authenticated', ids.client)
  const initialInvoice = await invoice(delayed.id)
  const supplierInvoice = initialInvoice.find(row => row.parte === 'profesional')
  check(supplierInvoice.empresa_nombre === 'Empresa prueba' && supplierInvoice.empresa_cif === 'B00000000', 'Factura nuevo empleado identifica empresa del contrato, no perfil personal')
  check(supplierInvoice.persona_nombre === 'member' && supplierInvoice.persona_cargo === 'Arquitecto' && supplierInvoice.persona_documento === null, 'Factura empresa identifica actor/cargo sin publicar su DNI')
  const buyerInvoice = (await invoice(buyerJob.id)).find(row => row.parte === 'cliente')
  check(buyerInvoice.empresa_nombre === 'Empresa prueba' && buyerInvoice.persona_nombre === 'member', 'Factura cliente empresa usa snapshot del lado contratante')
  await asRole('authenticated', ids.member)
  check((await invoice(delayed.id)).length === 2, 'Actor original conserva datos del justificante tras baja')
  await expectError(() => db.query('select datos from diime_private.trabajos_facturacion'), /permission denied/, 'Snapshot fiscal no accesible por tabla directa')
  await asRole('authenticated', ids.outsider)
  check((await invoice(delayed.id)).length === 0, 'Tercero no enumera datos fiscales de trabajo ajeno')
  await asRole('anon')
  await expectError(() => invoice(delayed.id), /permission denied/, 'Anónimo no obtiene datos fiscales')
  await asRole('service_role')
  await expectError(() => db.query('select datos from diime_private.trabajos_facturacion'), /permission denied/, 'Tabla fiscal no se expone tampoco por grants service_role genéricos')

  await asRole()
  await db.query("update empresas set nombre='Identidad modificada',cif='B99999999',ubicacion='Barcelona',email='new@example.test' where id=$1", [ids.company])
  await db.query("update profiles set nombre='Nombre posterior',documento='NUEVO-DOCUMENTO' where id=$1", [ids.member])
  await db.query("update empresa_miembros set cargo='Cargo posterior' where empresa_id=$1 and usuario_id=$2", [ids.company, ids.member])
  await asRole('authenticated', ids.client)
  check(JSON.stringify(await invoice(delayed.id)) === JSON.stringify(initialInvoice), 'Justificante mantiene empresa/CIF/actor/cargo originales tras cambiar datos y revocar miembro')

  await asRole()
  await db.query("update profiles set documento='DOC-PERSONAL' where id=$1", [ids.outsider])
  const personalJob = await createJob({ customer: ids.outsider, provider: ids.client, buyerCompany: null, supplierCompany: null })
  const personalInvoice = (await invoice(personalJob.id)).find(row => row.parte === 'cliente')
  check(personalInvoice.empresa_nombre === null && personalInvoice.empresa_cif === null && personalInvoice.persona_documento === 'DOC-PERSONAL', 'Contrato nuevo personal no factura como empresa aunque su actor sea titular de una')
  await asRole()
  check((await one("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='facturacion_trabajo' and p.prosecdef")).n === 0, 'RPC facturación pública es invoker')
  if (ids.legacyJob) {
    await asRole('authenticated', ids.owner)
    check((await invoice(ids.legacyJob)).length === 2, 'Contratos previos sin snapshot conservan consulta histórica')
    await asRole()
    check((await one('select count(*)::int n from diime_private.trabajos_facturacion where trabajo_id=$1', [ids.legacyJob])).n === 0, 'No se reconstruye snapshot histórico con datos posteriores')
  }
  await asRole()
}
