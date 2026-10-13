// Real PostgreSQL, isolated synthetic data. Does not load production credentials.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
const {default:EmbeddedPostgres}=await import('../.build/workflow-db/node_modules/embedded-postgres/dist/index.js')
const {default:pg}=await import('../.build/workflow-db/node_modules/pg/lib/index.js')
const port=Number(process.env.LEGACY_GUARD_TEST_PORT||55558)
assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535)
const directory=path.join(process.cwd(),'.build','legacy-guard-'+randomUUID())
await fs.mkdir(directory,{recursive:true})
const server=new EmbeddedPostgres({databaseDir:path.join(directory,'data'),user:'postgres',password:'local-only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}})
const connection={host:'127.0.0.1',port,user:'postgres',password:'local-only',database:'workflow_legacy_guard'}
const activate=await fs.readFile('scripts/ops/activar-guard-adjuntos-legacy.sql','utf8')
const deactivate=await fs.readFile('scripts/ops/desactivar-guard-adjuntos-legacy.sql','utf8')
const verifyZero=await fs.readFile('scripts/ops/comprobar-cero-referencias-legacy.sql','utf8')
const legacy='https://fixture.public.blob.vercel-storage.com/old-file.png'
const next='https://fixture.test/api/archivos/00000000-0000-4000-8000-000000000001'
const id=randomUUID()
let db,oldSnapshot,passed=0,failed=false
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
async function actor(role,text,values=[]){const c=new pg.Client(connection);await c.connect();try{await c.query('begin');await c.query(`set local role ${role}`);const r=await c.query(text,values);await c.query('commit');return r}catch(e){await c.query('rollback');throw e}finally{await c.end()}}
async function deny(role,text,values=[],code='42501'){await assert.rejects(()=>actor(role,text,values),error=>error.code===code)}
await server.initialise();await server.start()
try{
 await server.createDatabase(connection.database);db=new pg.Client(connection);await db.connect()
 await db.query(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema diime_private;
 create table public.archivos_privados(id uuid primary key,legacy_url text,sha256 text,bytes bigint,propietario_id uuid,compartido boolean,storage_path text);
 create table public.profiles(id uuid primary key,foto_perfil text,bio text);
 create table public.portfolio(id uuid primary key,imagenes text[]);
 create table public.solicitudes(id uuid primary key,archivos jsonb);
 create table public."reseñas"(id uuid primary key,contenido jsonb);
 grant usage on schema public,diime_private to anon,authenticated,service_role;
 grant all on public.profiles,public.portfolio,public.solicitudes,public."reseñas" to anon,authenticated,service_role;
 grant all on public.archivos_privados to service_role;`)
 await db.query('insert into profiles values($1,null,$2)',[id,'Original'])
 await check('Before guard, a writer can introduce a legacy URL after a zero-reference scan',async()=>{
  assert.equal((await db.query('select count(*)::int n from profiles where foto_perfil=$1',[legacy])).rows[0].n,0)
  await actor('authenticated','update profiles set foto_perfil=$1 where id=$2',[legacy,id])
  assert.equal((await db.query('select foto_perfil from profiles where id=$1',[id])).rows[0].foto_perfil,legacy)
 })
 await check('Empty verified inventory rolls the entire installation back',async()=>{
  await assert.rejects(()=>db.query(activate),e=>e.code==='55000');await db.query('rollback')
  assert.equal((await db.query("select to_regclass('diime_private.adjuntos_legacy_en_retirada') as relation")).rows[0].relation,null)
 })
 await db.query("insert into archivos_privados values($1,$2,$3,128,null,true,'legacy/fixture.png')",[id,legacy,'f'.repeat(64)])
 await db.query('insert into portfolio values($1,$2)',[id,[legacy]])
 oldSnapshot=new pg.Client(connection);await oldSnapshot.connect();await oldSnapshot.query('begin isolation level repeatable read');await oldSnapshot.query('select count(*)from profiles')
 await check('Installation protects every public table including Unicode and excludes metadata',async()=>{
  const results=await db.query(activate);const row=results.at(-1).rows[0];assert.equal(Number(row.guarded_urls),1);assert.equal(Number(row.guarded_tables),4)
  assert.equal((await db.query("select has_table_privilege('authenticated','diime_private.adjuntos_legacy_en_retirada','select') allowed")).rows[0].allowed,false)
 })
 await check('An older repeatable-read snapshot cannot bypass the new inventory',async()=>{
  await assert.rejects(()=>oldSnapshot.query('insert into profiles values($1,$2,null)',[randomUUID(),legacy]),e=>e.code==='55000')
  await oldSnapshot.query('rollback');await oldSnapshot.end();oldSnapshot=null
 })
 await check('Browser roles, service role and cron/postgres all deny reintroduction',async()=>{
  for(const role of ['anon','authenticated','service_role','postgres'])await deny(role,'insert into profiles values($1,$2,null)',[randomUUID(),legacy])
 })
 await check('New duplicates and moving a reference to a different field are rejected',async()=>{
  await deny('service_role','update portfolio set imagenes=$1 where id=$2',[[legacy,legacy],id])
  await deny('service_role','update profiles set foto_perfil=null,bio=$1 where id=$2',[legacy,id])
 })
 await check('Embedded JSON/text/array references and Unicode table names are protected',async()=>{
  await deny('authenticated','insert into solicitudes values($1,$2)',[randomUUID(),JSON.stringify([legacy])])
  await deny('authenticated','insert into "reseñas" values($1,$2)',[randomUUID(),JSON.stringify({comment:`See [file](${legacy})`})])
  await deny('authenticated','insert into portfolio values($1,$2)',[randomUUID(),[legacy]])
 })
 await check('Ordinary edits and replacement of the old URL remain available',async()=>{
  await assert.rejects(()=>db.query(verifyZero),e=>e.code==='55000'&&e.message.includes('Persisten'));await db.query('rollback')
  await actor('authenticated','update profiles set bio=$1 where id=$2',['Edited normally',id])
  await actor('service_role','update profiles set foto_perfil=$1 where id=$2',[next,id])
  await actor('service_role','update portfolio set imagenes=array_replace(imagenes,$1,$2) where id=$3',[legacy,'https://public-copy.example.test/new.png',id])
  await actor('authenticated','insert into solicitudes values($1,$2)',[randomUUID(),JSON.stringify([next])])
 })
 await check('Unpaginated scan verifies zero references only while every guard is active',async()=>{
  const results=await db.query(verifyZero);assert.equal(results.at(-1).rows[0].verification,'zero_legacy_references_guard_active')
  await db.query('alter table profiles disable trigger diime_guard_adjuntos_legacy')
  await assert.rejects(()=>db.query(verifyZero),e=>e.code==='55000'&&e.message.includes('Tabla sin guard'));await db.query('rollback')
  await db.query('alter table profiles enable trigger diime_guard_adjuntos_legacy')
  await db.query("insert into archivos_privados values($1,$2,$3,128,null,true,'legacy/other.png')",[randomUUID(),legacy+'other','f'.repeat(64)])
  await assert.rejects(()=>db.query(verifyZero),e=>e.code==='55000'&&e.message.includes('sin protección'));await db.query('rollback')
  await db.query('delete from archivos_privados where legacy_url=$1',[legacy+'other'])
  await db.query(verifyZero)
 })
 await check('Two concurrent writers cannot reintroduce a URL after it was removed',async()=>{
  const results=await Promise.allSettled(['authenticated','service_role'].map(role=>actor(role,'update profiles set foto_perfil=$1 where id=$2',[legacy,id])))
  assert.ok(results.every(r=>r.status==='rejected'&&r.reason.code==='42501'))
  assert.equal((await db.query('select foto_perfil from profiles where id=$1',[id])).rows[0].foto_perfil,next)
 })
 await check('Metadata remains writable by its existing service role during the window',async()=>{
  await actor('service_role','update archivos_privados set legacy_url=$1 where id=$2',[legacy,id])
  for(const role of ['anon','authenticated','service_role'])await deny(role,'select * from diime_private.adjuntos_legacy_en_retirada')
 })
 await check('Installation retry preserves one guard per table and the inventory',async()=>{
  const results=await db.query(activate);assert.equal(Number(results.at(-1).rows[0].guarded_tables),4)
 })
 await check('Cleanup is idempotent and removes only the operational guard',async()=>{
  await db.query(deactivate);await db.query(deactivate)
  assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname='diime_guard_adjuntos_legacy'")).rows[0].n,0)
  await actor('authenticated','update profiles set foto_perfil=$1 where id=$2',[legacy,id])
  assert.equal((await db.query('select count(*)::int n from archivos_privados')).rows[0].n,1)
 })
 console.log(`${passed} legacy guard scenarios passed (local PostgreSQL; no network/production).`)
}catch(error){failed=true;console.error(error)}finally{
 if(oldSnapshot){await oldSnapshot.query('rollback');await oldSnapshot.end()}
 if(db)await db.end();await server.stop()
}
if(failed)process.exit(1)
