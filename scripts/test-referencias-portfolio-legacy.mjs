// Real portfolio trigger from the migration; PostgreSQL with synthetic fixtures.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {renderPortfolioSql,imageArrayHash,preparePortfolioSql} from './ops/preparar-referencias-portfolio-legacy.mjs'
const {default:EmbeddedPostgres}=await import('../.build/workflow-db/node_modules/embedded-postgres/dist/index.js')
const {default:pg}=await import('../.build/workflow-db/node_modules/pg/lib/index.js')
const hash=value=>createHash('sha256').update(value).digest('hex')
const port=Number(process.env.PORTFOLIO_OPS_TEST_PORT||55559),directory=path.join(process.cwd(),'.build','portfolio-ops-'+randomUUID())
await fs.mkdir(directory,{recursive:true})
const server=new EmbeddedPostgres({databaseDir:path.join(directory,'data'),user:'postgres',password:'local-only',port,persistent:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}})
const migration=await fs.readFile('supabase/migrations/20261012204846_integridad_resenas_portfolio_notas_privadas.sql','utf8')
const trigger=migration.slice(migration.indexOf('create function diime_private.validar_portfolio_trabajo()'),migration.indexOf('\ncreate function diime_private.trabajos_valorables_profesional'))
const guard=await fs.readFile('scripts/ops/activar-guard-adjuntos-legacy.sql','utf8')
let db,failed=false,passed=0
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
const mappings=[],records=[],png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from('testPNG')])
async function snapshot(){return(await db.query('select to_jsonb(p) row from portfolio p order by id')).rows.map(row=>row.row)}
async function reset(){for(const m of mappings){await db.query('alter table portfolio disable trigger diime_guard_adjuntos_legacy');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[m.owner]);await db.query('update portfolio set imagenes=$1 where id=$2',[[m.legacy],m.portfolioId]);await db.query('alter table portfolio enable trigger diime_guard_adjuntos_legacy')}await db.query("select set_config('request.jwt.claim.sub','',false)")}
await server.initialise();await server.start()
try{
 await server.createDatabase('portfolio_ops');db=new pg.Client({host:'127.0.0.1',port,user:'postgres',password:'local-only',database:'portfolio_ops'});await db.connect()
 await db.query(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema diime_private;
 create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid$$;
 create table solicitudes(id uuid primary key,titulo text,descripcion text,ubicacion text,categoria_id uuid);
 create table categorias(id uuid primary key,nombre text);
 create table trabajos(id uuid primary key,solicitud_id uuid,profesional_id uuid,estado text);
 create table portfolio(id uuid primary key,trabajo_id uuid,profesional_id uuid,titulo text,descripcion text,ubicacion text,categoria text,imagenes text[],contexto_proveedor text,updated_at timestamptz default now());
 create table archivos_privados(id uuid primary key,legacy_url text,sha256 text,bytes bigint,propietario_id uuid,compartido boolean,storage_path text);
 create function diime_private.empresa_puede_operar_trabajo(tid uuid,actor uuid,p1 text,p2 text) returns boolean language sql as $$select exists(select 1 from public.trabajos where id=tid and profesional_id=actor)$$;`)
 for(let i=1;i<=2;i++){
  const portfolioId=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,owner=randomUUID(),privateId=randomUUID(),work=randomUUID(),request=randomUUID(),category=randomUUID()
  const legacy=`https://fixture.public.blob.vercel-storage.com/old-${i}.png`,sourceHash=hash(legacy),destination=`https://fixture.public.blob.vercel-storage.com/perfiles/public/legacy-${sourceHash}.png`
  await db.query('insert into categorias values($1,$2)',[category,'Categoria']);await db.query('insert into solicitudes values($1,$2,$3,$4,$5)',[request,'Titulo','Descripcion','Madrid',category]);await db.query('insert into trabajos values($1,$2,$3,$4)',[work,request,owner,'completado'])
  await db.query('insert into portfolio(id,trabajo_id,profesional_id,titulo,descripcion,ubicacion,categoria,imagenes,contexto_proveedor) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[portfolioId,work,owner,'Titulo','Descripcion','Madrid','Categoria',[legacy],'Conservar contexto'])
  await db.query("insert into archivos_privados values($1,$2,$3,$4,null,true,'legacy/test.png')",[privateId,legacy,hash(png),png.length])
  mappings.push({portfolioId,sourceHash,privateId,contentHash:hash(png),bytes:png.length,destination,imagesHash:imageArrayHash([legacy]),owner,legacy,work,request})
  records.push({id:privateId,legacy_url:legacy,sha256:hash(png),bytes:png.length,propietario_id:null,compartido:true,storage_path:'legacy/test.png',tipo:'image/png',nombre:`old-${i}.png`,url:`https://diime.test/api/archivos/${privateId}?nombre=old-${i}.png`})
 }
 await db.query(trigger);await db.query(guard)
 const safeMappings=()=>mappings.map(({owner,legacy,work,request,...m})=>m)
 await check('Fail-before: exact service-style update with null auth.uid is rejected by real trigger',async()=>{const before=await snapshot();await assert.rejects(db.query('update portfolio set imagenes=$1 where id=$2',[[mappings[0].destination],mappings[0].portfolioId]),e=>e.code==='42501'&&e.message.includes('No puedes publicar'));assert.deepEqual(await snapshot(),before)})
 await check('SQL owner claims update both rows and preserve every other field; claims restored',async()=>{const before=await snapshot();const prior=randomUUID();await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','existing-role',false),set_config('request.jwt.claims','{}',false)",[prior]);await db.query(renderPortfolioSql(safeMappings()));const after=await snapshot();for(let i=0;i<2;i++){assert.deepEqual(after[i].imagenes,[mappings[i].destination]);const{imagenes:a,updated_at:b,...restAfter}=after[i],{imagenes:c,updated_at:d,...restBefore}=before[i];assert.deepEqual(restAfter,restBefore)}assert.equal((await db.query('select auth.uid() as id')).rows[0].id,prior);assert.equal((await db.query("select current_setting('request.jwt.claim.role') as role")).rows[0].role,'existing-role');await db.query("select set_config('request.jwt.claim.sub','',false)")})
 await reset()
 await check('Second row canonicalization rolls back first row and all historical text',async()=>{await db.query('update solicitudes set descripcion=$1 where id=$2',['Changed canonical source',mappings[1].request]);const before=await snapshot();await assert.rejects(db.query(renderPortfolioSql(safeMappings())),e=>e.code==='55000'&&e.message.includes('otros campos'));await db.query('rollback');assert.deepEqual(await snapshot(),before);await db.query('update solicitudes set descripcion=$1 where id=$2',['Descripcion',mappings[1].request])})
 await check('CAS detects images edited after preparation and leaves both rows unchanged',async()=>{const prior=randomUUID();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[mappings[1].owner]);await db.query('update portfolio set imagenes=imagenes||$1::text where id=$2',['https://other.test/new.png',mappings[1].portfolioId]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[prior]);const before=await snapshot();await assert.rejects(db.query(renderPortfolioSql(safeMappings())),e=>e.code==='40001');await db.query('rollback');assert.deepEqual(await snapshot(),before);assert.equal((await db.query('select auth.uid() id')).rows[0].id,prior)})
 await reset()
 await check('Changed metadata or disabled product trigger abort before mutation',async()=>{const before=await snapshot();const wrong=safeMappings();wrong[0].contentHash='e'.repeat(64);await assert.rejects(db.query(renderPortfolioSql(wrong)),e=>e.code==='55000');await db.query('rollback');assert.deepEqual(await snapshot(),before);await db.query('alter table portfolio disable trigger validar_portfolio_trabajo');await assert.rejects(db.query(renderPortfolioSql(safeMappings())),e=>e.code==='55000');await db.query('rollback');await db.query('alter table portfolio enable trigger validar_portfolio_trabajo');assert.deepEqual(await snapshot(),before)})
 await check('Actual trigger retains work-state permission checks under owner claims',async()=>{await db.query("update trabajos set estado='en_progreso' where id=$1",[mappings[1].work]);const before=await snapshot();await assert.rejects(db.query(renderPortfolioSql(safeMappings())),e=>e.code==='42501'&&e.message.includes('no está disponible'));await db.query('rollback');assert.deepEqual(await snapshot(),before);await db.query("update trabajos set estado='completado' where id=$1",[mappings[1].work])})
 await check('Length-prefixed array CAS hash agrees with PostgreSQL for Unicode/quotes/delimiters',async()=>{const values=['ñ😀','a|b:c','"slash\\',''];const actual=(await db.query("select encode(sha256(convert_to(string_agg(octet_length(value)::text||':'||value,'|' order by ordinal),'UTF8')),'hex') h from unnest($1::text[]) with ordinality t(value,ordinal)",[values])).rows[0].h;assert.equal(actual,imageArrayHash(values))})
 await check('Read-only generator verifies copies and emits no original URL in SQL',async()=>{const io={preflight:async()=>{},listLegacyMetadata:async()=>records,listOwnedBlobs:async()=>mappings.map(m=>({url:m.destination,pathname:`perfiles/public/legacy-${m.sourceHash}.png`,size:png.length})),downloadPrivate:async()=>png,downloadPublic:async()=>({status:200,type:'image/png',bytes:png}),readPortfolio:async id=>({id,imagenes:[mappings.find(m=>m.portfolioId===id).legacy]})};const prepared=await preparePortfolioSql(io,{manifest:mappings.map(({portfolioId,sourceHash})=>({portfolioId,sourceHash})),projectRef:'fixture',siteUrl:'https://diime.test'});assert.equal(prepared.mappings.length,2);for(const m of mappings)assert.ok(!prepared.sql.includes(m.legacy));await db.query(prepared.sql);const after=await snapshot();assert.ok(after.every(row=>row.imagenes[0].includes('/perfiles/public/')));io.downloadPublic=async()=>({status:200,type:'image/png',bytes:Buffer.from('corrupt')});await assert.rejects(preparePortfolioSql(io,{manifest:[{portfolioId:mappings[0].portfolioId,sourceHash:mappings[0].sourceHash}],projectRef:'fixture',siteUrl:'https://diime.test'}),/PUBLIC_PNG_MISMATCH/)})
 console.log(JSON.stringify({passed,failed:0,localPostgres:true,remoteMutations:false,productTrigger:'20261012204846'}))
}catch(error){failed=true;console.error(error)}finally{if(db)await db.end();await server.stop()}
if(failed)process.exit(1)
