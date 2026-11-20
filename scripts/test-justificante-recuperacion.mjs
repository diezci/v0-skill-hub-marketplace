import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { nodos, renderFactura, texto } from './fixtures/factura-render.mjs'

const file = new URL('../app/trabajos/[id]/datos.ts', import.meta.url)
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const success = data => ({ data, status: 200, error: null })
const failure = status => ({ data: null, status, error: { code: 'test' } })

function fixture() {
  const responses = {
    auth: success({ user: { id: 'cliente' } }),
    documento_contratacion: success({ trabajo: { id: 'contrato', cliente_id: 'cliente', profesional_id: 'proveedor', modalidad_pago: 'hitos' } }),
    cliente: success(true), proveedor: success(false), profiles: success({ es_admin: false }), profesionales: success(null),
    trabajos_hitos: success([{ id: 'hito' }]), transacciones_escrow: success([{ id: 'pago' }]),
    facturacion_trabajo: success([]), contacto_perfiles: success([]),
  }
  let privilegedReads = 0
  const db = {
    auth: {
      getUser: async () => {
        if (responses.auth instanceof Error) throw responses.auth
        return responses.auth
      },
    },
    rpc: async (name, args) => responses[name === 'empresa_puede_operar_trabajo' ? args.p_parte : name],
    from(name) {
      if (name === 'trabajos_hitos') privilegedReads++
      const query = {
        select: () => query, eq: () => query,
        order: async () => responses[name], maybeSingle: async () => responses[name],
      }
      return query
    },
  }
  const deps = {
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/i18n': {},
  }
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, Error, require: name => {
      assert.ok(Object.hasOwn(deps, name))
      return deps[name]
    },
  })
  return { responses, load: () => module.exports.obtenerDatosContratacion('contrato'), privilegedReads: () => privilegedReads }
}

test('authentication transport failures can be retried before reading any contract', async () => {
  for (const error of [{ name: 'AuthRetryableFetchError' }, { status: 503 }]) {
    const f = fixture()
    f.responses.auth = { data: { user: null }, error }
    assert.equal(await f.load(), 'no_disponible')
    assert.equal(f.privilegedReads(), 0)
  }
})

test('a rejected network request can be retried without masking an unrelated server exception', async () => {
  const f = fixture()
  f.responses.auth = new TypeError('fetch failed')
  assert.equal(await f.load(), 'no_disponible')
  f.responses.auth = new Error('unexpected error')
  await assert.rejects(f.load(), /unexpected error/)
  assert.equal(f.privilegedReads(), 0)
})

test('a missing session, missing document or denied participant gets no document or retry view', async () => {
  for (const [key, value] of [
    ['auth', { data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } }],
    ['auth', success({ user: null })], ['documento_contratacion', success(null)],
    ['documento_contratacion', failure(403)], ['cliente', success(false)],
    ['profiles', success({ cuenta_eliminada: true })],
  ]) {
    const f = fixture()
    f.responses[key] = value
    assert.equal(await f.load(), null, key)
    assert.equal(f.privilegedReads(), 0)
  }
  const f = fixture()
  f.responses.cliente = failure(503)
  f.responses.proveedor = failure(403)
  assert.equal(await f.load(), null)
  assert.equal(f.privilegedReads(), 0)
  await assert.rejects(renderFactura({ datos: null }), /NOT_FOUND/)
})

test('transport and server failures at each document read discard partial results', async () => {
  for (const key of ['documento_contratacion', 'profiles', 'cliente', 'trabajos_hitos', 'profesionales',
    'transacciones_escrow', 'facturacion_trabajo', 'contacto_perfiles']) {
    for (const status of [0, 503]) {
      const f = fixture()
      f.responses[key] = failure(status)
      assert.equal(await f.load(), 'no_disponible', key)
    }
  }
})

test('persistent failure offers a fresh GET, and a later successful retry returns the authorized document', async () => {
  const f = fixture()
  const healthy = f.responses.trabajos_hitos
  f.responses.trabajos_hitos = failure(503)
  for (let attempt = 0; attempt < 2; attempt++) {
    const page = await renderFactura({ datos: await f.load(), vista: 'cliente' })
    assert.match(texto(page), /No se pudo cargar el justificante\.Reintentar/)
    assert.doesNotMatch(texto(page), /Contrato y pagos|Gastos Diime|Importe cobrado|Neto/)
    assert.ok(nodos(page).some(node => node.type === 'form' && node.props.method === 'get'))
    assert.ok(nodos(page).some(node => node.type === 'input' && node.props.name === 'vista' && node.props.value === 'cliente'))
  }
  f.responses.trabajos_hitos = healthy
  const recovered = await f.load()
  assert.equal(recovered.esCliente, true)
  assert.equal(recovered.esProfesional, false)
  assert.equal(recovered.hitos[0].id, 'hito')
})
