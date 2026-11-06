// Exercise the real admin server action with paginated, isolated data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'

function setup({ historyError = false, adminAllowed = true } = {}) {
  const ranges = []
  const history = Array.from({ length: 1002 }, (_, i) => ({
    id: String(i).padStart(4, '0'), usuario_id: i === 1001 ? 'customer' : 'provider',
    tipo: i === 0 ? 'entrega' : i === 1001 ? 'rechazo_entrega' : 'progreso',
    mensaje: `Evento ${i}`, archivos: i === 0 ? ['https://example.test/entrega'] : i === 1001 ? ['https://example.test/rechazo'] : [],
    created_at: '2026-11-06T12:00:00Z',
  }))
  function from(table) {
    let range = null
    const result = () => {
      if (table === 'actualizaciones_trabajo') {
        assert.ok(range, 'History queries must paginate')
        ranges.push(range)
        if (historyError && range[0] === 500) return { error: { message: 'Historial no disponible' }, data: null }
        return { data: history.slice(range[0], range[1] + 1), error: null }
      }
      return { data: [], error: null }
    }
    const q = {
      select() { return q }, eq() { return q }, order() { return q },
      range(start, end) { range = [start, end]; return q },
      maybeSingle: async () => ({ error: null, data: table === 'disputas'
        ? { id: 'dispute', trabajo_id: 'job', cliente_id: 'customer', profesional_id: 'provider' }
        : table === 'trabajos' ? { id: 'job' }
          : table === 'profiles' ? { id: 'user', es_admin: adminAllowed } : null }),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
    }
    return q
  }
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) }, from, rpc: async () => ({ data: [], error: null }) }
  const dependencies = {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/supabase/admin': { createAdminClient: () => client },
    '@/lib/i18n-servidor': { textoServidor: async text => text },
    '@/lib/notificaciones-contexto': {}, '@/lib/empresas/identidad': {},
    '@/lib/empresas/notificaciones': {}, '@/lib/flujo-pagos': {}, '@/lib/entregas': {}, 'next/cache': {},
  }
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync('app/actions/disputes.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, { exports, console, require(name) {
    if (!(name in dependencies)) throw Error(`Unmocked dependency ${name}`)
    return dependencies[name]
  } })
  return { action: exports.obtenerDetalleDisputa, ranges }
}

test('Admin receives both evidence sets beyond the first 1,000 history rows', async () => {
  const f = setup()
  const result = await f.action('dispute')
  assert.equal(result.error, undefined)
  assert.equal(result.data.actualizaciones.length, 1002)
  assert.equal(result.data.actualizaciones[0].tipo, 'entrega')
  assert.equal(result.data.actualizaciones[1001].tipo, 'rechazo_entrega')
  assert.deepEqual(f.ranges, [[0, 499], [500, 999], [1000, 1499]])
})

test('A later history query error returns no partial dispute evidence', async () => {
  const f = setup({ historyError: true })
  const result = await f.action('dispute')
  assert.equal(result.error, 'Historial no disponible')
  assert.equal(result.data, undefined)
  assert.deepEqual(f.ranges, [[0, 499], [500, 999]])
})

test('A non-admin cannot load evidence or start history queries', async () => {
  const f = setup({ adminAllowed: false })
  const result = await f.action('dispute')
  assert.equal(result.codigo, 'SIN_PERMISO')
  assert.equal(result.data, undefined)
  assert.equal(f.ranges.length, 0)
})
