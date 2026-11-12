import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { validarHitosSugeridos, validarPlanHitos, repartirComisionesHitos } from '../lib/hitos.ts'
const stage = (cents) => ({id:randomUUID(),titulo:'Hito',descripcion:'',importe_centimos:cents,criterio_aceptacion:'Entrega comprobada',fecha_limite:'2027-02-20'})
test('drafts admit optional amount, criteria and date; contractual plans do not', () => {
 const drafts=[{...stage(0),criterio_aceptacion:'',fecha_limite:''}]
 assert.equal(validarHitosSugeridos(drafts),null)
 assert.ok(validarPlanHitos(drafts,1))
 assert.ok(validarPlanHitos([stage(100)],100))
 assert.equal(validarPlanHitos([stage(100),stage(200)],300),null)
})
test('validate integer cents, actual calendar dates and unique stage IDs', () => {
 const valid=[stage(1),stage(2)]
 assert.ok(validarPlanHitos(valid,4))
 assert.ok(validarPlanHitos([valid[0],valid[0]],2))
 assert.ok(validarPlanHitos([{...valid[0],importe_centimos:0.1},valid[1]],2.1))
 assert.ok(validarPlanHitos([{...valid[0],fecha_limite:'2027-02-30'},valid[1]],3))
 assert.ok(validarHitosSugeridos(Array.from({length:21},()=>stage(1))))
})
test('minimum contract fee is allocated once and all cents balance', () => {
 const plan=[stage(100),stage(200),stage(700)]
 const result=repartirComisionesHitos(plan,200,200)
 assert.equal(result.reduce((a,h)=>a+h.comision_cliente_centimos,0),200)
 assert.equal(result.reduce((a,h)=>a+h.comision_proveedor_centimos,0),200)
 assert.deepEqual(result.map(h=>h.comision_proveedor_centimos),[20,40,140])
})
test('fractional allocations cannot make a tiny final stage negative', () => {
 for(let fee=0;fee<=3;fee++) {
  const result=repartirComisionesHitos([stage(1),stage(1),stage(1)],200,fee)
  assert.equal(result.reduce((a,h)=>a+h.comision_proveedor_centimos,0),fee)
  assert.ok(result.every(h=>h.comision_proveedor_centimos<=h.importe_centimos))
 }
})
test('remaining allocation supports a single unfunded stage', () => {
 const result=repartirComisionesHitos([stage(123)],17,11)
 assert.equal(result[0].comision_cliente_centimos,17)
 assert.equal(result[0].comision_proveedor_centimos,11)
 assert.throws(()=>repartirComisionesHitos([stage(1)],2,2),/comisiones/)
})
test('contractual stages require 50 cents, while suggestions remain optional', () => {
 assert.match(validarPlanHitos([stage(49),stage(51)],100),/mínimo de 0,50/)
 assert.equal(validarPlanHitos([stage(50),stage(50)],100),null)
 assert.equal(validarHitosSugeridos([stage(0)]),null)
})
test('Checkout maximum includes the allocated client fee and uses exact integer allocation', () => {
 assert.equal(validarPlanHitos([stage(90_909_090),stage(50)],90_909_140),null)
 assert.match(validarPlanHitos([stage(90_909_091),stage(50)],90_909_141),/999.999,99/)
 const result=repartirComisionesHitos([stage(900_000_001),stage(99_999_998)],99_999_999,99_999_999)
 assert.equal(result[0].comision_cliente_centimos,Number(99_999_999n*900_000_001n/999_999_999n))
})
