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
const sampleCompany = { id: empresaId, nombre: 'Empresa de prueba', descripcion: 'Equipo ficticio para pruebas', ubicacion: 'Madrid', servicios: ['Pintura'], sitio_web: 'https://example.com', logo: 'https://example.com/logo.png', verificada: false, propietario_id: ownerId, contacto_usuario_id: ownerId, razon_social: 'Empresa de prueba, S.L.', cif: 'B12345678', domicilio: 'Calle Ejemplo 10, Bilbao', representante_nombre: 'REPRESENTANTE PRIVADO', cargo_legal: 'CARGO PRIVADO', email: 'EMAIL PRIVADO', telefono: 'TELEFONO PRIVADO' }
const members = [{ usuario_id: ownerId, nombre: 'Ana', apellido: 'Ejemplo', cargo: 'Dirección', bio: 'Coordino los proyectos del equipo.', foto_perfil: 'https://example.com/ana.png', habilidades: ['Coordinación'], estado: 'activo', es_titular: true, rol: 'principal', perfil_publico: true, tiene_perfil_profesional: true, permisos: {perfil:true,mensajes:true,presupuestos:true,encargos:true,equipo:true,ver_cobros:true,gestionar_cobros:true} }, { usuario_id: memberId, nombre: 'Luis', apellido: 'Prueba', cargo: 'Pintor', bio: 'Especialista en acabados.', estado: 'activo', es_titular: false, rol: 'miembro', perfil_publico: true, tiene_perfil_profesional: true, permisos: {perfil:false,mensajes:true,presupuestos:true,encargos:true,equipo:false,ver_cobros:false,gestionar_cobros:false} }]
const workspace = { empresa: sampleCompany, miembros: members, invitaciones: [{ id: 'invitation', email: 'test@example.com', cargo: 'Pintor', estado: 'pendiente', created_at: '2026-09-01', expira_at: '2099-09-08' }], actividad: [{ id: 'activity', actor_usuario_id: memberId, actor_nombre: 'Luis Prueba', accion: 'Oferta actualizado', entidad_tipo: 'ofertas', entidad_id: 'offer', created_at: '2026-09-22T12:00:00Z', detalle: { solicitud_titulo: 'Pintar la cocina', precio: { antes: 100, despues: 120 } } }], es_titular: true, usuario_id: ownerId }
const defaults = { empresa_workspace: workspace, empresa_perfil_publico: { empresa: sampleCompany, miembros: members, portfolio: [{ id: 'portfolio', trabajo_id: 'work', titulo: 'Trabajo empresa', descripcion: 'Proyecto terminado', fecha_proyecto: '2026-09-01', participantes_ids: [memberId] }], resenas: [{ id: 'review', trabajo_id: 'work', autor: 'Cliente', rating: 5, comentario: 'Buen trabajo', created_at: '2026-09-22' }] }, empresas_publicas: [{ ...sampleCompany, miembros_count: 2 }], empresa_consultar_invitacion: { empresa_id: empresaId, empresa_nombre: sampleCompany.nombre, cargo: 'Pintor', estado: 'pendiente', expira_at: '2099-09-08', coincide_email: true }, empresa_afiliacion_publica: { empresa_id: empresaId, cargo: 'Pintor' } }

function loadModules(overrides = {}, ui = {}) {
  const cache = new Map()
  const responses = { ...defaults, ...overrides }
  const calls = []
  let user = { id: ownerId }
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: responses[name] ?? null, error: null } },
    from(table) {
      assert.equal(table, 'transacciones_escrow')
      return { select(columns) {
        assert.equal(columns, 'trabajo_id,estado,liquidacion_estado')
        return { eq(field, state) {
          assert.equal(field, 'estado'); assert.equal(state, 'liquidando')
          return { async in(field, ids) {
            assert.equal(field, 'trabajo_id'); calls.push({ table, columns, ids })
            return { data: (ui.escrowRows || []).filter(e => ids.includes(e.trabajo_id) && e.estado === state), error: ui.escrowError || null }
          } }
        } }
      } }
    },
  }
  function load(file) {
    const full = path.resolve(root, file)
    if (cache.has(full)) return cache.get(full).exports
    const module = { exports: {} }; cache.set(full, module)
    const source = readFileSync(full, 'utf8')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const customRequire = (name) => {
      if (ui.mockModules && Object.hasOwn(ui.mockModules, name)) return ui.mockModules[name]
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
      if (name === 'server-only') return {}
      if (name === 'react' && ui.react) return { ...React, ...ui.react }
      if (name === '@/lib/supabase/server') return { createClient: async () => client }
      if (name === '@/lib/empresas/service') return { esEmpresasLocal: () => false }
      if (name === 'next/cache') return { revalidatePath() {} }
      if (name === 'next/navigation') return { useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams() }
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
      if (name === '@/hooks/use-toast') return { useToast: () => ({ toast: value => ui.toasts?.push(value) }) }
      if (name === '@/components/idioma-provider') return { useIdioma: () => ({ idioma: 'es', t: (s) => s }), useT: () => (s) => s }
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
  assert.equal(result.empresa.razonSocial, sampleCompany.razon_social)
  assert.equal(result.empresa.nif, sampleCompany.cif, 'The company tax identifier is explicitly part of its public identity')
  assert.equal(result.empresa.domicilio, sampleCompany.domicilio)
  assert.doesNotMatch(JSON.stringify(result), /REPRESENTANTE PRIVADO|CARGO PRIVADO|EMAIL PRIVADO|TELEFONO PRIVADO/)
  for (const privateKey of ['cif', 'email', 'permisos', 'propietario_id', 'representanteNombre', 'cargoLegal']) assert.equal(Object.hasOwn(result.empresa, privateKey), false, privateKey)
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
  const { load } = loadModules({ empresa_workspace: { ...workspace, operaciones: { solicitudes: [], ofertas: [], trabajos: [{ id: 'work', titulo: 'Servicio empresa', estado: 'en_disputa', fecha: '2026-10-05', actor_usuario_id: memberId, actor_nombre: 'Luis', parte: 'proveedor', cancelacion_estado: 'pendiente', cancelacion_parte_solicitante: 'cliente', cancelacion_razon: 'Motivo compartido', cancelacion_revision:'11111111-2222-3333-4444-555555555555', disputa_actual: incident }] } } })
  const op = (await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data.operaciones.trabajos[0]
  assert.equal(op.cancelacionParteSolicitante, 'cliente')
  assert.equal(op.cancelacionEstado, 'pendiente')
  assert.equal(op.cancelacionRazon, 'Motivo compartido')
  assert.equal(op.cancelacionRevision,'11111111-2222-3333-4444-555555555555')
  assert.deepEqual(op.disputaActual, incident)
  assert.equal(Object.hasOwn(op, 'notas_privadas_proveedor'), false)
})

test('workspace exposes only authenticated settlement status and fails visibly on read errors', async () => {
  const source = { ...workspace, operaciones: { solicitudes: [], ofertas: [], trabajos: [{ id: 'work', titulo: 'Contrato', estado: 'cancelado', fecha: '2026-10-24', actor_usuario_id: ownerId, actor_nombre: 'Ana' }] } }
  const h = loadModules({ empresa_workspace: source }, { escrowRows: [{ trabajo_id: 'work', estado: 'liquidando', liquidacion_estado: 'error', liquidacion_error: 'PRIVATE_PROVIDER_DIAGNOSIS', stripe_charge_id: 'ch_private', monto: 110 }, { trabajo_id: 'foreign', estado: 'liquidando', liquidacion_estado: 'error' }] })
  const result = await h.load('lib/empresas/production-store.ts').espacioEmpresaReal()
  assert.deepEqual(result.data.operaciones.trabajos[0].liquidacion, { estado: 'liquidando', liquidacion_estado: 'error' })
  assert.equal(JSON.stringify(result.data).includes('PRIVATE_PROVIDER_DIAGNOSIS'), false)
  assert.equal(JSON.stringify(result.data).includes('ch_private'), false)
  assert.deepEqual(h.calls.find(c => c.table).ids, ['work'])
  const failed = loadModules({ empresa_workspace: source }, { escrowError: { message: 'PRIVATE_DATABASE_ERROR' } })
  const denied = await failed.load('lib/empresas/production-store.ts').espacioEmpresaReal()
  assert.equal(denied.data, undefined)
  assert.equal(denied.error, 'No se pudo consultar el estado de la liquidación.')
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
    useId() { const index = cursor++; if (!(index in state)) state[index] = `test-form-${index}`; return state[index] },
    useCallback: callback => callback,
    useEffect() {},
    useTransition: () => [false, callback => { tasks.push(callback()) }],
  } })
  const componentFile = { OperacionesEmpresa: 'operaciones-empresa', EmpresaWorkspaceReal: 'empresa-workspace-real', IncidenciasTrabajoEmpresa: 'incidencias-trabajo-empresa', PerfilEmpresaEditor: 'perfil-empresa-editor' }[component]
  const Component = runtime.load(`components/empresas/${componentFile}.tsx`)[component]
  function children(node) {
    if (['PreferenciasDemandas', 'DatosLegalesEmpresaCard'].includes(node.type?.name)) return [node.type(node.props)]
    return [node.props?.children, node.props?.acciones, node.props?.estado, node.props?.preferencias, ...Object.values(node.props?.edicion || {})]
  }
  function elements(node, predicate, found = []) {
    if (node == null || typeof node !== 'object') return found
    if (Array.isArray(node)) { node.forEach(child => elements(child, predicate, found)); return found }
    if (predicate(node)) found.push(node)
    children(node).forEach(child => elements(child, predicate, found))
    return found
  }
  function text(node) {
    if (node == null || typeof node === 'boolean') return ''
    if (Array.isArray(node)) return node.map(text).join(' ')
    if (typeof node === 'object') return children(node).map(text).join(' ')
    return String(node)
  }
  return {
    actions,
    render() { cursor = 0; return Component(['IncidenciasTrabajoEmpresa', 'PerfilEmpresaEditor'].includes(component) ? espacio : { espacio, ...options.props }) },
    all: elements, text,
    profile(tree) { return elements(tree, n => n.props?.datos && n.props?.vistaPrevia)[0] },
    selector(tree, name) { return elements(tree, n => n.type?.name === name)[0] },
    byId(tree, id) { return elements(tree, n => n.props?.id === id)[0] },
    button(tree, label) { return elements(tree, n => typeof n.props?.onClick === 'function' && text(n).trim() === label)[0] },
    async settle() { await Promise.all(tasks.splice(0)) },
  }
}

test('private preview links follow management permissions and preserve verified public links', async () => {
  const { load } = loadModules()
  const base = (await load('lib/empresas/production-store.ts').espacioEmpresaReal()).data
  const perfilPublico = await load('lib/empresas/production-store.ts').empresaPublicaReal(empresaId)
  for (const [rol, perfil, allowed] of [['principal', false, true], ['administrador', false, true], ['miembro', true, true], ['miembro', false, false]]) {
    for (const estadoVerificacion of ['borrador', 'en_revision', 'requiere_informacion', 'verificada']) {
      const espacio = { ...base, empresa: { ...base.empresa, estadoVerificacion }, miembroActual: { ...base.miembroActual, rol, permisos: { ...base.miembroActual.permisos, perfil } } }
      const h = workspaceHarness(load, espacio, 'EmpresaWorkspaceReal', { props: { perfilPublico } })
      const tree = h.render()
      assert.equal(h.button(tree, 'Editar perfil'), undefined, 'The workspace does not duplicate the profile editor action')
      const profileEditors = h.all(tree, n => n.type?.name === 'PerfilEmpresaEditor')
      assert.equal(profileEditors.length, 1, 'One profile owns the company identity and editing controls')
      const workspaceHeader = h.all(tree, n => n.type === 'header')[0]
      assert.equal(h.text(workspaceHeader).includes(espacio.empresa.nombre), false, 'The management toolbar must not repeat the profile identity')
      assert.equal(profileEditors[0].props.puedeEditar, perfil, `Edit access follows the profile permission: ${rol}/${perfil}`)
      const previewLinks = h.all(tree, n => n.props?.href === '/mi-empresa/vista-previa')
      assert.equal(previewLinks.length, allowed ? 1 : 0, `${rol}/${perfil}/${estadoVerificacion}`)
      if (allowed) {
        assert.equal(previewLinks[0].props.target, undefined, 'Preview must stay inside the app instead of opening a new window')
        assert.doesNotMatch(h.text(previewLinks[0]), /Se abre en otra pestaña/)
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
  const { PerfilEmpresaEditor } = load('components/empresas/perfil-empresa-editor.tsx')
  const { SolicitarPresupuestoEmpresa } = load('components/empresas/perfil-empresa.tsx')
  for (const estadoVerificacion of ['borrador', 'en_revision', 'requiere_informacion', 'verificada']) {
    const value = { ...datos, empresa: { ...datos.empresa, estadoVerificacion } }
    const tree = VistaPreviaEmpresa({ datos: value })
    const profile = React.Children.toArray(tree.props.children).find(n => n.type === PerfilEmpresaEditor)
    assert.ok(profile, 'Preview uses the same inline profile editor as the workspace')
    assert.equal(profile.props.datos, value)
    assert.equal(profile.props.puedeEditar, false)
    const html = renderToStaticMarkup(React.createElement(VistaPreviaEmpresa, { datos: value }))
    assert.match(html, /Vista previa privada/)
    assert.match(html, /href="\/mi-empresa"/)
    assert.doesNotMatch(html, /Enviar mensaje|Contactar empresa|Pedir presupuesto/, 'Private preview never starts public contact actions')
    assert.equal(html.includes('Tu empresa todavía no es pública.'), estadoVerificacion !== 'verificada')
    assert.equal(html.includes('Profesional Verificado'), estadoVerificacion === 'verificada')
    assert.doesNotMatch(html, /<button[^>]*>(?:<[^>]*>)*Editar perfil/)
    const editableHtml = renderToStaticMarkup(React.createElement(VistaPreviaEmpresa, { datos: value, puedeEditar: true }))
    assert.doesNotMatch(editableHtml, /href="\/mi-empresa#perfil-empresa"/)
    assert.match(editableHtml, /Puedes editar el perfil aquí mismo/)
    assert.match(editableHtml, /Editar perfil/)
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
  let workspaceResult = { error: 'Debes iniciar sesión' }
  let reads = 0
  const { load } = loadModules({}, { mockModules: {
    '@/lib/empresas/production-store': { vistaPreviaEmpresaReal: async () => { reads++; return result }, espacioEmpresaReal: async () => workspaceResult },
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
  result = { data: { empresa: { id: empresaId } } }
  for (const [id, perfil, allowed] of [[empresaId, true, true], [empresaId, false, false], ['otra-empresa', true, false]]) {
    workspaceResult = { data: { empresa: { id, nif: 'PRIVADO' }, miembroActual: { email: 'privado@example.test', permisos: { perfil } }, actividad: ['PRIVADA'] } }
    const page = await route.default()
    assert.equal(page.props.puedeEditar, allowed)
    assert.deepEqual(Object.keys(page.props).sort(), ['datos', 'puedeEditar'], 'Only the public DTO and edit flag reach the preview client')
  }
  workspaceResult = { error: 'No se pudo consultar el acceso' }
  assert.equal((await route.default()).props.puedeEditar, false)
})

test('workspace loads only an authorized matching profile and keeps its other sections available on profile failure', async () => {
  const original = loadModules()
  const api = original.load('lib/empresas/production-store.ts')
  const base = (await api.espacioEmpresaReal()).data
  const profile = await api.empresaPublicaReal(empresaId)
  let espacio = base
  let previewResult = { data: profile }
  let publicResult = profile
  let previewThrows = false
  const calls = []
  const { load } = loadModules({}, { mockModules: {
    '@/lib/empresas/service': {
      obtenerEspacioEmpresa: async () => ({ data: espacio }),
      obtenerEmpresaPublica: async id => { calls.push(['public', id]); return publicResult },
    },
    '@/lib/empresas/production-store': {
      vistaPreviaEmpresaReal: async () => { calls.push(['preview']); if (previewThrows) throw new Error('Unavailable'); return previewResult },
    },
    '@/lib/i18n-servidor': { getT: async () => ({ t: value => value }) },
    'next/navigation': { redirect: url => { throw new Error(`redirect:${url}`) } },
  } })
  const route = load('app/mi-empresa/page.tsx')
  for (const [rol, perfil, estado, local, expected] of [
    ['principal', false, 'borrador', false, 'preview'],
    ['administrador', false, 'en_revision', false, 'preview'],
    ['miembro', true, 'borrador', false, 'preview'],
    ['miembro', false, 'borrador', false, null],
    ['miembro', false, 'verificada', false, 'public'],
    ['principal', true, 'verificada', true, null],
  ]) {
    calls.length = 0
    espacio = { ...base, local, empresa: { ...base.empresa, estadoVerificacion: estado }, miembroActual: { ...base.miembroActual, rol, permisos: { ...base.miembroActual.permisos, perfil } } }
    const page = await route.default({ searchParams: Promise.resolve({}) })
    assert.deepEqual(calls, expected ? [expected === 'public' ? ['public', empresaId] : ['preview']] : [])
    assert.equal(page.props.perfilPublico, expected ? profile : null)
    if (expected) assert.doesNotMatch(JSON.stringify(page.props.perfilPublico), /PRIVADO|invitaciones|permisos|"email":|actividad/)
  }
  espacio = base
  for (const result of [{ error: 'No tienes permiso' }, { data: { ...profile, empresa: { ...profile.empresa, id: 'otra-empresa' } } }]) {
    previewResult = result
    const page = await route.default({ searchParams: Promise.resolve({ trabajo: empresaId }) })
    assert.equal(page.props.perfilPublico, null)
    assert.equal(page.props.espacio, espacio)
    assert.deepEqual(page.props.operacionInicial, { tipo: 'trabajos', id: empresaId })
  }
  previewThrows = true
  assert.equal((await route.default({ searchParams: Promise.resolve({}) })).props.perfilPublico, null)
  previewThrows = false
  espacio = { ...base, empresa: { ...base.empresa, estadoVerificacion: 'verificada' }, miembroActual: { ...base.miembroActual, rol: 'miembro', permisos: { ...base.miembroActual.permisos, perfil: false } } }
  publicResult = { ...profile, empresa: { ...profile.empresa, id: 'otra-empresa' } }
  assert.equal((await route.default({ searchParams: Promise.resolve({}) })).props.perfilPublico, null)
  const fallback = workspaceHarness(original.load, base)
  const tree = fallback.render()
  assert.equal(fallback.button(tree, 'Editar perfil'), undefined)
  assert.ok(fallback.button(tree, 'Reintentar'))
  assert.match(fallback.text(tree), /No se pudo cargar la vista previa/)
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
  const base = { cancelacionRevision:'11111111-2222-3333-4444-555555555555', trabajoId: 'job', titulo: 'Servicio de empresa', estado: 'en_progreso', parte: 'cliente', puedeGestionar: true, puedeAceptarCancelacion: false }
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
  const financeProps = { ...base, cancelacionEstado: 'pendiente', cancelacionParteSolicitante: 'proveedor', puedeAceptarCancelacion: true }
  const finance = workspaceHarness(load, financeProps, 'IncidenciasTrabajoEmpresa')
  tree = finance.render()
  finance.button(tree, 'Aceptar cancelación').props.onClick()
  assert.equal(finance.actions.length, 0, 'opening confirmation must not cancel the job')
  financeProps.cancelacionRevision='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' // Background refresh must not silently update consent.
  tree = finance.render()
  finance.all(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} })
  await finance.settle()
  assert.deepEqual(finance.actions.find(c => c.action === 'responderCancelacion').args, ['job', true, '', [], '11111111-2222-3333-4444-555555555555'])
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

test('cover survives public adapters while budget preferences remain private to the workspace and preview', async () => {
  const company = { ...sampleCompany, foto_portada: 'https://example.com/cover.webp', presupuesto_min_interes: 1200, presupuesto_max_interes: 35000 }
  const { load } = loadModules({ empresa_workspace: { ...workspace, empresa: company }, empresa_perfil_publico: { empresa: company }, empresa_perfil_vista_previa: { empresa: company }, empresas_publicas: [company] })
  const api = load('lib/empresas/production-store.ts')
  for (const datos of [await api.empresaPublicaReal(empresaId), ...(await api.empresasPublicasReales())]) {
    assert.equal(datos.empresa.portadaUrl, company.foto_portada)
    assert.equal(Object.hasOwn(datos.empresa, 'presupuestoMinInteres'), false)
    assert.equal(Object.hasOwn(datos.empresa, 'presupuestoMaxInteres'), false)
  }
  for (const datos of [(await api.espacioEmpresaReal()).data, (await api.vistaPreviaEmpresaReal()).data]) {
    assert.equal(datos.empresa.portadaUrl, company.foto_portada)
    assert.equal(datos.empresa.presupuestoMinInteres, 1200)
    assert.equal(datos.empresa.presupuestoMaxInteres, 35000)
  }
})

test('complete profile action validates and sends cover and budget together without erasing omitted preferences', async () => {
  const { load, calls } = loadModules()
  const { guardarPerfilEmpresa } = load('app/actions/empresa-workspace.ts')
  const base = { nombre: 'Empresa prueba', descripcion: 'Descripción suficiente de la empresa', web: 'https://example.test', ubicacion: 'Madrid', logoUrl: 'https://example.test/logo.webp', servicios: ['Fontanería'], provincias: ['Madrid'] }
  const changes = { ...base, portadaUrl: 'https://example.test/cover.webp', presupuestoMinInteres: 1500, presupuestoMaxInteres: 20000 }
  assert.equal((await guardarPerfilEmpresa(changes)).error, undefined)
  assert.equal(calls[0].name, 'empresa_editar_perfil_completo')
  assert.equal(calls[0].args.p_portada, changes.portadaUrl)
  assert.equal(calls[0].args.p_presupuesto_min_interes, 1500)
  assert.equal(calls[0].args.p_presupuesto_max_interes, 20000)
  assert.equal(calls[0].args.p_actualizar_portada, true)
  assert.equal(calls[0].args.p_actualizar_presupuesto, true)
  assert.equal((await guardarPerfilEmpresa({ ...base, portadaUrl: '' })).error, undefined)
  assert.equal(calls[1].args.p_actualizar_portada, true)
  assert.equal(calls[1].args.p_actualizar_presupuesto, false)
  assert.equal((await guardarPerfilEmpresa({ ...base, presupuestoMinInteres: 0, presupuestoMaxInteres: 100000 })).error, undefined)
  assert.equal(calls[2].args.p_actualizar_portada, false)
  assert.equal(calls[2].args.p_actualizar_presupuesto, true)
  assert.equal(calls[2].args.p_presupuesto_min_interes, null)
  assert.equal(calls[2].args.p_presupuesto_max_interes, null)
  for (const invalid of [
    { presupuestoMinInteres: 1000 },
    { presupuestoMaxInteres: 20000 },
    { presupuestoMinInteres: -1, presupuestoMaxInteres: 500 },
    { presupuestoMinInteres: 5000, presupuestoMaxInteres: 1000 },
    { presupuestoMinInteres: 0, presupuestoMaxInteres: 100001 },
    { presupuestoMinInteres: NaN, presupuestoMaxInteres: 1000 },
    { presupuestoMinInteres: '500', presupuestoMaxInteres: 1000 },
  ]) assert.ok((await guardarPerfilEmpresa({ ...base, ...invalid })).error, JSON.stringify(invalid))
  assert.equal(calls.length, 3, 'Invalid preferences must not reach the database')
})


function sharedProfileHarness(datos, options = {}) {
  let cursor = 0
  const state = [], actions = [], toasts = []
  const runtime = loadModules({}, { actions, toasts, actionResult: options.actionResult, react: {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value }] },
    useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i] },
    useCallback: fn => fn, useEffect() {},
  } })
  const { PerfilEmpresaEditor } = runtime.load('components/empresas/perfil-empresa-editor.tsx')
  const wrapper = PerfilEmpresaEditor({ datos, puedeEditar: options.editable !== false })
  const component = wrapper.props.children
  const Profile = runtime.load('components/perfil-profesional.tsx').default
  assert.equal(component.type, Profile, 'The whole company editor is the actual professional component')
  function children(node) {
    if (['PreferenciasDemandas', 'DatosLegalesEmpresaCard'].includes(node.type?.name)) return [node.type(node.props)]
    return ['children', 'coverActions', 'avatarActions', 'avatar'].map(key => node.props?.[key])
  }
  function all(node, predicate, found = []) {
    if (node == null || typeof node !== 'object') return found
    if (Array.isArray(node)) { node.forEach(child => all(child, predicate, found)); return found }
    if (predicate(node)) found.push(node)
    children(node).forEach(child => all(child, predicate, found))
    return found
  }
  function text(node) {
    if (node == null || typeof node === 'boolean') return ''
    if (Array.isArray(node)) return node.map(text).join(' ')
    if (typeof node === 'object') return children(node).map(text).join(' ')
    return String(node)
  }
  return {
    load: runtime.load, actions, toasts, adaptador: component.props.adaptador, all, text,
    render() { cursor = 0; return Profile(component.props) },
    button(tree, label) { return all(tree, node => typeof node.props?.onClick === 'function' && text(node).trim() === label)[0] },
    field(tree, name) { return all(tree, node => node.props?.id === name || node.props?.['aria-label'] === name || node.props?.placeholder === name)[0] },
    selector(tree, name) { return all(tree, node => node.type?.name === name)[0] },
  }
}

async function completeProfileFixture() {
  const { load } = loadModules()
  const original = await load('lib/empresas/production-store.ts').empresaPublicaReal(empresaId)
  return { ...original, empresa: { ...original.empresa, provincias: ['Madrid'], servicios: ['Limpieza'], titulo: 'Especialistas en acabados', telefono: '+34 612345678', emailContacto: 'contacto@example.test', tarifaHora: 45, anosExperiencia: 12, tiempoRespuesta: '2 horas', disponible: true, habilidades: ['Acabados'], certificaciones: ['Certificación declarada'], idiomas: ['Español'], proyectosCompletados: 20, portadaUrl: 'https://example.com/saved-cover.webp', presupuestoMinInteres: 1200, presupuestoMaxInteres: 35000 } }
}

test('company owner uses the full professional profile and adds only the team tab', async () => {
  const datos = await completeProfileFixture()
  const h = sharedProfileHarness(datos)
  const tree = h.render()
  const tabs = h.all(tree, node => node.type?.name === 'TabsTrigger').map(node => node.props.value)
  assert.deepEqual(tabs, ['sobre-mi', 'portfolio', 'valoraciones', 'equipo'])
  for (const section of ['Descripción', 'Servicios', 'Zona de trabajo', 'Contacto', 'Habilidades', 'Certificaciones', 'Idiomas', 'Estadísticas', 'Avisos de nuevas demandas']) assert.match(h.text(tree), new RegExp(section))
  assert.equal(h.all(tree, node => node.type === 'h1').length, 1)
  assert.equal(h.field(tree, 'Nombre comercial'), undefined)
  assert.equal(h.adaptador.datos.proyectos_completados, 20, 'Completed contracts are not inferred from portfolio size')
  assert.equal(h.adaptador.datos.portfolio[0].trabajo_id, 'work')
  assert.equal(h.adaptador.datos.reviews[0].texto, 'Buen trabajo')
  assert.equal(h.adaptador.equipo.type.name, 'EquipoEmpresa')
  const readonly = sharedProfileHarness(datos, { editable: false })
  assert.equal(readonly.button(readonly.render(), 'Editar perfil'), undefined)
  assert.equal(readonly.all(readonly.render(), node => node.type?.name === 'Dialog' && node.props.open === true).length, 0)
})

test('shared company editor saves all professional fields through the company action and returns to its single preview', async () => {
  const datos = await completeProfileFixture()
  const h = sharedProfileHarness(datos)
  h.button(h.render(), 'Editar perfil').props.onClick()
  let tree = h.render()
  h.field(tree, 'Nombre comercial').props.onChange({ target: { value: ' Nombre actualizado ' } })
  tree = h.render()
  h.field(tree, 'Título profesional (ej: Maestro Albañil)').props.onChange({ target: { value: 'Reformas integrales' } })
  tree = h.render()
  h.selector(tree, 'SelectorProvincias').props.onChange(['Madrid', 'Toledo'])
  tree = h.render()
  h.selector(tree, 'RangoPrecio').props.onChange([2500, 15000])
  tree = h.render()
  assert.ok(h.field(tree, 'avatar-upload'))
  assert.ok(h.field(tree, 'cover-upload'))
  await h.button(tree, 'Guardar cambios').props.onClick()
  assert.equal(h.actions.length, 1)
  assert.equal(h.actions[0].action, 'guardarPerfilEmpresa')
  const saved = h.actions[0].args[0]
  assert.equal(saved.nombre, 'Nombre actualizado')
  assert.equal(saved.titulo, 'Reformas integrales')
  assert.equal(saved.ubicacion, datos.empresa.ubicacion, 'Residence remains independent of work coverage')
  assert.equal(saved.web, datos.empresa.web, 'Unedited existing company metadata is retained')
  assert.equal(saved.telefono, datos.empresa.telefono)
  assert.equal(saved.emailContacto, datos.empresa.emailContacto)
  assert.equal(saved.tarifaHora, 45)
  assert.equal(saved.anosExperiencia, 12)
  assert.deepEqual(saved.habilidades, ['Acabados'])
  assert.deepEqual(saved.certificaciones, ['Certificación declarada'])
  assert.deepEqual(saved.idiomas, ['Español'])
  assert.deepEqual(saved.provincias, ['Madrid', 'Toledo'])
  assert.equal(saved.presupuestoMinInteres, 2500)
  assert.equal(saved.presupuestoMaxInteres, 15000)
  assert.equal(h.field(h.render(), 'Nombre comercial'), undefined)
  assert.ok(h.toasts.some(toast => toast.title === 'Perfil actualizado'))
})

test('cancel restores the company profile, both photos and private range using the professional edit snapshot', async () => {
  const datos = await completeProfileFixture()
  const h = sharedProfileHarness(datos)
  const uploads = []
  h.adaptador.subirImagen = async (file, type) => { uploads.push(type); return { url: `https://example.test/${type}.webp` } }
  h.button(h.render(), 'Editar perfil').props.onClick()
  h.field(h.render(), 'Nombre comercial').props.onChange({ target: { value: 'Cambios descartados' } })
  for (const [id, type] of [['avatar-upload', 'logo'], ['cover-upload', 'portada']]) await h.field(h.render(), id).props.onChange({ currentTarget: { files: [new File(['photo'], `${type}.webp`, { type: 'image/webp' })], value: 'selected' } })
  h.selector(h.render(), 'RangoPrecio').props.onChange([5000, 10000])
  h.button(h.render(), 'Cancelar').props.onClick()
  const header = h.selector(h.render(), 'ProfileHeader')
  assert.equal(header.props.coverUrl, datos.empresa.portadaUrl)
  assert.equal(header.props.avatar.props.src, datos.empresa.logoUrl)
  assert.deepEqual(uploads, ['logo', 'portada'])
  assert.equal(h.actions.length, 0, 'Uploading a photo does not publish an unsaved profile')
  h.button(h.render(), 'Editar perfil').props.onClick()
  assert.equal(h.field(h.render(), 'Nombre comercial').props.value, datos.empresa.nombre)
  assert.deepEqual(h.selector(h.render(), 'RangoPrecio').props.value, [1200, 35000])
})

test('shared save keeps rejected drafts, prevents duplicate submission and permits retry', async () => {
  const datos = await completeProfileFixture()
  let finish, count = 0
  const h = sharedProfileHarness(datos, { actionResult: async () => { count++; return await new Promise(resolve => { finish = resolve }) } })
  h.button(h.render(), 'Editar perfil').props.onClick()
  h.field(h.render(), 'Nombre comercial').props.onChange({ target: { value: 'Borrador conservado' } })
  h.field(h.render(), 'empresa-domicilio').props.onChange({ target: { value: 'Domicilio pendiente de guardar' } })
  const save = h.button(h.render(), 'Guardar cambios')
  const first = save.props.onClick()
  const duplicate = save.props.onClick()
  assert.equal(count, 1)
  assert.equal(h.button(h.render(), 'Guardar cambios').props.disabled, true)
  finish({ error: 'Error temporal' })
  await Promise.all([first, duplicate])
  assert.equal(h.field(h.render(), 'Nombre comercial').props.value, 'Borrador conservado')
  assert.equal(h.field(h.render(), 'empresa-domicilio').props.value, 'Domicilio pendiente de guardar')
  assert.ok(h.toasts.some(toast => toast.variant === 'destructive'))
  const retry = h.button(h.render(), 'Guardar cambios').props.onClick()
  finish({})
  await retry
  assert.equal(count, 2)
  assert.equal(h.field(h.render(), 'Nombre comercial'), undefined)
})

test('company photo adapter validates files and sends each purpose to its authorized company endpoint', async () => {
  const { load } = loadModules()
  const { subirImagenEmpresa } = load('components/empresas/perfil-empresa-editor.tsx')
  const previous = globalThis.fetch, requests = []
  globalThis.fetch = async (url, options) => { requests.push(url); assert.equal(options.body.get('empresaId'), empresaId); return { ok: true, json: async () => ({ url: 'https://example.test/image.webp' }) } }
  try {
    for (const type of ['logo', 'portada', 'portfolio']) assert.equal((await subirImagenEmpresa(new File(['image'], 'image.webp', { type: 'image/webp' }), empresaId, type)).url, 'https://example.test/image.webp')
    assert.deepEqual(requests, ['/api/empresas/logo', '/api/empresas/portada', '/api/empresas/portfolio'])
    for (const file of [new File(['svg'], 'x.svg', { type: 'image/svg+xml' }), new File([], 'empty.png', { type: 'image/png' }), new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'large.webp', { type: 'image/webp' })]) assert.equal(await subirImagenEmpresa(file, empresaId, 'logo'), null)
    assert.equal(requests.length, 3)
    globalThis.fetch = async () => { throw new Error('Network unavailable') }
    assert.equal(await subirImagenEmpresa(new File(['image'], 'x.png', { type: 'image/png' }), empresaId, 'portada'), null)
  } finally { globalThis.fetch = previous }
})

test('public company profile uses the exact public professional renderer and exposes only the extra team tab', async () => {
  const datos = await completeProfileFixture()
  const { load } = loadModules()
  const Company = load('components/empresas/perfil-empresa.tsx').default
  const Public = load('components/perfil-profesional-publico.tsx').default
  const wrapper = Company({ datos })
  const profile = React.Children.toArray(wrapper.props.children).find(node => node.type === Public)
  assert.ok(profile)
  assert.equal(profile.props.empresa.equipo.type.name, 'EquipoEmpresa')
  assert.equal(profile.props.perfil.nombre, datos.empresa.nombre)
  assert.equal(profile.props.perfil.telefono, datos.empresa.telefono)
  assert.deepEqual(profile.props.perfil.datos_empresa, { razonSocial: datos.empresa.razonSocial, cif: datos.empresa.nif, domicilio: datos.empresa.domicilio })
  assert.equal(Object.hasOwn(profile.props.perfil, 'presupuesto_interes'), false)
  const html = renderToStaticMarkup(React.createElement(Company, { datos }))
  for (const label of ['Sobre mí', 'Portfolio', 'Valoraciones', 'Equipo', 'Habilidades', 'Certificaciones declaradas', 'Idiomas', 'Razón social', 'CIF', 'Domicilio', datos.empresa.razonSocial, datos.empresa.nif, datos.empresa.domicilio]) assert.match(html, new RegExp(label))
  assert.doesNotMatch(html, /Avisos de nuevas demandas|Presupuesto de la demanda|Reputation|Proveedor del servicio/)
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
})

test('extended company profile action validates data, keeps location independent and excludes private account contact', async () => {
  const company = { ...sampleCompany, titulo: 'Reformas integrales', telefono: 'PRIVATE ACCOUNT PHONE', email: 'PRIVATE ACCOUNT EMAIL', telefono_contacto: '+34 612345678', email_contacto: 'contacto@example.test', tarifa_por_hora: 45, anos_experiencia: 12, tiempo_respuesta: '2 horas', disponible: true, habilidades: ['Acabados'], certificaciones: ['Declarada'], idiomas: ['Español'], proyectos_completados: 20 }
  const { load, calls } = loadModules({ empresa_perfil_publico: { empresa: company }, empresa_workspace: { ...workspace, empresa: company } })
  const publicData = await load('lib/empresas/production-store.ts').empresaPublicaReal(empresaId)
  assert.equal(publicData.empresa.telefono, company.telefono_contacto)
  assert.equal(publicData.empresa.emailContacto, company.email_contacto)
  assert.equal(publicData.empresa.proyectosCompletados, 20)
  assert.doesNotMatch(JSON.stringify(publicData), /PRIVATE ACCOUNT/)
  const { guardarPerfilEmpresa } = load('app/actions/empresa-workspace.ts')
  const before = calls.length
  const input = { nombre: 'Empresa ejemplo', descripcion: 'Descripción de empresa', web: '', ubicacion: 'Bilbao', servicios: ['Limpieza'], provincias: ['Bizkaia', 'Madrid'], titulo: ' Especialistas ', telefono: '+34 612345678', emailContacto: 'contacto@example.test', tarifaHora: 45, anosExperiencia: 12, tiempoRespuesta: '2 horas', disponible: false, habilidades: ['Acabados'], certificaciones: ['Declarada'], idiomas: ['Español'] }
  assert.equal((await guardarPerfilEmpresa(input)).error, undefined)
  const rpc = calls.at(-1)
  assert.equal(rpc.name, 'empresa_editar_perfil_profesional')
  assert.equal(rpc.args.p_ubicacion, 'Bilbao')
  assert.deepEqual(rpc.args.p_provincias, ['Bizkaia', 'Madrid'])
  assert.equal(rpc.args.p_datos_profesionales.titulo, 'Especialistas')
  assert.equal(rpc.args.p_datos_profesionales.disponible, false)
  for (const changes of [{ emailContacto: 'invalid-email' }, { tarifaHora: -1 }, { anosExperiencia: 1.5 }, { habilidades: 'Not an array' }, { disponible: 'true' }]) assert.ok((await guardarPerfilEmpresa({ ...input, ...changes })).error)
  assert.equal(calls.length, before + 1)
})

test('company portfolio uses company CRUD and cancelling profile edits retains a project already saved', async () => {
  const datos = await completeProfileFixture()
  let portfolio = []
  const h = sharedProfileHarness(datos, { actionResult: async (action, args) => {
    if (action === 'crearItemPortfolioEmpresa') { portfolio = [{ id: 'new-company-project', ...args[0] }]; return {} }
    if (action === 'obtenerPortfolioEmpresa') return { data: portfolio }
    if (action === 'obtenerTrabajosCompletadosParaPortfolioEmpresa') return { data: [] }
    return {}
  } })
  h.button(h.render(), 'Editar perfil').props.onClick()
  h.field(h.render(), 'Nombre comercial').props.onChange({ target: { value: 'Nombre pendiente' } })
  h.button(h.render(), 'Añadir proyecto').props.onClick()
  await h.button(h.render(), 'Seleccionar trabajo').props.onClick()
  h.field(h.render(), 'pf-titulo').props.onChange({ target: { value: 'Proyecto guardado de la empresa' } })
  h.field(h.render(), 'pf-descripcion').props.onChange({ target: { value: 'Reforma integral completada con fotografías propias.' } })
  const submit = h.all(h.render(), node => typeof node.props?.onClick === 'function' && h.text(node).trim() === 'Añadir proyecto').at(-1)
  await submit.props.onClick()
  assert.deepEqual(h.actions.map(action => action.action), ['obtenerTrabajosCompletadosParaPortfolioEmpresa', 'crearItemPortfolioEmpresa', 'obtenerPortfolioEmpresa'])
  h.button(h.render(), 'Cancelar').props.onClick()
  assert.match(h.text(h.render()), /Proyecto guardado de la empresa/)
  assert.doesNotMatch(h.text(h.render()), /Nombre pendiente/)
  assert.ok(h.toasts.some(toast => toast.title === 'Proyecto añadido'))
})

test('public company message action addresses the company and never sends its id to personal messaging', async () => {
  const datos = await completeProfileFixture()
  const actions = [], destinations = []
  const { load } = loadModules({}, {
    actions, actionResult: async () => ({ data: { id: 'company-conversation' } }),
    react: { useState: value => [value, () => {}] },
    mockModules: {
      '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'visitor' } } }) } }) },
      'next/navigation': { useRouter: () => ({ push: value => destinations.push(value) }) },
    },
  })
  const { ContactarEmpresa } = load('components/empresas/perfil-empresa.tsx')
  const tree = ContactarEmpresa({ datos })
  await React.Children.toArray(tree.props.children)[0].props.onClick()
  assert.deepEqual(actions, [{ action: 'crearConversacionEmpresa', args: [empresaId] }])
  assert.deepEqual(destinations, ['/mensajes?c=company-conversation'])
})

test('company legal identity is visible and readonly while its public address saves through the shared editor', async () => {
  const datos = await completeProfileFixture()
  const h = sharedProfileHarness(datos)
  let tree = h.render()
  assert.equal(h.selector(tree, 'DatosLegalesEmpresaCard').props.datos.razonSocial, datos.empresa.razonSocial)
  assert.equal(h.selector(tree, 'DatosLegalesEmpresaCard').props.datos.cif, datos.empresa.nif)
  assert.equal(h.field(tree, 'empresa-domicilio'), undefined)
  assert.match(h.text(tree), /Empresa de prueba, S\.L\.|B12345678|Calle Ejemplo 10, Bilbao/)
  h.button(tree, 'Editar perfil').props.onClick()
  tree = h.render()
  const legalCard = h.selector(tree, 'DatosLegalesEmpresaCard')
  const legalInputs = h.all(legalCard, node => typeof node.props?.onChange === 'function')
  assert.equal(legalInputs.length, 1, 'Only the address can change; registered legal identity is readonly')
  assert.equal(legalInputs[0].props.id, 'empresa-domicilio')
  assert.equal(legalInputs[0].props.maxLength, 500)
  h.field(tree, 'empresa-domicilio').props.onChange({ target: { value: 'Calle Nueva 25, 2º A\n48001 Bilbao' } })
  await h.button(h.render(), 'Guardar cambios').props.onClick()
  assert.equal(h.actions.length, 1)
  assert.equal(h.actions[0].action, 'guardarPerfilEmpresa')
  const saved = h.actions[0].args[0]
  assert.equal(saved.domicilio, 'Calle Nueva 25, 2º A\n48001 Bilbao')
  for (const key of ['razonSocial', 'razon_social', 'nif', 'cif']) assert.equal(Object.hasOwn(saved, key), false, key)
  tree = h.render()
  assert.equal(h.field(tree, 'empresa-domicilio'), undefined)
  assert.equal(h.selector(tree, 'DatosLegalesEmpresaCard').props.datos.domicilio, saved.domicilio)
  assert.equal(h.selector(tree, 'DatosLegalesEmpresaCard').props.datos.razonSocial, datos.empresa.razonSocial)
  assert.equal(h.selector(tree, 'DatosLegalesEmpresaCard').props.datos.cif, datos.empresa.nif)
})

test('cancelling a company address draft restores the public address and readonly viewers cannot edit it', async () => {
  const datos = await completeProfileFixture()
  const h = sharedProfileHarness(datos)
  h.button(h.render(), 'Editar perfil').props.onClick()
  h.field(h.render(), 'empresa-domicilio').props.onChange({ target: { value: 'Dirección que se descarta' } })
  h.button(h.render(), 'Cancelar').props.onClick()
  assert.equal(h.selector(h.render(), 'DatosLegalesEmpresaCard').props.datos.domicilio, datos.empresa.domicilio)
  assert.deepEqual(h.actions, [])
  h.button(h.render(), 'Editar perfil').props.onClick()
  assert.equal(h.field(h.render(), 'empresa-domicilio').props.value, datos.empresa.domicilio)
  const readonly = sharedProfileHarness(datos, { editable: false })
  const tree = readonly.render()
  assert.equal(readonly.selector(tree, 'DatosLegalesEmpresaCard').props.datos.domicilio, datos.empresa.domicilio)
  assert.equal(readonly.field(tree, 'empresa-domicilio'), undefined)
  assert.equal(readonly.button(tree, 'Editar perfil'), undefined)
})

test('company address action validates and normalizes public multiline addresses while omitted addresses stay untouched', async () => {
  const { load, calls } = loadModules()
  const { guardarPerfilEmpresa } = load('app/actions/empresa-workspace.ts')
  const base = { nombre: 'Empresa ejemplo', descripcion: 'Descripción de empresa', web: '', ubicacion: 'Bilbao', servicios: ['Limpieza'], provincias: ['Bizkaia'], titulo: 'Especialistas' }
  assert.equal((await guardarPerfilEmpresa({ ...base, domicilio: '  Calle Nueva 25\n48001 Bilbao  ' })).error, undefined)
  assert.equal(calls[0].name, 'empresa_editar_perfil_profesional')
  assert.equal(calls[0].args.p_datos_profesionales.domicilio, 'Calle Nueva 25\n48001 Bilbao')
  assert.equal((await guardarPerfilEmpresa(base)).error, undefined)
  assert.equal(Object.hasOwn(calls[1].args.p_datos_profesionales, 'domicilio'), false)
  assert.equal((await guardarPerfilEmpresa({ ...base, domicilio: '' })).error, undefined)
  assert.equal(calls[2].args.p_datos_profesionales.domicilio, '')
  for (const domicilio of ['x'.repeat(501), 'Calle\u0000oculta', 123, null, ['Calle']]) assert.ok((await guardarPerfilEmpresa({ ...base, domicilio })).error)
  assert.equal(calls.length, 3, 'Invalid addresses never reach the database')
})
