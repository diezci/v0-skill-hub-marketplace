import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import ts from 'typescript'
const require = createRequire(import.meta.url)
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename)
const { PROVINCIAS_ES } = require('../../lib/provincias.ts')
const { CATEGORIAS_SERVICIO_NOMBRES } = require('../../lib/categorias.ts')

export async function testCoberturaEmpresa({ db, asRole, ids, one, rpc, check, expectError }) {
  await asRole()
  const historical = await one('select ubicacion,provincias from public.empresas where id=$1', [ids.company])
  check(historical.provincias.length === 0 && !!historical.ubicacion, 'Migración conserva ubicación histórica sin atribuir provincias')
  const owner = '40000000-0000-4000-8000-000000000001'
  const editor = '40000000-0000-4000-8000-000000000002'
  for (const [id, name] of [[owner, 'owner'], [editor, 'editor']]) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, `coverage-${name}@example.test`])
    await db.query('insert into public.profiles(id,email,nombre) values($1,$2,$3)', [id, `coverage-${name}@example.test`, name])
  }
  await asRole('authenticated', owner)
  const company = await rpc('vincular_mi_empresa', [null, 'Cobertura de prueba', 'B40000001', 'DOC', 'Dirección', null, 'Ciudad histórica libre'])
  const input = ['Nombre comercial', 'Descripción de empresa', 'Texto recibido que no debe usarse', 'https://example.test', 'https://example.test/logo.webp', ['Fontanería'], ['Madrid', 'Toledo']]
  const save = (services = input[5], provinces = input[6]) => rpc('empresa_editar_perfil_cobertura', [...input.slice(0, 5), services, provinces])
  await save()
  let workspace = await rpc('empresa_workspace')
  check(JSON.stringify(workspace.empresa.provincias) === JSON.stringify(['Madrid', 'Toledo']), 'Workspace conserva ambas provincias seleccionadas')
  check(workspace.empresa.ubicacion === 'Madrid, Toledo', 'Ubicación legible deriva de provincias y no del texto enviado')
  check(workspace.empresa.razon_social === 'Cobertura de prueba', 'Editar cobertura no cambia razón social legal')
  check(workspace.empresa.logo === input[4], 'Edición canónica conserva URL de logo')
  await save(CATEGORIAS_SERVICIO_NOMBRES, PROVINCIAS_ES)
  workspace = await rpc('empresa_workspace')
  assert.deepEqual(workspace.empresa.provincias, PROVINCIAS_ES)
  assert.deepEqual(workspace.empresa.servicios, CATEGORIAS_SERVICIO_NOMBRES)
  check(workspace.empresa.ubicacion.length > 200 && workspace.empresa.servicios.length === 56, 'Admite 52 provincias y 56 servicios sin límites históricos 200/30/12')
  await save(['Fontanería', 'Fontanería', 'Electricidad'], ['Madrid', 'Madrid', 'Toledo'])
  workspace = await rpc('empresa_workspace')
  check(workspace.empresa.provincias.join('|') === 'Madrid|Toledo' && workspace.empresa.servicios.join('|') === 'Fontanería|Electricidad', 'Deduplica selecciones conservando su orden')
  for (const provinces of [[], null, ['Madrid', 'Alcobendas'], ['Malaga'], ['Madrid', null]]) {
    await expectError(() => save(['Fontanería'], provinces), /provincia válida/, 'SQL rechaza provincias vacías, no canónicas o nulas')
  }
  for (const services of [[], null, ['Reformas y Construcción'], ['Pintura'], ['Fontanería', null]]) {
    await expectError(() => save(services, ['Madrid']), /servicio válido/, 'SQL rechaza agrupaciones y servicios libres o nulos')
  }
  await asRole('anon')
  await expectError(() => save(), /permission denied/, 'Anónimo no modifica cobertura')
  check(await rpc('empresa_perfil_publico', [company]) === null, 'Cobertura no publica una empresa sin verificar')
  await asRole('authenticated', ids.outsider)
  await expectError(() => save(), /permiso/, 'Usuario ajeno no modifica cobertura')
  await asRole('authenticated', owner)
  const invitation = await rpc('empresa_crear_invitacion', ['coverage-editor@example.test', 'Editor', 'miembro', JSON.stringify({ perfil: true }), false])
  await asRole('authenticated', editor)
  await rpc('empresa_aceptar_invitacion', [invitation.token])
  await save()
  check((await rpc('empresa_workspace')).empresa.provincias.length === 2, 'Miembro con permiso de perfil edita cobertura')
  await asRole('authenticated', owner)
  await rpc('empresa_actualizar_miembro', [editor, null, true, null, null, null])
  await asRole('authenticated', editor)
  await expectError(() => save(), /permiso/, 'Miembro revocado pierde edición inmediatamente')
  await asRole()
  await db.query("update public.empresas set estado_verificacion='verificada',verificada=true where id=$1", [company])
  await asRole('anon')
  const published = await rpc('empresa_perfil_publico', [company])
  const listed = (await rpc('empresas_publicas')).find(e => e.id === company)
  check(published.empresa.provincias.join('|') === 'Madrid|Toledo' && listed.provincias.join('|') === 'Madrid|Toledo', 'Perfil público y directorio publican el mismo array de provincias')
  check(!('cif' in published.empresa) && !('propietario_id' in published.empresa), 'Añadir cobertura no expone datos empresariales privados')
  await asRole('authenticated', owner)
  await rpc('empresa_editar_perfil', ['Nombre antiguo', 'Descripción antigua', 'Lugar legado libre', '', '', ['Servicio legado libre']])
  workspace = await rpc('empresa_workspace')
  check(workspace.empresa.ubicacion === 'Lugar legado libre', 'RPC de seis argumentos sigue siendo compatible con clientes publicados')
  check(workspace.empresa.provincias.join('|') === 'Madrid|Toledo', 'Cliente legado no infiere ni borra las provincias explícitas')
  await asRole()
  check((await one("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='empresa_editar_perfil_cobertura' and not p.prosecdef")).n === 1, 'Nuevo endpoint público es invoker y tiene firma única')
}
