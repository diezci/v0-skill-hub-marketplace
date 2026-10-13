// Reproduce the workflow migrations and race tests without production data.
// Prerequisite: npm install --prefix .build/workflow-db embedded-postgres@17.6.0-beta.15 pg@8.23.0
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const {default:EmbeddedPostgres}=await import('../.build/workflow-db/node_modules/embedded-postgres/dist/index.js');
const {default:pg}=await import('../.build/workflow-db/node_modules/pg/lib/index.js');
const root=process.cwd();
const port=Number(process.env.DIIME_WORKFLOW_TEST_PORT || 55441);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local test port');
const runDir=path.join(root,'.build','workflow-verification-'+randomUUID());await fs.mkdir(runDir,{recursive:true});
const server=new EmbeddedPostgres({databaseDir:path.join(runDir,'data'),user:'postgres',password:'workflow-local-only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:m=>{if(String(m).includes('ERROR'))console.error(String(m))}});
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const schema=JSON.parse(await fs.readFile(path.join(root,'scripts/fixtures/workflow-schema-20260909.json'),'utf8'));
const grants=JSON.parse(await fs.readFile(path.join(root,'scripts/fixtures/workflow-grants-20260909.json'),'utf8'));
const conn={host:'127.0.0.1',port,user:'postgres',password:'workflow-local-only'};
const migrationFiles=['051_presupuesto_avisos_profesionales.sql','052_snapshot_comision_ofertas.sql',...(await fs.readdir(path.join(root,'supabase/migrations'))).filter(f=>/^\d{14}_/.test(f)).sort()];
async function restore(name,withMigrations) {
  await server.createDatabase(name);
  const db=new pg.Client({...conn,database:name});await db.connect();
  try {
    await db.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      CREATE TABLE storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
      GRANT ALL ON storage.objects TO service_role; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
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
    // The September snapshot includes function bodies but omits function ACLs.
    // Restore this ACL from migration 050, independently confirmed read-only in
    // production on 2026-10-12: {postgres=X/postgres,service_role=X/postgres}.
    await db.query(`REVOKE EXECUTE ON FUNCTION public.registrar_evento_operativo(text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
      GRANT EXECUTE ON FUNCTION public.registrar_evento_operativo(text,text,text,text,text,jsonb) TO service_role`);
  }finally{await db.end();}
}
const runs=[]; const logRoot=path.join(root,'.build/correcciones-prioritarias-20261012/pagos');
async function test(script,database,extra={}) {
  const dsn=`postgresql://postgres:workflow-local-only@127.0.0.1:${port}/${database}`;
  const env={...process.env,DIIME_TEST_DATABASE_URL:dsn,WORKFLOW_TEST_DATABASE_URL:dsn,DIIME_PERMISSIONS_TEST_DATABASE_URL:dsn,...extra};
  const started=Date.now();
  let output=''; const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'scripts',script)],{cwd:root,env,stdio:['ignore','pipe','pipe']}); child.stdout.on('data',c=>{output+=c;process.stdout.write(c)}); child.stderr.on('data',c=>{output+=c;process.stderr.write(c)});child.once('error',reject);child.once('exit',resolve)}); await fs.writeFile(path.join(logRoot,(process.env.DIIME_RECOVERY_BASELINE==='claim'?'claim-before-':'')+path.basename(script)+'.log'),output); runs.push({script,passed:code===0,code,milliseconds:Date.now()-started});
}
await fs.mkdir(logRoot,{recursive:true});
await server.initialise();await server.start();
try {
  await restore('workflow_all',true);
  if(process.env.DIIME_RECOVERY_BASELINE==='claim') {
    const source=await fs.readFile(path.join(root,'supabase/migrations/20261005164234_empresa_stripe_independiente.sql'),'utf8');
    const start=source.indexOf('create or replace function public.diime_reclamar_liquidacion(');
    const end=source.indexOf('\nend; $$;',start)+'\nend; $$;'.length;
    const db=new pg.Client({...conn,database:'workflow_all'});await db.connect();
    try{await db.query(source.slice(start,end))}finally{await db.end()}
  }
  await test('test-cancelacion-revocacion-integration.mjs','workflow_all');
  await test('test-pagos-workflow.mjs','workflow_all');
  if(process.env.DIIME_RUN_ADVISORS==='1') {
    const dsn=`postgresql://postgres:workflow-local-only@127.0.0.1:${port}/workflow_all?sslmode=disable`;
    let output='';
    const code=await new Promise((resolve,reject)=>{const child=spawn('npx',['--yes','supabase@2.120.0','db','advisors','--db-url',dsn,'--type','all','--output','json'],{cwd:root,stdio:['ignore','pipe','pipe']});child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.once('error',reject);child.once('exit',resolve)});
    await fs.writeFile(path.join(logRoot,'local-advisors.log'),output);
    console.log(`Local Supabase advisors exit ${code}; details in local-advisors.log`);
  }
  const evidence={postgres:17,fixture:'schema, policies, table/column grants and indexes only; synthetic auth compatibility tables',fixtureCorrection:{scope:'local disposable database only',reason:'September snapshot omitted function ACLs',function:'public.registrar_evento_operativo(text,text,text,text,text,jsonb)',source:'migration 050 and production read-only privilege query on 2026-10-12',authenticatedExecute:false,anonExecute:false,proacl:['postgres=X/postgres','service_role=X/postgres']},migrations:migrationFiles,runs};
  await fs.writeFile(path.join(logRoot,process.env.DIIME_RECOVERY_BASELINE==='claim'?'sql-claim-before.json':'sql-all.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(runs));
  if (runs.some(run=>!run.passed)) process.exitCode=1;
} finally {await server.stop();}
// embedded-postgres uses async-exit-hook, whose beforeExit handler hardcodes 0.
// The server is already stopped; exit explicitly so a failed child fails CI.
if (runs.some(run=>!run.passed)) process.exit(1);
