// Componentes y SDK actuales, transporte controlado; sin usuarios ni servicios externos.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { GoTrueClient } = createRequire(require.resolve('@supabase/supabase-js'))('@supabase/auth-js')
const results = []
const output = '.build/correcciones-prioritarias-20261012/sesion-chat'
fs.mkdirSync(output, { recursive: true })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function load(file, deps, globals = {}, transform = x => x) {
  const module = { exports: {} }
  const context = { module, exports: module.exports, console, Date, Promise, Set, Map, URL, URLSearchParams, FormData, File, ...globals,
    require(name) { if (name in deps) return deps[name]; throw Error('Unexpected dependency: ' + name) } }
  vm.runInNewContext(ts.transpileModule(transform(fs.readFileSync(file, 'utf8')), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context, { filename: file })
  return { value: module.exports, context }
}
function extract(file, name, deps) {
  const src = fs.readFileSync(file, 'utf8'), ast = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let body
  const visit = n => { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) body = n.initializer.getText(ast); ts.forEachChild(n, visit) }; visit(ast)
  assert.ok(body, name)
  const code = ts.transpileModule('const handler = ' + body + '; handler', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return vm.runInNewContext(code, deps)
}
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'pass' }); console.log('PASS', name) }
  catch (e) { results.push({ name, status: 'fail', error: e.stack }); console.error('FAIL', name, e.stack) }
}
function sdkFixture(status = 204) {
  const store = new Map(), key = 'synthetic-session-' + Math.random(), events = [], calls = []
  const token = Buffer.from('{"alg":"HS256"}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 'synthetic-user', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.synthetic'
  store.set(key, JSON.stringify({ access_token: token, refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: 'synthetic-user', email: 'fixture@example.test' } }))
  const sdk = new GoTrueClient({ url: 'https://auth.invalid', storageKey: key, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    storage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
    fetch: async (url) => { calls.push(String(url)); return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify({ msg: 'Synthetic Auth outage' }), { status }) } })
  sdk.onAuthStateChange((event) => events.push(event))
  return { sdk, calls, store, key, events, setStatus: x => { status = x } }
}
function logoutHandler(file, sdk, unlink = async () => {}) {
  const helper = load('lib/auth-logout.ts', { '@/lib/supabase/client': { createClient: () => ({ auth: sdk }) }, '@/lib/push/client': { desvincularPushActual: unlink } }).value
  const state = { busy: false, authenticated: true, errors: [], paths: [], refreshes: 0 }
  const deps = { actorEmpresaLocal: null, cierrePendiente: { current: false }, loggingOut: false, guardando: false, closingSession: false,
    cerrarSesionActual: helper.cerrarSesionActual, setIsLoading: v => state.busy = v, setClosingSession: v => state.busy = v, setLoggingOut: v => state.busy = v, setGuardando: v => state.busy = v,
    setIsAuthenticated: v => state.authenticated = v, setIsOpen() {}, setUserEmail() {}, setUserName() {}, setUserPhoto() {}, setIsAdmin() {}, setIsProfessional() {},
    toast: v => state.errors.push(v), setError: v => { if (v) state.errors.push(v) }, t: x => x,
    router: { push: p => state.paths.push(p), refresh: () => state.refreshes++ }, window: { location: { assign: p => state.paths.push(p) } } }
  return { state, run: extract(file, file.includes('confirmar-mayoria') ? 'salir' : 'handleLogout', deps) }
}
const logoutFiles = ['components/logout-button.tsx', 'components/navbar.tsx', 'components/perfil-profesional.tsx', 'app/admin/layout.tsx', 'components/confirmar-mayoria-edad.tsx']
for (const file of logoutFiles) {
  await test(file + ': Auth503 conserva identidad, informa error y permite reintentar', async () => {
    const a = sdkFixture(503), h = logoutHandler(file, a.sdk); await h.run()
    assert.ok((await a.sdk.getSession()).data.session); assert.ok(a.store.has(a.key)); assert.equal(h.state.authenticated, true); assert.equal(h.state.paths.length, 0); assert.equal(h.state.busy, false); assert.equal(h.state.errors.length, 1); assert.equal(a.events.includes('SIGNED_OUT'), false)
    a.setStatus(204); await h.run(); assert.equal((await a.sdk.getSession()).data.session, null); assert.equal(a.store.has(a.key), false); assert.deepEqual(h.state.paths, ['/']); assert.equal(h.state.busy, false); assert.ok(a.events.includes('SIGNED_OUT'))
  })
  await test(file + ': fallo push no aparenta cerrar ni llama logout', async () => {
    const a = sdkFixture(), h = logoutHandler(file, a.sdk, async () => { throw Error('Push no disponible') }); await h.run()
    assert.equal(a.calls.length, 0); assert.equal(h.state.paths.length, 0); assert.equal(h.state.errors.length, 1); assert.equal(h.state.busy, false)
  })
}
await test('Logout: doble clic comparte operación pendiente y no duplica revocación', async () => {
  const a = sdkFixture(), pending = deferred(); let removals = 0
  const h = logoutHandler('components/logout-button.tsx', a.sdk, async () => { removals++; await pending.promise })
  const first = h.run(), second = h.run(); assert.equal(removals, 1); pending.resolve(); await Promise.all([first, second]); assert.equal(a.calls.length, 1); assert.deepEqual(h.state.paths, ['/'])
})
for (const failure of ['result', 'throw']) await test('Push: ' + failure + ' conserva token y badge para reintento', async () => {
  let fail = true; const tokens = [], badges = []
  const client = load('lib/push/client.ts', { '@capawesome/capacitor-badge': { Badge: { isSupported: async () => ({ isSupported: true }), set: async x => badges.push(x.count) } }, '@capacitor/core': { Capacitor: { isNativePlatform: () => true } }, '@/app/actions/push': { eliminarDispositivoPush: async token => { tokens.push(token); if (fail) { if (failure === 'throw') throw Error('Network'); return { error: 'Servidor' } } return { success: true } } } }).value
  client.guardarTokenPushActual('synthetic-device'); await assert.rejects(client.desvincularPushActual()); assert.deepEqual(badges, [])
  fail = false; await client.desvincularPushActual(); await client.desvincularPushActual(); assert.deepEqual(tokens, ['synthetic-device', 'synthetic-device']); assert.ok(badges.every(x => x === 0))
})
await test('Push: renovación durante desvinculación elimina ambos tokens', async () => {
  const pending = deferred(), tokens = []; let client
  client = load('lib/push/client.ts', { '@capawesome/capacitor-badge': { Badge: {} }, '@capacitor/core': { Capacitor: { isNativePlatform: () => false } }, '@/app/actions/push': { eliminarDispositivoPush: async token => { tokens.push(token); if (token === 'old') await pending.promise; return { success: true } } } }).value
  client.guardarTokenPushActual('old'); const op = client.desvincularPushActual(); client.guardarTokenPushActual('new'); pending.resolve(); await op; assert.deepEqual(tokens, ['old', 'new'])
})
const jsx = (type, props) => ({ type, props })
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : []
function chatFixture() {
  const slots = [], effects = [], intervals = new Map(), toasts = [], sends = [], paths = [], windowListeners = new Map()
  let cursor = 0, dirty = false, tree, authChange, mounted = true, account = 'user-A', intervalId = 0
  const conv = id => ({ id, participante_1: account, participante_2: 'other-' + id, participante_otro: { nombre: 'Chat', apellido: id }, puede_escribir: true })
  let readMessages = async id => ({ data: [{ id: 'history-' + id, remitente_id: 'other', contenido: 'History ' + id, created_at: '2026-10-12T10:00:00Z' }] })
  let readList = async () => ({ data: [conv('A'), conv('B')] })
  let getUser = async () => ({ data: { user: { id: account } } })
  let send = async body => ({ data: { id: 'sent-' + body.conversacionId, remitente_id: account, contenido: body.contenido, created_at: '2026-10-12T11:00:00Z' } })
  let readReview = async () => ({ data: { id: 'job-A' } })
  let writeReview = async () => ({ success: true })
  let upload = async () => ({ ok: true, json: async () => ({ url: 'https://example.test/api/archivos/fixture', filename: 'test.pdf', type: 'application/pdf' }) })
  const hooks = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; dirty = true }] },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial } },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn() }) } },
  }
  const ui = new Proxy({ __esModule: true }, { get: (o, k) => k in o ? o[k] : String(k) })
  const deps = new Proxy({ react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useSearchParams: () => search, useRouter: () => router },
    '@/components/idioma-provider': { useT: () => t, useIdioma: () => ({ idioma: 'es' }) }, '@/lib/i18n': { localeDe: () => 'es-ES' },
    '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: () => getUser(), onAuthStateChange: cb => { authChange = cb; return { data: { subscription: { unsubscribe() {} } } } } } }) },
    '@/app/actions/messages': { obtenerConversaciones: () => readList(), obtenerMensajes: id => readMessages(id) },
    '@/app/actions/reviews': { obtenerTrabajoValorable: (...args) => readReview(...args), crearResena: (...args) => writeReview(...args) },
    '@/app/actions/trabajos': { obtenerTrabajosConUsuario: async () => ({ data: [] }) },
    '@/hooks/use-toast': { useToast: () => ({ toast: x => toasts.push(x) }) }, '@/lib/utils': { cn: () => '' },
  }, { has: () => true, get: (o, k) => k in o ? o[k] : ui })
  let search = new URLSearchParams()
  const router = { replace: p => paths.push(p), push: p => paths.push(p) }, t = x => x
  const runtime = load('components/mensajes-content.tsx', deps, { window: { dispatchEvent() {}, addEventListener: (event, fn) => windowListeners.set(event, fn), removeEventListener: event => windowListeners.delete(event) }, document: { visibilityState: 'visible' }, CustomEvent: class {},
    setInterval: (fn, ms) => { const id = ++intervalId; intervals.set(id, { fn, ms }); return id }, clearInterval: id => intervals.delete(id),
    fetch: async (url, opts) => { if (url === '/api/upload') return upload(opts); const body = JSON.parse(opts.body); sends.push(body); return { json: async () => send(body) } },
  }, src => src.replace('  const formatTime =', '  globalThis.__chat = { handleSendMessage, handleSelectConversation, handleFileChange, handleValorar, handleEnviarValoracion, reviewTrabajo, reviewSubmitting, cerrarConversacion, newMessage, borradores, sendingMessage, uploading, currentUserId, messages, conversations, selectedConversation, versionSesion, versionLectura };\n  const formatTime ='))
  const render = () => { if (!mounted) return; cursor = 0; dirty = false; tree = runtime.value.default({}); effects.splice(0).forEach(f => f()) }
  const flush = async () => { for (let i = 0; i < 16; i++) { await Promise.resolve(); if (dirty) render() } }
  const f = { sends, toasts, paths, get state() { return runtime.context.__chat }, async mount() { render(); await flush() }, flush,
    async select(id) { const p = f.state.handleSelectConversation(conv(id)); await flush(); return p },
    draft(text) { const input = walk(tree).find(n => n.type === 'Textarea' && n.props['aria-label'] === 'Escribe un mensaje'); assert.ok(input); input.props.onChange({ target: { value: text } }); render() },
    setReadReview(fn) { readReview = fn }, setWriteReview(fn) { writeReview = fn },
    setSend(fn) { send = fn }, setRead(fn) { readMessages = fn }, setList(fn) { readList = fn }, setGetUser(fn) { getUser = fn }, setUpload(fn) { upload = fn },
    navigate(query, { popstate = false } = {}) { if (popstate) windowListeners.get('popstate')?.(); const next = new URLSearchParams(query); if (next.toString() !== search.toString()) search = next; render() },
    changeUser(id) { account = id; authChange(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null) },
    poll(ms) { return [...intervals.values()].find(i => i.ms === ms)?.fn() },
    unmount() { mounted = false; slots.forEach(s => s?.cleanup?.()) },
  }; return f
}
await test('Chat: URL intermedia A no vence clic B iniciado desde URL sin conversación', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); f.draft('Borrador A')
  await f.select('B'); await f.flush(); f.draft('Borrador B')
  f.navigate('c=A'); await f.flush(); await f.poll(20000); await f.flush()
  assert.equal(f.state.selectedConversation.id, 'B'); assert.equal(f.state.newMessage, 'Borrador B')
  await f.state.handleSendMessage(); await f.flush()
  assert.equal(f.sends.at(-1).conversacionId, 'B'); assert.equal(f.sends.at(-1).contenido, 'Borrador B'); assert.equal(f.state.borradores.A, 'Borrador A')
  f.navigate('c=B'); await f.flush(); assert.equal(f.state.selectedConversation.id, 'B')
  f.navigate('c=A', { popstate: true }); await f.flush(); assert.equal(f.state.selectedConversation.id, 'A'); assert.equal(f.state.newMessage, 'Borrador A'); f.unmount()
})
await test('Chat: atrás durante navegación pendiente prima sobre el clic', async () => {
  const f = chatFixture(); await f.mount(); f.navigate('c=A'); await f.flush(); await f.select('B'); await f.flush()
  f.navigate('c=A', { popstate: true }); await f.flush(); assert.equal(f.state.selectedConversation.id, 'A'); f.unmount()
})
await test('Chat: atrás a URL vacía cierra e invalida lecturas sin perder borrador para adelante', async () => {
  const f = chatFixture(), old = deferred(); await f.mount(); f.navigate('c=A'); await f.flush(); f.draft('Borrador A')
  f.setRead(() => old.promise); const pending = f.poll(4000)
  f.navigate('', { popstate: true }); await f.flush(); assert.equal(f.state.selectedConversation, null); assert.equal(f.state.messages.length, 0)
  old.resolve({ data: [{ id: 'late-A', created_at: '2026-10-12' }] }); await pending; await f.flush()
  assert.equal(f.state.selectedConversation, null); assert.equal(f.state.messages.length, 0)
  f.setRead(async () => ({ data: [{ id: 'latest-A', created_at: '2026-10-12' }] }))
  f.navigate('c=A', { popstate: true }); await f.flush(); assert.equal(f.state.selectedConversation.id, 'A'); assert.equal(f.state.newMessage, 'Borrador A'); f.unmount()
})
await test('Chat: cerrar antes de confirmar URL intermedia mantiene el panel cerrado', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); f.state.cerrarConversacion(); await f.flush()
  f.navigate('c=A'); await f.flush(); await f.poll(20000); await f.flush(); assert.equal(f.state.selectedConversation, null)
  f.navigate(''); await f.flush(); f.navigate('c=A', { popstate: true }); await f.flush(); assert.equal(f.state.selectedConversation.id, 'A'); f.unmount()
})
await test('Chat: volver al destino URL actual cancela un clic intermedio pendiente', async () => {
  const f = chatFixture(); await f.mount(); f.navigate('c=A'); await f.flush(); await f.select('B'); await f.flush(); await f.select('A'); await f.flush()
  assert.equal(f.paths.at(-1), '/mensajes?c=A')
  f.navigate('c=B'); await f.flush(); assert.equal(f.state.selectedConversation.id, 'A')
  f.navigate('c=A'); await f.flush(); assert.equal(f.state.selectedConversation.id, 'A'); f.unmount()
})
for (const refresh of ['messages', 'conversation-list']) await test('Chat: URL anterior no reabre A mientras B carga por ' + refresh, async () => {
  const f = chatFixture(), readB = deferred()
  await f.mount(); f.navigate('c=A'); await f.flush(); f.draft('Borrador A')
  f.setRead(id => id === 'B' ? readB.promise : Promise.resolve({ data: [{ id: 'history-A', created_at: '2026-10-12' }] }))
  const pending = f.select('B'); await f.flush()
  assert.equal(f.state.selectedConversation.id, 'B'); assert.equal(f.state.newMessage, '')
  f.draft('Borrador B')
  if (refresh === 'conversation-list') { await f.poll(20000); await f.flush() }
  readB.resolve({ data: [{ id: 'history-B', created_at: '2026-10-12' }] }); await pending; await f.flush()
  assert.equal(f.state.selectedConversation.id, 'B'); assert.equal(f.state.newMessage, 'Borrador B')
  assert.equal(f.state.borradores.A, 'Borrador A'); assert.deepEqual(Array.from(f.state.messages, x => x.id), ['history-B'])
  f.navigate('c=B'); await f.flush(); assert.equal(f.state.selectedConversation.id, 'B')
  f.navigate('c=A'); await f.flush(); assert.equal(f.state.selectedConversation.id, 'A'); assert.equal(f.state.newMessage, 'Borrador A')
  f.navigate('c=B'); await f.flush(); assert.equal(f.state.selectedConversation.id, 'B'); assert.equal(f.state.newMessage, 'Borrador B'); f.unmount()
})
await test('Chat: cerrar mantiene panel vacío mientras URL anterior espera y lista refresca', async () => {
  const f = chatFixture(); await f.mount(); f.navigate('c=A'); await f.flush()
  f.state.cerrarConversacion(); await f.flush(); await f.poll(20000); await f.flush(); assert.equal(f.state.selectedConversation, null)
  f.navigate(''); await f.flush(); f.navigate('c=A'); await f.flush(); assert.equal(f.state.selectedConversation.id, 'A'); f.unmount()
})
await test('Chat: lectura A tardía no vence selección B con URL A pendiente', async () => {
  const f = chatFixture(), readA = deferred(); await f.mount()
  f.setRead(id => id === 'A' ? readA.promise : Promise.resolve({ data: [{ id: 'latest-B', created_at: '2026-10-12' }] }))
  f.navigate('c=A'); await f.flush(); await f.select('B'); await f.flush()
  readA.resolve({ data: [{ id: 'obsolete-A', created_at: '2026-10-12' }] }); await f.flush()
  assert.equal(f.state.selectedConversation.id, 'B'); assert.deepEqual(Array.from(f.state.messages, x => x.id), ['latest-B']); f.unmount()
})
await test('Chat: deep link espera lista y se reaplica tras cambio de sesión', async () => {
  const f = chatFixture(), list = deferred(); f.setList(() => list.promise); await f.mount(); f.navigate('c=A'); await f.flush()
  list.resolve({ data: [{ id: 'A', participante_1: 'user-A', participante_2: 'other-A', participante_otro: { nombre: 'A' } }] }); await f.flush()
  assert.equal(f.state.selectedConversation.id, 'A'); f.draft('Privado sesión A')
  f.changeUser('user-B'); await f.flush(); assert.equal(f.state.currentUserId, 'user-B'); assert.equal(f.state.selectedConversation.id, 'A'); assert.equal(f.state.newMessage, ''); f.unmount()
})
for (const kind of ['error', 'network']) await test('Chat: ' + kind + ' mantiene borrador y habilita reintento', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); f.draft('No perder'); f.setSend(async () => { if (kind === 'network') throw Error('Failed to fetch'); return { error: 'Servicio no disponible' } })
  await f.state.handleSendMessage(); await f.flush(); assert.equal(f.state.newMessage, 'No perder'); assert.equal(f.state.sendingMessage, false); assert.equal(f.toasts.length, 1)
  f.setSend(async () => ({ data: { id: 'retry', created_at: '2026-10-12', contenido: 'No perder' } })); await f.state.handleSendMessage(); await f.flush(); assert.equal(f.state.newMessage, ''); assert.ok(f.state.messages.some(m => m.id === 'retry')); f.unmount()
})
await test('Chat: respuesta de A respeta historial y borrador B, conserva borradores al navegar', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); f.draft('Texto A'); const p = deferred(); f.setSend(() => p.promise); const op = f.state.handleSendMessage(); await f.flush()
  await f.select('B'); await f.flush(); assert.equal(f.state.newMessage, ''); assert.equal(f.state.sendingMessage, false); f.draft('Texto B'); p.resolve({ data: { id: 'sent-A', created_at: '2026-10-12', contenido: 'Texto A' } }); await op; await f.flush()
  assert.equal(f.state.newMessage, 'Texto B'); assert.deepEqual(Array.from(f.state.messages, x => x.id), ['history-B']); assert.equal(f.state.borradores.A, ''); await f.select('A'); await f.flush(); assert.equal(f.state.newMessage, ''); await f.select('B'); await f.flush(); assert.equal(f.state.newMessage, 'Texto B'); f.unmount()
})
await test('Chat: doble envío se deduplica y respuesta no sobrescribe mensajes nuevos ni edición', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); f.draft('Original'); const p = deferred(); f.setSend(() => p.promise); const send = f.state.handleSendMessage; const op = send(); await send(); assert.equal(f.sends.length, 1); await f.flush(); f.draft('Edición posterior')
  f.setRead(async () => ({ data: [{ id: 'new-incoming', created_at: '2026-10-12', contenido: 'Nuevo' }, { id: 'sent-A', created_at: '2026-10-12', contenido: 'Original' }] })); await f.poll(4000); await f.flush(); p.resolve({ data: { id: 'sent-A', created_at: '2026-10-12', contenido: 'Original' } }); await op; await f.flush()
  assert.deepEqual(Array.from(f.state.messages, x => x.id), ['new-incoming', 'sent-A']); assert.equal(f.state.newMessage, 'Edición posterior'); f.unmount()
})
await test('Chat: lectura anterior al envío no elimina el mensaje confirmado', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); f.draft('Nuevo'); const pending = deferred(); f.setRead(() => pending.promise); const poll = f.poll(4000); await f.state.handleSendMessage(); await f.flush(); pending.resolve({ data: [{ id: 'old', created_at: '2026-10-12' }] }); await poll; await f.flush(); assert.ok(f.state.messages.some(x => x.id === 'sent-A')); f.unmount()
})
await test('Chat: selección A→B→A no acepta primera lectura A atrasada', async () => {
  const f = chatFixture(); await f.mount(); const old = deferred(); let calls = 0; f.setRead(async id => { if (id === 'A' && ++calls === 1) return old.promise; return { data: [{ id: 'latest-' + id, created_at: '2026-10-12' }] } })
  const first = f.select('A'); await f.flush(); await f.select('B'); await f.flush(); await f.select('A'); await f.flush(); old.resolve({ data: [{ id: 'obsolete-A', created_at: '2026-10-12' }] }); await first; await f.flush(); assert.deepEqual(Array.from(f.state.messages, x => x.id), ['latest-A']); f.unmount()
})
await test('Chat: cambio de cuenta elimina borradores y descarta envío de cuenta anterior', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); f.draft('Secreto A'); const old = deferred(); f.setSend(() => old.promise); const op = f.state.handleSendMessage(); f.changeUser('user-B'); await f.flush(); assert.equal(f.state.currentUserId, 'user-B'); assert.equal(f.state.selectedConversation, null); assert.equal(Object.keys(f.state.borradores).length, 0)
  await f.select('B'); await f.flush(); f.draft('Borrador nueva cuenta'); old.resolve({ data: { id: 'private-A', created_at: '2026-10-12' } }); await op; await f.flush(); assert.equal(f.state.newMessage, 'Borrador nueva cuenta'); assert.deepEqual(Array.from(f.state.messages, x => x.id), ['history-B']); f.unmount()
})
await test('Chat: lista inicial y sesión inicial retrasadas no recuperan cuenta anterior', async () => {
  const f = chatFixture(), auth = deferred(), list = deferred(); f.setGetUser(() => auth.promise); await f.mount(); f.setList(() => list.promise); f.changeUser('user-A'); await f.flush(); f.setList(async () => ({ data: [] })); f.changeUser('user-B'); await f.flush(); auth.resolve({ data: { user: { id: 'user-A' } } }); list.resolve({ data: [{ id: 'private-A' }] }); await f.flush(); assert.equal(f.state.currentUserId, 'user-B'); assert.equal(f.state.conversations.length, 0); f.unmount()
})
await test('Chat: adjunto A no aparece en B cuando termina envío', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); const upload = deferred(); f.setUpload(() => upload.promise); const op = f.state.handleFileChange({ target: { files: [new File(['pdf'], 'fixture.pdf')], value: 'fixture' } }); await f.select('B'); await f.flush(); upload.resolve({ ok: true, json: async () => ({ url: 'https://example.test/api/archivos/fixture', filename: 'fixture.pdf', type: 'application/pdf' }) }); await op; await f.flush(); assert.equal(f.sends[0].conversacionId, 'A'); assert.deepEqual(Array.from(f.state.messages, x => x.id), ['history-B']); assert.equal(f.state.uploading, false); f.unmount()
})
await test('Chat: adjunto iniciado antes de cambio de sesión no se envía por otra cuenta', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); const upload = deferred(); f.setUpload(() => upload.promise); const op = f.state.handleFileChange({ target: { files: [new File(['pdf'], 'fixture.pdf')], value: '' } }); f.changeUser('user-B'); await f.flush(); upload.resolve({ ok: true, json: async () => ({ url: 'https://example.test/fixture', filename: 'fixture.pdf' }) }); await op; await f.flush(); assert.equal(f.sends.length, 0); assert.equal(f.state.selectedConversation, null); f.unmount()
})
await test('Chat: cerrar sesión durante polling descarta mensajes y lista privadas', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); const m = deferred(), l = deferred(); f.setRead(() => m.promise); f.setList(() => l.promise); const a = f.poll(4000), b = f.poll(20000); f.changeUser(null); await f.flush(); m.resolve({ data: [{ id: 'private', created_at: '2026-10-12' }] }); l.resolve({ data: [{ id: 'private-conv' }] }); await Promise.all([a, b]); await f.flush(); assert.equal(f.state.messages.length, 0); assert.equal(f.state.conversations.length, 0); assert.equal(f.state.currentUserId, ''); f.unmount()
})
await test('Chat: lista inicial lenta no sustituye una actualización posterior de la misma cuenta', async () => {
  const f = chatFixture(), old = deferred(); f.setList(() => old.promise); await f.mount(); f.setList(async () => ({ data: [{ id: 'latest' }] })); await f.poll(20000); await f.flush(); old.resolve({ data: [{ id: 'obsolete' }] }); await f.flush(); assert.deepEqual(Array.from(f.state.conversations, x => x.id), ['latest']); f.unmount()
})
for (const change of ['conversation', 'session']) await test('Chat: valoración pendiente no abre diálogo después de cambiar ' + change, async () => {
  const f = chatFixture(), old = deferred(); await f.mount(); await f.select('A'); await f.flush(); f.setReadReview(() => old.promise); const op = f.state.handleValorar(); if (change === 'conversation') await f.select('B'); else f.changeUser('user-B'); await f.flush(); old.resolve({ data: { id: 'private-job-A' } }); await op; await f.flush(); assert.equal(f.state.reviewTrabajo, null); assert.equal(f.toasts.length, 0); f.unmount()
})
await test('Chat: fallo de red al valorar conserva diálogo y permite reintento', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); await f.state.handleValorar(); await f.flush(); f.setWriteReview(async () => { throw Error('Network') }); await f.state.handleEnviarValoracion(); await f.flush(); assert.equal(f.state.reviewSubmitting, false); assert.equal(f.state.reviewTrabajo.id, 'job-A'); assert.equal(f.toasts.length, 1); f.setWriteReview(async () => ({ success: true })); await f.state.handleEnviarValoracion(); await f.flush(); assert.equal(f.state.reviewTrabajo, null); f.unmount()
})
await test('Chat: valoración enviada por cuenta anterior no afecta a la cuenta actual', async () => {
  const f = chatFixture(), old = deferred(); await f.mount(); await f.select('A'); await f.flush(); await f.state.handleValorar(); await f.flush(); f.setWriteReview(() => old.promise); const op = f.state.handleEnviarValoracion(); await f.flush(); f.changeUser('user-B'); await f.flush(); old.resolve({ success: true }); await op; await f.flush(); assert.equal(f.state.reviewTrabajo, null); assert.equal(f.state.reviewSubmitting, false); assert.equal(f.toasts.length, 0); f.unmount()
})
await test('Chat: respuesta vacía al adjuntar informa error y habilita reintento', async () => {
  const f = chatFixture(); await f.mount(); await f.select('A'); await f.flush(); f.setSend(async () => ({})); await f.state.handleFileChange({ target: { files: [new File(['pdf'], 'fixture.pdf')], value: '' } }); await f.flush(); assert.equal(f.state.uploading, false); assert.equal(f.toasts.length, 1); f.unmount()
})
fs.writeFileSync(output + '/regression-results.json', JSON.stringify({ scope: 'Componentes/handlers y Supabase Auth SDK reales; React, storage y transporte controlados. No E2E, no red externa ni producción.', results }, null, 2))
console.log(JSON.stringify({ checks: results.length, pass: results.filter(x => x.status === 'pass').length, fail: results.filter(x => x.status === 'fail').length }))
process.exitCode = results.some(x => x.status === 'fail') ? 1 : 0
