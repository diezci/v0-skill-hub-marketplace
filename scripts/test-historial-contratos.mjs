import assert from 'node:assert/strict'
import {seleccionarContratoVigente,seleccionarEscrowContrato} from '../lib/historial-contratos.ts'
const paid={id:'paid',estado:'en_progreso',created_at:'2026-10-01',transacciones_escrow:[{estado:'fondos_retenidos'}]}
const cancelled={id:'duplicate',estado:'cancelado',created_at:'2026-10-03',transacciones_escrow:[]}
assert.equal(seleccionarContratoVigente([cancelled,paid]).id,'paid')
assert.equal(seleccionarContratoVigente([paid,cancelled]).id,'paid')
const completed={id:'old',estado:'completado',created_at:'2026-09-01',transacciones_escrow:[{estado:'completado'}]}
const pending={id:'current',estado:'pendiente_pago',created_at:'2026-10-02',transacciones_escrow:[{estado:'pendiente'}]}
assert.equal(seleccionarContratoVigente([completed,pending]).id,'current')
assert.equal(seleccionarContratoVigente([cancelled,{...paid,estado:'en_disputa',transacciones_escrow:[{estado:'disputa'}]}]).id,'paid')
const list=[cancelled,paid];seleccionarContratoVigente(list);assert.equal(list[0].id,'duplicate')
assert.equal(seleccionarEscrowContrato([{id:'retry',estado:'pendiente'},{id:'captured',estado:'fondos_retenidos'}]).id,'captured')
assert.equal(seleccionarEscrowContrato([{estado:'cancelado'}]),null)
assert.equal(seleccionarContratoVigente([]),null)
console.log('8 historical contract assertions passed')
