// Server action validation, controlled Auth transport; not browser/E2E evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const calls = []
const supabase = { auth: { signUp: async x => { calls.push(x); return { data: { user: { id: 'synthetic' }, session: null }, error: null } } } }
const deps = { '@/lib/i18n-servidor': { textoServidor: async x => x, idiomaActual: async () => 'es' }, '@/lib/auth-redirect': { destinoAuthSeguro: (x, fallback) => typeof x === 'string' && /^\/(?!\/)/.test(x) ? x : fallback }, '@/lib/supabase/server': { createClient: async () => supabase }, 'next/headers': {}, 'next/navigation': {} }
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/actions/auth.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, require: name => { if (!(name in deps)) throw Error(name); return deps[name] }, process: { env: { NEXT_PUBLIC_SITE_URL: 'http://localhost:3200' } }, URL, Date, console })
const valid = { email: 'fixture@example.test', password: 'Valid!123', nombre: 'Persona', apellido: 'Prueba', tipoEntidad: 'particular', documento: '00000000T', aceptaTerminos: true, confirmaMayoriaEdad: true }
const cases = [null, {}, ...['nombre', 'apellido', 'documento'].flatMap(k => ['', ' ', null, 12, {}].map(value => ({ ...valid, [k]: value }))), ...['aceptaTerminos', 'confirmaMayoriaEdad'].flatMap(k => [false, 'false', 'true', 1, null].map(value => ({ ...valid, [k]: value }))), { ...valid, tipoEntidad: 'admin' }, { ...valid, email: 'wrong' }, { ...valid, email: {} }, { ...valid, password: '12345' }, { ...valid, password: 1234567 }, { ...valid, tipoEntidad: 'empresa', nombreEmpresa: 'Fixture', documentoPersonal: {} }, { ...valid, tipoEntidad: 'empresa', nombreEmpresa: {}, documentoPersonal: '00000000T' }]
let checks = 0
for (const input of cases) { const before = calls.length, result = await module.exports.registrarUsuario(input); assert.equal(typeof result.error, 'string'); assert.equal(calls.length, before, 'Invalid input must not reach Auth'); checks++ }
for (const tipoEntidad of ['particular', 'empresa']) { const result = await module.exports.registrarUsuario({ ...valid, tipoEntidad, nombre: ' Persona ', apellido: ' Prueba ', email: ' fixture@example.test ', documento: tipoEntidad === 'empresa' ? ' b00000000 ' : ' 00000000T ', documentoPersonal: ' 12345678Z ', nombreEmpresa: ' Empresa ', telefono: ' 600000000 ', ubicacion: ' Madrid ' }); assert.equal(result.data.success, true); const metadata = calls.at(-1).options.data; assert.equal(metadata.nombre, 'Persona'); assert.equal(metadata.documento, tipoEntidad === 'empresa' ? '12345678Z' : '00000000T'); assert.equal(metadata.telefono, '600000000'); assert.equal(metadata.ubicacion, 'Madrid'); if (tipoEntidad === 'empresa') assert.equal(metadata.registro_empresa.cif, 'B00000000'); checks++ }
console.log(JSON.stringify({ checks, pass: checks, fail: 0 }))
