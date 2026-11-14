/** PostgreSQL real (PGlite), datos sintéticos y permisos auth/anon/service_role.
 * npm install --prefix /tmp/diime-empresa-db-tests --no-save --no-package-lock @electric-sql/pglite@0.3.14
 * PGLITE_PATH=/tmp/diime-empresa-db-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/empresas-equipo.test.mjs
 * La fixture conserva columnas y funciones relevantes del esquema vigente;
 * no sustituye un reset integral de Supabase ni una prueba Stripe end-to-end.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_PATH ? pathToFileURL(process.env.PGLITE_PATH).href : '@electric-sql/pglite')
process.on('uncaughtException',async e=>{console.error({message:e.message,code:e.code,where:e.where,position:e.position,detail:e.detail,stack:e.stack?.split('\n').slice(0,3).join('\n')});try{await db.close()}catch{}process.exit(1)})
export const db = new PGlite()
const read = (p) => readFile(new URL('../'+p, import.meta.url), 'utf8')
let assertions = 0
const check = (condition, message) => { assert.ok(condition, message); assertions++ }
const one = async (sql, args = []) => (await db.query(sql,args)).rows[0]
const rpc = async (name, args = []) => (await one(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).value
const asRole = async (role='postgres', actor=null) => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('diime.actor_usuario_id','',false)",[actor || ''])
  if (role !== 'postgres') await db.exec(`set role ${role}`)
}
const expectError = async (fn, pattern, message) => {
  try { await fn() } catch (error) { assert.match(error.message,pattern,message); assertions++; return }
  assert.fail(message || `Expected error ${pattern}`)
}
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema private; create schema diime_private;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public,private,diime_private to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
`)
await db.exec(await read('./fixtures/empresas-baseline.sql'))
await db.exec(`
 grant all on all tables in schema public to service_role;
 grant select,insert,update,delete on public.profiles,public.profesionales,public.empresas,public.solicitudes,public.ofertas,public.trabajos to authenticated;
 grant select on public.solicitudes to anon;
 alter table public.solicitudes enable row level security;
 alter table public.ofertas enable row level security;
 alter table public.trabajos enable row level security;
 create policy solicitudes_select on public.solicitudes for select using(true);
 create policy solicitudes_insert on public.solicitudes for insert to authenticated with check(cliente_id=auth.uid());
 create policy solicitudes_update on public.solicitudes for update to authenticated using(cliente_id=auth.uid()) with check(cliente_id=auth.uid());
 create policy solicitudes_delete on public.solicitudes for delete to authenticated using(cliente_id=auth.uid());
 create policy ofertas_select on public.ofertas for select to authenticated using(profesional_id=auth.uid() or exists(select 1 from public.solicitudes s where s.id=solicitud_id and s.cliente_id=auth.uid()));
 create policy ofertas_insert on public.ofertas for insert to authenticated with check(profesional_id=auth.uid());
 create policy ofertas_update on public.ofertas for update to authenticated using(profesional_id=auth.uid() or exists(select 1 from public.solicitudes s where s.id=solicitud_id and s.cliente_id=auth.uid()));
 create policy ofertas_delete on public.ofertas for delete to authenticated using(profesional_id=auth.uid());
 create policy trabajos_select on public.trabajos for select to authenticated using(auth.uid() in (cliente_id,profesional_id));
 create policy trabajos_update on public.trabajos for update to authenticated using(auth.uid() in (cliente_id,profesional_id));
`)
await db.exec(await read('./fixtures/empresas-workflow-baseline.sql'))
// The historical fixture contains the private RPC but omits its public wrapper.
const contractMigration = await read('../migrations/20260909191220_contratacion_atomica_y_guardas_workflow.sql')
const contractWrapperEnd = 'grant execute on function public.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz) to authenticated;'
await db.exec(contractMigration.slice(contractMigration.indexOf('create or replace function public.aceptar_oferta_y_crear_trabajo'), contractMigration.indexOf(contractWrapperEnd) + contractWrapperEnd.length))
await db.exec(await read('./fixtures/empresas-financial-baseline.sql'))
await db.exec(`
 grant execute on function public.vincular_mi_empresa(text,text,text,text,text,text,text) to authenticated;
 grant execute on function diime_private.vincular_empresa(text,text,text,text,text,text,text) to authenticated;
 create trigger trg_guardar_integridad_solicitud before insert or update or delete on public.solicitudes for each row execute function public.guardar_integridad_solicitud();
 create trigger trg_guardar_integridad_oferta before insert or update or delete on public.ofertas for each row execute function public.guardar_integridad_oferta();
 create trigger trg_guardar_integridad_trabajo before insert or update or delete on public.trabajos for each row execute function public.guardar_integridad_trabajo();
 create trigger trg_validar_nuevo_contrato before insert on public.trabajos for each row execute function public.validar_nuevo_contrato();
 create trigger trg_proteger_pertenencia_empresa before insert or update of empresa_id on public.profiles for each row execute function public.proteger_pertenencia_empresa();
`)
export const ids = {admin:'00000000-0000-4000-8000-000000000006',platformAdmin:'00000000-0000-4000-8000-000000000007',worker2:'00000000-0000-4000-8000-000000000008',owner:'00000000-0000-4000-8000-000000000001',member:'00000000-0000-4000-8000-000000000002',client:'00000000-0000-4000-8000-000000000003',outsider:'00000000-0000-4000-8000-000000000004',clientOnly:'00000000-0000-4000-8000-000000000005'}
for (const [name,id] of Object.entries(ids)) {
 await db.query("insert into auth.users values($1,$2,now())",[id,`${name}@example.test`])
 await db.query("insert into public.profiles(id,email,nombre,bio,verificado) values($1,$2,$3,'Resumen profesional de prueba',true)",[id,`${name}@example.test`,name])
 if(!['clientOnly','admin'].includes(name)) await db.query("insert into public.profesionales(id,titulo,stripe_account_id,stripe_onboarding_completado,stripe_transferencias_habilitadas,stripe_payouts_habilitados) values($1,'Profesional de prueba',$2,true,true,true)",[id,`acct_${name}`])
}
await db.exec(await read('../migrations/20260921221953_empresas_equipo_identidad_auditoria.sql'))
await db.exec(await read('../migrations/20260921222030_empresa_liquidacion_destino.sql'))
await db.exec(await read('../migrations/20260921223402_empresa_facturacion_snapshot.sql'))
await db.exec(await read('../migrations/20261005163655_empresas_roles_operaciones_verificacion.sql'))
await db.exec(await read('../migrations/20261014010000_empresa_revision_vigente.sql'))
await db.exec(await read('../migrations/20261014011000_empresa_continuidad_solicitudes.sql'))

await db.exec(await read('../migrations/048_liquidacion_inmutable.sql'))
await db.exec(await read('../migrations/20261005164234_empresa_stripe_independiente.sql'))
await db.exec(await read('../migrations/20261012204814_recuperar_reembolsos_y_cierre_cancelacion.sql'))
await db.exec(await read('../migrations/20261014113500_conciliar_fallo_tardio_reembolso.sql'))
await db.exec(await read('../migrations/20261014152829_reparar_enlaces_operaciones_empresa.sql'))
await db.exec(await read('../migrations/20261024183300_confirmacion_repetida_conserva_historial.sql'))
// Private-file ownership validator from the real migration; file access itself
// is tested by the repository's separate private-attachments suite.
await db.exec(`create table public.archivos_privados(id uuid primary key, propietario_id uuid, url text, legacy_url text, compartido boolean default false);`)
const filesMigration = await read('../migrations/20261012204908_proteger_adjuntos_privados.sql')
const validationStart=filesMigration.indexOf('create function diime_private.validar_adjuntos_actor(')
await db.exec(filesMigration.slice(validationStart,filesMigration.indexOf('$$;',validationStart)+3))
// Apply the later patch to the actual dispute function too. The separate
// cancellation-RPC fixture is outside this focused financial harness.
const attachmentPatchStart = filesMigration.indexOf('do $patch$')
const attachmentPatch = filesMigration.slice(attachmentPatchStart, filesMigration.indexOf('end; $patch$;', attachmentPatchStart) + 'end; $patch$;'.length)
await db.exec(attachmentPatch.replace("'public.diime_gestionar_solicitud_cancelacion(uuid,uuid,text,text,text[])',", ''))
const financialOriginal = await read('../migrations/20260909191217_pagos_disputas_atomicos.sql')
const guardStart=financialOriginal.indexOf('create or replace function public.diime_guardar_checkout_y_contexto()')
await db.exec(financialOriginal.slice(guardStart,financialOriginal.indexOf('$$;',guardStart)+3))
await db.exec(`create trigger trg_diime_guardar_checkout_y_contexto before insert or update on public.transacciones_escrow for each row execute function public.diime_guardar_checkout_y_contexto();`)
// Rebuild the actual latest definitions that the new migration wraps/patches.
// Keep unrelated profile actions out of this fixture, but execute their real
// table alterations and workspace patches in repository migration order.
async function applyFirstAlter(file, table) {
  const source = await read('../migrations/' + file)
  const expression = new RegExp('alter table public\\.' + table + '[\\s\\S]*?;', 'i')
  const statement = source.match(expression)?.[0]
  if (!statement) throw new Error('Missing authoritative table alteration: ' + file)
  await db.exec(statement)
}
async function applyNamedBlock(file, tag) {
  const source = await read('../migrations/' + file)
  const begin = source.indexOf('do ' + tag)
  const end = source.indexOf(tag + ';', begin + ('do ' + tag).length)
  if (begin < 0 || end < 0) throw new Error('Missing authoritative patch block: ' + file)
  await db.exec(source.slice(begin, end + tag.length + 1))
}
await applyFirstAlter('20261005182958_empresas_provincias_servicios_canonicos.sql', 'empresas')
await db.exec(await read('../migrations/20261013232340_versionar_respuestas_cancelacion.sql'))
await db.exec(await read('../migrations/20261023173640_documento_contratacion_acceso_vigente.sql'))
await applyFirstAlter('20261024001359_empresa_oferta_sustitucion_vinculada.sql', 'ofertas')
await db.exec(await read('../migrations/20261024005842_empresa_workspace_oferta_vinculo.sql'))
await db.exec(await read('../migrations/20261024140852_workflow_caducidad_y_recordatorios.sql'))
for (const file of [
  '20261103214330_empresa_portada_presupuesto_interes.sql',
  '20261103220036_empresa_perfil_profesional_completo.sql',
  '20261103221856_empresa_domicilio_identidad_publica.sql',
]) {
  await applyFirstAlter(file, 'empresas')
  await applyNamedBlock(file, '$migration$')
}
await applyNamedBlock('20261106134325_entregas_con_adjuntos.sql', '$patch$')
await db.exec(await read('../migrations/20261111235115_pagos_hitos_planes.sql'))
