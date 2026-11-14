/** Real PostgreSQL functions, synthetic rows; Stripe network calls are covered separately. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { db, ids } from './fixtures/hitos-db.mjs'
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]
const rpc = async (name, args = []) => (await one(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args)).value
const role = async (name = 'postgres', actor = null) => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('diime.actor_usuario_id','',false)", [actor || ''])
  if (name !== 'postgres') await db.exec(`set role ${name}`)
}
const historicalFinancial = await readFile(new URL('../migrations/20260909191217_pagos_disputas_atomicos.sql', import.meta.url), 'utf8')
const closeStart = historicalFinancial.indexOf('create or replace function public.diime_cerrar_intento(')
await db.exec(historicalFinancial.slice(closeStart, historicalFinancial.indexOf('$$;', closeStart) + 3))
await db.exec('revoke all on function public.diime_cerrar_intento(uuid,text) from public,anon,authenticated; grant execute on function public.diime_cerrar_intento(uuid,text) to service_role;')
const historicalNotices = await readFile(new URL('../migrations/20260918113744_notificaciones_pagos_contexto.sql', import.meta.url), 'utf8')
const mediationStart = historicalNotices.indexOf('CREATE OR REPLACE FUNCTION public.diime_resolver_mediacion(')
await db.exec(historicalNotices.slice(mediationStart, historicalNotices.indexOf('end; $function$;', mediationStart) + 'end; $function$;'.length))
await db.exec('revoke all on function public.diime_resolver_mediacion(uuid,uuid,text,text) from public,anon,authenticated; grant execute on function public.diime_resolver_mediacion(uuid,uuid,text,text) to service_role;')
await db.exec('create trigger proteger_destinatario_aviso_empresa before insert on public.notificaciones for each row execute function diime_private.proteger_destinatario_aviso_empresa();')
await db.exec('create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);')
await db.exec(await readFile(new URL('../migrations/20261026133724_contracargos_expediente_y_conciliacion.sql', import.meta.url), 'utf8'))
await db.exec(await readFile(new URL('../migrations/20261111235133_hitos_conciliacion_financiera.sql', import.meta.url), 'utf8'))
await db.exec(await readFile(new URL('../migrations/20261114205032_hitos_destino_cobro_siguientes_fases.sql', import.meta.url), 'utf8'))
await db.query('update public.profiles set es_admin=true where id=$1', [ids.platformAdmin])
const adminSession = randomUUID()
await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [adminSession, ids.platformAdmin])
let scenarios = 0
async function check(name, body) { await body(); scenarios++; console.log(`PASS ${name}`) }
async function fixture(mode = 'hitos') {
  await role()
  const stages = [40, 60].map((amount, i) => ({ id: randomUUID(), titulo: `Fase ${i + 1}`, descripcion: '', criterio_aceptacion: `Entrega ${i + 1} comprobable`, importe_centimos: amount * 100, fecha_limite: `2027-02-0${i + 1}` }))
  const request = await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion,estado) values($1,'Contrato de prueba','Servicio','Madrid','abierta') returning id", [ids.client])
  const offer = await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,estado,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto,modalidad_pago,plan_hitos) values($1,$2,100,3,'Oferta','pendiente',10,2,10,90,$3,$4) returning id", [request.id, ids.owner, mode, JSON.stringify(mode === 'hitos' ? stages : [])])
  const job = await one("insert into public.trabajos(solicitud_id,oferta_id,cliente_id,profesional_id,titulo,precio_acordado,estado,proveedor_stripe_account_id,proveedor_cobros_usuario_id) values($1,$2,$3,$4,'Contrato de prueba',100,'pendiente_pago','acct_owner',$4) returning id", [request.id, offer.id, ids.client, ids.owner])
  await role('service_role')
  return { id: job.id, stages, request: request.id, offer: offer.id }
}
const prepare = async (job, index = 0, actor = ids.client) => {
  // Exercise the full reservation chain used by pagarHito, including its legacy
  // Connect destination adapter; testing preparar_pago_hito alone misses its state gate.
  await rpc('empresa_fijar_destino_cobro_trabajo', [job.id, actor, 'acct_owner'])
  return rpc('preparar_pago_hito', [job.id, job.stages[index].id, actor])
}
async function capture(e) {
  const suffix = e.id.replaceAll('-', '')
  const session = `cs_test_${suffix}`, intent = `pi_${suffix}`, charge = `ch_${suffix}`
  await db.query('update public.transacciones_escrow set stripe_session_id=$1 where id=$2', [session, e.id])
  return rpc('diime_confirmar_pago', [e.id, session, intent, charge, Math.round(Number(e.monto) * 100), 'eur'])
}
async function deliver(job, index = 0) {
  await db.query("update public.trabajos_hitos set estado='entregado',mensaje_entrega='Pruebas y entrega' where id=$1", [job.stages[index].id])
}
async function finish(e, actor = ids.client, type = 'confirmacion', extra = []) {
  const claim = await rpc('diime_reclamar_liquidacion', [e.id, actor, type, ...extra])
  const result = await rpc('diime_finalizar_liquidacion', [e.id, claim.liquidacion_operacion_id, claim.stripe_charge_id, Number(claim.monto_reembolsado) > 0 ? `re_${e.id}` : null, Number(claim.monto_reembolsado) > 0 ? 'succeeded' : null, Number(claim.pago_neto_proveedor) > 0 ? `tr_${e.id}` : null])
  return { claim, result }
}
const status = async (job) => ({ job: (await one('select estado from public.trabajos where id=$1', [job.id])).estado, stages: (await db.query('select estado from public.trabajos_hitos where trabajo_id=$1 and activo order by orden', [job.id])).rows.map(h => h.estado) })

await check('only next milestone can be funded, and preparing the same one reuses the same intent', async () => {
  const job = await fixture()
  await assert.rejects(() => prepare(job, 1))
  await assert.rejects(() => prepare(job, 0, ids.outsider))
  const e = await prepare(job)
  assert.equal(e.id, (await prepare(job)).id)
  await capture(e)
  assert.deepEqual(await status(job), { job: 'en_progreso', stages: ['financiado', 'pendiente'] })
  const notices = (await one("select count(*)::int as n from public.notificaciones where metadata->>'hito_id'=$1", [job.stages[0].id])).n
  await capture(e)
  assert.equal((await one("select count(*)::int as n from public.notificaciones where metadata->>'hito_id'=$1", [job.stages[0].id])).n, notices)
})
await check('one milestone approval never completes the whole job; final milestone does', async () => {
  const job = await fixture(), e1 = await prepare(job)
  await capture(e1)
  await assert.rejects(() => rpc('diime_reclamar_liquidacion', [e1.id, ids.client, 'confirmacion']))
  await deliver(job)
  await assert.rejects(() => rpc('diime_reclamar_liquidacion', [e1.id, ids.owner, 'confirmacion']))
  const claim = await rpc('diime_reclamar_liquidacion', [e1.id, ids.client, 'confirmacion'])
  assert.equal((await status(job)).stages[0], 'aprobado')
  await assert.rejects(() => rpc('diime_finalizar_liquidacion', [e1.id, claim.liquidacion_operacion_id, claim.stripe_charge_id, null, null, null]))
  await finish(e1)
  assert.deepEqual(await status(job), { job: 'en_progreso', stages: ['completado', 'pendiente'] })
  await assert.rejects(() => rpc('empresa_fijar_destino_cobro_trabajo', [job.id, ids.client, 'acct_different']))
  await assert.rejects(() => rpc('empresa_fijar_destino_cobro_trabajo', [job.id, ids.outsider, 'acct_owner']))
  await finish(e1)
  await assert.rejects(() => rpc('diime_finalizar_liquidacion', [e1.id, claim.liquidacion_operacion_id, claim.stripe_charge_id, null, null, 'tr_other']))
  const e2 = await prepare(job, 1); await capture(e2); await deliver(job, 1); await finish(e2)
  assert.deepEqual(await status(job), { job: 'completado', stages: ['completado', 'completado'] })
  assert.equal((await one('select sum(comision_cliente)::numeric as fee from public.transacciones_escrow where trabajo_id=$1', [job.id])).fee, '10.00')
})
await check('an expired paid checkout is refunded once without activating its milestone', async () => {
  const job = await fixture(), e = await prepare(job)
  await rpc('diime_cerrar_intento', [e.id, null])
  // Capture can arrive before the creator persisted its session or after expiry.
  const result = await rpc('diime_confirmar_pago', [e.id, 'cs_test_late', 'pi_late', 'ch_late', 4400, 'eur'])
  assert.equal(result.tardio, true)
  assert.deepEqual(await status(job), { job: 'pendiente_pago', stages: ['pendiente', 'pendiente'] })
  const settled = await finish(e, null, 'pago_tardio')
  assert.equal(Number(settled.claim.monto_reembolsado), 44); assert.equal(Number(settled.claim.pago_neto_proveedor), 0)
  await finish(e, null, 'pago_tardio')
  assert.deepEqual(await status(job), { job: 'pendiente_pago', stages: ['pendiente', 'pendiente'] })
  const retry = await prepare(job); assert.notEqual(retry.id, e.id); await capture(retry)
  await finish(e, null, 'pago_tardio')
  assert.deepEqual(await status(job), { job: 'en_progreso', stages: ['financiado', 'pendiente'] })
})
await check('cancelling after one paid milestone preserves it and refunds only the active stage', async () => {
  const job = await fixture(), e1 = await prepare(job); await capture(e1); await deliver(job); await finish(e1)
  const e2 = await prepare(job, 1); await capture(e2)
  await db.query("update public.trabajos set cancelacion_solicitada_por=$1,cancelacion_estado='pendiente',cancelacion_razon='Cerrar el resto',cancelacion_aceptada_por=$2,pago_bloqueado=true where id=$3", [ids.client, ids.owner, job.id])
  await finish(e2, ids.owner, 'cancelacion')
  assert.deepEqual(await status(job), { job: 'cancelado', stages: ['completado', 'cancelado'] })
  assert.equal((await one('select estado from public.transacciones_escrow where id=$1', [e1.id])).estado, 'completado')
  assert.equal(Number((await one('select monto_reembolsado from public.transacciones_escrow where id=$1', [e2.id])).monto_reembolsado), 60)
})
await check('a dispute targets the requested stage and withdrawal restores that exact delivery state', async () => {
  const job = await fixture(), e = await prepare(job); await capture(e); await deliver(job)
  await assert.rejects(() => rpc('diime_abrir_disputa_hito', [job.id, job.stages[1].id, ids.client, 'No coincide']))
  const d = await rpc('diime_abrir_disputa_hito', [job.id, job.stages[0].id, ids.client, 'Entrega incompleta'])
  assert.deepEqual(await status(job), { job: 'en_disputa', stages: ['en_disputa', 'pendiente'] })
  await assert.rejects(() => prepare(job, 1))
  assert.equal(await rpc('diime_retirar_disputa', [d.id, ids.client]), 'ok')
  assert.deepEqual(await status(job), { job: 'en_progreso', stages: ['entregado', 'pendiente'] })
})
await check('mediation refunds the disputed stage without closing unfunded future work', async () => {
  const job = await fixture(), e = await prepare(job); await capture(e)
  const d = await rpc('diime_abrir_disputa_hito', [job.id, job.stages[0].id, ids.client, 'Entrega imposible'])
  await finish(e, ids.platformAdmin, 'disputa', [40, d.id, 'cliente', 'Reembolso de esta fase'])
  assert.deepEqual(await status(job), { job: 'en_progreso', stages: ['cancelado', 'pendiente'] })
  const e2 = await prepare(job, 1); assert.equal(e2.hito_id, job.stages[1].id)
})
await check('bank loss before transfer cancels only that stage and never creates a second refund', async () => {
  const job = await fixture(), e = await prepare(job); const paid = await capture(e)
  const d = await rpc('diime_actualizar_contracargo', [paid.escrow.stripe_payment_intent_id, 'dp_' + e.id, paid.escrow.stripe_charge_id, 'lost', 4400, 'eur', null, 'evt_' + e.id])
  await rpc('diime_finalizar_conciliacion_contracargo', [d.id, d.stripe_disputa_id, ids.platformAdmin, adminSession, null])
  assert.deepEqual(await status(job), { job: 'en_progreso', stages: ['cancelado', 'pendiente'] })
  const ledger = await one('select estado,stripe_refund_id,monto_reembolsado from public.transacciones_escrow where id=$1', [e.id])
  assert.equal(ledger.estado, 'reembolsado'); assert.equal(ledger.stripe_refund_id, null); assert.equal(Number(ledger.monto_reembolsado), 44)
})
await check('a late failed refund can reopen an older stage while the next one remains funded, then recover without rewriting either', async () => {
  const job = await fixture(), e1 = await prepare(job); await capture(e1)
  const d = await rpc('diime_abrir_disputa_hito', [job.id, job.stages[0].id, ids.client, 'Devolver fase 1'])
  const { claim } = await finish(e1, ids.platformAdmin, 'disputa', [40, d.id, 'cliente', 'Devolución acordada'])
  const e2 = await prepare(job, 1); await capture(e2)
  const refund = `re_${e1.id}`, replacement = `re_retry_${e1.id}`
  await rpc('diime_registrar_estado_reembolso', [e1.id, claim.liquidacion_operacion_id, refund, 'failed', 'Fallo tardío', null])
  assert.equal((await one('select estado from public.transacciones_escrow where id=$1', [e1.id])).estado, 'liquidando')
  assert.equal((await one('select estado from public.transacciones_escrow where id=$1', [e2.id])).estado, 'fondos_retenidos')
  await assert.rejects(() => rpc('diime_finalizar_liquidacion', [e1.id, claim.liquidacion_operacion_id, claim.stripe_charge_id, refund, 'succeeded', null]), /falló/)
  await rpc('diime_autorizar_reintento_reembolso', [e1.id, ids.platformAdmin, refund, 'Reembolso rechazado; nuevo intento explícito'])
  await rpc('diime_registrar_estado_reembolso', [e1.id, claim.liquidacion_operacion_id, replacement, 'succeeded', null, refund])
  await rpc('diime_finalizar_liquidacion', [e1.id, claim.liquidacion_operacion_id, claim.stripe_charge_id, replacement, 'succeeded', null])
  assert.deepEqual(await status(job), { job: 'en_progreso', stages: ['cancelado', 'financiado'] })
  assert.equal((await one('select estado from public.disputas where id=$1', [d.id])).estado, 'resuelta')
})
await check('legacy one-time capture and full-job settlement still use the original lifecycle', async () => {
  const job = await fixture('unico')
  const e = await one("insert into public.transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,monto_bruto_proveedor,estado) values($1,$2,$3,110,100,10,10,10,90,100,'pendiente') returning *", [job.id, ids.client, ids.owner])
  await capture(e)
  assert.equal((await status(job)).job, 'en_progreso')
  await assert.rejects(() => rpc('empresa_fijar_destino_cobro_trabajo', [job.id, ids.client, 'acct_owner']))
  await db.query("update public.trabajos set estado='entregado' where id=$1", [job.id])
  await finish(e)
  assert.deepEqual(await status(job), { job: 'completado', stages: [] })
})
await check('company payment uses the actual authorized payer rather than the assigned operational member', async () => {
  await role()
  const company = (await one("insert into public.empresas(nombre,cif,propietario_id,verificada,estado_verificacion,razon_social) values('Cliente Empresa Finance','B12345679',$1,true,'verificada','Cliente Empresa Finance SL') returning id", [ids.client])).id
  await db.query("insert into public.empresa_miembros(empresa_id,usuario_id,cargo,origen,rol,permisos) values($1,$2,'Gestor','invitacion','miembro',$3)", [company, ids.worker2, JSON.stringify({ perfil: false, mensajes: true, presupuestos: false, encargos: true, equipo: false, ver_cobros: false, gestionar_cobros: false })])
  await db.query("insert into public.empresa_miembros(empresa_id,usuario_id,cargo,origen,rol,permisos) values($1,$2,'Administración','invitacion','administrador',$3)", [company, ids.member, JSON.stringify({ perfil: true, mensajes: true, presupuestos: true, encargos: true, equipo: true, ver_cobros: true, gestionar_cobros: true })])
  const companyJob = async () => {
    await role('authenticated', ids.client)
    const request = (await one("insert into public.solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion) values($1,$2,'Encargo empresarial','Prueba','Madrid') returning id", [ids.client, company])).id
    await role('authenticated', ids.owner)
    const stages = [40, 60].map((amount, i) => ({ id: randomUUID(), titulo: `Fase empresa ${i + 1}`, descripcion: '', criterio_aceptacion: 'Entrega comprobable', importe_centimos: amount * 100, fecha_limite: '2027-03-01' }))
    const offer = (await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,modalidad_pago,plan_hitos,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,4,'Presupuesto empresarial','hitos',$3,10,2,10,90) returning id", [request, ids.owner, JSON.stringify(stages)])).id
    await role('authenticated', ids.client)
    const job = (await rpc('aceptar_oferta_y_crear_trabajo', [offer, request, ids.owner, null, 1])).trabajo.id
    await role()
    await db.query('update public.trabajos set operador_cliente_id=$1 where id=$2', [ids.worker2, job])
    await role('service_role')
    return { id: job, stages }
  }
  const job = await companyJob(), e = await prepare(job, 0, ids.member)
  assert.equal(e.actor_pago_id, ids.member)
  const paid = await capture(e)
  assert.equal(paid.tardio, false)
  assert.deepEqual(await status(job), { job: 'en_progreso', stages: ['financiado', 'pendiente'] })
  const revokedJob = await companyJob(), revokedPayment = await prepare(revokedJob, 0, ids.member)
  await role()
  await db.query("update public.empresa_miembros set estado='revocado' where empresa_id=$1 and usuario_id=$2", [company, ids.member])
  await role('service_role')
  const late = await capture(revokedPayment)
  assert.equal(late.tardio, true)
  assert.deepEqual(await status(revokedJob), { job: 'pendiente_pago', stages: ['pendiente', 'pendiente'] })
  // Database routing must preserve the exact hito route after rechecking the
  // recipient, including revocation between proposal and notification insert.
  const route = `/trabajos/${job.id}/hitos`
  const notification = async (recipient, link, type = 'oferta_actualizada') => one("insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,metadata) values($1,$2,'Aviso de prueba','Revisar hito',$3,$4) returning usuario_id,link", [recipient, type, link, JSON.stringify({ trabajo_id: job.id, parte_destinataria: 'cliente' })])
  const operatorNotice = await notification(ids.worker2, route)
  assert.equal(operatorNotice.usuario_id, ids.worker2); assert.equal(operatorNotice.link, route)
  const financeNotice = await notification(ids.worker2, route, 'reembolso_emitido')
  assert.equal(financeNotice.usuario_id, ids.client); assert.equal(financeNotice.link, route)
  await role()
  await db.query("update public.empresa_miembros set estado='revocado' where empresa_id=$1 and usuario_id=$2", [company, ids.worker2])
  await role('service_role')
  const redirected = await notification(ids.worker2, route)
  assert.equal(redirected.usuario_id, ids.client); assert.equal(redirected.link, route)
  const unrelated = await notification(ids.worker2, `/trabajos/${randomUUID()}/hitos`)
  assert.equal(unrelated.link, `/mi-empresa?trabajo=${job.id}&aspecto=oferta_actualizada`)

})
await check('a terminal plan with a refunded stage closes cancelled, keeping prior completed stages intact', async () => {
  const job = await fixture(), e1 = await prepare(job); await capture(e1); await deliver(job); await finish(e1)
  const e2 = await prepare(job, 1); await capture(e2)
  const d = await rpc('diime_abrir_disputa_hito', [job.id, job.stages[1].id, ids.client, 'Última fase no entregada'])
  await finish(e2, ids.platformAdmin, 'disputa', [60, d.id, 'cliente', 'Devolución de última fase'])
  assert.deepEqual(await status(job), { job: 'cancelado', stages: ['completado', 'cancelado'] })
  assert.equal((await one('select estado from public.solicitudes where id=$1', [job.request])).estado, 'cancelada')
})
await check('a won bank dispute on an already completed contract restores stage before parent completion', async () => {
  const job = await fixture(), e1 = await prepare(job); const paid = await capture(e1); await deliver(job); await finish(e1)
  const e2 = await prepare(job, 1); await capture(e2); await deliver(job, 1); await finish(e2)
  const d = await rpc('diime_actualizar_contracargo', [paid.escrow.stripe_payment_intent_id, 'dp_won_' + e1.id, paid.escrow.stripe_charge_id, 'won', 4400, 'eur', null, 'evt_' + e1.id])
  assert.equal((await status(job)).job, 'en_disputa')
  await assert.rejects(() => rpc('diime_finalizar_conciliacion_contracargo', [d.id, d.stripe_disputa_id, ids.outsider, adminSession, null]), /No autorizado/)
  await rpc('diime_finalizar_conciliacion_contracargo', [d.id, d.stripe_disputa_id, ids.platformAdmin, adminSession, null])
  assert.deepEqual(await status(job), { job: 'completado', stages: ['completado', 'completado'] })
  await rpc('diime_finalizar_conciliacion_contracargo', [d.id, d.stripe_disputa_id, ids.platformAdmin, adminSession, null])
  assert.deepEqual(await status(job), { job: 'completado', stages: ['completado', 'completado'] })
})
await check('winning a bank dispute on paid history cannot reactivate a mutually cancelled contract', async () => {
  const job = await fixture(), e = await prepare(job); const paid = await capture(e); await deliver(job); await finish(e)
  await db.query("update public.trabajos set cancelacion_solicitada_por=$1,cancelacion_estado='pendiente',cancelacion_razon='Cerrar fases pendientes',cancelacion_aceptada_por=$2,pago_bloqueado=true where id=$3", [ids.client, ids.owner, job.id])
  await rpc('diime_cerrar_cancelacion', [job.id, ids.owner])
  const d = await rpc('diime_actualizar_contracargo', [paid.escrow.stripe_payment_intent_id, 'dp_cancel_' + e.id, paid.escrow.stripe_charge_id, 'won', 4400, 'eur', null, 'evt_' + e.id])
  await rpc('diime_finalizar_conciliacion_contracargo', [d.id, d.stripe_disputa_id, ids.platformAdmin, adminSession, null])
  assert.deepEqual(await status(job), { job: 'cancelado', stages: ['completado', 'cancelado'] })
  await assert.rejects(() => prepare(job, 1))
})
await check('rejected cancellation between stages mediates only remaining work, keeping settled money', async () => {
  for (const decision of ['cliente', 'proveedor', 'retirar']) {
    const job = await fixture(), e = await prepare(job); await capture(e); await deliver(job); await finish(e)
    await db.query("update public.trabajos set cancelacion_solicitada_por=$1,cancelacion_estado='pendiente',cancelacion_razon='Cancelar el resto',pago_bloqueado=true where id=$2", [ids.client, job.id])
    const d = await rpc('diime_abrir_disputa', [job.id, ids.owner, 'Quiero mantener el contrato', true, []])
    assert.equal(d.escrow_id, null)
    assert.equal((await status(job)).job, 'en_disputa')
    if (decision === 'retirar') assert.equal(await rpc('diime_retirar_disputa', [d.id, ids.client]), 'ok')
    else await rpc('diime_resolver_mediacion', [d.id, ids.platformAdmin, decision, 'Decisión sobre las fases pendientes'])
    assert.deepEqual(await status(job), { job: decision === 'cliente' ? 'cancelado' : 'en_progreso', stages: ['completado', decision === 'cliente' ? 'cancelado' : 'pendiente'] })
    const ledger = await one('select estado,pago_neto_proveedor,stripe_transfer_id,monto_reembolsado from public.transacciones_escrow where id=$1', [e.id])
    assert.equal(ledger.estado, 'completado'); assert.equal(Number(ledger.pago_neto_proveedor), 36); assert.equal(Number(ledger.monto_reembolsado), 0)
    assert.equal(ledger.stripe_transfer_id, `tr_${e.id}`)
  }
})
await check('authenticated clients cannot call financial commit or legacy bypass RPCs', async () => {
  await role('authenticated', ids.client)
  for (const name of ['diime_confirmar_pago', 'diime_confirmar_pago_pago_unico']) {
    await assert.rejects(() => rpc(name, [randomUUID(), 'cs_x', 'pi_x', 'ch_x', 4400, 'eur']), /permission denied/)
  }
  await role()
})
console.log(`${scenarios} milestone financial database scenarios passed (real local PostgreSQL, synthetic payment evidence).`)
await db.close()
