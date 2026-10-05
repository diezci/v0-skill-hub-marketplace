import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const companyId = '50000000-0000-4000-8000-000000000001'
const payload = {
  empresa: { id: companyId, nombre: 'Empresa en revisión', razon_social: 'Razón social real', estado_verificacion: 'en_revision', verificada: false, provincias: ['Madrid', 'Toledo'], servicios: ['Fontanería'], cif: 'NO DEVOLVER' },
  miembros: [{ usuario_id: 'visible', nombre: 'Persona visible', cargo: 'Cargo público', tiene_perfil_profesional: true, email: 'NO DEVOLVER', permisos: { perfil: true } }],
  portfolio: [{ id: 'trabajo', titulo: 'Portfolio real', rango_precio: '100–250 €', participantes_ids: ['visible'] }],
  resenas: [{ id: 'resena', trabajo_id: 'trabajo', autor: 'Cliente', rating: 4, comentario: 'Valoración real', created_at: '2026-10-05' }],
  actividad: [{ detalle: 'NO DEVOLVER' }],
}

function harness() {
  let user = { id: 'current-actor' }
  let response = { data: payload, error: null }
  let available = true
  const calls = []
  const client = { auth: { getUser: async () => ({ data: { user } }) }, rpc: async (...args) => { calls.push(args); return response } }
  const module = { exports: {} }
  const js = ts.transpileModule(readFileSync(new URL('../lib/empresas/production-store.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', js)((name) => {
    if (name === 'server-only') return {}
    if (name === 'react') return { cache: fn => fn }
    if (name === '@/lib/supabase/server') return { createClient: async () => available ? client : null }
    throw new Error(`Dependencia inesperada: ${name}`)
  }, module, module.exports)
  return { api: module.exports, calls, setUser: value => { user = value }, setResponse: value => { response = value }, setAvailable: value => { available = value } }
}

test('preview requires a current authenticated user before executing any RPC', async () => {
  const h = harness()
  h.setUser(null)
  assert.equal((await h.api.vistaPreviaEmpresaReal()).codigo, 'NO_AUTENTICADO')
  assert.deepEqual(h.calls, [])
})

test('private preview uses the public adapter and preserves real verification, portfolio and reviews', async () => {
  const h = harness()
  const preview = await h.api.vistaPreviaEmpresaReal()
  assert.deepEqual(h.calls, [['empresa_perfil_vista_previa']])
  assert.equal(preview.data.empresa.estadoVerificacion, 'en_revision')
  assert.deepEqual(preview.data.empresa.provincias, ['Madrid', 'Toledo'])
  assert.deepEqual(preview.data, await h.api.empresaPublicaReal(companyId))
  assert.equal(preview.data.trabajos[0].rangoPrecio, '100–250 €')
  assert.equal(preview.data.resenas[0].puntuacion, 4)
  assert.equal(preview.data.miembros[0].tienePerfilProfesional, true)
  assert.doesNotMatch(JSON.stringify(preview.data), /NO DEVOLVER|actividad|permisos|email|nif|cif/)
})

test('preview distinguishes absent company and denied permission without returning a prior payload', async () => {
  const h = harness()
  assert.equal((await h.api.vistaPreviaEmpresaReal()).data.empresa.id, companyId)
  h.setResponse({ data: null, error: { code: '42501', message: 'SQL internal detail' } })
  const denied = await h.api.vistaPreviaEmpresaReal()
  assert.equal(denied.codigo, 'SIN_PERMISO')
  assert.equal(denied.data, undefined)
  assert.doesNotMatch(denied.error, /SQL internal/)
  h.setResponse({ data: null, error: null })
  assert.equal((await h.api.vistaPreviaEmpresaReal()).codigo, 'SIN_EMPRESA')
  assert.equal(h.calls.length, 3, 'Each request rechecks current database authorization')
})

test('preview fails closed on unavailable database and hides database failure details', async () => {
  const h = harness()
  h.setAvailable(false)
  assert.equal((await h.api.vistaPreviaEmpresaReal()).data, undefined)
  assert.deepEqual(h.calls, [])
  h.setAvailable(true)
  h.setResponse({ data: payload, error: { code: 'XX000', message: 'Private database details' } })
  const failed = await h.api.vistaPreviaEmpresaReal()
  assert.equal(failed.data, undefined)
  assert.doesNotMatch(failed.error, /Private database/)
})
