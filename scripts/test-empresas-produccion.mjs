import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const empresaId = '10000000-0000-4000-8000-000000000001'
const ownerId = '20000000-0000-4000-8000-000000000001'
const memberId = '20000000-0000-4000-8000-000000000002'
const sampleCompany = { id: empresaId, nombre: 'Empresa de prueba', descripcion: 'Equipo ficticio para pruebas', ubicacion: 'Madrid', servicios: ['Pintura'], sitio_web: 'https://example.com', logo: 'https://example.com/logo.png', verificada: false, propietario_id: ownerId, contacto_usuario_id: ownerId, cif: 'PRIVADO' }
const members = [{ usuario_id: ownerId, nombre: 'Ana', apellido: 'Ejemplo', cargo: 'Dirección', bio: 'Coordino los proyectos del equipo.', foto_perfil: 'https://example.com/ana.png', habilidades: ['Coordinación'], estado: 'activo', es_titular: true, rol: 'principal', perfil_publico: true, tiene_perfil_profesional: true, permisos: {perfil:true,mensajes:true,presupuestos:true,encargos:true,equipo:true,ver_cobros:true,gestionar_cobros:true} }, { usuario_id: memberId, nombre: 'Luis', apellido: 'Prueba', cargo: 'Pintor', bio: 'Especialista en acabados.', estado: 'activo', es_titular: false, rol: 'miembro', perfil_publico: true, tiene_perfil_profesional: true, permisos: {perfil:false,mensajes:true,presupuestos:true,encargos:true,equipo:false,ver_cobros:false,gestionar_cobros:false} }]
const workspace = { empresa: sampleCompany, miembros: members, invitaciones: [{ id: 'invitation', email: 'test@example.com', cargo: 'Pintor', estado: 'pendiente', created_at: '2026-09-01', expira_at: '2099-09-08' }], actividad: [{ id: 'activity', actor_usuario_id: memberId, actor_nombre: 'Luis Prueba', accion: 'Oferta actualizado', entidad_tipo: 'ofertas', entidad_id: 'offer', created_at: '2026-09-22T12:00:00Z', detalle: { solicitud_titulo: 'Pintar la cocina', precio: { antes: 100, despues: 120 } } }], es_titular: true, usuario_id: ownerId }
const defaults = { empresa_workspace: workspace, empresa_perfil_publico: { empresa: sampleCompany, miembros: members, portfolio: [{ id: 'portfolio', trabajo_id: 'work', titulo: 'Trabajo empresa', descripcion: 'Proyecto terminado', fecha_proyecto: '2026-09-01', participantes_ids: [memberId] }], resenas: [{ id: 'review', trabajo_id: 'work', autor: 'Cliente', rating: 5, comentario: 'Buen trabajo', created_at: '2026-09-22' }] }, empresas_publicas: [{ ...sampleCompany, miembros_count: 2 }], empresa_consultar_invitacion: { empresa_id: empresaId, empresa_nombre: sampleCompany.nombre, cargo: 'Pintor', estado: 'pendiente', expira_at: '2099-09-08', coincide_email: true }, empresa_afiliacion_publica: { empresa_id: empresaId, cargo: 'Pintor' } }

function loadModules(overrides = {}, ui = {}) {
  const cache = new Map()
  const responses = { ...defaults, ...overrides }
  const calls = []
  let user = { id: ownerId }
  const client = { auth: { getUser: async () => ({ data: { user } }) }, rpc: async (name, args) => { calls.push({ name, args }); return { data: responses[name] ?? null, error: null } } }
  function load(file) {
    const full = path.resolve(root, file)
    if (cache.has(full)) return cache.get(full).exports
    const module = { exports: {} }; cache.set(full, module)
    const source = readFileSync(full, 'utf8')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const customRequire = (name) => {
      if (name === 'server-only') return {}
      if (name === 'react' && ui.react) return { ...React, ...ui.react }
      if (name === '@/lib/supabase/server') return { createClient: async () => client }
      if (name === 'next/navigation') return { useRouter: () => ({ refresh() {}, push() {} }) }
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
      if (name === '@/components/idioma-provider') return { useIdioma: () => ({ idioma: 'es' }), useT: () => (s) => s }
      if (name.startsWith('@/app/actions/')) return new Proxy({}, { get: (_, action) => async (...args) => { ui.actions?.push({ action, args }); return { data: action === 'invitarMiembroEmpresa' ? { url: '/mi-empresa/invitaciones/prueba' } : undefined } } })
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(full), name)
        const resolved = [base, `${base}.ts`, `${base}.tsx`].find((v) => existsSync(v))
        if (!resolved) throw new Error(`Cannot resolve ${name}`)
        return load(resolved)
      }
      return require(name)
    }
    new Function('require', 'module', 'exports', js)(customRequire, module, module.exports)
    return module.exports
  }
  return { load, responses, calls, setUser: (u) => { user = u } }
}

test('public adapter keeps company, member summaries, contact, company work and reviews without private fields', async () => {
  const { load } = loadModules()
  const api = load('lib/empresas/production-store.ts')
  const result = await api.empresaPublicaReal(empresaId)
  assert.equal(result.local, false)
  assert.equal(result.contactoUsuarioId, ownerId)
  assert.equal(result.miembros[1].cargo, 'Pintor')
  assert.equal(result.miembros[0].fotoUrl, members[0].foto_perfil)
  assert.equal(result.trabajos[0].participantesIds[0], memberId)
  assert.equal(result.resenas[0].puntuacion, 5)
  for (const privateKey of ['nif', 'cif', 'email', 'permisos', 'propietario_id']) assert.equal(Object.hasOwn(result.empresa, privateKey), false, privateKey)
})

test('workspace derives titular privileges and retains real activity actor and exact change', async () => {
  const { load } = loadModules()
  const result = await load('lib/empresas/production-store.ts').espacioEmpresaReal()
  assert.equal(result.data.local, false)
  assert.equal(result.data.miembroActual.rol, 'principal')
  assert.equal(result.data.miembros[1].permisos.presupuestos, true)
  assert.equal(result.data.miembros[1].permisos.equipo, false)
  assert.equal(result.data.actividad[0].actorNombre, 'Luis Prueba')
  assert.deepEqual(result.data.actividad[0].detalle.precio, { antes: 100, despues: 120 })
})

test('workspace adapts cancellation side and the scoped dispute without adding personal fields', async () => {
  const incident = { id: 'dispute', estado: 'en_revision', motivo: 'Motivo compartido', resolucion: null, resultado: null }
  const { load } = loadModules({ empresa_workspace: { ...workspace, operaciones: { solicitudes: [], ofertas: [], trabajos: [{ id: 'work', titulo: 'Servicio empresa', estado: 'en_disputa', fecha: '2026-10-05', actor_usuario_id: memberId, actor_nombre: 'Luis', parte: 'proveedor', cancelacion_estado: 'pendiente', cancelacion_parte_solicitante: 'cliente', cancelacion_razon: 'Motivo compartido', disputa_actual: incident }] } } })
  const op = (await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data.operaciones.trabajos[0]
  assert.equal(op.cancelacionParteSolicitante, 'cliente')
  assert.equal(op.cancelacionEstado, 'pendiente')
  assert.equal(op.cancelacionRazon, 'Motivo compartido')
  assert.deepEqual(op.disputaActual, incident)
  assert.equal(Object.hasOwn(op, 'notas_privadas_proveedor'), false)
})

test('unauthenticated invite/workspace return login code and make no RPC call', async () => {
  const { load, setUser, calls } = loadModules()
  setUser(null)
  const api = load('lib/empresas/production-store.ts')
  assert.equal((await api.espacioEmpresaReal()).codigo, 'NO_AUTENTICADO')
  assert.equal((await api.invitacionEmpresaReal('a'.repeat(64))).codigo, 'NO_AUTENTICADO')
  assert.equal(calls.length, 0)
})

test('invite retains account-match status without exposing destination email and rejects malformed token', async () => {
  const { load, responses, calls } = loadModules()
  responses.empresa_consultar_invitacion = { ...defaults.empresa_consultar_invitacion, coincide_email: false }
  const api = load('lib/empresas/production-store.ts')
  const result = await api.invitacionEmpresaReal('a'.repeat(64))
  assert.equal(result.data.coincideEmail, false)
  assert.equal(result.data.invitacion.email, '')
  assert.equal(result.data.invitacion.cargo, 'Pintor')
  assert.equal(result.data.invitacion.empresaId, empresaId)
  const before = calls.length
  assert.ok((await api.invitacionEmpresaReal('invalid/token')).error)
  assert.equal(calls.length, before)
})

test('no membership opens creation flow, directory and affiliation use public RPC', async () => {
  const { load, responses } = loadModules()
  const api = load('lib/empresas/production-store.ts')
  responses.empresa_workspace = null
  assert.equal((await api.espacioEmpresaReal()).codigo, 'SIN_EMPRESA')
  assert.equal((await api.empresasPublicasReales())[0].miembrosCount, 2)
  assert.equal((await api.empleadoEmpresaReal(memberId)).perfil.cargo, 'Pintor')
})

function workspaceHarness(load, espacio, component = "EmpresaWorkspaceReal") {
  let cursor = 0
  const state = []
  const tasks = []
  const actions = []
  const runtime = loadModules({}, { actions, react: {
    useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
    },
    useTransition: () => [false, callback => { tasks.push(callback()) }],
  } })
  const componentFile = { OperacionesEmpresa: 'operaciones-empresa', EmpresaWorkspaceReal: 'empresa-workspace-real', IncidenciasTrabajoEmpresa: 'incidencias-trabajo-empresa' }[component]
  const Component = runtime.load(`components/empresas/${componentFile}.tsx`)[component]
  function elements(node, predicate, found = []) {
    if (node == null || typeof node !== 'object') return found
    if (Array.isArray(node)) { node.forEach(child => elements(child, predicate, found)); return found }
    if (predicate(node)) found.push(node)
    elements(node.props?.children, predicate, found)
    return found
  }
  function text(node) {
    if (node == null || typeof node === 'boolean') return ''
    if (Array.isArray(node)) return node.map(text).join(' ')
    if (typeof node === 'object') return text(node.props?.children)
    return String(node)
  }
  return {
    actions,
    render() { cursor = 0; return Component(component === 'IncidenciasTrabajoEmpresa' ? espacio : { espacio }) },
    all: elements, text,
    byId(tree, id) { return elements(tree, n => n.props?.id === id)[0] },
    button(tree, label) { return elements(tree, n => typeof n.props?.onClick === 'function' && text(n).trim() === label)[0] },
    async settle() { await Promise.all(tasks.splice(0)) },
  }
}

test('real owner can invite an administrator with explicit permissions and optional public visibility', async () => {
  const { load } = loadModules()
  const espacio = (await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data
  const h = workspaceHarness(load, espacio)
  let tree = h.render()
  assert.ok(h.button(tree, 'Invitar miembro'))
  assert.doesNotMatch(h.text(tree), /Aprobar en local|elena@empresa.example/)
  h.button(tree, 'Invitar miembro').props.onClick()
  tree = h.render()
  const role = h.byId(tree, 'miembro-rol')
  assert.match(h.text(role), /Administrador de la cuenta/)
  role.props.onChange({ target: { value: 'administrador' } })
  h.byId(tree, 'miembro-email').props.onChange({ target: { value: 'admin@example.com' } })
  h.byId(tree, 'miembro-cargo').props.onChange({ target: { value: 'Gestión de proyectos' } })
  const permissions = h.all(tree, n => n.props?.permisos && typeof n.props?.onChange === 'function')[0]
  permissions.props.onChange({ ...espacio.miembroActual.permisos, gestionar_cobros: false })
  const visibility = h.all(tree, n => typeof n.props?.onCheckedChange === 'function')[0]
  assert.equal(visibility.props.checked, false)
  visibility.props.onCheckedChange(true)
  tree = h.render()
  const form = h.all(tree, n => n.type === 'form' && h.byId(n, 'miembro-email'))[0]
  const previousWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://diime.example' } }
  try { form.props.onSubmit({ preventDefault() {} }); await h.settle() } finally { globalThis.window = previousWindow }
  const invitation = h.actions.find(c => c.action === 'invitarMiembroEmpresa')
  assert.equal(invitation.args[0].rol, 'administrador')
  assert.equal(invitation.args[0].perfilPublico, true)
  assert.equal(invitation.args[0].permisos.equipo, true)
  assert.equal(invitation.args[0].permisos.gestionar_cobros, false)
})

test('ordinary member cannot invite or manage others; administrator cannot grant the admin role', async () => {
  const { load } = loadModules()
  const espacio = (await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data
  const member = { ...espacio.miembros[1], rol: 'miembro', permisos: { ...espacio.miembros[1].permisos, equipo: false } }
  const memberSpace = { ...espacio, actor: { ...espacio.actor, id: member.usuarioId }, miembroActual: member }
  const employee = workspaceHarness(load, memberSpace)
  const employeeTree = employee.render()
  assert.equal(employee.button(employeeTree, 'Invitar miembro'), undefined)
  assert.equal(employee.button(employeeTree, 'Gestionar miembro'), undefined)
  const admin = { ...member, rol: 'administrador', permisos: { ...member.permisos, equipo: true } }
  const manager = workspaceHarness(load, { ...memberSpace, miembroActual: admin })
  let tree = manager.render()
  manager.button(tree, 'Invitar miembro').props.onClick()
  tree = manager.render()
  assert.doesNotMatch(manager.text(manager.byId(tree, 'miembro-rol')), /Administrador de la cuenta|Responsable principal/)
  const permissions = manager.all(tree, n => n.props?.permisos && typeof n.props?.onChange === 'function')[0]
  assert.deepEqual(permissions.props.limites, admin.permisos)
})

test('company operations filter by original actor or current operator and reserve payment controls for permitted clients', async () => {
  const { load } = loadModules()
  const espacio = (await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data
  const own = { id: 'job-client', trabajoId: 'job-client', titulo: 'Oficina terminada', descripcion: 'Reparación terminada', estado: 'entregado', fecha: '2026-10-05', actorUsuarioId: ownerId, actorNombre: 'Ana Ejemplo', operadorUsuarioId: ownerId, operadorNombre: 'Ana Ejemplo', precio: 300, parte: 'cliente' }
  const provided = { ...own, id: 'job-provider', trabajoId: 'job-provider', titulo: 'Pintar cocina', parte: 'proveedor', actorUsuarioId: memberId, actorNombre: 'Luis Prueba', operadorUsuarioId: memberId, operadorNombre: 'Luis Prueba', estado: 'en_progreso' }
  const actual = { ...espacio, operaciones: { solicitudes: [], ofertas: [], trabajos: [own, provided] } }
  const owner = workspaceHarness(load, actual, 'OperacionesEmpresa')
  let tree = owner.render()
  assert.equal(owner.all(tree, n => n.props?.trabajoId && n.props?.estado === 'entregado' && typeof n.props?.precio === 'number').length, 1)
  assert.ok(owner.button(tree, 'Actualizar trabajo'))
  owner.byId(tree, 'operacion-persona').props.onChange({ target: { value: memberId } })
  tree = owner.render()
  assert.match(owner.text(tree), /Pintar cocina/)
  assert.doesNotMatch(owner.text(tree), /Oficina terminada/)
  const reader = { ...actual.miembroActual, permisos: { ...actual.miembroActual.permisos, gestionar_cobros: false, encargos: false } }
  const readonly = workspaceHarness(load, { ...actual, miembroActual: reader }, 'OperacionesEmpresa')
  tree = readonly.render()
  assert.equal(readonly.all(tree, n => n.props?.trabajoId && n.props?.estado === 'entregado' && typeof n.props?.precio === 'number').length, 0)
  assert.equal(readonly.button(tree, 'Actualizar trabajo'), undefined)
  assert.equal(readonly.button(tree, 'Cambiar responsable'), undefined)
})

test('delegated company incidents require job permission and preserve the requesting contractual side', async () => {
  const { load } = loadModules()
  const base = { trabajoId: 'job', titulo: 'Servicio de empresa', estado: 'en_progreso', parte: 'cliente', puedeGestionar: true, puedeAceptarCancelacion: false }
  const delegate = workspaceHarness(load, base, 'IncidenciasTrabajoEmpresa')
  let tree = delegate.render()
  assert.ok(delegate.button(tree, 'Solicitar cancelación'))
  delegate.button(tree, 'Solicitar cancelación').props.onClick()
  tree = delegate.render()
  delegate.byId(tree, 'incidencia-razon-job').props.onChange({ target: { value: 'No se puede acceder al inmueble' } })
  tree = delegate.render()
  delegate.all(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  await delegate.settle()
  assert.deepEqual(delegate.actions.find(c => c.action === 'solicitarCancelacion').args, ['job', 'No se puede acceder al inmueble'])
  const ownRequest = workspaceHarness(load, { ...base, cancelacionEstado: 'pendiente', cancelacionParteSolicitante: 'cliente', puedeAceptarCancelacion: true }, 'IncidenciasTrabajoEmpresa')
  tree = ownRequest.render()
  assert.equal(ownRequest.button(tree, 'Aceptar cancelación'), undefined)
  assert.equal(ownRequest.button(tree, 'Rechazar cancelación'), undefined)
  const otherRequest = workspaceHarness(load, { ...base, cancelacionEstado: 'pendiente', cancelacionParteSolicitante: 'proveedor' }, 'IncidenciasTrabajoEmpresa')
  tree = otherRequest.render()
  assert.equal(otherRequest.button(tree, 'Aceptar cancelación'), undefined)
  assert.ok(otherRequest.button(tree, 'Rechazar cancelación'))
  const finance = workspaceHarness(load, { ...base, cancelacionEstado: 'pendiente', cancelacionParteSolicitante: 'proveedor', puedeAceptarCancelacion: true }, 'IncidenciasTrabajoEmpresa')
  tree = finance.render()
  finance.button(tree, 'Aceptar cancelación').props.onClick()
  assert.equal(finance.actions.length, 0, 'opening confirmation must not cancel the job')
  tree = finance.render()
  finance.all(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  await finance.settle()
  assert.deepEqual(finance.actions.find(c => c.action === 'responderCancelacion').args, ['job', true, ''])
  const readonly = workspaceHarness(load, { ...base, puedeGestionar: false, puedeAceptarCancelacion: true }, 'IncidenciasTrabajoEmpresa')
  assert.equal(readonly.render(), null)
})

test('delivery rejection is only offered to the client and invokes the dispute action with its reason', async () => {
  const { load } = loadModules()
  const base = { trabajoId: 'delivered', titulo: 'Trabajo entregado', estado: 'entregado', parte: 'cliente', puedeGestionar: true, puedeAceptarCancelacion: false }
  const client = workspaceHarness(load, base, 'IncidenciasTrabajoEmpresa')
  let tree = client.render()
  assert.equal(client.button(tree, 'Solicitar cancelación'), undefined)
  client.button(tree, 'Rechazar entrega').props.onClick()
  tree = client.render()
  client.byId(tree, 'incidencia-razon-delivered').props.onChange({ target: { value: 'Faltan los remates acordados' } })
  tree = client.render()
  client.all(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  await client.settle()
  assert.deepEqual(client.actions.find(c => c.action === 'rechazarEntrega').args, ['delivered', 'Faltan los remates acordados'])
  const provider = workspaceHarness(load, { ...base, parte: 'proveedor' }, 'IncidenciasTrabajoEmpresa')
  assert.equal(provider.button(provider.render(), 'Rechazar entrega'), undefined)
})

if (process.env.EMPRESA_RPC_FIXTURES) {
  test('adapter accepts actual migration RPC responses from the disposable database fixture', async () => {
    const fixtures = JSON.parse(readFileSync(process.env.EMPRESA_RPC_FIXTURES, 'utf8'))
    const { load } = loadModules(fixtures)
    const api = load('lib/empresas/production-store.ts')
    const workspace = await api.espacioEmpresaReal()
    assert.ok(workspace.data, workspace.error)
    assert.equal(workspace.data.empresa.id, fixtures.empresa_workspace.empresa.id)
    assert.equal(workspace.data.miembros.length, fixtures.empresa_workspace.miembros.length)
    const publicResult = await api.empresaPublicaReal(fixtures.empresa_perfil_publico.empresa.id)
    assert.ok(publicResult)
    assert.equal(publicResult.local, false)
    assert.equal(publicResult.miembros.length, fixtures.empresa_perfil_publico.miembros.length)
    const companies = await api.empresasPublicasReales()
    assert.equal(companies.length, fixtures.empresas_publicas.length)
  })
}
