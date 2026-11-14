// Real authenticated HTTP actions + local database + real Stripe sandbox movements.
// Run only after the selected Checkout has been paid in the browser.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { hitosContext } from './hitos-context.mjs'

const kind = process.argv[2], stage = Number(process.argv[3] || 1)
assert.ok(['unico', 'hitos', 'parcial', 'cancelacion'].includes(kind))
assert.ok([1, 2].includes(stage))
const c = await hitosContext(), fixtureFile = c.dir + '/checkout-fixtures.json'
const fixtures = JSON.parse(fs.readFileSync(fixtureFile, 'utf8')), j = fixtures.jobs.find(j => j.kind === kind)
assert.ok(j)
const hito = kind === 'unico' ? null : j.hitos[stage - 1]
const sessionId = stage === 1 ? j.sessionId : j.secondSessionId
const escrowId = stage === 1 ? j.escrowId : j.secondEscrowId
assert.ok(sessionId); assert.ok(escrowId)
const session = await c.stripe.checkout.sessions.retrieve(sessionId)
assert.equal(session.livemode, false); assert.equal(session.payment_status, 'paid', 'Complete real Checkout first')
let esc = await c.row('transacciones_escrow', escrowId), job = await c.row('trabajos', j.trabajoId)
assert.equal(esc.stripe_session_id, session.id)
assert.equal(esc.hito_id || null, hito?.id || null)
const proofPath = c.dir + `/checkout-${kind}-${stage}-proof.json`
const report = fs.existsSync(proofPath) ? JSON.parse(fs.readFileSync(proofPath, 'utf8')) : {
  testOnly: true, realStripeApi: true, realHttpServerActions: true, realDatabase: true,
  capture: 'Browser Checkout; verified paid by Stripe API', kind, stage, job: job.id, escrow: esc.id, checks: [],
}
const deliveryCheck = hito ? 'Provider delivery, client changes and resubmission preserve held funds' : 'Provider delivery preserves held funds until client approval'
if (!hito) for (const check of report.checks) {
  if (check.name === 'Provider delivery, client changes and resubmission preserve held funds') check.name = deliveryCheck
}
const save = () => fs.writeFileSync(proofPath, JSON.stringify(report, null, 2) + '\n')
async function check(name, body) {
  if (report.checks.some(x => x.name === name && x.passed)) return
  try { const detail = await body(); report.checks.push({ name, passed: true, detail }); save(); console.log(`PASS ${name}`) }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); save(); throw error }
}
const movements = async () => {
  const [transfers, refunds] = await Promise.all([
    c.stripe.transfers.list({ transfer_group: esc.stripe_transfer_group, limit: 100 }),
    c.stripe.refunds.list({ payment_intent: esc.stripe_payment_intent_id, limit: 100 }),
  ])
  assert.equal(transfers.has_more, false); assert.equal(refunds.has_more, false)
  return { transfers: transfers.data, refunds: refunds.data }
}
const contractRoute = kind === 'unico' ? '/mis-solicitudes' : `/trabajos/${job.id}/hitos`

await check('Captured Checkout activates only its funded payment; no early transfer', async () => {
  assert.equal(esc.estado, 'fondos_retenidos')
  assert.equal(job.estado, 'en_progreso')
  const m = await movements(); assert.equal(m.transfers.length, 0); assert.equal(m.refunds.length, 0)
  if (hito) {
    assert.equal((await c.row('trabajos_hitos', hito.id)).estado, 'financiado')
    if (stage === 1) {
      assert.ok((await c.call('CP', 'pagarHito', [job.id, j.hitos[1].id], contractRoute)).error, 'Next stage must stay blocked')
      assert.equal((await c.row('trabajos_hitos', j.hitos[1].id)).estado, 'pendiente')
    }
  }
  return { escrow: esc.estado, job: job.estado, transfers: 0, refunds: 0 }
})

if (kind === 'unico' || kind === 'hitos') {
  await check('Premature and provider self approval denied before delivery', async () => {
    if (hito) {
      assert.ok((await c.call('CP', 'aprobarHito', [job.id, hito.id], contractRoute)).error)
      assert.ok((await c.call('PP', 'aprobarHito', [job.id, hito.id], contractRoute)).error)
    } else assert.ok((await c.call('CP', 'confirmarTrabajoCompletado', [job.id])).error)
    assert.equal((await movements()).transfers.length, 0)
    return { transfers: 0 }
  })
  await check(deliveryCheck, async () => {
    if (hito) {
      if (process.env.DIIME_HITOS_QA_FILES === '1') {
        const { entregarConArchivos } = await import('./hitos-storage-proof.mjs')
        report.storage = await entregarConArchivos(c, job.id, hito.id, contractRoute)
      } else {
        c.ok(await c.call('PP', 'entregarHito', [job.id, hito.id, { mensaje: 'Informe de revisión completado para la prueba controlada.', archivos: [] }], contractRoute), 'deliver')
        c.ok(await c.call('CP', 'solicitarCambiosHito', [job.id, hito.id, 'Añade el resultado de la comprobación final del enchufe.', []], contractRoute), 'request changes')
        assert.equal((await c.row('trabajos_hitos', hito.id)).estado, 'cambios_solicitados')
        c.ok(await c.call('PP', 'entregarHito', [job.id, hito.id, { mensaje: 'Comprobación final añadida y entrega revisada.', archivos: [] }], contractRoute), 'resubmit')
        assert.equal((await c.row('trabajos_hitos', hito.id)).estado, 'entregado')
      }
    } else c.ok(await c.call('PP', 'marcarTrabajoEntregado', [job.id, 'Revisión y pruebas completadas para la prueba controlada.', []], '/mis-trabajos'), 'deliver single')
    assert.equal((await movements()).transfers.length, 0)
    return { transfers: 0 }
  })
  await check('Concurrent approval and retry transfer once with original charge identity', async () => {
    const name = hito ? 'aprobarHito' : 'confirmarTrabajoCompletado', args = hito ? [job.id, hito.id] : [job.id]
    // Compile and establish cookies before firing concurrent action POSTs.
    const cp = await c.client('CP'); await (await cp.request(contractRoute)).text()
    const results = await Promise.all([cp.call(name, args, { route: contractRoute }), cp.call(name, args, { route: contractRoute })])
    assert.ok(results.some(r => !r.value?.error), JSON.stringify(results.map(r => r.value)))
    await c.call('CP', name, args, contractRoute)
    esc = await c.row('transacciones_escrow', esc.id); job = await c.row('trabajos', job.id)
    assert.equal(esc.estado, 'completado'); assert.equal(esc.liquidacion_estado, 'completada')
    const m = await movements(); assert.equal(m.transfers.length, 1); assert.equal(m.refunds.length, 0)
    const t = m.transfers[0]; assert.equal(t.livemode, false); assert.equal(t.amount, Math.round(Number(esc.pago_neto_proveedor) * 100))
    assert.equal(t.source_transaction, esc.stripe_charge_id); assert.equal(t.destination, job.proveedor_stripe_account_id)
    assert.equal(t.metadata.pago_id || t.metadata.escrow_id, esc.id)
    if (hito) { assert.equal(t.metadata.hito_id, hito.id); assert.equal(t.metadata.contrato_id, job.id) }
    assert.equal(job.estado, kind === 'hitos' && stage === 1 ? 'en_progreso' : 'completado')
    return { transfer: t.id, amount: t.amount, currency: t.currency, transferCount: 1, job: job.estado }
  })
  if (kind === 'hitos' && stage === 1) {
    const payment = c.ok(await c.call('CP', 'pagarHito', [job.id, j.hitos[1].id], contractRoute), 'second Checkout')
    j.secondSessionId = payment.escrow.stripe_session_id; j.secondEscrowId = payment.escrow.id
    j.secondUrl = c.baseUrl + `/pago/${job.id}?hito=${j.hitos[1].id}`
    fs.writeFileSync(fixtureFile, JSON.stringify(fixtures, null, 2) + '\n')
    console.log(JSON.stringify({ nextCheckout: j.secondUrl }))
  }
} else if (kind === 'parcial') {
  await check('Exact milestone mediation freezes only its payment and rejects invalid split', async () => {
    const d = c.ok(await c.call('CP', 'crearDisputa', [{ trabajo_id: job.id, hito_id: hito.id, motivo: 'Discrepancia sintética de alcance: solicitar devolución de ocho euros del servicio de este hito.' }], contractRoute), 'dispute')
    report.dispute = d.id; save()
    assert.equal((await c.row('transacciones_escrow', esc.id)).estado, 'disputa')
    assert.ok((await c.call('AD', 'resolverDisputa', [{ disputa_id: d.id, resolucion: 'parcial', monto_reembolso: 21, nota: 'Importe inválido superior al servicio de veinte euros.' }], '/admin/disputas')).error)
    const m = await movements(); assert.equal(m.refunds.length, 0); assert.equal(m.transfers.length, 0)
    return { dispute: d.id, invalidSplitRejected: true }
  })
  await check('Partial refund and provider remainder settle once on repeated resolution', async () => {
    const args = [{ disputa_id: report.dispute, resolucion: 'parcial', monto_reembolso: 8, nota: 'Reparto de prueba: devolver ocho euros y aprobar doce euros del primer hito.' }]
    c.ok(await c.call('AD', 'resolverDisputa', args, '/admin/disputas'), 'partial resolution')
    await c.call('AD', 'resolverDisputa', args, '/admin/disputas')
    esc = await c.row('transacciones_escrow', esc.id); job = await c.row('trabajos', job.id)
    const m = await movements(); assert.equal(m.refunds.length, 1); assert.equal(m.transfers.length, 1)
    assert.equal(m.refunds[0].status, 'succeeded'); assert.equal(m.refunds[0].amount, 800)
    assert.equal(m.transfers[0].amount, 1080); assert.equal(m.transfers[0].source_transaction, esc.stripe_charge_id)
    assert.equal(m.transfers[0].metadata.hito_id, hito.id); assert.equal(m.refunds[0].metadata.hito_id, hito.id)
    assert.equal(Number(esc.retencion_plataforma) + Number(esc.pago_neto_proveedor) + Number(esc.monto_reembolsado), 22)
    assert.equal(job.estado, 'en_progreso'); assert.equal((await c.row('trabajos_hitos', j.hitos[1].id)).estado, 'pendiente')
    return { transfer: m.transfers[0].id, transferCents: 1080, refund: m.refunds[0].id, refundCents: 800, grossPlatformCents: 320 }
  })
} else {
  await check('Versioned cancellation rejects stale agreement without refund', async () => {
    c.ok(await c.call('CP', 'solicitarCancelacion', [job.id, 'Cancelación sintética por cambio de fecha del servicio.'], contractRoute), 'request cancellation')
    const oldRevision = (await c.row('trabajos', job.id)).cancelacion_revision
    c.ok(await c.call('CP', 'editarSolicitudCancelacion', [job.id, 'Cancelación sintética revisada: devolver el servicio del hito financiado.'], contractRoute), 'edit cancellation')
    assert.ok((await c.call('PP', 'responderCancelacion', [job.id, true, '', [], oldRevision], contractRoute)).error)
    assert.equal((await movements()).refunds.length, 0)
    return { staleAgreementRejected: true, refunds: 0 }
  })
  await check('Concurrent cancellation acceptance refunds service once, closes future stages', async () => {
    const revision = (await c.row('trabajos', job.id)).cancelacion_revision
    const pp = await c.client('PP'); await (await pp.request(contractRoute)).text()
    const args = [job.id, true, '', [], revision]
    const results = await Promise.all([pp.call('responderCancelacion', args, { route: contractRoute }), pp.call('responderCancelacion', args, { route: contractRoute })])
    assert.ok(results.some(r => !r.value?.error), JSON.stringify(results.map(r => r.value)))
    await c.call('PP', 'responderCancelacion', args, contractRoute)
    esc = await c.row('transacciones_escrow', esc.id); job = await c.row('trabajos', job.id)
    const m = await movements(); assert.equal(m.refunds.length, 1); assert.equal(m.transfers.length, 0)
    assert.equal(m.refunds[0].amount, 2000); assert.equal(m.refunds[0].status, 'succeeded')
    assert.equal(m.refunds[0].metadata.hito_id, hito.id); assert.equal(job.estado, 'cancelado')
    assert.equal(Number(esc.comision_cliente_retenida), 2)
    assert.equal((await c.row('trabajos_hitos', j.hitos[1].id)).estado, 'cancelado')
    return { refund: m.refunds[0].id, refundCents: 2000, retainedClientFeeCents: 200, transferCount: 0 }
  })
}
report.passed = report.checks.every(x => x.passed); report.finishedAt = new Date().toISOString(); save()
console.log(JSON.stringify({ kind, stage, passed: report.passed, checks: report.checks.length, proof: proofPath }))
