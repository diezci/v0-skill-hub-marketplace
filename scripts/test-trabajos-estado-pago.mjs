import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const file = ts.createSourceFile('trabajos.ts', readFileSync(new URL('../app/actions/trabajos.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
const names = ['obtenerMisTrabajos', 'recortarEscrowSegunRol']
const source = file.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(file)).join('\n')
assert.equal(file.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).length, 2)
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

const completed = { id: 'captured-payment', estado: 'completado', liquidacion_estado: 'completada', fecha_retencion: '2026-11-15', monto_base: 10, monto: 12, comision_cliente: 2, comision_proveedor: 2, pago_neto_proveedor: 8 }
function fixture(ids = ['job'], capacity = Infinity) {
  const failures = new Set()
  let active = 0, profileReads = 0
  const payments = new Map(ids.map(id => [id, [{ ...completed, trabajo_id: id }]]))
  const jobs = ids.map(id => ({ id, cliente_id: 'client', profesional_id: 'provider', estado: 'completado', entregas: [] }))
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'provider' } } }) },
    from(table) {
      let job
      const query = {
        select() { return query }, or() { return query },
        eq(column, value) { if (column === 'trabajo_id') job = value; return query },
        async single() { assert.equal(table, 'profiles'); profileReads++; return { data: { nombre: 'QA' }, error: null } },
        async order() {
          if (table === 'trabajos') return { data: jobs, error: null }
          assert.equal(table, 'transacciones_escrow')
          const overloaded = ++active > capacity
          await new Promise(resolve => setTimeout(resolve, 1))
          active--
          return failures.has(job) || overloaded ? { data: null, error: { message: 'Synthetic connection failure' } } : { data: payments.get(job), error: null }
        },
      }
      return query
    },
  }
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, Set, Promise, createClient: async () => supabase, identidadesEmpresas: async () => ({}), textoServidor: async text => text })
  return { failures, payments, load: module.exports.obtenerMisTrabajos, profileReads: () => profileReads }
}

test('a later unpaid attempt does not replace a completed payment or expose client fees to the provider', async () => {
  const f = fixture()
  f.payments.get('job').unshift({ id: 'closed-attempt', estado: 'cancelado' })
  const result = await f.load()
  assert.equal(result.error, undefined)
  const payment = result.data[0].transaccion_escrow
  assert.equal(payment.id, 'captured-payment')
  assert.equal(payment.estado, 'completado')
  assert.equal(payment.pago_neto_proveedor, 8)
  assert.equal('monto' in payment, false)
  assert.equal('comision_cliente' in payment, false)
})

test('failed payment lookup reports a load error instead of an unpaid contract', async () => {
  const f = fixture(); f.failures.add('job')
  const result = await f.load()
  assert.ok(result.error)
  assert.equal(result.data, undefined)
})

test('a partial financial read cannot replace the provider list and totals', async () => {
  const f = fixture(['paid', 'unavailable']); f.failures.add('unavailable')
  const result = await f.load()
  assert.ok(result.error)
  assert.equal(result.data, undefined)
})

test('a successful empty payment query remains distinct from an unavailable query', async () => {
  const f = fixture(); f.payments.set('job', [])
  const result = await f.load()
  assert.equal(result.error, undefined)
  assert.equal(result.data[0].transaccion_escrow, null)
})

test('a successful retry restores the actual completed payment', async () => {
  const f = fixture(); f.failures.add('job')
  assert.ok((await f.load()).error)
  f.failures.clear()
  const result = await f.load()
  assert.equal(result.error, undefined)
  assert.equal(result.data[0].transaccion_escrow.estado, 'completado')
  assert.equal(result.data[0].transaccion_escrow.pago_neto_proveedor, 8)
})

test('a long history loads all payments within a limited connection budget and reuses shared profiles', async () => {
  const f = fixture(Array.from({ length: 40 }, (_, i) => `job-${i}`), 16)
  const result = await f.load()
  assert.equal(result.error, undefined)
  assert.equal(result.data.length, 40)
  assert.ok(result.data.every(job => job.transaccion_escrow.estado === 'completado'))
  assert.equal(f.profileReads(), 2)
})
