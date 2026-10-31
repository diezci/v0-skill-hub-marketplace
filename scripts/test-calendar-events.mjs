import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateCalendarEvent,calendarDate,calendarTime,calendarInstant} from '../lib/calendar-events.ts'
const event={titulo:'Cita',fecha_inicio:'2026-10-23T09:30:00+02:00',fecha_fin:'2026-10-25T17:45:00+01:00',todo_el_dia:false}
test('valid multi-day event spans DST with stable local date/time',()=>{
 process.env.TZ='Europe/Madrid'
 assert.equal(validateCalendarEvent(event),null)
 assert.equal(calendarDate(event.fecha_inicio,false),'2026-10-23')
 assert.equal(calendarTime(event.fecha_inicio),'09:30')
 assert.equal(calendarDate(event.fecha_fin,false),'2026-10-25')
 assert.equal(calendarTime(event.fecha_fin),'17:45')
 assert.equal(calendarInstant('2026-10-23','09:30'),'2026-10-23T07:30:00.000Z')
 assert.equal(calendarInstant('2026-10-25','17:45'),'2026-10-25T16:45:00.000Z')
})
test('reject impossible dates, reversed intervals and missing timed hours',()=>{
 for(const patch of [{titulo:'  '},{fecha_inicio:'2026-02-30'},{fecha_inicio:'bogus'},{fecha_fin:'2026-10-22T09:00:00Z'},{fecha_inicio:'2026-10-23'}])assert.ok(validateCalendarEvent({...event,...patch}))
 assert.equal(calendarInstant('2026-03-29','02:30'),null)
 assert.equal(calendarInstant('2026-10-23','25:30'),null)
})
test('all-day dates stay calendar dates in a western time zone',()=>{
 process.env.TZ='America/Los_Angeles'
 assert.equal(validateCalendarEvent({titulo:'Tres días',fecha_inicio:'2026-10-23',fecha_fin:'2026-10-25',todo_el_dia:true}),null)
 assert.equal(calendarDate('2026-10-23T00:00:00+00:00',true),'2026-10-23')
 assert.equal(validateCalendarEvent({titulo:'Bisiesto',fecha_inicio:'2028-02-29'}),null)
 assert.ok(validateCalendarEvent({titulo:'No bisiesto',fecha_inicio:'2026-02-29'}))
})
