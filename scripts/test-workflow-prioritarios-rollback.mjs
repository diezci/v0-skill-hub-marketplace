// Verifica localmente el ensayo SQL de producción con fixtures desechables.
// Ejecutar: node scripts/test-workflow-prioritarios-rollback.mjs
// No necesita credenciales ni conexión a Supabase; no ejecuta escrituras remotas.
// Prerequisite: npm install --prefix .build/workflow-db embedded-postgres@17.6.0-beta.15 pg@8.23.0
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const {default:EmbeddedPostgres}=await import('../.build/workflow-db/node_modules/embedded-postgres/dist/index.js');
const {default:pg}=await import('../.build/workflow-db/node_modules/pg/lib/index.js');
const root=process.cwd();
const port=55548;
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local test port');
const runDir=path.join(root,'.build','workflow-verification-'+randomUUID());await fs.mkdir(runDir,{recursive:true});
const server=new EmbeddedPostgres({databaseDir:path.join(runDir,'data'),user:'postgres',password:'workflow-local-only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:m=>{if(String(m).includes('ERROR'))console.error(String(m))}});
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const schema=JSON.parse(await fs.readFile(path.join(root,'scripts/fixtures/workflow-schema-20260909.json'),'utf8'));
const grants=JSON.parse(await fs.readFile(path.join(root,'scripts/fixtures/workflow-grants-20260909.json'),'utf8'));
const conn={host:'127.0.0.1',port,user:'postgres',password:'workflow-local-only'};
const migrationFiles=['051_presupuesto_avisos_profesionales.sql','052_snapshot_comision_ofertas.sql',...(await fs.readdir(path.join(root,'supabase/migrations'))).filter(f=>/^\d{14}_/.test(f)&&f<'20261012000000').sort()];
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


const output=path.join(root,'.build/correcciones-prioritarias-20261012/privacidad');
await fs.mkdir(output,{recursive:true});await server.initialise();await server.start();let db;
try {
 await restore('workflow_catalog_comparison',true);db=new pg.Client({...conn,database:'workflow_catalog_comparison'});await db.connect();
 for(const name of (await fs.readdir(path.join(root,'scripts/fixtures/workflow-extra-20261005'))).filter(n=>n.endsWith('.sql')).sort())await db.query(await fs.readFile(path.join(root,'scripts/fixtures/workflow-extra-20261005',name),'utf8'));
 await db.query(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant all on storage.objects to service_role;`);
 for(const f of (await fs.readdir(path.join(root,'supabase/migrations'))).filter(f=>/^20261012\d{6}_/.test(f)).sort())await db.query(await fs.readFile(path.join(root,'supabase/migrations',f),'utf8'));
 await db.query('create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()');
 const byAlias=Object.fromEntries(['CP','PP','CE','PE','EP','AJ'].map(alias=>[alias,randomUUID()]));
 await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
 for(const alias of ['CP','PP','CE','PE','EP','AJ']){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[byAlias[alias],alias+'@example.test']);await db.query('insert into profiles(id,email,nombre) values($1,$2,$3) on conflict(id) do nothing',[byAlias[alias],alias+'@example.test','QA '+alias]);}
 for(const alias of ['PP','PE'])await db.query("insert into profesionales(id,titulo) values($1,'QA local')",[byAlias[alias]]);
 const companies={};for(const alias of ['CE','PE']){const c=(await db.query("insert into empresas(nombre,cif,propietario_id) values($1,$2,$3) returning id",['QA '+alias,'BLOCAL'+alias,byAlias[alias]])).rows[0].id;companies[alias]=c;await db.query('update profiles set empresa_id=$1 where id=$2',[c,byAlias[alias]]);}
 await db.query("insert into empresa_miembros(empresa_id,usuario_id,cargo,origen,rol,permisos) values($1,$2,'Operador','invitacion','miembro','{\"encargos\":true,\"mensajes\":true,\"presupuestos\":true,\"perfil\":false,\"equipo\":false,\"ver_cobros\":false,\"gestionar_cobros\":false}')",[companies.PE,byAlias.EP]);await db.query('update profiles set empresa_id=$1 where id=$2',[companies.PE,byAlias.EP]);
 let testSql=await fs.readFile(path.join(root,'scripts/verify-workflow-prioritarios-rollback.template.sql'),'utf8');
 for(const [alias,id] of Object.entries(byAlias))testSql=testSql.replaceAll('__QA_'+alias+'__',id);
 testSql=testSql.replaceAll('__QA_MARKER__','QA rollback '+randomUUID());
 const result=await db.query(testSql);const last=Array.isArray(result)?result.at(-1):result;console.log(JSON.stringify(last.rows,null,2));await fs.writeFile(path.join(output,'rollback-local-result.json'),JSON.stringify(last.rows[0].verification,null,2));
 const v=last.rows[0].verification;
 assert.equal(v.setup_completed,true);assert.equal(v.checks_count,31);assert.equal(v.all_checks_pass,true);assert.equal(v.qa_reputation_unchanged,true);assert.equal(v.qa_profiles_memberships_companies_unchanged,true);
 for(const key of ['fixture_requests_after_rollback','metadata_after_rollback','synthetic_users_after_rollback','synthetic_companies_after_rollback','synthetic_reviews_after_rollback','synthetic_portfolio_after_rollback','synthetic_notes_after_rollback'])assert.equal(v[key],0,key);
}finally{if(db)await db.end();await server.stop();}
process.exit(process.exitCode||0);
