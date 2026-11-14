import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const load = (file, deps) => {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console, require: name => { if (name === 'server-only') return {}; assert.ok(name in deps, name); return deps[name] },
  })
  return exports
}
const recipientModule = load('lib/empresas/notificaciones.ts', {})
const members = [
  { usuario_id: 'quoter', estado: 'activo', rol: 'miembro', permisos: { presupuestos: true, encargos: false, ver_cobros: false } },
  { usuario_id: 'owner', estado: 'activo', rol: 'principal', permisos: { presupuestos: false, encargos: true, ver_cobros: false } },
  { usuario_id: 'manager', estado: 'activo', rol: 'administrador', permisos: { presupuestos: true, encargos: false, ver_cobros: false } },
]
const admin = { from(table) {
  let filters = []
  const query = { select: () => query, eq: (k, v) => { filters.push([k, v]); return query }, in: () => query, is: () => query,
    maybeSingle: async () => ({ data: { propietario_id: 'owner' } }), then: resolve => resolve({ data: table === 'empresa_miembros' ? members.filter(m => filters.every(([k, v]) => k === 'empresa_id' || m[k] === v)) : members.map(m => ({ id: m.usuario_id })) }) }
  return query
} }
assert.deepEqual(Array.from(await recipientModule.destinatariosOperacionEmpresa(admin, 'company', 'quoter', 'presupuestos')), ['quoter'])
assert.deepEqual(Array.from(await recipientModule.destinatariosOperacionEmpresa(admin, 'company', 'quoter', 'encargos')), ['owner', 'manager'])
assert.deepEqual(Array.from(await recipientModule.destinatariosOperacionEmpresa(admin, 'company', 'quoter', 'ver_cobros')), [])
members[0].estado = 'revocado'
assert.deepEqual(Array.from(await recipientModule.destinatariosOperacionEmpresa(admin, 'company', 'quoter', 'presupuestos')), ['manager'])

const received = [], permissions = []
const notice = load('lib/hitos-avisos.ts', {
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => { const q = { select: () => q, eq: () => q, single: async () => ({ data: { id: 'offer', solicitud_id: 'request', profesional_id: 'quoter', empresa_id: 'company', solicitud: { titulo: 'Trabajo', cliente_id: 'client' } } }) }; return q } }) },
  '@/lib/notificaciones': { crearNotificacion: async n => received.push(n) },
  '@/lib/empresas/notificaciones': { destinatariosOperacionEmpresa: async (_admin, _company, _operator, permission) => { permissions.push(permission); return ['quoter'] } },
})
await notice.notificarCambioHitos('proponer_plan_oferta', { rol: 'cliente' }, { p_oferta: 'offer' })
assert.deepEqual(permissions, ['presupuestos'])
assert.equal(received[0].metadata.empresa_id, 'company'); assert.equal(received[0].metadata.permiso_destinatario, 'presupuestos')
assert.equal(received[0].link, '/ofertas/offer/plan')

// The post-insert revocation check must use the same budget permission;
// financial notices retain their independent, stronger billing requirement.
const checked = []
const stored = { usuario_id: 'quoter', tipo: 'oferta_actualizada', titulo: 'Plan', mensaje: 'Plan', link: '/ofertas/offer/plan', metadata: { empresa_id: 'company', oferta_id: 'offer', parte_destinataria: 'proveedor', permiso_destinatario: 'presupuestos' } }
const notificationModule = load('lib/notificaciones.ts', {
  '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'actor' } } }) } }) },
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: stored }) }) }) }) }) },
  '@/lib/empresas/notificaciones': { destinatariosOperacionEmpresa: async (_admin, _company, _operator, permission) => { checked.push(permission); return [] } },
  '@/lib/push/enviar': { enviarPushAUsuario: async () => assert.fail('Revoked recipient must not receive push') },
  '@/lib/emails/enviar': { enviarAvisoPorEmail: async () => assert.fail('Revoked recipient must not receive email') },
})
await notificationModule.crearNotificacion({ usuarioId: 'quoter', tipo: 'oferta_actualizada', titulo: 'Plan' })
stored.tipo = 'reembolso_emitido'
await notificationModule.crearNotificacion({ usuarioId: 'quoter', tipo: 'reembolso_emitido', titulo: 'Devolución' })
assert.deepEqual(checked, ['presupuestos', 'ver_cobros'])
console.log('Milestone notices: budget recipients, revoked recipients, fallback permissions and independent financial checks passed (no delivery).')
