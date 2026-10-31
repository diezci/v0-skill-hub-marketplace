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

test('configured auth origin wins over an internal hostname and rejects invalid URL schemes', () => {
  assert.equal(helper.origenAuthConfigurado('http://localhost:3200/auth/callback', 'http://127.0.0.1:3200'), 'http://127.0.0.1:3200')
  assert.equal(helper.origenAuthConfigurado('https://preview.example/auth/callback', 'https://www.diime.es'), 'https://www.diime.es')
  assert.equal(helper.origenAuthConfigurado('https://www.diime.es/auth/callback'), 'https://www.diime.es')
  for (const url of ['javascript:alert(1)', 'data:text/html,auth', 'https://user:password@example.com']) {
    assert.throws(() => helper.origenAuthConfigurado('http://localhost:3200', url))
  }
})

test('password login after a resent confirmation resumes saved intent without trusting external metadata', () => {
  assert.equal(helper.destinoTrasConfirmacion(null, '/mi-perfil?completar=profesional'), '/mi-perfil?completar=profesional')
  assert.equal(helper.destinoTrasConfirmacion('/mis-solicitudes', '/mi-perfil?completar=profesional'), '/mis-solicitudes')
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/\nevil.example']) {
    assert.equal(helper.destinoTrasConfirmacion(null, value), '/')
    assert.equal(helper.destinoTrasConfirmacion(value, '/mi-perfil'), '/')
  }
})

test('actual login ignores old registration metadata unless this is the confirmation continuation', async () => {
  for (const [search, saved, expected] of [
    ['', '/mi-perfil?completar=profesional', '/'],
    ['?confirmacion=0', '/mi-perfil?completar=profesional', '/'],
    ['?next=%2Fmis-solicitudes', '/mi-perfil?completar=profesional', '/mis-solicitudes'],
    ['?confirmacion=1', '/mi-perfil?completar=profesional', '/mi-perfil?completar=profesional'],
    ['?confirmacion=1', '//evil.example', '/'],
    ['?confirmacion=1&next=%2Fmis-ofertas', '/mi-perfil?completar=profesional', '/mis-ofertas'],
  ]) {
    const state = [], paths = []
    let cursor = 0
    const jsx = (type, props) => ({ type, props })
    const deps = {
      react: { useEffect() {}, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value }] } },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'next/navigation': { useRouter: () => ({ push: value => paths.push(value), refresh() {} }) },
      '@/components/idioma-provider': { useT: () => value => value },
      '@/lib/auth-redirect': helper,
      '@/lib/supabase/client': { createClient: () => ({ auth: { signInWithPassword: async input => {
        assert.equal(input.email, 'synthetic@example.com')
        assert.equal(input.password, 'synthetic-password')
        return { data: { user: { user_metadata: { registro_next: saved } } }, error: null }
      } } }) },
    }
    const ui = new Set(['@/components/ui/button', '@/components/ui/card', '@/components/ui/input', '@/components/ui/password-input', '@/components/ui/label', '@/components/ui/separator', 'next/link', 'lucide-react', '@/components/botones-oauth'])
    const exports = {}
    const source = readFileSync(new URL('../app/auth/login/page.tsx', import.meta.url), 'utf8')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    new Function('require', 'exports', 'window', js)(name => {
      if (deps[name]) return deps[name]
      if (ui.has(name)) return new Proxy({}, { get: (_, key) => String(key) })
      throw new Error(`Unexpected login dependency ${name}`)
    }, exports, { location: { search } })
    const walk = node => !node ? [] : Array.isArray(node) ? node.flatMap(walk) : typeof node === 'object' ? [node, ...walk(node.props?.children)] : []
    const render = () => { cursor = 0; return walk(exports.default()) }
    let tree = render()
    tree.find(node => node.props?.id === 'email').props.onChange({ target: { value: 'synthetic@example.com' } })
    tree.find(node => node.props?.id === 'password').props.onChange({ target: { value: 'synthetic-password' } })
    tree = render()
    await tree.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.deepEqual(paths, [expected], search || 'ordinary login')
  }
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
  assert.equal(calls[0].options.data.registro_next, invitation)
})

test('registration rejects legacy shared token before signUp and sanitizes hostile next', async () => {
  const { api, calls } = registration()
  assert.match((await api.registrarUsuario({ ...personal, tokenInvitacion: 'old-shared-token' })).error, /enlace individual/)
  assert.equal(calls.length, 0)
  await api.registrarUsuario({ ...personal, next: '//evil.example' })
  assert.equal(new URL(calls[0].options.emailRedirectTo).searchParams.get('next'), '/')
  assert.equal(calls[0].options.data.registro_next, '/')
})

test('resend callback restores only safe signup intent and explicit next still wins', async () => {
  const user = { id: 'synthetic-user', user_metadata: { registro_next: '/mi-perfil?completar=profesional' } }
  const client = {
    auth: { exchangeCodeForSession: async () => ({ data: { user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: user.id } }) }) }) }),
  }
  const { GET } = transpilar('app/auth/callback/route.ts', { '@/lib/auth-redirect': helper, '@/lib/supabase/server': { createClient: async () => client }, 'next/server': { NextResponse: { redirect: url => url } } })
  const previous = process.env.NEXT_PUBLIC_SITE_URL
  process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3200'
  try {
    assert.equal((await GET(new Request('http://localhost:3200/auth/callback?code=synthetic'))).href, 'http://127.0.0.1:3200/mi-perfil?completar=profesional')
    assert.equal((await GET(new Request('http://localhost:3200/auth/callback?code=synthetic&next=%2Fmis-solicitudes'))).href, 'http://127.0.0.1:3200/mis-solicitudes')
    for (const unsafe of ['//evil.example', '/\\evil.example', 'https://evil.example']) {
      user.user_metadata.registro_next = unsafe
      assert.equal((await GET(new Request('http://localhost:3200/auth/callback?code=synthetic'))).href, 'http://127.0.0.1:3200/')
    }
    const failure = await GET(new Request('http://localhost:3200/auth/callback?error=server_error'))
    assert.equal(failure.origin, 'http://127.0.0.1:3200')
    assert.equal(failure.pathname, '/auth/error')
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previous
  }
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
  assert.equal(rejected.pathname, '/auth/error')
  assert.equal(rejected.searchParams.get('next'), '/')
})

test('failed, expired, reused and missing auth codes show recovery and retain only a safe destination', async () => {
  for (const authResult of [
    { data: { user: null }, error: { message: 'expired' } },
    { data: { user: null }, error: null },
  ]) {
    let profileWrites = 0
    const client = { auth: { exchangeCodeForSession: async () => authResult }, from: () => { profileWrites++; throw new Error('profile must not be accessed') } }
    const { GET } = transpilar('app/auth/callback/route.ts', { '@/lib/auth-redirect': helper, '@/lib/supabase/server': { createClient: async () => client }, 'next/server': { NextResponse: { redirect: (url) => url } } })
    for (const next of ['/mis-solicitudes?trabajo=qa#detalle', '//evil.example', '/\\evil.example']) {
      for (const code of ['', '&code=invalid', '&error=server_error']) {
        const result = await GET(new Request(`https://www.diime.es/auth/callback?next=${encodeURIComponent(next)}${code}`))
        assert.equal(result.pathname, '/auth/error')
        assert.equal(result.origin, 'https://www.diime.es')
        assert.equal(result.searchParams.get('next'), helper.destinoAuthSeguro(next))
      }
    }
    assert.equal(profileWrites, 0)
  }
})

test('OAuth cancellation returns to login with a safe destination, without exchanging codes or writing a profile', async () => {
  const { GET } = transpilar('app/auth/callback/route.ts', {
    '@/lib/auth-redirect': helper,
    '@/lib/supabase/server': { createClient: () => { throw Error('Cancellation must not create a session') } },
    'next/server': { NextResponse: { redirect: url => url } },
  })
  for (const next of ['/mis-solicitudes?estado=abierta#detalle', '//evil.example', '/\\evil.example', 'https://evil.example']) {
    const url = new URL('https://www.diime.es/auth/callback')
    url.searchParams.set('error', 'access_denied')
    url.searchParams.set('code', 'must-not-be-exchanged')
    url.searchParams.set('next', next)
    const result = await GET(new Request(url))
    assert.equal(result.origin, 'https://www.diime.es')
    assert.equal(result.pathname, '/auth/login')
    assert.equal(result.searchParams.get('oauth'), 'cancelled')
    assert.equal(result.searchParams.get('next'), helper.destinoAuthSeguro(next))
  }
})
