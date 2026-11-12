import assert from 'node:assert/strict'
import { test } from 'node:test'
import { datosFactura, renderFactura, texto } from './fixtures/factura-render.mjs'

function datos(rol = 'cliente') {
  const d = datosFactura({ rol })
  d.trabajo = { ...d.trabajo, modalidad_pago: 'hitos', plan_version: 2, precio_acordado: 12000 }
  d.hitos = [
    { id: 'h1', orden: 1, titulo: 'Preparación', criterio_aceptacion: 'Materiales entregados', fecha_limite: '2026-12-01', importe_centimos: 240000, comision_cliente_centimos: 24000, comision_proveedor_centimos: 12000, estado: 'completado' },
    { id: 'h2', orden: 2, titulo: 'Construcción', criterio_aceptacion: 'Obra terminada', fecha_limite: '2026-12-20', importe_centimos: 960000, comision_cliente_centimos: 96000, comision_proveedor_centimos: 48000, estado: 'pendiente' },
  ]
  d.escrows = [{ id: 'p1', hito_id: 'h1', monto_base: 2400, monto: 2640, comision_cliente: 240, comision_proveedor: 120, pago_neto_proveedor: 2280, fecha_retencion: '2026-11-12T10:00:00Z', liquidacion_estado: 'completada', stripe_transfer_id: 'tr_stage1' }]
  return d
}

test('receipt distinguishes contract total, captured stage, and unpaid future stages', async () => {
  const text = texto(await renderFactura({ datos: datos() }))
  assert.match(text, /Precio acordado del servicio12.000,00/)
  assert.match(text, /Importe cobrado2640,00/)
  assert.match(text, /Total pendiente de aportar10.560,00/)
  assert.doesNotMatch(text, /Gastos Diime del proveedor|Neto liquidado al proveedor/)
  assert.match(text, /no acredita el ingreso en su banco/)
})

test('provider receipt preserves their own historical fee and hides client fees even with forged view', async () => {
  const text = texto(await renderFactura({ datos: datos('proveedor'), vista: 'cliente' }))
  assert.match(text, /Neto liquidado al proveedor2280,00/)
  assert.match(text, /Neto previsto del proveedor9120,00/)
  assert.doesNotMatch(text, /Gastos Diime del cliente|Importe cobrado/)
})

test('pending refund is visibly provisional and never becomes a paid future stage', async () => {
  const d = datos()
  Object.assign(d.escrows[0], { monto_reembolsado: 400, liquidacion_estado: 'procesando' })
  const text = texto(await renderFactura({ datos: d }))
  assert.match(text, /Reembolso pendiente de confirmación400,00/)
  assert.doesNotMatch(text, /Reembolso registrado/)
  assert.match(text, /Total pendiente de aportar10.560,00/)
})
