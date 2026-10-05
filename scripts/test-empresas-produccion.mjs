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
      if (ui.mockModules && Object.hasOwn(ui.mockModules, name)) return ui.mockModules[name]
      if (name === 'server-only') return {}
      if (name === 'react' && ui.react) return { ...React, ...ui.react }
      if (name === '@/lib/supabase/server') return { createClient: async () => client }
      if (name === '@/lib/empresas/service') return { esEmpresasLocal: () => false }
      if (name === 'next/cache') return { revalidatePath() {} }
      if (name === 'next/navigation') return { useRouter: () => ({ refresh() {}, push() {} }) }
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
      if (name === '@/components/idioma-provider') return { useIdioma: () => ({ idioma: 'es' }), useT: () => (s) => s }
      if (name.startsWith('@/app/actions/')) return new Proxy({}, { get: (_, action) => async (...args) => { ui.actions?.push({ action, args }); return ui.actionResult ? ui.actionResult(action, args) : { data: action === 'invitarMiembroEmpresa' ? { url: '/mi-empresa/invitaciones/prueba' } : undefined } } })
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

function workspaceHarness(load, espacio, component = "EmpresaWorkspaceReal", options = {}) {
  let cursor = 0
  const state = []
  const tasks = []
  const actions = []
  const runtime = loadModules({}, { actions, actionResult: options.actionResult, react: {
    useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
    },
    useRef(initial) { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index] },
    useEffect() {},
    useTransition: () => [false, callback => { tasks.push(callback()) }],
  } })
  const componentFile = { OperacionesEmpresa: 'operaciones-empresa', EmpresaWorkspaceReal: 'empresa-workspace-real', IncidenciasTrabajoEmpresa: 'incidencias-trabajo-empresa', PerfilEmpresaEditor: 'perfil-empresa-editor' }[component]
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
    render() { cursor = 0; return Component(['IncidenciasTrabajoEmpresa', 'PerfilEmpresaEditor'].includes(component) ? espacio : { espacio }) },
    all: elements, text,
    byId(tree, id) { return elements(tree, n => n.props?.id === id)[0] },
    button(tree, label) { return elements(tree, n => typeof n.props?.onClick === 'function' && text(n).trim() === label)[0] },
    async settle() { await Promise.all(tasks.splice(0)) },
  }
}

test('private preview links follow management permissions and preserve verified public links', async () => {
  const { load } = loadModules()
  const base = (await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data
  for (const [rol, perfil, allowed] of [['principal', false, true], ['administrador', false, true], ['miembro', true, true], ['miembro', false, false]]) {
    for (const estadoVerificacion of ['borrador', 'en_revision', 'requiere_informacion', 'verificada']) {
      const espacio = { ...base, empresa: { ...base.empresa, estadoVerificacion }, miembroActual: { ...base.miembroActual, rol, permisos: { ...base.miembroActual.permisos, perfil } } }
      const h = workspaceHarness(load, espacio)
      const tree = h.render()
      const previewLinks = h.all(tree, n => n.props?.href === '/mi-empresa/vista-previa')
      assert.equal(previewLinks.length, allowed ? 1 : 0, `${rol}/${perfil}/${estadoVerificacion}`)
      if (allowed) {
        assert.equal(previewLinks[0].props.target, '_blank', 'Preview must preserve unsaved edits in the original tab')
        assert.match(previewLinks[0].props.rel, /noopener/)
        assert.match(h.text(previewLinks[0]), /Se abre en otra pestaña/)
      }
      assert.equal(h.all(tree, n => n.props?.href === `/empresa/${base.empresa.id}`).length, estadoVerificacion === 'verificada' ? 1 : 0)
    }
  }
})

test('preview reuses the public profile, reflects verification truth and cannot start contact or quote actions', async () => {
  const { load } = loadModules()
  const api = load('lib/empresas/production-store.ts')
  const datos = await api.empresaPublicaReal(empresaId)
  const { VistaPreviaEmpresa } = load('components/empresas/vista-previa-empresa.tsx')
  const { default: PerfilEmpresa, SolicitarPresupuestoEmpresa } = load('components/empresas/perfil-empresa.tsx')
  for (const estadoVerificacion of ['borrador', 'en_revision', 'requiere_informacion', 'verificada']) {
    const value = { ...datos, empresa: { ...datos.empresa, estadoVerificacion } }
    const tree = VistaPreviaEmpresa({ datos: value })
    const profile = React.Children.toArray(tree.props.children).find(n => n.type === PerfilEmpresa)
    assert.ok(profile, 'The production public profile is reused')
    assert.equal(profile.props.datos, value)
    assert.equal(profile.props.vistaPrevia, true)
    const html = renderToStaticMarkup(React.createElement(VistaPreviaEmpresa, { datos: value }))
    assert.match(html, /Vista previa privada/)
    assert.match(html, /Esta vista muestra los cambios guardados/)
    assert.match(html, /href="\/mi-empresa"/)
    assert.match(html, /disabled=""[^>]*aria-describedby="empresa-vista-previa-contacto"/)
    assert.equal(html.includes('Tu empresa todavía no es pública.'), estadoVerificacion !== 'verificada')
    assert.equal(html.includes('Empresa verificada'), estadoVerificacion === 'verificada')
  }
  for (const local of [true, false]) {
    const contact = SolicitarPresupuestoEmpresa({ datos: { ...datos, local }, vistaPrevia: true })
    assert.equal(contact.props.disabled, true)
    assert.equal(contact.props.onClick, undefined)
    const publicContact = SolicitarPresupuestoEmpresa({ datos: { ...datos, local } })
    assert.notEqual(publicContact.type, contact.type, 'The normal public contact flow remains intact')
  }
})

test('private preview route uses generic noindex metadata and redirects unauthenticated users before rendering company data', async () => {
  let result = { codigo: 'NO_AUTENTICADO', error: 'Debes iniciar sesión' }
  let reads = 0
  const { load } = loadModules({}, { mockModules: {
    '@/lib/empresas/production-store': { vistaPreviaEmpresaReal: async () => { reads++; return result } },
    '@/lib/i18n-servidor': { getT: async () => ({ t: value => value }) },
    'next/navigation': { redirect: url => { throw new Error(`redirect:${url}`) } },
  } })
  const route = load('app/mi-empresa/vista-previa/page.tsx')
  const metadata = await route.generateMetadata()
  assert.deepEqual(metadata.robots, { index: false, follow: false })
  assert.equal(reads, 0, 'Metadata never fetches company data')
  await assert.rejects(route.default(), /redirect:\/auth\/login\?next=%2Fmi-empresa%2Fvista-previa/)
  result = { codigo: 'SIN_EMPRESA', error: 'No company' }
  await assert.rejects(route.default(), /redirect:\/mi-empresa$/)
  result = { codigo: 'SIN_PERMISO', error: 'No tienes permiso para realizar esta operación de empresa' }
  const html = renderToStaticMarkup(await route.default())
  assert.match(html, /Vista previa no disponible/)
  assert.doesNotMatch(html, /Contactar empresa|Portfolio|Empresa de prueba/)
})

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


test('company profile saves province and canonical service arrays without truncation or manual URL fields', async () => {
  const { load } = loadModules()
  const empresa = (await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data.empresa
  const provinces = load('lib/provincias.ts').PROVINCIAS_ES
  const services = load('lib/categorias.ts').CATEGORIAS_SERVICIO_NOMBRES
  const h = workspaceHarness(load, { empresa, puedeEditar: true }, 'PerfilEmpresaEditor')
  let tree = h.render()
  const selectors = h.all(tree, n => Array.isArray(n.props?.seleccionadas) && !n.props.disabled)
  assert.equal(selectors.length, 2)
  selectors[0].props.onChange([...provinces])
  selectors[1].props.onChange([...services])
  tree = h.render()
  assert.equal(h.byId(tree, 'empresa-logo').props.type, 'file')
  assert.equal(h.byId(tree, 'empresa-logo').props.accept, 'image/png,image/jpeg,image/webp')
  assert.equal(h.byId(tree, 'empresa-zona'), undefined)
  assert.doesNotMatch(h.text(tree), /Enlace al logotipo|Separa los servicios con comas/)
  await h.all(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  const saved = h.actions.find(c => c.action === 'guardarPerfilEmpresa').args[0]
  assert.deepEqual(saved.provincias, provinces)
  assert.deepEqual(saved.servicios, services)
  assert.equal(saved.logoUrl, empresa.logoUrl)
})

test('company logo preview rejects invalid files and preserves edits on upload failure before a successful retry', async () => {
  const { load } = loadModules()
  const empresa = { ...(await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data.empresa, provincias: ['Madrid'], servicios: ['Limpieza'] }
  const h = workspaceHarness(load, { empresa, puedeEditar: true }, 'PerfilEmpresaEditor')
  const previousFetch = globalThis.fetch
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL
  const revoked = []
  URL.createObjectURL = () => 'blob:logo-preview'
  URL.revokeObjectURL = value => revoked.push(value)
  try {
    let tree = h.render()
    const file = new File(['image-data'], 'logo.png', { type: 'image/png' })
    h.byId(tree, 'empresa-logo').props.onChange({ target: { files: [new File(['svg'], 'logo.svg', { type: 'image/svg+xml' })], value: '' } })
    assert.match(h.text(h.render()), /Elige una imagen PNG, JPG o WebP/)
    h.byId(h.render(), 'empresa-logo').props.onChange({ target: { files: [file], value: '' } })
    tree = h.render()
    assert.ok(h.all(tree, n => n.props?.src === 'blob:logo-preview').length)
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: 'No se pudo subir el logo. Vuelve a intentarlo.' }) })
    await h.all(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
    tree = h.render()
    assert.match(h.text(tree), /No se pudo subir el logo/)
    assert.equal(h.actions.length, 0)
    assert.ok(h.all(tree, n => n.props?.src === 'blob:logo-preview').length)
    let uploads = 0
    let finishUpload
    globalThis.fetch = async (url, options) => {
      uploads++
      assert.equal(url, '/api/empresas/logo')
      assert.equal(options.body.get('empresaId'), empresa.id)
      assert.equal(options.body.get('file').name, 'logo.png')
      await new Promise(resolve => { finishUpload = resolve })
      return { ok: true, json: async () => ({ url: 'https://blob.example/company-logo.png' }) }
    }
    const form = h.all(tree, n => n.type === 'form')[0]
    const firstSave = form.props.onSubmit({ preventDefault() {} })
    const duplicateSave = form.props.onSubmit({ preventDefault() {} })
    assert.equal(uploads, 1)
    assert.equal(h.all(h.render(), n => n.type === 'fieldset')[0].props.disabled, true)
    finishUpload()
    await Promise.all([firstSave, duplicateSave])
    assert.equal(h.actions.length, 1)
    assert.equal(h.actions[0].args[0].logoUrl, 'https://blob.example/company-logo.png')
    assert.match(h.text(h.render()), /Perfil actualizado/)
    assert.deepEqual(revoked, ['blob:logo-preview'])
  } finally { globalThis.fetch = previousFetch; URL.createObjectURL = create; URL.revokeObjectURL = revoke }
})

test('company profile validates coverage before uploading, removes an existing logo, and does not save without permission', async () => {
  const { load } = loadModules()
  const empresa = { ...(await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data.empresa, provincias: [], servicios: [] }
  const h = workspaceHarness(load, { empresa, puedeEditar: true }, 'PerfilEmpresaEditor')
  await h.all(h.render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(h.actions.length, 0)
  assert.match(h.text(h.render()), /Selecciona al menos una provincia y un servicio/)
  const filled = { ...empresa, provincias: ['Madrid', 'Toledo'], servicios: ['Limpieza', 'Montaje de muebles'] }
  const editor = workspaceHarness(load, { empresa: filled, puedeEditar: true }, 'PerfilEmpresaEditor')
  editor.button(editor.render(), 'Quitar logotipo').props.onClick()
  await editor.all(editor.render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(editor.actions[0].args[0].logoUrl, '')
  const readonly = workspaceHarness(load, { empresa: filled, puedeEditar: false }, 'PerfilEmpresaEditor')
  const tree = readonly.render()
  assert.equal(readonly.all(tree, n => n.type === 'fieldset')[0].props.disabled, true)
  await readonly.all(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(readonly.actions.length, 0)
})

test('company coverage survives workspace, public-profile and directory adapters without inferring historical locations', async () => {
  const company = { ...sampleCompany, provincias: ['Madrid', 'Toledo'], ubicacion: 'Madrid, Toledo' }
  const { load } = loadModules({ empresa_workspace: { ...workspace, empresa: company }, empresa_perfil_publico: { empresa: company }, empresas_publicas: [company] })
  const api = load('lib/empresas/production-store.ts')
  for (const value of [(await api.espacioEmpresaReal()).data.empresa, (await api.empresaPublicaReal(empresaId)).empresa, (await api.empresasPublicasReales())[0].empresa]) {
    assert.deepEqual(value.provincias, ['Madrid', 'Toledo'])
    assert.equal(value.ubicacion, 'Madrid, Toledo')
  }
  const legacy = await loadModules().load('lib/empresas/production-store.ts').empresaPublicaReal(empresaId)
  assert.deepEqual(legacy.empresa.provincias, [])
  assert.equal(legacy.empresa.ubicacion, 'Madrid')
})

test('profile action validates canonical choices and uses an authenticated unambiguous coverage RPC', async () => {
  const { load, calls, setUser } = loadModules()
  const { guardarPerfilEmpresa } = load('app/actions/empresa-workspace.ts')
  const base = { nombre: 'Empresa prueba', descripcion: 'Descripción suficiente de la empresa', web: 'https://example.test', ubicacion: 'Texto que no es autoridad', logoUrl: 'https://example.test/logo.webp', servicios: ['Fontanería'], provincias: ['Madrid', 'Toledo', 'Madrid'] }
  assert.equal((await guardarPerfilEmpresa(base)).error, undefined)
  assert.equal(calls[0].name, 'empresa_editar_perfil_cobertura')
  assert.deepEqual(calls[0].args.p_provincias, ['Madrid', 'Toledo'])
  assert.equal(calls[0].args.p_ubicacion, 'Madrid, Toledo')
  assert.equal(calls[0].args.p_logo, base.logoUrl)
  for (const extra of [{ provincias: [] }, { provincias: ['Alcobendas'] }, { servicios: [] }, { servicios: ['Pintura'] }]) assert.ok((await guardarPerfilEmpresa({ ...base, ...extra })).error)
  assert.equal(calls.length, 1, 'Invalid canonical values never reach the database')
  const { provincias, ...legacy } = base
  await guardarPerfilEmpresa(legacy)
  assert.equal(calls[1].name, 'empresa_editar_perfil')
  assert.equal(Object.hasOwn(calls[1].args, 'p_provincias'), false)
  setUser(null)
  assert.equal((await guardarPerfilEmpresa(base)).codigo, 'NO_AUTENTICADO')
  assert.equal(calls.length, 2)
})

test('legacy free-text services cannot be silently discarded by saving a different profile field', async () => {
  const { load } = loadModules()
  const empresa = { ...(await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data.empresa, provincias: ['Madrid'], servicios: ['Limpieza', 'Servicio histórico sin categoría'] }
  const h = workspaceHarness(load, { empresa, puedeEditar: true }, 'PerfilEmpresaEditor')
  let tree = h.render()
  assert.match(h.text(tree), /Servicio histórico sin categoría/)
  const selectors = h.all(tree, n => Array.isArray(n.props?.seleccionadas) && !n.props.disabled)
  assert.deepEqual(selectors[1].props.seleccionadas, ['Limpieza'])
  h.byId(tree, 'empresa-nombre').props.onChange({ target: { value: 'Nombre actualizado' } })
  tree = h.render()
  await h.all(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(h.actions.length, 0)
  assert.match(h.text(h.render()), /Revisa los servicios anteriores antes de guardar/)
  const review = h.all(h.render(), n => typeof n.props?.onCheckedChange === 'function')[0]
  review.props.onCheckedChange(true)
  await h.all(h.render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  assert.equal(h.actions[0].args[0].nombre, 'Nombre actualizado')
  assert.deepEqual(h.actions[0].args[0].servicios, ['Limpieza'])
})
