import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

function load(file, dependencies = {}) {
  const exports = {}
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', js)(name => {
    if (name === '@/lib/producto') return load('lib/producto.ts')
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    return {}
  }, exports)
  return exports
}

test('specialized company registration and team admission stop before database or local writes', async () => {
  let calls = 0
  const unexpected = () => { calls++; throw Error('Unexpected company onboarding mutation') }
  const deps = {
    '@/lib/i18n-servidor': { textoServidor: async value => value },
    '@/lib/supabase/server': { createClient: unexpected },
    '@/lib/empresas/service': { esEmpresasLocal: unexpected, obtenerActorEmpresaLocal: unexpected },
    '@/lib/empresas/production-store': { rpcEmpresa: unexpected },
    '@/lib/empresas/local-store': { empresaLocalStore: { invitar: unexpected, aceptarInvitacion: unexpected } },
  }
  const company = load('app/actions/empresas.ts', deps)
  const workspace = load('app/actions/empresa-workspace.ts', deps)
  for (const result of [
    await company.completarRegistroEmpresa({ nombreEmpresa: 'Sociedad', cif: 'B00000000', documentoPersonal: '00000000T' }),
    await workspace.invitarMiembroEmpresa({ nombre: 'Persona', email: 'fixture@example.test', rol: 'miembro', permisos: {} }),
    await workspace.aceptarInvitacionEmpresa('previously-issued-token'),
  ]) assert.match(result.error, /perfil profesional/)
  assert.equal(calls, 0)
})

test('a new account reaches its shared profile instead of company creation', async () => {
  const { default: Page } = load('app/mi-empresa/page.tsx', {
    'next/navigation': { redirect: destination => { throw Error(`redirect:${destination}`) } },
    '@/lib/empresas/service': { obtenerEspacioEmpresa: async () => ({ codigo: 'SIN_EMPRESA' }) },
  })
  await assert.rejects(() => Page({ searchParams: Promise.resolve({}) }), /redirect:\/mi-perfil$/)
})

test('existing company deep links retain contract context and payment return', async () => {
  const id = '10000000-0000-4000-8000-000000000001'
  const espacio = { empresa: { id }, actor: { id: 'actor' }, local: true }
  const { default: Page } = load('app/mi-empresa/page.tsx', {
    'next/navigation': { redirect: destination => { throw Error(`Unexpected redirect:${destination}`) } },
    '@/components/empresas/empresa-workspace': { EmpresaWorkspace: 'CompanyWorkspace' },
    '@/lib/empresas/service': { obtenerEspacioEmpresa: async () => ({ data: espacio }) },
    '@/lib/i18n-servidor': { getT: async () => ({ t: value => value }) },
    '@/lib/notificaciones-contexto': { idNotificacionValido: value => value === id },
  })
  const result = await Page({ searchParams: Promise.resolve({ trabajo: id, stripe_connect: 'return' }) })
  assert.equal(result.type, 'CompanyWorkspace')
  assert.equal(result.props.espacio, espacio)
  assert.deepEqual(result.props.operacionInicial, { tipo: 'trabajos', id })
  assert.equal(result.props.mostrarCobrosIniciales, true)
})

test('old invitation links explain the pause without reading or accepting the token', async () => {
  const { default: Page } = load('app/mi-empresa/invitaciones/[token]/page.tsx', {
    '@/lib/i18n-servidor': { getT: async () => ({ t: value => value }) },
    '@/lib/empresas/service': { obtenerInvitacionEmpresa: () => { throw Error('No invitation lookup expected') } },
  })
  const result = await Page({ params: Promise.resolve({ token: 'old-token' }) })
  assert.match(JSON.stringify(result), /Invitaciones de empresa pausadas/)
  assert.match(JSON.stringify(result), /\/mi-perfil/)
})
