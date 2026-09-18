import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Compila solo el núcleo de dominio, sin Next, server-only ni servicios externos.
const temporal = await mkdtemp(path.join(os.tmpdir(), 'diime-empresas-test-'))
const modulos = path.join(temporal, 'modulos')
await mkdir(modulos)
for (const archivo of ['types', 'seed', 'local-store']) {
  const fuente = await readFile(new URL(`../lib/empresas/${archivo}.ts`, import.meta.url), 'utf8')
  const salida = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  await writeFile(path.join(modulos, `${archivo}.js`), salida)
}
const require = createRequire(import.meta.url)
const { EmpresaLocalStore } = require(path.join(modulos, 'local-store.js'))
const { ACTORES_EMPRESA_LOCAL: actores, TODOS_PERMISOS, PERMISOS_BASE } = require(path.join(modulos, 'seed.js'))
let contador = 0
async function nuevo() { return new EmpresaLocalStore(path.join(temporal, `caso-${++contador}`)) }
const invitacion = (extra = {}) => ({ nombre: 'Elena Torres', email: 'elena@empresa.example', rol: 'miembro', permisos: { ...PERMISOS_BASE }, ...extra })
const presupuesto = { empresaId: 'reformas-garcia', titulo: 'Reforma de cocina en Madrid', descripcion: 'Queremos reformar la cocina y renovar todas las instalaciones.' }
const documento = { metodo: 'certificado', representanteNombre: 'Javier García', cargoLegal: 'Administrador único', documentoNombre: 'ejemplo.pdf', documento: new TextEncoder().encode('%PDF-1.7\nDocumento ficticio de prueba\n%%EOF'), consentimiento: true }
function correcto(resultado) { assert.equal(resultado.error, undefined); return resultado.data }
function error(resultado, patron) { assert.match(resultado.error ?? '', patron) }
function token(resultado) { return correcto(resultado).url.split('/').at(-1) }
after(async () => { await rm(temporal, { recursive: true, force: true }) })

test('DTO público contiene solo empresa y miembros públicos, sin credenciales ni documentación', async () => {
  const store = await nuevo()
  const publico = await store.publica('reformas-garcia')
  assert.ok(publico.local)
  const texto = JSON.stringify(publico)
  for (const campo of ['"email"', '"nif"', '"permisos"', '"rol"', 'tokenHash', 'documentoNombre', 'representanteNombre']) assert.equal(texto.includes(campo), false, campo)
  assert.equal(publico.resenas.length, 3)
  assert.ok(publico.resenas.every((r) => publico.trabajos.some((t) => t.id === r.trabajoId)))
  assert.equal(await store.publica('otra-empresa'), null)
})

test('se deniega la suplantación del rol y las escrituras sin permiso', async () => {
  const store = await nuevo()
  error(await store.espacio({ ...actores.owner, plataformaAdmin: true }), /identidad/)
  error(await store.invitar(actores.mario, invitacion()), /permiso/)
  error(await store.invitar(actores.admin, invitacion()), /permiso/)
  error(await store.invitar(actores.owner, invitacion({ email: 'real@real.com' })), /ficticia/)
})

test('administrador delegado no puede conceder finanzas, crear administradores ni alterar al principal', async () => {
  const store = await nuevo()
  error(await store.invitar(actores.ana, invitacion({ permisos: { ...TODOS_PERMISOS } })), /permisos que no tienes/)
  error(await store.invitar(actores.ana, invitacion({ rol: 'administrador' })), /Solo el responsable/)
  error(await store.actualizarMiembro(actores.ana, { miembroId: 'miembro-owner', rol: 'miembro', permisos: { ...PERMISOS_BASE } }), /protegido/)
  error(await store.revocarMiembro(actores.owner, 'miembro-owner'), /protegido/)
  error(await store.actualizarMiembro(actores.owner, { miembroId: 'miembro-mario', rol: 'miembro', permisos: { ...PERMISOS_BASE, gestionar_cobros: true } }), /requiere también/)
})

test('invitación dirigida, token solo hash, 7 días, y un único uso incluso con aceptación simultánea', async () => {
  const store = await nuevo()
  const resultado = await store.invitar(actores.owner, invitacion())
  assert.ok(correcto(resultado).url.startsWith('/mi-empresa/invitaciones/'))
  const secreto = token(resultado)
  const texto = await readFile(path.join(store.directorio, 'state.json'), 'utf8')
  assert.equal(texto.includes(secreto), false)
  const registro = JSON.parse(texto).invitaciones[0]
  assert.equal(new Date(registro.expiraEn) - new Date(registro.creadaEn), 7 * 86400000)
  error(await store.aceptarInvitacion(actores.cliente, secreto), /correo/)
  const resultados = await Promise.all([store.aceptarInvitacion(actores.invitado, secreto), store.aceptarInvitacion(actores.invitado, secreto)])
  assert.equal(resultados.filter((r) => !r.error).length, 1)
  assert.equal(correcto(await store.espacio(actores.owner)).miembros.filter((m) => m.usuarioId === 'invitado').length, 1)
  error(await store.aceptarInvitacion(actores.invitado, 'inventado'), /no existe/)
})

test('consultar un enlace con otra cuenta no revela destinatario, rol ni permisos', async () => {
  const store = await nuevo()
  const secreto = token(await store.invitar(actores.owner, invitacion({ rol: 'administrador', permisos: { ...TODOS_PERMISOS } })))
  for (const actor of [actores.cliente, actores.mario, actores.ana, actores.owner, actores.admin]) {
    const resultado = await store.invitacion(actor, secreto)
    error(resultado, /cuenta del correo/)
    assert.equal(resultado.data, undefined)
    const texto = JSON.stringify(resultado)
    for (const campo of ['elena@empresa.example', 'Elena Torres', 'administrador', 'permisos', 'tokenHash', 'expiraEn']) assert.equal(texto.includes(campo), false, campo)
  }
  const propia = correcto(await store.invitacion(actores.invitado, secreto))
  assert.equal(propia.coincideEmail, true)
  assert.equal(propia.invitacion.email, actores.invitado.email)
  assert.equal(propia.invitacion.rol, 'administrador')
  assert.equal('tokenHash' in propia.invitacion, false)
})

test('invitaciones canceladas y caducadas nunca incorporan al destinatario', async () => {
  const store = await nuevo()
  const secreto = token(await store.invitar(actores.owner, invitacion()))
  const espacio = correcto(await store.espacio(actores.owner))
  correcto(await store.cancelarInvitacion(actores.owner, espacio.invitaciones[0].id))
  error(await store.aceptarInvitacion(actores.invitado, secreto), /revocada/)
  const segundo = token(await store.invitar(actores.owner, invitacion()))
  const fichero = path.join(store.directorio, 'state.json')
  const estado = JSON.parse(await readFile(fichero, 'utf8'))
  estado.invitaciones.at(-1).expiraEn = '2000-01-01T00:00:00Z'
  await writeFile(fichero, JSON.stringify(estado))
  error(await store.aceptarInvitacion(actores.invitado, segundo), /caducado/)
})

test('las delegaciones pendientes se revalidan contra los permisos actuales del emisor', async () => {
  const store = await nuevo()
  const secreto = token(await store.invitar(actores.ana, invitacion({ permisos: { ...PERMISOS_BASE, presupuestos: true } })))
  correcto(await store.actualizarMiembro(actores.owner, { miembroId: 'miembro-ana', rol: 'administrador', permisos: { ...PERMISOS_BASE, equipo: true } }))
  error(await store.aceptarInvitacion(actores.invitado, secreto), /permisos que no tienes/)
})

test('revocación bloquea sesión existente, anula invitaciones y reasigna solicitudes conservando historia y proveedor', async () => {
  const store = await nuevo()
  const secreto = token(await store.invitar(actores.ana, invitacion()))
  correcto(await store.solicitarPresupuesto(actores.cliente, presupuesto))
  const antes = correcto(await store.espacio(actores.owner))
  assert.equal(antes.solicitudes[0].responsableUsuarioId, 'ana')
  correcto(await store.revocarMiembro(actores.owner, 'miembro-ana'))
  error(await store.espacio(actores.ana), /acceso activo/)
  error(await store.invitar(actores.ana, invitacion()), /permiso/)
  error(await store.aceptarInvitacion(actores.invitado, secreto), /revocada/)
  const despues = correcto(await store.espacio(actores.owner))
  assert.equal(despues.solicitudes[0].responsableUsuarioId, 'owner')
  assert.equal(despues.solicitudes[0].empresaRazonSocial, antes.solicitudes[0].empresaRazonSocial)
  const publico = await store.publica('reformas-garcia')
  assert.equal(publico.miembros.some((m) => m.usuarioId === 'ana'), false)
  assert.ok(publico.trabajos.some((t) => t.participantesIds.includes('ana')))
  assert.equal(publico.resenas.length, 3)
  const perfilHistorico = await store.empleado('ana')
  assert.equal(perfilHistorico.perfil.usuarioId, 'ana')
  assert.equal(perfilHistorico.empresa.miembros.some((m) => m.usuarioId === 'ana'), false)
  assert.equal(JSON.stringify(perfilHistorico.perfil).includes('email'), false)
})

test('miembro sin gestión solo ve su información y solicitudes asignadas', async () => {
  const store = await nuevo()
  correcto(await store.solicitarPresupuesto(actores.cliente, presupuesto))
  const espacio = correcto(await store.espacio(actores.mario))
  assert.equal(espacio.miembros.length, 1)
  assert.equal(espacio.miembros[0].usuarioId, 'mario')
  assert.deepEqual(espacio.invitaciones, [])
  assert.deepEqual(espacio.solicitudes, [])
  assert.equal(espacio.empresa.nif, '')
  assert.equal(espacio.verificacion, null)
})

test('subir PDF no verifica: identidad y autorización obligatorias; solo Diime revisa', async () => {
  const store = await nuevo()
  error(await store.solicitarVerificacion(actores.ana, documento), /responsable principal/)
  error(await store.solicitarVerificacion(actores.owner, { ...documento, consentimiento: false }), /Confirma/)
  error(await store.solicitarVerificacion(actores.owner, { ...documento, documento: new TextEncoder().encode('no es un pdf') }), /PDF válido/)
  error(await store.solicitarVerificacion(actores.owner, { ...documento, documento: new Uint8Array(5 * 1024 * 1024 + 1) }), /hasta 5 MB/)
  correcto(await store.solicitarVerificacion(actores.owner, documento))
  assert.equal((await store.publica('reformas-garcia')).empresa.estadoVerificacion, 'en_revision')
  error(await store.documentoVerificacion(actores.ana), /Solo el responsable/)
  error(await store.documentoVerificacion(actores.cliente), /Solo el responsable/)
  assert.deepEqual(correcto(await store.documentoVerificacion(actores.admin)).contenido, documento.documento)
  assert.equal(correcto(await store.documentoVerificacion(actores.owner)).nombre, 'ejemplo.pdf')
  error(await store.revisarVerificacion(actores.owner, { decision: 'verificada', nota: 'Quiero aprobar mi propia solicitud.' }), /equipo Diime/)
  error(await store.invitar(actores.owner, invitacion()), /verificación/)
  error(await store.solicitarPresupuesto(actores.cliente, presupuesto), /verificación/)
  correcto(await store.revisarVerificacion(actores.admin, { decision: 'requiere_informacion', nota: 'Adjunta un documento de representación actualizado.' }))
  assert.equal((await store.publica('reformas-garcia')).empresa.estadoVerificacion, 'requiere_informacion')
  correcto(await store.solicitarVerificacion(actores.owner, documento))
  correcto(await store.revisarVerificacion(actores.admin, { decision: 'verificada', nota: 'Documentación ficticia comprobada en esta prueba.' }))
  assert.equal((await store.publica('reformas-garcia')).empresa.estadoVerificacion, 'verificada')
})

test('solicitudes fijan proveedor y cliente, y el perfil comercial no reescribe lo contratado', async () => {
  const store = await nuevo()
  error(await store.solicitarPresupuesto(actores.owner, presupuesto), /vista de cliente/)
  error(await store.solicitarPresupuesto(actores.admin, presupuesto), /vista de cliente/)
  const id = correcto(await store.solicitarPresupuesto(actores.cliente, presupuesto)).id
  const empresa = (await store.publica('reformas-garcia')).empresa
  correcto(await store.guardarPerfil(actores.owner, { ...empresa, nombre: 'Reformas García Renovadas' }))
  const solicitud = correcto(await store.espacio(actores.owner)).solicitudes.find((s) => s.id === id)
  assert.equal(solicitud.empresaRazonSocial, 'Reformas García, S. L.')
  assert.equal(solicitud.clienteUsuarioId, 'cliente')
  assert.equal(solicitud.clienteNombre, 'Lucía Martín')
})

test('escrituras concurrentes preservan todas las solicitudes sin perder estado', async () => {
  const store = await nuevo()
  const resultados = await Promise.all(Array.from({ length: 24 }, (_, i) => store.solicitarPresupuesto(actores.cliente, { ...presupuesto, titulo: `Solicitud concurrente número ${i}` })))
  resultados.forEach(correcto)
  const estado = JSON.parse(await readFile(path.join(store.directorio, 'state.json'), 'utf8'))
  assert.equal(estado.solicitudes.length, 24)
  assert.equal(new Set(estado.solicitudes.map((s) => s.id)).size, 24)
  assert.equal(estado.actividad.length, 25)
})
