import assert from 'node:assert/strict'
import {calendarWorkEnd,localCalendarDay,calendarDateKey,calendarContractDate} from '../lib/calendar-work-dates.ts'
const item={fecha_fin:'2026-10-23',fecha_estimada_fin:'2026-10-30'}
for(const estado of ['completado','cancelado'])assert.equal(calendarWorkEnd({...item,estado}),'2026-10-23')
for(const estado of ['entregado','en_progreso','pendiente_pago'])assert.equal(calendarWorkEnd({...item,estado}),'2026-10-30')
assert.equal(calendarWorkEnd({estado:'cancelado',fecha_estimada_fin:'2026-10-30'}),'2026-10-30')
process.env.TZ='Europe/Madrid';assert.equal(localCalendarDay(new Date('2026-10-23T00:00:00+02:00')),'2026-10-23')
assert.equal(calendarDateKey('2026-10-23T23:30:00Z'),'2026-10-24')
assert.equal(calendarDateKey('2026-10-23'),'2026-10-23')
for (const zone of ['Europe/Madrid','America/Los_Angeles','Pacific/Auckland']) {
 process.env.TZ=zone
 for(const [instant,day] of [['2026-10-26T23:30:00Z','2026-10-27'],['2027-03-27T23:30:00Z','2027-03-28'],['2027-03-28T22:30:00Z','2027-03-29'],['2027-10-30T22:30:00Z','2027-10-31'],['2027-10-31T23:30:00Z','2027-11-01']]){
  assert.equal(calendarDateKey(instant),day)
  assert.equal(localCalendarDay(calendarContractDate(instant)),day)
 }
 assert.equal(calendarDateKey('2027-03-28'),'2027-03-28')
}
console.log('42 calendar closure and Madrid deadline assertions passed')
