// Real server actions create local synthetic contracts. Actual capture happens in browser Checkout.
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { hitosContext } from './hitos-context.mjs'

const c = await hitosContext(), file = c.dir + '/checkout-fixtures.json'
const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {
  createdAt: new Date().toISOString(), testOnly: true, sandbox: 'acct_1USOyz3B6hPi56bO', jobs: [],
}
const save = () => fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n')
for (const kind of ['unico', 'hitos', 'parcial', 'cancelacion']) {
  let j = result.jobs.find(j => j.kind === kind)
  if (!j) {
    const hitos = kind !== 'unico'
    const plan = hitos ? [
      { id: randomUUID(), titulo: 'Diagnóstico y revisión', descripcion: 'Primera revisión del servicio de prueba.', criterio_aceptacion: 'Informe de diagnóstico revisado y aceptado por el cliente.', fecha_limite: '2026-12-01', importe_centimos: 2000 },
      { id: randomUUID(), titulo: 'Instalación y pruebas finales', descripcion: 'Ejecución final del servicio de prueba.', criterio_aceptacion: 'Instalación revisada y pruebas finales documentadas.', fecha_limite: '2026-12-15', importe_centimos: 3000 },
    ] : []
    const price = hitos ? 50 : 10
    const solicitud = c.ok(await c.call('CP', 'crearSolicitud', [{ empresa_id: null, titulo: `QA hitos ${kind} ${Date.now()}`,
      descripcion: 'Necesito revisar los enchufes y comprobar la instalación eléctrica de una habitación.',
      categoria_id: 'Electricidad', ubicacion: 'Madrid', urgencia: 'media', presupuesto_min: price, presupuesto_max: price,
      modalidad_pago: hitos ? 'hitos' : 'unico', hitos_sugeridos: plan }], '/mis-solicitudes'), 'crearSolicitud')
    const oferta = c.ok(await c.call('PP', 'crearOferta', [{ empresa_id: null, solicitud_id: solicitud.id, precio: price,
      tiempo_estimado: 1, unidad_tiempo: 'dias', descripcion: 'Revisión de los enchufes y comprobación de la instalación según el alcance solicitado.',
      acepta_gastos: true, modalidad_pago: hitos ? 'hitos' : 'unico', plan_hitos: plan }], '/demandas'), 'crearOferta')
    j = { kind, solicitudId: solicitud.id, ofertaId: oferta.id, plan, price, planVersion: oferta.plan_version }
    result.jobs.push(j); save()
  }
  if (!j.trabajoId) {
    const oferta = await c.row('ofertas', j.ofertaId)
    const trabajo = c.ok(await c.call('CP', 'aceptarOferta', [j.ofertaId, oferta.plan_version]), 'aceptarOferta')
    j.trabajoId = trabajo.id; save()
  }
  if (j.kind !== 'unico') {
    const rows = await c.admin.from('trabajos_hitos').select('*').eq('trabajo_id', j.trabajoId).eq('activo', true).order('orden')
    assert.ifError(rows.error); assert.equal(rows.data.length, 2); j.hitos = rows.data.map(h => ({ id: h.id, orden: h.orden, titulo: h.titulo, importeCentimos: h.importe_centimos }))
  }
  const route = j.kind === 'unico' ? `/pago/${j.trabajoId}` : `/pago/${j.trabajoId}?hito=${j.hitos[0].id}`
  if (!j.sessionId) {
    const payment = c.ok(await c.call('CP', j.kind === 'unico' ? 'crearPagoEscrow' : 'pagarHito',
      j.kind === 'unico' ? [{ trabajo_id: j.trabajoId }] : [j.trabajoId, j.hitos[0].id], route), 'prepare Checkout')
    assert.ok(payment.escrow?.stripe_session_id)
    j.sessionId = payment.escrow.stripe_session_id; j.escrowId = payment.escrow.id; save()
  }
  const session = await c.stripe.checkout.sessions.retrieve(j.sessionId)
  assert.equal(session.livemode, false); assert.equal(session.currency, 'eur')
  assert.equal(session.amount_total, j.kind === 'unico' ? 1200 : 2200)
  j.url = c.baseUrl + route; j.contractUrl = c.baseUrl + `/trabajos/${j.trabajoId}/hitos`
  j.paymentStatus = session.payment_status; save()
  console.log(JSON.stringify({ kind: j.kind, url: j.url, payment: j.paymentStatus, total: session.amount_total }))
}
