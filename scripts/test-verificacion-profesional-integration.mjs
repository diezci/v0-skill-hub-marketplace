// Verificación manual: RLS, estados e historial con PostgreSQL 17 local desechable.
// Ejecutar: node scripts/test-verificacion-profesional-integration.mjs
// Prerequisite: npm install --prefix .build/workflow-db embedded-postgres@17.6.0-beta.15 pg@8.23.0
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const {default:EmbeddedPostgres}=await import('../.build/workflow-db/node_modules/embedded-postgres/dist/index.js');
const {default:pg}=await import('../.build/workflow-db/node_modules/pg/lib/index.js');
const root=path.resolve(new URL('..',import.meta.url).pathname);
const port=Number(process.env.DIIME_VERIFICATION_TEST_PORT || 55443);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local test port');
const runDir=path.join(root,'.build','workflow-verification-'+randomUUID());await fs.mkdir(runDir,{recursive:true});
const server=new EmbeddedPostgres({databaseDir:path.join(runDir,'data'),user:'postgres',password:'workflow-local-only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:m=>{if(String(m).includes('ERROR'))console.error(String(m))}});
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const schema=JSON.parse(await fs.readFile(new URL('./fixtures/workflow-schema-20260909.json',import.meta.url),'utf8'));
const grants=JSON.parse(await fs.readFile(new URL('./fixtures/workflow-grants-20260909.json',import.meta.url),'utf8'));
const conn={host:'127.0.0.1',port,user:'postgres',password:'workflow-local-only'};
const migrationFiles=['051_presupuesto_avisos_profesionales.sql','052_snapshot_comision_ofertas.sql',...(await fs.readdir(path.join(root,'supabase/migrations'))).filter(f=>/^\d{14}_/.test(f)).sort()];
async function restore(name,withMigrations) {
  await server.createDatabase(name);
  const db=new pg.Client({...conn,database:name});await db.connect();
  try {
    await db.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE TABLE auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',banned_until timestamptz,phone text,encrypted_password text,email_change text,phone_change text,confirmation_token text,recovery_token text,updated_at timestamptz);
      CREATE TABLE auth.sessions(id uuid primary key,user_id uuid);
      CREATE TABLE auth.identities(id uuid default gen_random_uuid(),user_id uuid);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $f$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(coalesce(auth.jwt()->>'sub',current_setting('request.jwt.claim.sub',true)),'')::uuid $f$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$ SELECT coalesce(auth.jwt()->>'role',nullif(current_setting('request.jwt.claim.role',true),'')) $f$;
      CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $f$ SELECT gen_random_uuid() $f$;
      GRANT USAGE ON SCHEMA public,auth,extensions TO anon,authenticated,service_role;
      SET check_function_bodies=off; SET search_path=public,extensions;`);
    for(const t of schema.tables) await db.query(`CREATE TABLE public.${quote(t.name)} (${t.columns.map(c=>`${quote(c.name)} ${c.type}${c.default?' DEFAULT '+c.default:''}${c.notnull?' NOT NULL':''}`).join(',')})`);
    for(const c of [...schema.constraints].sort((a,b)=>(a.type==='f')-(b.type==='f'))) if(c.type!=='t')await db.query(`ALTER TABLE public.${c.table} ADD CONSTRAINT ${quote(c.name)} ${c.definition}`);
    for(const i of schema.indexes)await db.query(i);
    for(const f of schema.functions)await db.query(f);
    for(const t of schema.triggers)await db.query(t);
    for(const t of schema.tables)if(t.rls)await db.query(`ALTER TABLE public.${quote(t.name)} ENABLE ROW LEVEL SECURITY`);
    for(const p of schema.policies)await db.query(`CREATE POLICY ${quote(p.policyname)} ON public.${quote(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(quote).join(',')}${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''}`);
    for(const g of grants.tables)await db.query(`GRANT ${g.privilege} ON public.${quote(g.table)} TO ${g.role==='PUBLIC'?'PUBLIC':quote(g.role)}`);
    for(const g of grants.columns)await db.query(`GRANT ${g.privilege} (${quote(g.column)}) ON public.${quote(g.table)} TO ${g.role==='PUBLIC'?'PUBLIC':quote(g.role)}`);
    if(withMigrations)for(const name of migrationFiles){await db.query('BEGIN');try{await db.query(await fs.readFile(path.join(root,'supabase/migrations',name),'utf8'));await db.query('COMMIT')}catch(e){await db.query('ROLLBACK');throw new Error(`${name}: ${e.message}`,{cause:e})}}
  }finally{await db.end();}
}

const checks = [];
const ids = Object.fromEntries(['particular', 'cliente', 'pendiente', 'admin', 'admin2', 'ajeno', 'historico', 'historicoRetirada', 'historicoEmpresa', 'empresa', 'sinSolicitud', 'concurrente', 'carreraEmpresa', 'borradoEmpresa', 'eliminado'].map(n => [n, randomUUID()]));
const connection = { ...conn, database: 'verification' };
const requestSql = 'select public.solicitar_verificacion_profesional($1) as id';
const reviewSql = 'select public.revisar_verificacion_profesional($1,$2,$3,$4,$5) as id';
const legacySql = 'select public.actualizar_verificacion_profesional($1,$2) as ok';
const linkSql = 'select public.vincular_mi_empresa(null,$1,$2,$3,$4,null,null) as id';
async function actor(alias, sql, values = [], role = 'authenticated') {
  assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
  if (sql === reviewSql && values.length === 4) {
    const result = await db.query('select actualizada_at::text as version from public.solicitudes_verificacion_profesional where profesional_id=$1',[values[0]]);
    values = [...values,result.rows[0]?.version || null];
  }
  const client = new pg.Client(connection); await client.connect();
  try {
    await client.query('begin');
    await client.query('select set_config(\'request.jwt.claims\', $1, true)', [JSON.stringify({sub: ids[alias] || null, role})]);
    await client.query(`set local role ${role}`);
    const result = await client.query(sql, values);
    await client.query('commit'); return result;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { await client.end(); }
}
async function denied(name, alias, sql, values = [], role = 'authenticated', code = '42501') {
  await assert.rejects(actor(alias, sql, values, role), e => e.code === code, name);
  checks.push(name);
}
const request = (alias, message = '') => actor(alias, requestSql, [message]).then(r => r.rows[0].id);
const review = (alias, state, comment = '', note = '', admin = 'admin', version) =>
  actor(admin, reviewSql, version === undefined ? [ids[alias],state,comment,note] : [ids[alias],state,comment,note,version]).then(r => r.rows[0].id);
await server.initialise(); await server.start();
let db;
try {
  await restore('verification', true);
  db = new pg.Client(connection); await db.connect();
  for (const [alias, id] of Object.entries(ids)) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)', [id, `${alias}@example.com`, alias === 'pendiente' ? null : new Date()]);
    await db.query('insert into public.profiles(id,email,nombre,es_admin,verificado,email_notificaciones,cuenta_eliminada) values($1,$2,$3,$4,$5,false,$6)',
      [id, `${alias}@example.com`, alias, alias.startsWith('admin'), alias.startsWith('historico'), alias === 'eliminado' ? new Date() : null]);
    if (alias !== 'cliente') await db.query('insert into public.profesionales(id,titulo,disponible) values($1,$2,false)', [id, 'Proveedor de prueba local']);
  }
  const snapshot = async alias => (await db.query(`select p.verificado, p.empresa_id as empresa_actual, s.*
    from public.profiles p left join public.solicitudes_verificacion_profesional s on s.profesional_id=p.id where p.id=$1`, [ids[alias]])).rows[0];
  const history = async alias => (await db.query('select * from public.historial_verificacion_profesional where profesional_id=$1 order by creado_at,id', [ids[alias]])).rows;
  const invariant = async (alias, state, verified) => {
    const row = await snapshot(alias); assert.equal(row.estado, state); assert.equal(row.verificado, verified);
    assert.equal(row.resuelta_at == null, ['pendiente', 'en_revision'].includes(state));
  };
  const fingerprint = async () => {
    const state = {};
    for (const table of ['solicitudes','ofertas','trabajos','transacciones_escrow','disputas','stripe_eventos_webhook','notificaciones','eventos_operativos'])
      state[table] = (await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) as hash from public.${table} t`)).rows[0].hash;
    return state;
  };
  const before = await fingerprint();

  await denied('anónimo no solicita', null, requestSql, [''], 'anon');
  await denied('cliente no solicita sin ser profesional', 'cliente', requestSql, ['']);
  await denied('correo no confirmado no solicita', 'pendiente', requestSql, ['']);
  await denied('perfil eliminado no solicita', 'eliminado', requestSql, ['']);
  await denied('rechaza mensaje excesivo', 'particular', requestSql, ['x'.repeat(2001)], 'authenticated', '22023');
  const expediente = await request('particular', '  Mi experiencia  ');
  assert.equal((await snapshot('particular')).mensaje, 'Mi experiencia');
  assert.equal(await request('particular', 'Doble clic no sobrescribe'), expediente);
  assert.equal((await history('particular')).length, 1);
  checks.push('solicitud y doble envío conservan un expediente y un evento');
  await invariant('particular', 'pendiente', false);
  for (const alias of ['particular', 'admin']) assert.equal((await actor(alias, 'select id from public.solicitudes_verificacion_profesional where id=$1', [expediente])).rowCount, 1);
  for (const alias of ['ajeno', 'cliente']) assert.equal((await actor(alias, 'select id from public.solicitudes_verificacion_profesional where id=$1', [expediente])).rowCount, 0);
  await denied('anónimo no consulta solicitudes', null, 'select * from public.solicitudes_verificacion_profesional', [], 'anon');
  checks.push('solo titular y administrador consultan el expediente');
  for (const alias of ['particular', 'admin']) {
    await denied(`${alias} no inserta expediente directamente`, alias,
      'insert into public.solicitudes_verificacion_profesional(profesional_id,estado) values($1,\'pendiente\')', [ids.ajeno]);
    await denied(`${alias} no altera expediente directamente`, alias,
      'update public.solicitudes_verificacion_profesional set estado=\'en_revision\' where id=$1', [expediente]);
    await denied(`${alias} no borra historial`, alias,
      'delete from public.historial_verificacion_profesional where profesional_id=$1', [ids.particular]);
    await denied(`${alias} no inserta historial`, alias,
      'insert into public.historial_verificacion_profesional(solicitud_id,profesional_id,estado) values($1,$2,\'verificado\')', [expediente, ids.particular]);
    await denied(`${alias} no cambia insignia por UPDATE directo`, alias,
      'update public.profiles set verificado=true where id=$1', [ids[alias]]);
  }
  await denied('proveedor no se aprueba', 'particular', reviewSql, [ids.particular,'verificado','','']);
  await denied('proveedor no elude wrapper usando helper privado', 'particular',
    'select diime_private.revisar_verificacion_profesional($1,\'verificado\',\'\',\'\',true)', [ids.particular]);
  await denied('admin no aprueba sin solicitud', 'admin', reviewSql, [ids.sinSolicitud,'verificado','',''], 'authenticated', '22023');
  await denied('RPC antiguo tampoco aprueba sin solicitud', 'admin', legacySql, [ids.sinSolicitud,true], 'authenticated', '22023');
  await denied('RPC nuevo exige versión leída del expediente', 'admin', reviewSql, [ids.particular,'verificado','','',null], 'authenticated', '22023');
  await denied('helper privado no elude versión con compatibilidad NULL', 'admin',
    'select diime_private.revisar_verificacion_profesional($1,\'verificado\',\'\',\'\',null,null)', [ids.particular], 'authenticated', '22023');
  await denied('helper privado no extiende compatibilidad a decisiones sin versión', 'admin',
    'select diime_private.revisar_verificacion_profesional($1,\'no_aprobado\',\'Motivo\',\'\',true,null)', [ids.particular], 'authenticated', '22023');
  await denied('no se admite estado desconocido', 'admin', reviewSql, [ids.particular,'inventado','',''], 'authenticated', '22023');
  for (const state of ['no_aprobado','retirada']) await denied(`${state} necesita motivo público`, 'admin', reviewSql, [ids.particular,state,'  ','nota'], 'authenticated', '22023');
  await denied('límite de comentario público', 'admin', reviewSql, [ids.particular,'en_revision','x'.repeat(2001),''], 'authenticated', '22023');
  await denied('límite de nota interna', 'admin', reviewSql, [ids.particular,'en_revision','','x'.repeat(4001)], 'authenticated', '22023');
  await review('particular','en_revision','Revisando experiencia','Nota privada A');
  await invariant('particular','en_revision',false);
  assert.equal(await request('particular'), expediente);
  assert.equal(await review('particular','en_revision','Reintento','Otra nota'), expediente);
  assert.equal((await history('particular')).length, 2);
  checks.push('revisión y solicitud repetidas no duplican ni alteran decisiones');
  await review('particular','verificado','Revisión completada','Nota privada B');
  await review('particular','verificado','Doble clic');
  await invariant('particular','verificado',true);
  assert.equal((await history('particular')).length, 3);
  await denied('perfil verificado no vuelve a solicitar', 'particular', requestSql, [''], 'authenticated', '22023');
  checks.push('aprobación sincroniza insignia y expediente atómicamente');
  assert.equal((await actor('particular','select * from public.historial_verificacion_profesional where solicitud_id=$1',[expediente])).rowCount, 0);
  assert.equal((await actor('ajeno','select * from public.historial_verificacion_profesional where solicitud_id=$1',[expediente])).rowCount, 0);
  const adminHistory = await actor('admin','select nota_interna from public.historial_verificacion_profesional where solicitud_id=$1',[expediente]);
  assert.ok(adminHistory.rows.some(r => r.nota_interna === 'Nota privada B'));
  assert.ok(!JSON.stringify((await actor('particular','select * from public.solicitudes_verificacion_profesional where id=$1',[expediente])).rows).includes('Nota privada'));
  checks.push('notas internas accesibles únicamente para administración');
  await review('particular','retirada','La documentación ha dejado de ser válida');
  await invariant('particular','retirada',false);
  assert.equal(await request('particular','Información corregida'), expediente);
  await review('particular','no_aprobado','Falta acreditar experiencia','Detalle solo para administración');
  await invariant('particular','no_aprobado',false);
  await denied('no se reabre una denegación desde admin aprobando', 'admin', reviewSql, [ids.particular,'verificado','',''], 'authenticated', '22023');
  assert.equal(await request('particular','Segunda corrección'), expediente);
  assert.equal((await snapshot('particular')).comentario_publico, null);
  await denied('RPC antiguo no aprueba ni siquiera una solicitud pendiente', 'admin', legacySql, [ids.particular,true], 'authenticated', '22023');
  await review('particular','verificado');
  await invariant('particular','verificado',true);
  await actor('admin',legacySql,[ids.particular,false]);
  await invariant('particular','retirada',false);
  assert.equal((await history('particular')).length, 9);
  checks.push('retirada, denegación y nuevas solicitudes conservan historial; retirada antigua sincroniza');
  await actor('admin',legacySql,[ids.historico,true]);
  await actor('admin',legacySql,[ids.historico,true]);
  assert.equal((await snapshot('historico')).verificado,true);
  assert.equal((await snapshot('historico')).id,null);
  assert.equal((await history('historico')).length,0);
  await actor('admin',legacySql,[ids.historico,false]);
  await invariant('historico','retirada',false);
  await actor('admin',legacySql,[ids.historicoRetirada,false]);
  await invariant('historicoRetirada','retirada',false);
  await actor('admin',legacySql,[ids.sinSolicitud,false]);
  assert.equal((await history('sinSolicitud')).length,0);
  checks.push('RPC antiguo true es no-op para insignias históricas; false retira con historial');

  // El propio proveedor crea una empresa por el RPC real de pertenencia.
  const legacyCompany = (await actor('historicoEmpresa',linkSql,['Empresa histórica','BLOCALHIST','11111111Z','Gerente'])).rows[0].id;
  await invariant('historicoEmpresa','retirada',false);
  assert.equal((await snapshot('historicoEmpresa')).empresa_id,null);
  assert.equal((await snapshot('historicoEmpresa')).empresa_actual,legacyCompany);
  checks.push('vínculo ordinario a empresa retira también insignia histórica sin solicitud');
  await request('empresa','Soy particular inicialmente');
  const company = (await actor('empresa',linkSql,['Empresa local','BLOCALEMP','22222222Z','Gerente'])).rows[0].id;
  await invariant('empresa','retirada',false);
  assert.equal((await snapshot('empresa')).empresa_id,null);
  await request('empresa','Ahora represento a mi empresa');
  assert.equal((await snapshot('empresa')).empresa_id,company);
  await review('empresa','verificado');
  await invariant('empresa','verificado',true);
  await db.query('update public.profiles set empresa_id=$1 where id=$2',[legacyCompany,ids.empresa]);
  await invariant('empresa','retirada',false);
  assert.equal((await snapshot('empresa')).empresa_id,company);
  assert.ok((await history('empresa')).some(h => h.estado === 'verificado' && h.empresa_id === company));
  await request('empresa','Nueva representación');
  assert.equal((await snapshot('empresa')).empresa_id,legacyCompany);
  await db.query('update public.solicitudes_verificacion_profesional set empresa_id=null where profesional_id=$1',[ids.empresa]);
  await denied('no aprueba snapshot de empresa diferente', 'admin', reviewSql, [ids.empresa,'verificado','',''], 'authenticated', '22023');
  await db.query('update public.solicitudes_verificacion_profesional set empresa_id=$1 where profesional_id=$2',[legacyCompany,ids.empresa]);
  checks.push('empresa se toma del perfil; cambio invalida petición/insignia y conserva representación histórica');
  const versionA = (await db.query('select actualizada_at::text as version from public.solicitudes_verificacion_profesional where profesional_id=$1',[ids.empresa])).rows[0].version;
  const idAntes = (await snapshot('empresa')).id;
  await db.query('update public.profiles set empresa_id=$1 where id=$2',[company,ids.empresa]);
  await request('empresa','Reenvío representando a la empresa B');
  assert.equal((await snapshot('empresa')).id,idAntes);
  await denied('modal de empresa A no aprueba reenvío de empresa B con mismo expediente', 'admin', reviewSql,
    [ids.empresa,'verificado','','',versionA], 'authenticated', '22023');
  await invariant('empresa','pendiente',false);
  await review('empresa','verificado');
  await invariant('empresa','verificado',true);
  checks.push('la versión actual permite aprobar B después de bloquear la versión antigua de A');

  const requests = await Promise.all(Array.from({length:8}, () => request('concurrente','Solicitud simultánea')));
  assert.equal(new Set(requests).size,1); assert.equal((await history('concurrente')).length,1);
  const sharedVersion = (await db.query('select actualizada_at::text as version from public.solicitudes_verificacion_profesional where profesional_id=$1',[ids.concurrente])).rows[0].version;
  const reviews = await Promise.allSettled(['admin','admin2'].map(a => review('concurrente','verificado','','',a,sharedVersion)));
  assert.equal(reviews.filter(r => r.status === 'fulfilled').length,1);
  assert.equal(reviews.filter(r => r.status === 'rejected' && r.reason.code === '22023').length,1);
  assert.equal((await history('concurrente')).length,2);
  await invariant('concurrente','verificado',true);
  checks.push('ocho solicitudes generan un expediente; dos aprobaciones concurrentes dan un éxito y un rechazo por versión');
  await request('carreraEmpresa');
  const blocker = new pg.Client(connection); await blocker.connect();
  try {
    await blocker.query('begin'); await blocker.query('select id from public.profiles where id=$1 for update',[ids.carreraEmpresa]);
    const decision = review('carreraEmpresa','verificado').then(() => ({ok:true}), e => ({ok:false,code:e.code}));
    const change = db.query('update public.profiles set empresa_id=$1 where id=$2',[company,ids.carreraEmpresa]);
    await new Promise(resolve => setTimeout(resolve,100));
    await blocker.query('commit');
    const result = await decision; await change;
    assert.ok(result.ok || result.code === '22023');
  } finally { await blocker.query('rollback'); await blocker.end(); }
  await invariant('carreraEmpresa','retirada',false);
  checks.push('aprobación compitiendo con cambio de empresa nunca deja insignia de la representación anterior');
  const removedCompany = (await actor('borradoEmpresa',linkSql,['Empresa eliminable local','BLOCALDELETE','33333333Z','Gerente'])).rows[0].id;
  await request('borradoEmpresa'); await review('borradoEmpresa','verificado');
  await db.query('delete from public.empresas where id=$1',[removedCompany]);
  await invariant('borradoEmpresa','retirada',false);
  assert.equal((await snapshot('borradoEmpresa')).empresa_actual,null);
  assert.ok((await history('borradoEmpresa')).some(h => h.estado === 'retirada' && h.empresa_id === removedCompany));
  checks.push('eliminar empresa respeta SET NULL previo y retira insignia conservando UUID histórico');
  const permissions = await db.query(`select n.nspname,p.proname,p.prosecdef,
    has_function_privilege('anon',p.oid,'execute') as anon_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','diime_private') and p.proname in
      ('solicitar_verificacion_profesional','revisar_verificacion_profesional','actualizar_verificacion_profesional','invalidar_verificacion_por_empresa')`);
  assert.ok(permissions.rows.every(r => !r.anon_execute));
  assert.ok(permissions.rows.filter(r => r.nspname === 'public').every(r => !r.prosecdef));
  assert.deepEqual(await fingerprint(),before);
  checks.push('RPC públicos invoker, sin acceso anónimo; tablas económicas y avisos intactos');
  const evidence = {resultado:'correcto',pruebas:checks.length,postgres:17,migraciones:migrationFiles,checks};
  await fs.writeFile(path.join(root,'.build','verification-integration-results.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
} finally {
  if (db) await db.end();
  await server.stop();
}
