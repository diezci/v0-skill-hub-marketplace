import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Compile the dependency-free translation modules without relying on Next aliases.
const require = createRequire(import.meta.url)
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  })
  module._compile(outputText, filename)
}
const { traducir, detectarIdioma, INGLES, localeDe } = require('../lib/i18n.ts')
const { TAXONOMIA_SERVICIOS } = require('../lib/categorias.ts')
const { formatearPrecioEuros, formatearRangoPresupuesto, formatearTramoPortfolio } = require('../lib/utils.ts')
const { formatearPrecio } = require('../lib/comisiones.ts')

assert.equal(detectarIdioma('en-US,en;q=0.9,es;q=0.8'), 'en')
assert.equal(detectarIdioma('fr,es;q=0.9,en;q=0.7'), 'es')
assert.equal(detectarIdioma('en;q=0,es;q=0.5'), 'es')
assert.equal(detectarIdioma('de'), 'es')
assert.equal(detectarIdioma(null), 'es')
assert.equal(localeDe('en'), 'en-GB')
assert.equal(traducir('en', 'nav.entrar'), 'Sign in')
assert.equal(traducir('es', 'nav.entrar'), 'Iniciar sesión')
assert.equal(traducir('en', 'Abrir menú, {count} avisos pendientes', { count: 7 }), 'Open menu, 7 unread notifications')
assert.equal(traducir('en', 'A user’s original title'), 'A user’s original title')
assert.equal(traducir('en', 'El cliente necesita el trabajo: {plazo}', { plazo: '$& {count}' }), 'The client needs the work: $& {count}')
assert.equal(formatearPrecioEuros(1234.5, 'en'), '€1,234.50')
assert.equal(formatearPrecioEuros(1234.5, 'es'), '1234,50€')
assert.equal(formatearPrecio(12, 'en'), '€12')
assert.equal(formatearRangoPresupuesto(null, 500, 'en'), 'Up to €500')
assert.equal(formatearRangoPresupuesto(null, null, 'en'), 'To be agreed')
assert.equal(formatearTramoPortfolio(10, 'en'), 'Over €100,000')

let taxonomyCount = 0
for (const cat of TAXONOMIA_SERVICIOS) {
  for (const text of [cat.nombre, ...cat.bloques.flatMap(b => [b.nombre, ...b.subcategorias.flatMap(s => [s.nombre, s.detalle])])]) {
    if (!text) continue
    assert.ok(INGLES[text], `Missing category translation: ${text}`)
    taxonomyCount++
  }
}
const placeholders = text => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1]).sort()
for (const [key, text] of Object.entries(INGLES)) {
  assert.ok(text.trim(), `Empty translation: ${key}`)
  assert.deepEqual(placeholders(text), placeholders(key), `Translation changes placeholders: ${key}`)
}
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
let keyCount = 0
const missing = new Set()
for (const file of [...walk('components'), ...walk('app')].filter(f => /\.[jt]sx?$/.test(f))) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = n => {
    if (ts.isCallExpression(n) && ['t', 'traducir'].includes(n.expression.getText(ast)) && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const key = n.arguments[0].text
      if (!INGLES[key]) missing.add(`${file}: ${key}`)
      keyCount++
    }
    ts.forEachChild(n, visit)
  }
  visit(ast)
}
assert.deepEqual([...missing], [], 'Missing English keys used by the interface')
console.log(`i18n OK: ${Object.keys(INGLES).length} English translations, ${keyCount} UI references, ${taxonomyCount} taxonomy labels; locale, amounts and interpolation passed.`)

// Exercise the actual component render/handlers with isolated hooks. No network,
// storage or payment calls run: these regressions concern display vs form values.
const { runInNewContext } = await import('node:vm')
function componentHarness(file, exportName = 'default') {
  let idioma = 'es'
  let cursor = 0
  const state = []
  const effects = []
  const jsx = require('react/jsx-runtime')
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
    },
    useEffect() { cursor++ },
    useRef(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = { current: initial }
      return state[index]
    },
    useMemo(fn, dependencies) {
      const index = cursor++
      const previous = effects[index]
      if (!previous || dependencies.some((dep, i) => dep !== previous.dependencies[i])) {
        effects[index] = { value: fn(), dependencies }
      }
      return effects[index].value
    },
    useCallback(fn) { cursor++; return fn },
  }
  let t = (key, params) => traducir(idioma, key, params)
  const ui = new Proxy({ __esModule: true }, { get: (target, name) => name in target ? target[name] : String(name) })
  const localRequire = name => {
    if (name === 'react') return hooks
    if (name === 'react/jsx-runtime') return jsx
    if (name === '@/components/idioma-provider') return { useT: () => t, useIdioma: () => ({ idioma, t }) }
    if (name === '@/lib/i18n') return require('../lib/i18n.ts')
    if (name === '@/lib/utils') return require('../lib/utils.ts')
    if (name === '@/lib/comisiones') return require('../lib/comisiones.ts')
    if (name === '@/lib/categorias') return require('../lib/categorias.ts')
    if (name === '@/lib/provincias') return { PROVINCIAS_ES: ['Madrid', 'Barcelona'] }
    if (name === '@/lib/precios') return { PRECIO_MAX: 100000 }
    if (name === '@/hooks/use-toast') return { useToast: () => ({ toast() {} }), toast() {} }
    if (name === 'next/navigation') return { useRouter: () => ({ push() {}, refresh() {} }), useSearchParams: () => new URLSearchParams() }
    if (name === '@/hooks/use-notificaciones-seccion') return { useNotificacionesSeccion: () => ({ pendientes: [], paraEntidad: () => [], marcarLeidas: async () => ({ success: true }) }) }
    return ui
  }
  const module = { exports: {} }
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  })
  runInNewContext(outputText, { module, exports: module.exports, require: localRequire, console, Date, Intl, URLSearchParams })
  return {
    render(props = {}) { cursor = 0; return module.exports[exportName](props) },
    seedState(index, value) { state[index] = value },
    language(value) { idioma = value; t = (key, params) => traducir(idioma, key, params) },
  }
}
const elements = root => {
  if (Array.isArray(root)) return root.flatMap(elements)
  if (!root || typeof root !== 'object' || !root.props) return []
  return [root, ...elements(root.props.children)]
}
const nodeText = node => Array.isArray(node) ? node.map(nodeText).join('')
  : node && typeof node === 'object' ? nodeText(node.props?.children)
  : typeof node === 'string' || typeof node === 'number' ? String(node) : ''

const requests = componentHarness('components/demandas-servicios.tsx')
let requestTree = requests.render()
const filterToggle = elements(requestTree).find(node => node.type === 'Button' && nodeText(node).trim() === 'Filtros')
assert.ok(filterToggle, 'The mobile filter toggle must render')
filterToggle.props.onClick()
for (const language of ['en', 'es']) {
  requests.language(language)
  requestTree = requests.render()
  const locationOptions = elements(requestTree).filter(node => node.type === 'SelectItem' && ['Toda España', 'All Spain'].includes(node.props.value))
  assert.equal(locationOptions.length, 2, 'Both desktop and mobile location filters render')
  for (const option of locationOptions) {
    assert.equal(option.props.value, 'Toda España', 'Translated labels must never change the location sentinel')
    assert.equal(nodeText(option), language === 'en' ? 'All Spain' : 'Toda España')
  }
}

const categoryPicker = componentHarness('components/selector-categorias-agrupado.tsx', 'SelectorCategoriasAgrupado')
categoryPicker.language('en')
let selected = []
const categoryTree = categoryPicker.render({ seleccionadas: [], multiple: false, onChange: values => { selected = values } })
const canonicalCategory = TAXONOMIA_SERVICIOS[0].bloques[0].subcategorias[0].nombre
const categoryButton = elements(categoryTree).find(node => node.type === 'button' && nodeText(node).trim() === traducir('en', canonicalCategory))
assert.ok(categoryButton, 'The translated service option must render')
categoryButton.props.onClick()
assert.equal(selected[0], canonicalCategory, 'Selecting an English category must submit the canonical source value')

const login = componentHarness('app/auth/login/page.tsx')
login.language('en')
let loginTree = login.render()
elements(loginTree).find(node => node.props.id === 'email').props.onChange({ target: { value: 'client@example.com' } })
elements(loginTree).find(node => node.props.id === 'password').props.onChange({ target: { value: 'short' } })
loginTree = login.render()
elements(loginTree).find(node => node.props.id === 'password').props.onBlur()
assert.ok(nodeText(login.render()).includes(traducir('en', 'La contraseña debe tener al menos 6 caracteres')))
login.language('es')
loginTree = login.render()
assert.equal(elements(loginTree).find(node => node.props.id === 'email').props.value, 'client@example.com')
assert.equal(elements(loginTree).find(node => node.props.id === 'password').props.value, 'short')
assert.ok(nodeText(loginTree).includes('La contraseña debe tener al menos 6 caracteres'), 'Existing validation changes language without clearing form input')
console.log('i18n state OK: desktop/mobile filter values, category submission and form/validation preservation across language changes.')

// A translated search term must be reconsidered when only the language changes.
const listing = componentHarness('components/gig-listing.tsx')
listing.seedState(2, [{
  id: 'i18n-search-fixture', title: 'Javier', description: '', category: 'Fontanería',
  habilidades: [], provincia: 'Madrid', price: 50, rating: 0, reviews: 0, image: '',
  freelancer: { name: 'Javier', avatar: '', level: 'Profesional' },
}])
const searchFilters = { categorias: [], provincia: '', precioMin: 0, precioMax: 100000, search: 'plumbing' }
let listingTree = listing.render({ filtros: searchFilters })
assert.equal(elements(listingTree).filter(node => node.props.href === '/profesional/i18n-search-fixture').length, 0)
listing.language('en')
listingTree = listing.render({ filtros: searchFilters })
assert.equal(elements(listingTree).filter(node => node.props.href === '/profesional/i18n-search-fixture').length, 1, 'Translated search results update after switching language without resetting the filters')
console.log('i18n search OK: memoized professional search responds to language changes.')

// Run the actual provider with controllable server-action promises. Simulated
// Set-Cookie responses intentionally arrive after a newer client selection.
function languageProviderHarness({ cookie = 'es', account = 'es', server = cookie || 'es' } = {}) {
  let cursor = 0
  let dirty = true
  let languageCookie = cookie
  let accountLanguage = account
  let serverLanguage = server
  let output
  let refreshes = 0
  const slots = []
  const effectSlots = []
  let scheduledEffects = []
  const saves = []
  const document = {
    documentElement: { lang: cookie },
    get cookie() { return languageCookie ? `diime_idioma=${languageCookie}` : '' },
    set cookie(value) { languageCookie = value.split(';')[0].split('=')[1] },
  }
  const sameDependencies = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const hooks = {
    createContext(value) { return { Provider: 'LanguageProvider', value } },
    useContext(context) { return context.value },
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => {
        const next = typeof value === 'function' ? value(slots[index]) : value
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true }
      }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useCallback(fn, dependencies) {
      const index = cursor++
      if (!slots[index] || !sameDependencies(slots[index].dependencies, dependencies)) slots[index] = { fn, dependencies }
      return slots[index].fn
    },
    useEffect(fn, dependencies) {
      const index = cursor++
      if (!sameDependencies(effectSlots[index]?.dependencies, dependencies)) scheduledEffects.push({ index, fn, dependencies })
    },
  }
  const router = { refresh() { refreshes++ } }
  const supabase = { auth: {
    async getUser() { return { data: { user: { user_metadata: { idioma: accountLanguage } } } } },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } } },
  } }
  const guardarIdioma = idioma => new Promise((resolve, reject) => {
    saves.push({ idioma,
      complete() { accountLanguage = idioma; document.cookie = `diime_idioma=${idioma}`; resolve({ guardado: true }) },
      reject,
    })
  })
  const localRequire = name => {
    if (name === 'react') return hooks
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
    if (name === 'next/navigation') return { useRouter: () => router }
    if (name === '@/lib/i18n') return require('../lib/i18n.ts')
    if (name === '@/lib/supabase/client') return { createClient: () => supabase }
    if (name === '@/app/actions/idioma') return { guardarIdioma }
    throw new Error(`Unexpected provider dependency: ${name}`)
  }
  const module = { exports: {} }
  const { outputText } = ts.transpileModule(fs.readFileSync('components/idioma-provider.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  })
  runInNewContext(outputText, { module, exports: module.exports, require: localRequire, document, navigator: {}, console, queueMicrotask })
  const render = (server = serverLanguage) => {
    serverLanguage = server
    for (let pass = 0; pass < 20; pass++) {
      dirty = false
      cursor = 0
      scheduledEffects = []
      output = module.exports.IdiomaProvider({ idioma: serverLanguage, children: 'preserved-child' })
      for (const { index, fn, dependencies } of scheduledEffects) {
        effectSlots[index]?.cleanup?.()
        effectSlots[index] = { dependencies, cleanup: fn() }
      }
      if (!dirty) return output.props.value
    }
    throw new Error('Provider did not settle after 20 renders')
  }
  return {
    render,
    async settle() { for (let i = 0; i < 16; i++) await Promise.resolve(); return render() },
    select(language) { render().cambiarIdioma(language); return render() },
    saves,
    get cookie() { return languageCookie },
    get account() { return accountLanguage },
    get refreshes() { return refreshes },
    get documentLanguage() { return document.documentElement.lang },
  }
}

const rapidLanguage = languageProviderHarness()
rapidLanguage.render()
await rapidLanguage.settle()
rapidLanguage.select('en')
rapidLanguage.select('es')
await rapidLanguage.settle()
assert.deepEqual(rapidLanguage.saves.map(save => save.idioma), ['es'], 'A superseded queued language save must be skipped')
rapidLanguage.saves[0].complete()
await rapidLanguage.settle()
assert.equal(rapidLanguage.render().idioma, 'es')
assert.equal(rapidLanguage.cookie, 'es')
assert.equal(rapidLanguage.account, 'es')

const delayedLanguage = languageProviderHarness()
delayedLanguage.render()
await delayedLanguage.settle()
delayedLanguage.select('en')
await delayedLanguage.settle()
assert.equal(delayedLanguage.saves[0].idioma, 'en')
assert.equal(delayedLanguage.select('es').idioma, 'es', 'The latest language is displayed immediately')
assert.equal(delayedLanguage.render('en').idioma, 'es', 'A stale server render cannot override a pending newer selection')
delayedLanguage.saves[0].complete()
await delayedLanguage.settle()
assert.equal(delayedLanguage.cookie, 'es', 'The latest client cookie is restored after an older Set-Cookie response')
assert.equal(delayedLanguage.render().idioma, 'es')
assert.deepEqual(delayedLanguage.saves.map(save => save.idioma), ['en', 'es'])
assert.equal(delayedLanguage.refreshes, 0, 'Only the latest completed save may refresh the server tree')
delayedLanguage.saves[1].complete()
await delayedLanguage.settle()
assert.equal(delayedLanguage.cookie, 'es')
assert.equal(delayedLanguage.account, 'es', 'An older save cannot win the final account language')
assert.equal(delayedLanguage.documentLanguage, 'es')
assert.equal(delayedLanguage.refreshes, 1)
delayedLanguage.render('es')
assert.equal(delayedLanguage.render('en').idioma, 'es', 'A late server prop must agree with the latest cookie before it can change the displayed language')
console.log('i18n provider OK: rapid switching, out-of-date server props and delayed Set-Cookie responses preserve the latest choice.')

// Account-preference reconciliation is also a save: if it started before an
// explicit selection, its late response must not replace that explicit choice.
const reconciliationRace = languageProviderHarness({ cookie: 'es', account: 'en' })
reconciliationRace.render()
await reconciliationRace.settle()
assert.equal(reconciliationRace.saves[0].idioma, 'es')
reconciliationRace.select('en')
await reconciliationRace.settle()
const explicitLanguageSave = reconciliationRace.saves.findLast(save => save.idioma === 'en')
if (explicitLanguageSave) {
  // Concurrent implementations can finish the newer save first.
  explicitLanguageSave.complete()
  await reconciliationRace.settle()
}
reconciliationRace.saves[0].complete()
await reconciliationRace.settle()
// Serialized implementations begin the latest explicit save after reconciliation.
for (const save of reconciliationRace.saves.filter(save => save.idioma === 'en' && save !== explicitLanguageSave)) save.complete()
await reconciliationRace.settle()
assert.equal(reconciliationRace.render().idioma, 'en')
assert.equal(reconciliationRace.cookie, 'en', 'A late account-reconciliation response must not overwrite a newer explicit language cookie')
assert.equal(reconciliationRace.account, 'en', 'An automatic reconciliation must not win over the latest explicit account preference')
console.log('i18n reconciliation OK: automatic account sync cannot overwrite a newer explicit choice.')

const restoredAccountLanguage = languageProviderHarness({ cookie: '', account: 'en' })
restoredAccountLanguage.render()
await restoredAccountLanguage.settle()
assert.equal(restoredAccountLanguage.render().idioma, 'en', 'A new device restores the account language when no local cookie exists')
assert.equal(restoredAccountLanguage.cookie, 'en')
assert.equal(restoredAccountLanguage.saves.length, 0, 'Restoring an account preference does not overwrite it')

const interruptedRestoration = languageProviderHarness({ cookie: '', account: 'en' })
interruptedRestoration.render()
interruptedRestoration.select('es')
await interruptedRestoration.settle()
assert.equal(interruptedRestoration.render().idioma, 'es', 'A late account lookup cannot replace a newer explicit choice')
assert.equal(interruptedRestoration.saves.length, 1)
interruptedRestoration.saves[0].complete()
await interruptedRestoration.settle()
assert.equal(interruptedRestoration.cookie, 'es')
assert.equal(interruptedRestoration.account, 'es')
console.log('i18n restoration OK: account preference restores on new devices while explicit choices take precedence.')
