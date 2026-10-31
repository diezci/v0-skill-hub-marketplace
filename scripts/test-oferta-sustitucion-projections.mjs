import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function extract(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const node = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  assert.ok(node, name)
  return ts.transpileModule(node.getText(source).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
}
const linked = { id: 'replacement', oferta_origen_id: 'original', solicitud_id: 'request', profesional_id: 'provider', estado: 'pendiente', empresa_id: 'company' }
const request = { id: 'request', cliente_id: 'client', empresa_id: null, categoria_id: null }
function database(professionalError = false) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'client' } } }) },
    from(table) {
      let columns = '*', single = false
      const query = {
        select(value) { columns = value; return this }, eq() { return this }, order() { return this },
        single() { single = true; return this },
        then(resolve, reject) {
          if (table === 'profesionales' && professionalError) return Promise.resolve({ data: null, error: { message: 'profile unavailable' } }).then(resolve, reject)
          let rows = table === 'ofertas' ? [{ ...linked, solicitud: { ...request } }] : table === 'solicitudes' ? [request] : table === 'trabajos' ? [] : [{ id: 'provider', nombre: 'QA' }]
          // Honor the production projection: omitting lineage must fail the test.
          if (table === 'ofertas' && !columns.trim().startsWith('*')) {
            const names = new Set(columns.split(',').map(s => s.trim()))
            rows = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => names.has(key))))
          }
          return Promise.resolve({ data: single ? rows[0] : rows, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
}
for (const professionalError of [false, true]) {
  const context = { createClient: async () => database(professionalError), textoServidor: async x => x, obtenerMapaCategorias: async () => ({}), identidadesEmpresas: async () => ({}), seleccionarContratoVigente: () => null, console: { log() {}, error() {} } }
  vm.createContext(context)
  vm.runInContext(extract('app/actions/solicitudes.ts', 'obtenerSolicitudesPorUsuario'), context)
  const result = await context.obtenerSolicitudesPorUsuario()
  assert.equal(result.data[0].ofertas[0].oferta_origen_id, 'original')
  console.log('PASS client lineage survives ' + (professionalError ? 'missing professional profile' : 'normal enrichment'))
}
const context = { createClient: async () => database(), textoServidor: async x => x, identidadesEmpresas: async () => ({}) }
vm.createContext(context)
vm.runInContext(extract('app/actions/ofertas.ts', 'obtenerMisOfertas'), context)
assert.equal((await context.obtenerMisOfertas()).data[0].oferta_origen_id, 'original')
console.log('PASS provider wildcard projection and client enrichment preserve lineage')
