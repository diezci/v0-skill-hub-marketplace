// Reproduce the workflow migrations and race tests without production data.
// Prerequisite: npm install --prefix .build/workflow-db embedded-postgres@17.6.0-beta.15 pg@8.23.0
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const {default:EmbeddedPostgres}=await import('../.build/workflow-db/node_modules/embedded-postgres/dist/index.js');
const {default:pg}=await import('../.build/workflow-db/node_modules/pg/lib/index.js');
const root=path.resolve(new URL('..',import.meta.url).pathname);
const port=Number(process.env.DIIME_WORKFLOW_TEST_PORT || 55441);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local test port');
const runDir=path.join(root,'.build','workflow-verification-'+randomUUID());await fs.mkdir(runDir,{recursive:true});
const server=new EmbeddedPostgres({databaseDir:path.join(runDir,'data'),user:'postgres',password:'workflow-local-only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:m=>{if(String(m).includes('ERROR'))console.error(String(m))}});
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const schema=JSON.parse(await fs.readFile(new URL('./fixtures/workflow-schema-20260909.json',import.meta.url),'utf8'));
const grants=JSON.parse(await fs.readFile(new URL('./fixtures/workflow-grants-20260909.json',import.meta.url),'utf8'));
const conn={host:'127.0.0.1',port,user:'postgres',password:'workflow-local-only'};
const migrationFiles=['051_presupuesto_avisos_profesionales.sql','052_snapshot_comision_ofertas.sql',...(await fs.readdir(path.join(root,'supabase/migrations'))).filter(f=>f.startsWith('20260909')).sort()];
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
const runs=[];
async function test(script,database,extra={}) {
  const dsn=`postgresql://postgres:workflow-local-only@127.0.0.1:${port}/${database}`;
  const env={...process.env,DIIME_TEST_DATABASE_URL:dsn,WORKFLOW_TEST_DATABASE_URL:dsn,DIIME_PERMISSIONS_TEST_DATABASE_URL:dsn,...extra};
  const started=Date.now();
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'scripts',script)],{cwd:root,env,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${script}: exit ${code}`)))});
  runs.push({script,passed:true,milliseconds:Date.now()-started});
}
await server.initialise();await server.start();
try {
  await restore('workflow_history',false);
  await test('test-comisiones-historicas-integration.mjs','workflow_history');
  await restore('workflow_all',true);
  await test('test-permisos-rls.mjs','workflow_all');
  await test('test-contratacion-integration.mjs','workflow_all',{WORKFLOW_TEST_OUTPUT:path.join(root,'.build','workflow-contracts-result.json')});
  await test('test-pagos-workflow.mjs','workflow_all');
  const evidence={postgres:17,fixture:'schema, policies, grants and indexes only; synthetic auth compatibility tables',migrations:migrationFiles,runs};
  await fs.writeFile(path.join(root,'.build','workflow-integration-results.json'),JSON.stringify(evidence,null,2));
  console.log('All workflow migrations and local integration suites passed. No Stripe calls or production data.');
} finally {await server.stop();}
