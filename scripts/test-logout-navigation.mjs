// Real admin component, logout helper and auth callbacks; controlled transport.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const ui = new Proxy({ __esModule: true }, { get: (target, key) => key in target ? target[key] : String(key) })
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : []

function load(file, deps, globals = {}, extra = '') {
  const module = { exports: {} }
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8') + extra
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(js, { module, exports: module.exports, require: name => deps[name] || ui, ...globals })
  return module.exports
}

function adminFixture() {
  let cursor = 0, authChange, session = { user: { id: 'synthetic-admin' } }, tree
  let failLogout = false, signOutCalls = 0, stopUnlink
  const slots = [], effects = [], paths = [], errors = []
  const hooks = {
    useState(initial) {
      const i = cursor++
      slots[i] ||= { value: initial }
      return [slots[i].value, value => { slots[i].value = value }]
    },
    useRef(initial) { return slots[cursor++] ||= { current: initial } },
    useMemo(factory) { return (slots[cursor++] ||= { value: factory() }).value },
    useEffect(fn, deps) {
      const i = cursor++
      if (!slots[i] || deps.some((dep, j) => dep !== slots[i].deps[j])) {
        const old = slots[i]
        slots[i] = { deps }
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn() })
      }
    },
  }
  const client = {
    auth: {
      getUser: async () => ({ data: { user: session?.user ?? null } }),
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange(callback) { authChange = callback; return { data: { subscription: { unsubscribe() {} } } } },
      async signOut() {
        signOutCalls++
        if (failLogout) return { error: new Error('Synthetic outage') }
        session = null
        // Supabase publishes SIGNED_OUT before signOut resolves.
        authChange('SIGNED_OUT', null)
        return { error: null }
      },
    },
    from() { return { select() { return this }, eq() { return this }, in() { return this }, count: 0, single: async () => ({ data: { es_admin: true, nombre: 'Test' } }) } },
  }
  const helper = load('lib/auth-logout.ts', {
    '@/lib/supabase/client': { createClient: () => client },
    '@/lib/push/client': { desvincularPushActual: () => stopUnlink || Promise.resolve() },
  })
  const router = { replace: path => paths.push(['router.replace', path]), push: path => paths.push(['router.push', path]) }
  const component = load('app/admin/layout.tsx', {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => router, usePathname: () => '/admin' },
    '@/components/idioma-provider': { useIdioma: () => ({ t: x => x }) },
    '@/hooks/use-notificaciones-seccion': { useResumenNotificaciones: () => ({ resumen: { porSeccion: {}, notificaciones: [] } }) },
    '@/hooks/use-toast': { useToast: () => ({ toast: error => errors.push(error) }) },
    '@/app/actions/operaciones': { obtenerConteoDemandasSinOferta: async () => ({ ok: true, total: 0 }) },
    '@/lib/supabase/client': { createClient: () => client },
    '@/lib/auth-logout': helper,
    '@/lib/utils': { cn: (...values) => values.filter(x => typeof x === 'string').join(' ') },
  }, {
    window: { location: { replace: path => paths.push(['replace', path]) } },
    queueMicrotask, setInterval: () => 1, clearInterval() {},
  }, '\nexport { AdminLayoutContenido };')
  const render = () => { cursor = 0; tree = component.AdminLayoutContenido({ children: null }); effects.splice(0).forEach(effect => effect()) }
  const fixture = {
    paths, errors,
    get signOutCalls() { return signOutCalls },
    setFail(value) { failLogout = value },
    holdUnlink() { stopUnlink = new Promise(resolve => { fixture.release = resolve }) },
    async mount() { render(); for (let i = 0; i < 8; i++) await Promise.resolve(); render() },
    logout() { return walk(tree).find(node => node.type === 'Button' && node.props.onClick)?.props.onClick() },
    expire() { session = null; authChange('SIGNED_OUT', null) },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()) },
  }
  return fixture
}

test('explicit admin logout goes home once, without the SIGNED_OUT listener navigating to login', async () => {
  const app = adminFixture()
  await app.mount()
  assert.deepEqual(app.paths, [])
  await app.logout()
  assert.deepEqual(app.paths, [['replace', '/']])
  assert.equal(app.signOutCalls, 1)
  assert.deepEqual(app.errors, [])
  app.cleanup()
})

test('admin double click does not start a competing home navigation', async () => {
  const app = adminFixture()
  await app.mount()
  app.holdUnlink()
  const first = app.logout(), second = app.logout()
  assert.equal(app.signOutCalls, 0)
  assert.deepEqual(app.paths, [])
  app.release()
  await Promise.all([first, second])
  assert.equal(app.signOutCalls, 1)
  assert.deepEqual(app.paths, [['replace', '/']])
  app.cleanup()
})

test('failed admin logout stays on the page and allows a successful retry', async () => {
  const app = adminFixture()
  await app.mount()
  app.setFail(true)
  await app.logout()
  assert.deepEqual(app.paths, [])
  assert.equal(app.errors.length, 1)
  app.setFail(false)
  await app.logout()
  assert.deepEqual(app.paths, [['replace', '/']])
  app.cleanup()
})

test('external session expiry still sends the administrator to login', async () => {
  const app = adminFixture()
  await app.mount()
  app.expire()
  assert.deepEqual(app.paths, [['router.replace', '/auth/login']])
  app.cleanup()
})

// Run the real AppChrome and each real logout handler together. Rendering the
// SIGNED_OUT update before signOut resolves reproduces the competing navigation
// that an isolated button test cannot see.
function integratedLogout(file) {
  let cursor = 0, dirty = false, tree, session = { user: { id: 'synthetic-user' } }, fail = false
  const slots = [], effects = [], paths = [], errors = [], callbacks = new Set(), listeners = new Map()
  const route = file.includes('/admin/') ? '/admin' : '/mi-cuenta'
  const hooks = {
    useState(initial) {
      const i = cursor++
      slots[i] ||= { value: initial }
      return [slots[i].value, value => {
        const next = typeof value === 'function' ? value(slots[i].value) : value
        if (next !== slots[i].value) { slots[i].value = next; dirty = true }
      }]
    },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i]
      if (!old || deps.some((dep, j) => dep !== old.deps[j])) {
        slots[i] = { deps, cleanup: old?.cleanup }
        effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn() })
      }
    },
  }
  const privateVisible = () => walk(tree).some(node => node.type === 'PrivateCard')
  const CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail } }
  const window = {
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type),
    dispatchEvent: event => { listeners.get(event.type)?.(event); return true },
    location: { pathname: route, search: '', hash: '', replace: path => paths.push({ path, privateVisible: privateVisible() }) },
    scrollTo() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  }
  const client = { auth: {
    onAuthStateChange(callback) { callbacks.add(callback); return { data: { subscription: { unsubscribe: () => callbacks.delete(callback) } } } },
    getSession: async () => ({ data: { session }, error: null }),
    async signOut() {
      if (fail) return { error: new Error('Synthetic outage') }
      session = null
      callbacks.forEach(callback => callback('SIGNED_OUT', null))
      await flush()
      return { error: null }
    },
  } }
  const helper = load('lib/auth-logout.ts', {
    '@/lib/supabase/client': { createClient: () => client },
    '@/lib/push/client': { desvincularPushActual: async () => {} },
  })
  const redirects = load('lib/auth-redirect.ts', {}, { window, CustomEvent, URL })
  const chrome = load('components/app-chrome.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { usePathname: () => route },
    '@/lib/supabase/client': { createClient: () => client },
    '@/lib/auth-logout': helper, '@/lib/auth-redirect': redirects,
    '@/components/idioma-provider': { useT: () => value => value },
    '@/hooks/use-viewport-adaptable': { useViewportAdaptable() {} },
  }, { window, CustomEvent, document: { documentElement: { dataset: {} } } })
  const render = () => {
    cursor = 0; dirty = false
    tree = chrome.AppChrome({ children: { type: 'PrivateCard', props: {} } })
    effects.splice(0).forEach(effect => effect())
  }
  async function flush() { for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) render() } }
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const name = file.includes('confirmar-mayoria') ? 'salir' : 'handleLogout'
  let handlerSource
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) handlerSource = node.initializer.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(handlerSource)
  const handler = vm.runInNewContext(ts.transpileModule(`(${handlerSource})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    window, actorEmpresaLocal: null, cierrePendiente: { current: false }, loggingOut: false, guardando: false,
    cerrarSesionActual: helper.cerrarSesionActual,
    setIsLoading() {}, setClosingSession() {}, setLoggingOut() {}, setGuardando() {},
    setIsAuthenticated() {}, setUserEmail() {}, setUserName() {}, setUserPhoto() {}, setIsAdmin() {}, setIsProfessional() {}, setIsOpen() {},
    t: value => value, toast: error => errors.push(error), setError: error => { if (error) errors.push(error) },
    router: { push: path => paths.push({ path, method: 'push' }), replace: path => paths.push({ path, method: 'router.replace' }), refresh: () => paths.push({ method: 'refresh' }) },
  })
  return {
    paths, errors, privateVisible, handler, flush,
    async mount() { render(); await flush() },
    setFail: value => { fail = value },
    async expire() { await client.auth.signOut(); await flush() },
    reauth() { redirects.solicitarReautenticacion('/mi-cuenta?reanudar=1') },
    cleanup() { slots.forEach(slot => slot.cleanup?.()) },
  }
}

for (const file of ['components/navbar.tsx', 'components/logout-button.tsx', 'components/perfil-profesional.tsx', 'components/confirmar-mayoria-edad.tsx', 'app/admin/layout.tsx']) {
  test(`${file} + AppChrome: confirmed logout navigates once after private content unmounts; failures stay put`, async () => {
    const app = integratedLogout(file)
    await app.mount()
    assert.equal(app.privateVisible(), true)
    app.setFail(true)
    await app.handler(); await app.flush()
    assert.equal(app.privateVisible(), true)
    assert.deepEqual(app.paths, [])
    assert.equal(app.errors.length, 1)
    app.setFail(false)
    await app.handler(); await app.flush()
    assert.equal(app.privateVisible(), false)
    assert.deepEqual(app.paths, [{ path: '/', privateVisible: false }])
    app.reauth(); await app.flush()
    assert.deepEqual(app.paths, [{ path: '/', privateVisible: false }], 'Late private request cannot navigate again')
    app.cleanup()
  })
}

test('AppChrome still owns external session expiry and preserves a safe return destination', async () => {
  const app = integratedLogout('components/logout-button.tsx')
  await app.mount(); await app.expire()
  assert.equal(app.privateVisible(), false)
  assert.deepEqual(app.paths, [{ path: '/auth/login?next=%2Fmi-cuenta', privateVisible: false }])
  app.cleanup()
})
