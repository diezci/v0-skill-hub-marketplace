import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const calls = []
let user = null, admin = false, deleted = null
const profiles = [
  { id: 'pending-person', disponible: true, perfil: { nombre: 'Ana', verificado: false } },
  { id: 'pending-company', disponible: true, perfil: { nombre: 'Empresa', verificado: false } },
  { id: 'approved-person', disponible: true, perfil: { nombre: 'Acreditada', verificado: true } },
  { id: 'approved-company', disponible: true, perfil: { nombre: 'Empresa acreditada', verificado: true } },
  { id: 'unavailable', disponible: false, perfil: { nombre: 'Baja', verificado: true } },
]
const client = {
  auth: { getUser: async () => ({ data: { user } }) },
  rpc: async (name) => { calls.push(name); return { data: name === 'telefono_publico' ? 'PRIVATE PHONE' : [] } },
  from(table) {
    const filters = []; let columns = '', limit = Infinity, single = false
    const query = {
      select(value) { columns = value; return query },
      eq(key, value) { filters.push([key, value]); return query },
      order() { return query }, limit(value) { limit = value; return query },
      single() { single = true; return query },
      then(resolve) {
        calls.push({ table, columns, filters })
        if (table === 'profiles') return Promise.resolve({ data: { es_admin: admin, cuenta_eliminada: deleted } }).then(resolve)
        let data = table === 'profesionales' ? structuredClone(profiles) : []
        for (const [key, value] of filters) {
          if (key.includes('.')) {
            assert.match(columns, /profiles!inner/, 'Parent records must be filtered using an inner join')
            const [relation, field] = key.split('.')
            data = data.filter(row => row[relation]?.[field] === value)
          } else data = data.filter(row => row[key] === value)
        }
        data = data.slice(0, limit)
        return Promise.resolve({ data: single ? data[0] : data, error: single && !data[0] ? { message: 'Not found' } : null }).then(resolve)
      },
    }
    return query
  },
}
function load(file, overrides) {
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', js)(name => {
    if (name in overrides) return overrides[name]
    if (name === 'react/jsx-runtime') return require(name)
    if (name === '@/lib/i18n-servidor') return { idiomaActual: async () => 'es', textoServidor: async value => value, getT: async () => ({ idioma: 'es', t: value => value }) }
    if (name === '@/lib/supabase/server') return { createClient: async () => client }
    if (name === 'next/cache') return { revalidatePath() {} }
    if (name === '@/lib/utils') return { formatearTramoPortfolio: value => value }
    if (name.startsWith('@/')) return {}
    throw Error(name)
  }, exports)
  return exports
}
const actions = load('app/actions/profiles.ts', {})
assert.deepEqual((await actions.obtenerProfesionales()).data.map(p => p.id), ['approved-person', 'approved-company'])
assert.deepEqual((await actions.obtenerProfesionalesDestacados()).map(p => p.id), ['approved-person', 'approved-company'])
for (const id of ['pending-person', 'pending-company']) {
  calls.length = 0
  const result = await actions.obtenerProfesionalPorId(id)
  assert.equal(result.noPublicable, true)
  assert.equal(calls.includes('telefono_publico'), false, 'Private detail must stop before contact RPC')
  assert.equal(calls.includes('portfolio_publico'), false)
  user = { id }; assert.equal((await actions.obtenerProfesionalPorId(id)).data.id, id)
  user = { id: 'unrelated', user_metadata: { es_admin: true } }
  assert.equal((await actions.obtenerProfesionalPorId(id)).noPublicable, true, 'User metadata cannot grant preview')
  admin = true; assert.equal((await actions.obtenerProfesionalPorId(id)).data.id, id)
  deleted = '2026-11-15'; assert.equal((await actions.obtenerProfesionalPorId(id)).noPublicable, true)
  deleted = null; admin = false; user = null
}
assert.equal((await actions.obtenerProfesionalPorId('approved-person')).data.id, 'approved-person')
// A historical company affiliation must not bypass the new publication rule.
const page = load('app/profesional/[id]/page.tsx', {
  '@/app/actions/profiles': actions,
  '@/lib/empresas/service': { esEmpresasLocal: () => false, obtenerEmpleadoEmpresa: async () => ({ perfil: { nombre: 'Legacy affiliate' }, empresa: { empresa: { nombre: 'Legacy company' } } }) },
  'next/navigation': { notFound() { throw Error('NOT_FOUND') } },
})
await assert.rejects(() => page.default({ params: Promise.resolve({ id: 'pending-person' }), searchParams: Promise.resolve({}) }), /NOT_FOUND/)
assert.equal((await page.generateMetadata({ params: Promise.resolve({ id: 'pending-person' }) })).robots.index, false)
user = { id: 'pending-person' }
assert.equal((await page.generateMetadata({ params: Promise.resolve({ id: 'pending-person' }) })).robots.index, false, 'Owner preview is not indexable')
console.log('PASS public profile accreditation: directory, featured, individual/company details, owner/admin previews, metadata, stale admin and legacy affiliation boundary')
