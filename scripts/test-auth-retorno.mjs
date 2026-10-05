import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

function transpilar(relative, dependencies = {}) {
  const source = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  const require = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    throw new Error(`Unexpected dependency ${name}`)
  }
  new Function('require', 'exports', js)(require, exports)
  return exports
}
const helper = transpilar('lib/auth-redirect.ts')
const invitation = `/mi-empresa/invitaciones/${'a'.repeat(64)}`

test('auth destination retains local invitation and query, rejects external and ambiguous URLs', () => {
  assert.equal(helper.destinoAuthSeguro(invitation), invitation)
  assert.equal(helper.destinoAuthSeguro('/mi-perfil?completar=profesional#guardar'), '/mi-perfil?completar=profesional#guardar')
  for (const v of [null, undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/\nevil.example', ' /mi-empresa', 'javascript:alert(1)']) {
    assert.equal(helper.destinoAuthSeguro(v), '/', String(v))
  }
  assert.equal(helper.destinoAuthSeguro(undefined, ''), '')
})

function registration() {
  const calls = []
  const client = { auth: { signUp: async (input) => { calls.push(input); return { data: { user: { id: 'synthetic-user' }, session: null }, error: null } } } }
  const api = transpilar('app/actions/auth.ts', {
    '@/lib/auth-redirect': helper,
    '@/lib/i18n-servidor': { textoServidor: async (v) => v, idiomaActual: async () => 'es' },
    '@/lib/supabase/server': { createClient: async () => client },
    'next/headers': {}, 'next/navigation': {},
  })
  return { api, calls }
}
const personal = { email: 'ficticio@example.com', password: 'not-a-real-password', nombre: 'Prueba', apellido: 'Local', tipoEntidad: 'particular', documento: 'ficticio', aceptaTerminos: true, confirmaMayoriaEdad: true }

test('email confirmation callback preserves the individual invitation without adding company credentials', async () => {
  const { api, calls } = registration()
  const result = await api.registrarUsuario({ ...personal, next: invitation })
  assert.ok(result.data)
  const callback = new URL(calls[0].options.emailRedirectTo)
  assert.equal(callback.pathname, '/auth/callback')
  assert.equal(callback.searchParams.get('next'), invitation)
  assert.equal(calls[0].options.data.registro_empresa, null)
})

test('registration rejects legacy shared token before signUp and sanitizes hostile next', async () => {
  const { api, calls } = registration()
  assert.match((await api.registrarUsuario({ ...personal, tokenInvitacion: 'old-shared-token' })).error, /enlace individual/)
  assert.equal(calls.length, 0)
  await api.registrarUsuario({ ...personal, next: '//evil.example' })
  assert.equal(new URL(calls[0].options.emailRedirectTo).searchParams.get('next'), '/')
})

test('callback returns to the invitation after exchanging the code, always on this origin', async () => {
  let exchanged = false
  const client = { auth: { exchangeCodeForSession: async () => { exchanged = true; return { data: { user: { id: 'synthetic-user' } }, error: null } } }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'synthetic-user' } }) }) }) }) }
  const { GET } = transpilar('app/auth/callback/route.ts', { '@/lib/auth-redirect': helper, '@/lib/supabase/server': { createClient: async () => client }, 'next/server': { NextResponse: { redirect: (url) => url } } })
  const result = await GET(new Request(`https://www.diime.es/auth/callback?code=synthetic&next=${encodeURIComponent(invitation)}`))
  assert.equal(exchanged, true)
  assert.equal(result.href, `https://www.diime.es${invitation}`)
  const rejected = await GET(new Request('https://www.diime.es/auth/callback?next=%2F%5Cevil.example'))
  assert.equal(rejected.origin, 'https://www.diime.es')
  assert.equal(rejected.pathname, '/')
})
