// Actual password-update page, controlled Auth transport; no users or network.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
const source = readFileSync('app/auth/actualizar-contrasena/page.tsx', 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
function fixture({ url = '?code=synthetic', initializationError = null, removeCode = true, user = { id: 'recovery-user' }, userError = null, updateError = null } = {}) {
  const slots = [], effects = [], calls = { initialize: 0, getUser: 0, update: [], paths: [], reload: 0 }
  let cursor = 0, dirty = false, tree
  const window = { location: { href: 'https://app.invalid/auth/actualizar-contrasena' + url, reload: () => calls.reload++ } }
  const auth = {
    async initialize() { calls.initialize++; if (removeCode && !initializationError) { const u = new URL(window.location.href); u.searchParams.delete('code'); window.location.href = u.href } return { error: initializationError } },
    async getUser() { calls.getUser++; return { data: { user }, error: userError } },
    async updateUser(input) { calls.update.push(input); return { error: updateError } },
  }
  const jsx = (type, props) => ({ type, props })
  const deps = {
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; dirty = true }] },
      useEffect(fn, values) { const i = cursor++; if (!slots[i] || values.some((value, j) => value !== slots[i].values[j])) { slots[i] = { values }; effects.push(fn) } },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/idioma-provider': { useT: () => value => value },
    '@/lib/supabase/client': { createClient: () => ({ auth }) },
    'next/navigation': { useRouter: () => ({ push: value => calls.paths.push(value) }) },
  }
  const exports = {}
  new Function('require', 'exports', 'window', 'setTimeout', compiled)(name => deps[name] || new Proxy({}, { get: (_, key) => String(key) }), exports, window, callback => callback())
  const walk = node => !node ? [] : Array.isArray(node) ? node.flatMap(walk) : typeof node === 'object' ? [node, ...walk(node.props?.children)] : [node]
  function render() { cursor = 0; dirty = false; tree = walk(exports.default()); effects.splice(0).forEach(fn => fn()) }
  async function flush() { for (let i = 0; i < 16; i++) { await Promise.resolve(); if (dirty) render() } }
  const find = predicate => tree.find(predicate)
  return {
    calls, get tree() { return tree }, text: () => tree.filter(v => typeof v === 'string').join(' '),
    hasForm: () => Boolean(find(node => node?.type === 'form')),
    async mount() { render(); assert.equal(this.hasForm(), false, 'No operational form before Auth validation'); await flush() },
    setUser(value, error = null) { user = value; userError = error },
    async submit(password = 'New!synthetic-password', confirmation = password) { const form = find(n => n?.type === 'form'); assert.ok(form); find(n => n?.props?.id === 'password').props.onChange({ target: { value: password } }); find(n => n?.props?.id === 'confirmPassword').props.onChange({ target: { value: confirmation } }); render(); await find(n => n?.type === 'form').props.onSubmit({ preventDefault() {} }); await flush() },
    retry() { find(n => n?.props?.onClick).props.onClick() },
  }
}
function invalid(f) {
  assert.equal(f.hasForm(), false)
  assert.match(f.text(), /El enlace no es válido, ha caducado o ya se ha utilizado/)
  assert.ok(f.tree.some(n => n?.props?.href === '/auth/recuperar-contrasena'))
  assert.ok(f.tree.some(n => n?.props?.href === '/auth/login'))
  assert.equal(f.calls.update.length, 0)
}
for (const url of ['?error_code=otp_expired', '#error=access_denied&error_description=Expired', '?error=bad_link']) {
  test('URL error blocks an existing unrelated session: ' + url.split('=')[0], async () => {
    const f = fixture({ url, user: { id: 'other-user' } }); await f.mount(); invalid(f); assert.equal(f.calls.getUser, 0)
  })
}
test('A PKCE code left by the SDK cannot use an unrelated existing session', async () => {
  const f = fixture({ removeCode: false, user: { id: 'other-user' } }); await f.mount(); invalid(f); assert.equal(f.calls.getUser, 0)
})
test('Cached SDK exchange errors block the form even after URL cleanup', async () => {
  const f = fixture({ url: '', initializationError: { name: 'AuthPKCEGrantCodeExchangeError' } }); await f.mount(); invalid(f)
})
test('Missing/expired session has a local recovery exit without exposing raw SDK error', async () => {
  const f = fixture({ user: null, userError: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } }); await f.mount(); invalid(f); assert.doesNotMatch(f.text(), /Auth session missing/)
})
test('Transient initial check offers retry without claiming expiration', async () => {
  for (const errorAt of ['initializationError', 'userError']) {
    const f = fixture({ [errorAt]: { name: 'AuthRetryableFetchError', status: 503 } }); await f.mount(); assert.equal(f.hasForm(), false); assert.match(f.text(), /problema de conexión/); assert.doesNotMatch(f.text(), /ha caducado/); f.retry(); assert.equal(f.calls.reload, 1)
  }
})
test('Valid exchange and matching identity updates once, then shows success and login', async () => {
  const f = fixture(); await f.mount(); assert.ok(f.hasForm()); await f.submit(); assert.equal(f.calls.update.length, 1); assert.equal(f.calls.getUser, 2); assert.match(f.text(), /¡Contraseña actualizada!/); assert.deepEqual(f.calls.paths, ['/auth/login'])
})
test('Changing identity in another tab cannot update the new account', async () => {
  const f = fixture(); await f.mount(); f.setUser({ id: 'other-user' }); await f.submit(); invalid(f)
})
test('Session lost after mounting cannot update any account', async () => {
  const f = fixture(); await f.mount(); f.setUser(null, { name: 'AuthSessionMissingError' }); await f.submit(); invalid(f)
})
test('Validation rejects mismatched and short passwords before any mutation', async () => {
  const f = fixture(); await f.mount(); await f.submit('New!password', 'different'); assert.match(f.text(), /no coinciden/); await f.submit('123'); assert.match(f.text(), /al menos 6 caracteres/); assert.equal(f.calls.update.length, 0)
})
test('Network failure while saving retains entered password for retry without false success', async () => {
  const f = fixture({ updateError: { name: 'AuthRetryableFetchError' } }); await f.mount(); await f.submit(); assert.ok(f.hasForm()); assert.match(f.text(), /Conservamos tus datos/); assert.doesNotMatch(f.text(), /¡Contraseña actualizada!/); assert.equal(f.tree.find(n => n?.props?.id === 'password').props.value, 'New!synthetic-password')
})
test('Same-password server rejection remains actionable in Spanish', async () => {
  const f = fixture({ updateError: { code: 'same_password' } }); await f.mount(); await f.submit(); assert.match(f.text(), /distinta de la anterior/); assert.ok(f.hasForm())
})
