import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'
import ts from 'typescript'

// Real action and local document store. Neither Supabase nor network is used.
const dir = await mkdtemp(path.join(os.tmpdir(), 'diime-documento-empresa-'))
const modules = path.join(dir, 'modulos')
await mkdir(modules)
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
for (const name of ['types', 'seed', '../categorias', '../provincias', '../precios', 'local-store', 'representacion']) {
  await writeFile(path.join(modules, `${name}.js`), compile(await readFile(new URL(`../lib/empresas/${name}.ts`, import.meta.url), 'utf8')))
}
const require = createRequire(import.meta.url)
const domain = require(path.join(modules, 'local-store.js'))
const { ACTORES_EMPRESA_LOCAL: actores } = require(path.join(modules, 'seed.js'))
const store = new domain.EmpresaLocalStore(path.join(dir, 'estado'))
const bytes = Buffer.from('%PDF-1.7\nDocumento privado sintético\n%%EOF')
assert.equal((await store.solicitarVerificacion(actores.owner, {
  metodo: 'documental', representanteNombre: 'Javier García', cargoLegal: 'Administrador único',
  documentoNombre: 'representacion.pdf', documento: bytes, consentimiento: true,
})).error, undefined)
let actor = actores.owner, local = true, accesoDenegado = false, llamadasRemotas = 0
const module = { exports: {} }
new Function('require', 'module', 'exports', compile(await readFile(new URL('../app/actions/empresa-workspace.ts', import.meta.url), 'utf8')))((name) => {
  if (name === 'next/cache') return { revalidatePath: () => assert.fail('A document read must not invalidate caches') }
  if (name === '@/lib/entregas') return {}
  if (name === '@/lib/empresas/representacion') return require(path.join(modules, 'representacion.js'))
  if (name === '@/lib/empresas/local-store') return { ...domain, empresaLocalStore: store }
  if (name === '@/lib/empresas/service') return { esEmpresasLocal: () => local, obtenerActorEmpresaLocal: async () => {
    if (accesoDenegado) throw new Error('Esta función local solo se puede abrir desde localhost.')
    return actor
  } }
  if (name === '@/lib/empresas/production-store') return { rpcEmpresa: async (rpc, args) => {
    llamadasRemotas++
    assert.equal(local, false, 'Local preview must never use the real RPC')
    assert.equal(rpc, 'empresa_verificacion_documento')
    assert.deepEqual(args, { p_empresa_id: 'empresa-real' })
    return { data: { nombre: 'documento-real.pdf', base64: 'JVBERi0=' } }
  } }
  throw new Error(`Unexpected dependency: ${name}`)
}, module, module.exports)
const { descargarVerificacionEmpresa } = module.exports
after(() => rm(dir, { recursive: true, force: true }))

test('principal y Diime descargan el PDF local sin llamar a Supabase', async () => {
  for (actor of [actores.owner, actores.admin]) {
    const result = await descargarVerificacionEmpresa('reformas-garcia')
    assert.equal(result.error, undefined)
    assert.equal(result.data.nombre, 'representacion.pdf')
    assert.deepEqual(Buffer.from(result.data.base64, 'base64'), bytes)
  }
  assert.equal(llamadasRemotas, 0)
})
test('miembros y clientes no reciben documento privado ni pueden cambiar empresa objetivo', async () => {
  for (actor of [actores.ana, actores.mario, actores.cliente]) {
    const result = await descargarVerificacionEmpresa('reformas-garcia')
    assert.ok(result.error)
    assert.equal(result.data, undefined)
  }
  actor = actores.admin
  const ajena = await descargarVerificacionEmpresa('otra-empresa')
  assert.match(ajena.error, /No tienes acceso/)
  assert.equal(ajena.data, undefined)
  assert.equal(llamadasRemotas, 0)
})
test('la denegación de acceso local no intenta una descarga real de respaldo', async () => {
  accesoDenegado = true
  assert.match((await descargarVerificacionEmpresa('reformas-garcia')).error, /localhost/)
  accesoDenegado = false
  assert.equal(llamadasRemotas, 0)
})
test('fuera del modo local se conserva la RPC real autenticada', async () => {
  local = false
  const result = await descargarVerificacionEmpresa('empresa-real')
  assert.equal(result.data.nombre, 'documento-real.pdf')
  assert.equal(llamadasRemotas, 1)
})
