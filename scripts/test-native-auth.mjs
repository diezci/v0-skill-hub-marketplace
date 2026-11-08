// Actual OAuth buttons, native handler and bridge; synthetic users and transport.
// This exercises JS routing/PKCE handoff, not a physical device or live provider.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const CALLBACK = 'es.diime.app://auth/callback'
const RETURN_KEY = 'diime_oauth_return_v1'
const jsx = (type, props) => ({ type, props })
const plain = value => JSON.parse(JSON.stringify(value))
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : []

function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} }
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(js, { module, exports: module.exports, URL, URLSearchParams, Date, Set, Error,
    process: { env: { NODE_ENV: 'production' } },
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name] },
    ...globals,
  })
  return module.exports
}

const redirect = load('lib/auth-redirect.ts')
const native = load('lib/auth-native.ts', { '@/lib/auth-redirect': redirect })

function storage() {
  const items = new Map()
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) }
}

function authFixture(saved = { destino: '/', terms: false, age: false }) {
  const savedStorage = storage(), codes = [], updates = [], profiles = [], paths = [], order = []
  let exchange = async () => ({ data: { user: { id: 'synthetic-user' } }, error: null })
  let closed = 0
  const supabase = {
    auth: {
      async exchangeCodeForSession(code) { codes.push(code); order.push('exchange'); return exchange(code) },
      async updateUser(input) { updates.push(plain(input)); order.push('consent'); return { error: null } },
    },
    from(table) { assert.equal(table, 'profiles'); return { update(input) { return { async eq(column, id) { profiles.push({ input: plain(input), column, id }); return { error: null } } } } } },
  }
  if (saved) native.guardarRetornoOAuthNativo(saved, savedStorage)
  const options = {
    supabase, storage: savedStorage, procesados: new Set(),
    cerrarNavegador: async () => { closed++; order.push('close') },
    navegar: path => { paths.push(path); order.push('navigate') },
  }
  return {
    supabase, storage: savedStorage, codes, updates, profiles, paths, order, options,
    handle: native.crearManejadorAuthNativo(options),
    get closed() { return closed },
    setExchange(fn) { exchange = fn },
  }
}

function buttonsFixture({ platform = 'native', idioma = 'en', path = '/auth/registro', next = '/mi-empresa/invitaciones/synthetic?from=mail#accept', accepts = true, adult = true } = {}) {
  const savedStorage = storage(), calls = [], browser = [], errors = [], loading = []
  const traducciones = { 'Continuar con Google': 'Continue with Google', 'Continuar con Apple': 'Continue with Apple' }
  const component = load('components/botones-oauth.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/idioma-provider': { useT: () => text => idioma === 'en' ? traducciones[text] || text : text },
    '@/components/ui/button': { Button: 'Button' },
    '@/lib/supabase/client': { createClient: () => ({ auth: { signInWithOAuth: async input => { calls.push(plain(input)); return { data: { url: `https://provider.test/authorize?provider=${input.provider}` }, error: null } } } }) },
    '@capacitor/core': { Capacitor: { isNativePlatform: () => platform === 'native' } },
    '@capacitor/browser': { Browser: { open: async input => browser.push(plain(input)) } },
    '@/lib/auth-redirect': redirect,
    '@/lib/auth-native': native,
  }, { window: { location: { origin: 'https://www.diime.es', pathname: path, search: `?next=${encodeURIComponent(next)}` }, localStorage: savedStorage } })
  const tree = component.BotonesOAuth({ cargando: false, onCargando: value => loading.push(value), onError: value => errors.push(value), aceptaTerminos: accepts, confirmaMayoriaEdad: adult })
  const buttons = walk(tree).filter(node => node.type === 'Button')
  return { storage: savedStorage, calls, browser, errors, loading, buttons,
    async click(provider) { const button = buttons[provider === 'google' ? 0 : 1]; assert.ok(button); await button.props.onClick() },
  }
}

for (const idioma of ['es', 'en']) for (const provider of ['google', 'apple']) for (const path of ['/auth/login', '/auth/registro']) {
  test(`${idioma} ${provider} ${path}: native uses the exact registered redirect and keeps return context in the app`, async () => {
    const app = buttonsFixture({ idioma, path })
    await app.click(provider)
    assert.equal(app.calls.length, 1)
    const input = app.calls[0]
    assert.equal(input.provider, provider)
    assert.equal(input.options.redirectTo, CALLBACK)
    assert.equal(input.options.skipBrowserRedirect, true)
    assert.equal(new URL(input.options.redirectTo).search, '')
    assert.deepEqual(input.options.queryParams, provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : undefined)
    assert.deepEqual(app.browser, [{ url: `https://provider.test/authorize?provider=${provider}`, presentationStyle: 'popover' }])
    const pending = JSON.parse(app.storage.getItem(RETURN_KEY))
    assert.equal(pending.destino, '/mi-empresa/invitaciones/synthetic?from=mail#accept')
    assert.equal(pending.terms, path === '/auth/registro')
    assert.equal(pending.age, path === '/auth/registro')
    assert.ok(Date.now() - pending.creado < 1000)
    assert.deepEqual(Object.keys(pending).sort(), ['age', 'creado', 'destino', 'terms'])
    assert.deepEqual(app.errors, [''])
    assert.deepEqual(app.loading, [true])
  })
}

for (const provider of ['google', 'apple']) for (const path of ['/auth/login', '/auth/registro']) {
  test(`${provider} ${path}: web retains HTTPS callback, destination and registration consent`, async () => {
    const web = buttonsFixture({ platform: 'web', path })
    await web.click(provider)
    const callback = new URL(web.calls[0].options.redirectTo)
    assert.equal(callback.origin, 'https://www.diime.es')
    assert.equal(callback.pathname, '/auth/callback')
    assert.equal(callback.searchParams.get('next'), '/mi-empresa/invitaciones/synthetic?from=mail#accept')
    assert.equal(callback.searchParams.get('terms'), path === '/auth/registro' ? '1' : null)
    assert.equal(callback.searchParams.get('age'), path === '/auth/registro' ? '1' : null)
    assert.equal(web.calls[0].options.skipBrowserRedirect, false)
    assert.equal(web.storage.getItem(RETURN_KEY), null)
    assert.deepEqual(web.browser, [])
  })
}

test('registration cannot start OAuth without either required confirmation', async () => {
  for (const options of [{ accepts: false }, { adult: false }]) {
    const app = buttonsFixture(options)
    assert.ok(app.buttons.every(button => button.props.disabled))
    await app.click('google')
    assert.deepEqual(app.calls, [])
    assert.equal(app.errors.length, 1)
    assert.equal(app.storage.getItem(RETURN_KEY), null)
  }
})

test('hostile return destinations are sanitized both when starting OAuth and when consuming storage', async () => {
  for (const next of ['//evil.test', '/\\evil.test', 'https://evil.test', '/\nevil.test']) {
    const app = buttonsFixture({ next })
    await app.click('google')
    assert.equal(JSON.parse(app.storage.getItem(RETURN_KEY)).destino, '/')
    const auth = authFixture(null)
    auth.storage.setItem(RETURN_KEY, JSON.stringify({ destino: next, terms: false, age: false, creado: Date.now() }))
    await auth.handle(`${CALLBACK}?code=synthetic`)
    assert.deepEqual(auth.paths, ['/'])
  }
})

test('native registration exchanges in the originating client, applies saved consent and returns to the invitation', async () => {
  const auth = authFixture({ destino: '/mi-empresa/invitaciones/synthetic?accept=1#terms', terms: true, age: true })
  assert.equal(await auth.handle(`${CALLBACK}?code=synthetic`), true)
  assert.deepEqual(auth.codes, ['synthetic'])
  assert.deepEqual(auth.order, ['close', 'exchange', 'consent', 'navigate'])
  assert.equal(auth.updates.length, 1)
  const metadata = auth.updates[0].data
  assert.equal(metadata.terms_version, '2026-08')
  assert.equal(metadata.mayor_edad_version, '18-plus-2026-08')
  assert.equal(metadata.terms_accepted_at, metadata.mayor_edad_confirmada_at)
  assert.ok(Number.isFinite(Date.parse(metadata.terms_accepted_at)))
  assert.deepEqual(auth.profiles, [{ input: { mayor_edad_confirmada_at: metadata.terms_accepted_at, mayor_edad_version: '18-plus-2026-08' }, column: 'id', id: 'synthetic-user' }])
  assert.deepEqual(auth.paths, ['/mi-empresa/invitaciones/synthetic?accept=1#terms'])
  assert.equal(auth.storage.getItem(RETURN_KEY), null)
})

test('callback query parameters cannot invent consent or override the locally saved destination', async () => {
  const auth = authFixture({ destino: '/mis-solicitudes', terms: false, age: false })
  await auth.handle(`${CALLBACK}?code=synthetic&age=1&terms=1&next=https://evil.test`)
  assert.deepEqual(auth.updates, [])
  assert.deepEqual(auth.profiles, [])
  assert.deepEqual(auth.paths, ['/mis-solicitudes'])
})

test('duplicate launch/event callbacks share one exchange even while the first exchange is pending', async () => {
  const auth = authFixture(), exchange = deferred()
  auth.setExchange(() => exchange.promise)
  const first = auth.handle(`${CALLBACK}?code=single-use`)
  await tick()
  const second = auth.handle(`${CALLBACK}?code=single-use&age=1`)
  await second
  assert.deepEqual(auth.codes, ['single-use'])
  assert.equal(auth.closed, 1)
  exchange.resolve({ data: { user: { id: 'synthetic-user' } }, error: null })
  await first
  assert.deepEqual(auth.paths, ['/'])
  // After a WebView reload getLaunchUrl may still expose the consumed code.
  const freshHandler = native.crearManejadorAuthNativo({ ...auth.options, procesados: new Set() })
  await freshHandler(`${CALLBACK}?code=single-use`)
  assert.deepEqual(auth.codes, ['single-use'])
  assert.deepEqual(auth.paths, ['/'])
})

test('missing, corrupt, expired, future and invalid-date pending state never exchanges or grants consent', async () => {
  const entries = [null, '{broken-json', 'null', JSON.stringify({ destino: '/', terms: true, age: true, creado: Date.now() - 31 * 60 * 1000 }), JSON.stringify({ destino: '/', terms: true, age: true, creado: Date.now() + 60000 }), JSON.stringify({ destino: '/', terms: true, age: true, creado: 'today' })]
  for (const raw of entries) {
    const auth = authFixture(null)
    if (raw !== null) auth.storage.setItem(RETURN_KEY, raw)
    assert.equal(await auth.handle(`${CALLBACK}?code=synthetic&terms=1&age=1`), true)
    assert.deepEqual(auth.codes, [])
    assert.deepEqual(auth.updates, [])
    assert.deepEqual(auth.profiles, [])
    assert.deepEqual(auth.paths, [])
    assert.equal(auth.storage.getItem(RETURN_KEY), null)
  }
})

test('a retained denial launch cannot suppress the same denial from a new OAuth attempt', async () => {
  const auth = authFixture()
  const denial = `${CALLBACK}?error=access_denied`
  await auth.handle(denial)
  const reloaded = native.crearManejadorAuthNativo({ ...auth.options, procesados: new Set() })
  // iOS retains the old launch URL after the login page reloads.
  await reloaded(denial)
  assert.deepEqual(auth.paths, ['/auth/login?error=oauth'])
  native.guardarRetornoOAuthNativo({ destino: '/', terms: true, age: true }, auth.storage)
  // Google and Apple can return identical errors for separate attempts.
  await reloaded(denial)
  assert.deepEqual(auth.paths, ['/auth/login?error=oauth', '/auth/login?error=oauth'])
  assert.equal(auth.closed, 2)
  assert.equal(auth.storage.getItem(RETURN_KEY), null)
})

test('non-boolean saved confirmation values do not record consent', async () => {
  const auth = authFixture(null)
  auth.storage.setItem(RETURN_KEY, JSON.stringify({ destino: '/', terms: 'true', age: 1, creado: Date.now() }))
  await auth.handle(`${CALLBACK}?code=synthetic`)
  assert.deepEqual(auth.updates, [])
  assert.deepEqual(auth.profiles, [])
})

test('callback validation rejects unrelated schemes, hosts, credentials, ports and sibling paths without consuming pending state', async () => {
  const auth = authFixture()
  for (const url of ['invalid', 'https://www.diime.es/auth/callback?code=x', 'evil://auth/callback?code=x', 'es.diime.app://evil/callback?code=x', 'es.diime.app://auth/callback-evil?code=x', 'es.diime.app://auth/callback/stripe/return?code=x', 'es.diime.app://user@auth/callback?code=x', 'es.diime.app://auth:123/callback?code=x', 'es.diime.app://auth/callback/extra?code=x']) {
    assert.equal(await auth.handle(url), false, url)
    assert.ok(auth.storage.getItem(RETURN_KEY), url)
  }
  assert.deepEqual(auth.codes, [])
  assert.deepEqual(auth.paths, [])
})

test('provider errors, missing code, rejected exchange and missing user return to app login', async () => {
  for (const [url, response] of [
    [CALLBACK, null],
    [`${CALLBACK}?error=access_denied&code=synthetic`, null],
    [`${CALLBACK}?code=synthetic#error=access_denied`, null],
    [`${CALLBACK}?code=synthetic`, { data: { user: null }, error: new Error('Invalid PKCE') }],
    [`${CALLBACK}?code=synthetic`, { data: { user: null }, error: null }],
  ]) {
    const auth = authFixture({ destino: '/mi-empresa', terms: true, age: true })
    if (response) auth.setExchange(async () => response)
    await auth.handle(url)
    assert.deepEqual(auth.paths, ['/auth/login?error=oauth'])
    assert.deepEqual(auth.updates, [])
    assert.equal(auth.closed, 1)
  }
  const auth = authFixture()
  auth.setExchange(async () => { throw new Error('Network unavailable') })
  await auth.handle(`${CALLBACK}?code=synthetic`)
  assert.deepEqual(auth.paths, ['/auth/login?error=oauth'])
})

test('browser-close failure does not prevent an otherwise valid app login', async () => {
  const auth = authFixture()
  const handler = native.crearManejadorAuthNativo({ ...auth.options, cerrarNavegador: async () => { throw new Error('Already closed') } })
  await handler(`${CALLBACK}?code=synthetic`)
  assert.deepEqual(auth.codes, ['synthetic'])
  assert.deepEqual(auth.paths, ['/'])
})

function bridgeFixture(auth, launch) {
  const listeners = new Map(), order = [], paths = [], assigned = [], effects = []
  let cleanup, closed = 0
  const pluginListener = async () => ({ remove: async () => {} })
  const component = load('components/capacitor-bridge.tsx', {
    react: { useRef: initial => ({ current: initial }), useEffect: effect => effects.push(effect) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/idioma-provider': { useT: () => text => text },
    '@capacitor/core': { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } },
    '@capacitor/app': { App: {
      async addListener(name, fn) { listeners.set(name, fn); order.push(name); return { remove: async () => listeners.delete(name) } },
      async getLaunchUrl() { order.push('getLaunchUrl'); return launch },
    } },
    '@capacitor/browser': { Browser: { close: async () => { closed++ }, open: async () => {} } },
    '@capacitor/haptics': { Haptics: {}, ImpactStyle: {} },
    '@capacitor/keyboard': { Keyboard: { setResizeMode: async () => {} }, KeyboardResize: {} },
    '@capacitor/network': { Network: { getStatus: async () => ({ connected: true }), addListener: pluginListener } },
    '@capacitor/push-notifications': { PushNotifications: { addListener: pluginListener } },
    '@capacitor/splash-screen': { SplashScreen: { hide: async () => {} } },
    '@capacitor/status-bar': { StatusBar: { setStyle: async () => {}, setBackgroundColor: async () => {} }, Style: {} },
    '@/app/actions/push': { registrarDispositivoPush: async () => ({}) },
    '@/lib/push/client': { guardarTokenPushActual() {} },
    '@/lib/supabase/client': { createClient: () => ({ ...auth.supabase, auth: { ...auth.supabase.auth, getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) },
    '@/lib/auth-native': native,
  }, {
    window: { location: { origin: 'https://www.diime.es', search: '', replace: path => paths.push(path), assign: path => assigned.push(path) }, localStorage: auth.storage, setTimeout: () => 1, clearTimeout() {}, dispatchEvent() {} },
    document: { documentElement: { dataset: {}, classList: { contains: () => false } }, addEventListener() {}, removeEventListener() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    console,
  })
  component.CapacitorBridge()
  cleanup = effects[0]()
  return { listeners, order, paths, assigned, cleanup, get closed() { return closed } }
}

test('real CapacitorBridge registers appUrlOpen then processes getLaunchUrl; simultaneous delivery exchanges once', async () => {
  const auth = authFixture({ destino: '/mis-solicitudes', terms: false, age: false }), launch = deferred()
  const bridge = bridgeFixture(auth, launch.promise)
  await tick()
  assert.ok(bridge.order.indexOf('appUrlOpen') < bridge.order.indexOf('getLaunchUrl'))
  const url = `${CALLBACK}?code=cold-start`
  const liveEvent = bridge.listeners.get('appUrlOpen')({ url })
  launch.resolve({ url })
  await liveEvent
  await tick()
  assert.deepEqual(auth.codes, ['cold-start'])
  assert.deepEqual(bridge.paths, ['/mis-solicitudes'])
  assert.equal(bridge.closed, 1)
  bridge.cleanup()
  // A remounted WebView must not exchange the now-consumed launch URL again.
  const reloaded = bridgeFixture(auth, { url })
  await tick()
  assert.deepEqual(auth.codes, ['cold-start'])
  assert.deepEqual(reloaded.paths, [])
  reloaded.cleanup()
})

test('cold start without a live appUrlOpen event still restores the app session through getLaunchUrl', async () => {
  const auth = authFixture(), bridge = bridgeFixture(auth, { url: `${CALLBACK}?code=launch-only` })
  await tick()
  assert.deepEqual(auth.codes, ['launch-only'])
  assert.deepEqual(bridge.paths, ['/'])
  bridge.cleanup()
})

test('retained Stripe launch links cannot cause a reload loop; live Stripe return still navigates normally', async () => {
  const auth = authFixture(), url = 'es.diime.app://auth/callback/stripe/return?volver=%2Fmi-empresa'
  const bridge = bridgeFixture(auth, { url })
  await tick()
  assert.deepEqual(auth.codes, [])
  assert.deepEqual(bridge.paths, [])
  assert.deepEqual(bridge.assigned, [])
  assert.equal(bridge.closed, 0)
  assert.ok(auth.storage.getItem(RETURN_KEY), 'An unrelated launch cannot consume the pending OAuth flow')
  await bridge.listeners.get('appUrlOpen')({ url })
  assert.deepEqual(bridge.assigned, ['/auth/login?next=%2Fmi-empresa%3Fstripe_connect%3Dreturn'])
  assert.equal(bridge.closed, 1)
  bridge.cleanup()
})

test('a delayed launch callback does not authenticate or navigate after bridge unmount', async () => {
  const auth = authFixture(), launch = deferred(), bridge = bridgeFixture(auth, launch.promise)
  await tick()
  bridge.cleanup()
  launch.resolve({ url: `${CALLBACK}?code=too-late` })
  await tick()
  assert.deepEqual(auth.codes, [])
  assert.deepEqual(bridge.paths, [])
  assert.ok(auth.storage.getItem(RETURN_KEY))
})
