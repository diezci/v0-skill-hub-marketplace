// Regresión independiente de adjuntos privados con PostgreSQL 17 desechable.
// Ejecutar: node scripts/test-archivos-privados-db.mjs
// Prerequisite: npm install --prefix .build/workflow-db embedded-postgres@17.6.0-beta.15 pg@8.23.0
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const {default:EmbeddedPostgres}=await import('../.build/workflow-db/node_modules/embedded-postgres/dist/index.js');
const {default:pg}=await import('../.build/workflow-db/node_modules/pg/lib/index.js');
const root=process.cwd();
const port=Number(process.env.ARCHIVOS_TEST_PORT||55549);
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

const evidence = []; let phase='after';
// The exported fixtures only fill gaps in older checkouts. A canonical migration
// with the same name is already applied by restore, even if its timestamp differs.
const migrationName = name => name.replace(/^\d{14}_/, '');
const canonicalMigrations = new Set(migrationFiles.map(migrationName));
const remoteMigrations = (await fs.readdir(path.join(root, 'scripts/fixtures/workflow-extra-20261005')))
  .filter(name => name.endsWith('.sql') && !canonicalMigrations.has(migrationName(name)))
  .sort();
const connection={...conn,database:'workflow_archivos_privados'};
let db;
const ids=Object.fromEntries(['cliente','proveedor','ajeno','otroProveedor','admin1'].map(x=>[x,randomUUID()]));
async function actor(alias,sql,values=[],role='authenticated') {const c=new pg.Client(connection);await c.connect();try{await c.query('begin');await c.query('select set_config(\'request.jwt.claims\',$1,true)',[JSON.stringify({sub:ids[alias]||null,role})]);await c.query(`set local role ${role}`);const r=await c.query(sql,values);await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}finally{await c.end();}}
async function check(caseIds,roles,name,fn){let observed;try{observed=await fn();evidence.push({phase,caseIds,roles,name,status:'pass',level:'localSQL',observed});console.log('PASS',name,JSON.stringify(observed));}catch(e){evidence.push({phase,caseIds,roles,name,status:'fail',level:'localSQL',observed:e.message,code:e.code});console.log('FAIL',name,e.message);}}
async function denied(alias,sql,args=[],role='authenticated'){try{const r=await actor(alias,sql,args,role);assert.equal(r.rowCount,0,'Forbidden mutation affected rows');return 'zero rows';}catch(e){if(e instanceof assert.AssertionError)throw e;assert.ok(['42501','55000','22023','23514','23505','P0001'].includes(e.code),`${e.code} ${e.message}`);return `${e.code}: ${e.message}`;}}
async function request(owner='cliente'){const id=randomUUID();await db.query("insert into solicitudes(id,cliente_id,titulo,descripcion,ubicacion,estado) values($1,$2,'Prueba local aislada','Reparación de una puerta interior con materiales','Madrid','abierta')",[id,ids[owner]]);return id;}
async function offer(d,p='proveedor',units='horas',time=8){const id=randomUUID();await db.query("insert into ofertas(id,solicitud_id,profesional_id,precio,tiempo_estimado,unidad_tiempo,descripcion,estado) values($1,$2,$3,100,$4,$5,'Servicio de prueba local','pendiente')",[id,d,ids[p],time,units]);return id;}
const accept=async (d,o,who='cliente',p='proveedor')=>(await actor(who,'select public.aceptar_oferta_y_crear_trabajo($1,$2,$3,null) resultado',[o,d,ids[p]])).rows[0].resultado;
const rpc=async(alias,name,args=[]) => (await actor(alias,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0]?.result;
const roleFor=alias=>alias==='cliente'?'cliente_particular':alias==='proveedor'?'proveedor_particular':alias==='admin1'?'admin':'ajeno';
async function createUser(alias,professional=true){ids[alias]=randomUUID();await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[ids[alias],`${alias}@example.test`]);await db.query('insert into profiles(id,email,nombre,es_admin,email_notificaciones) values($1,$2,$3,$4,false)',[ids[alias],`${alias}@example.test`,alias,alias==='admin1']);if(professional)await db.query("insert into profesionales(id,titulo) values($1,'Profesional sintético')",[ids[alias]]);}
async function jobFixture(client='cliente',provider='proveedor',clientCompany=null,providerCompany=null,state='completado'){
 const request=(await actor(client,"insert into solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion,estado) values($1,$2,'Demanda original','Texto original acordado con el cliente','Madrid','abierta') returning id",[ids[client],clientCompany])).rows[0].id;
 const offer=(await actor(provider,"insert into ofertas(solicitud_id,profesional_id,empresa_id,precio,tiempo_estimado,unidad_tiempo,descripcion,estado) values($1,$2,$3,100,8,'horas','Oferta sintética','pendiente') returning id",[request,ids[provider],providerCompany])).rows[0].id;
 const result=await rpc(client,'aceptar_oferta_y_crear_trabajo',[offer,request,ids[provider],null]);
 await db.query('update trabajos set estado=$1 where id=$2',[state,result.trabajo.id]);return{id:result.trabajo.id,request,offer,client,provider};
}
const reportDir=path.join(root,'.build/correcciones-prioritarias-20261012/archivos');await fs.mkdir(reportDir,{recursive:true});
const newMigrations=(await fs.readdir(path.join(root,'supabase/migrations'))).filter(f=>/^20261012\d{6}_/.test(f)).sort();
async function file(owner='cliente',legacy=false){const id=randomUUID(),url=`https://diime.es/api/archivos/${id}?nombre=Prueba%20sint%C3%A9tica.pdf`,legacyUrl=legacy?`https://legacy.example.test/${id}.pdf`:null;await db.query('insert into archivos_privados(id,propietario_id,storage_path,url,legacy_url,nombre,tipo,bytes) values($1,$2,$3,$4,$5,$6,$7,128)',[id,ids[owner],`${ids[owner]}/${id}.pdf`,url,legacyUrl,'Prueba sintética.pdf','application/pdf']);return{id,url,legacyUrl};}
const metadata=(who,f)=>rpc(who,'archivo_privado_metadata',[f.id]);
async function reads(who,f){const m=await metadata(who,f);assert.ok(m?.storage_path,`No metadata for ${who}`);assert.equal(m.nombre,'Prueba sintética.pdf');return true;}
async function hidden(who,f){assert.equal(await metadata(who,f),null,`Unexpected metadata for ${who}`);return true;}
async function refused(who,sql,args=[],role='authenticated'){await assert.rejects(actor(who,sql,args,role),e=>e.code==='42501',`Expected 42501 as ${who}`);return '42501';}
async function chat(a='cliente',b='proveedor'){const c=(await db.query('insert into conversaciones(participante_1,participante_2) values($1,$2) returning id',[ids[a],ids[b]])).rows[0].id;return c;}
async function message(who,c,f){return (await actor(who,"insert into mensajes(conversacion_id,remitente_id,contenido,tipo,archivo_url,archivo_nombre) values($1,$2,'Adjunto de prueba','archivo',$3,'Prueba sintética.pdf') returning id",[c,ids[who],f.url])).rows[0].id;}
async function serviceRPC(name,args){return (await actor(null,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args,'service_role')).rows[0]?.result;}
const test=(name,fn,roles=['cliente','proveedor','ajeno'])=>check(['adjuntos_privados'],roles,name,fn);
await server.initialise();await server.start();
try{
 await restore('workflow_archivos_privados',true);db=new pg.Client(connection);await db.connect();
 for(const name of remoteMigrations)await db.query(await fs.readFile(path.join(root,'scripts/fixtures/workflow-extra-20261005',name),'utf8'));
 await db.query(`create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated,service_role;
 grant all on storage.objects to anon,authenticated,service_role;
 grant all on storage.buckets to service_role;
 -- A permissive policy proves the new restrictive policy denies even if an old public policy exists.
 create policy fixture_old_public_access on storage.objects for all to anon,authenticated using(true) with check(true);
 insert into storage.objects(bucket_id,name) values('adjuntos-privados','fixture.pdf'),('avatars','public.png');`);
 for(const name of newMigrations){console.log('MIGRATION',name);await db.query(await fs.readFile(path.join(root,'supabase/migrations',name),'utf8'));}
 await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
 for(const alias of Object.keys(ids))await createUser(alias);
 await test('Bucket privado y las tres migraciones conviven',async()=>{assert.equal(newMigrations.length,3);assert.equal((await db.query("select public from storage.buckets where id='adjuntos-privados'")).rows[0].public,false);return{migrations:newMigrations,privateBucket:true};});
 const draft=await file();
 await test('Borrador: propietario puede leer; otro usuario no',async()=>{await reads('cliente',draft);await hidden('proveedor',draft);await hidden('ajeno',draft);return{owner:true,others:false};});
 for(const role of ['anon','authenticated'])await test(`Acceso directo Storage denegado para ${role} aunque exista política pública antigua`,async()=>{const who=role==='anon'?null:'cliente';const r=await actor(who,"select name from storage.objects where bucket_id='adjuntos-privados'",[],role);assert.equal(r.rowCount,0);assert.equal((await actor(who,"select name from storage.objects where bucket_id='avatars'",[],role)).rowCount,1);await refused(who,"insert into storage.objects(bucket_id,name) values('adjuntos-privados','intrusion.pdf')",[],role);assert.equal((await actor(who,"delete from storage.objects where bucket_id='adjuntos-privados' returning id",[],role)).rowCount,0);return{privateReads:0,insertDenied:true,deleteRows:0,unrelatedPublicRead:true};},[role]);
 for(const role of ['anon','authenticated'])await test(`Tabla metadata y funciones impersonación denegadas a ${role}`,async()=>{const who=role==='anon'?null:'cliente';await refused(who,'select * from archivos_privados',[],role);await refused(who,"update archivos_privados set compartido=false where id=$1",[draft.id],role);await refused(who,'select diime_private.archivo_puede_leer($1,$2)',[draft.id,ids.cliente],role);await refused(who,'select migrar_referencia_archivo_privado($1)',[draft.id],role);if(role==='anon')await refused(null,'select archivo_privado_metadata($1)',[draft.id],role);return{tableDenied:true,impersonationDenied:true,migrationDenied:true};},[role]);

 await test('Alias de URL y URL arbitraria nueva no se admiten al compartir un borrador propio',async()=>{
  const aliases=[draft.url+'?otra=1',draft.url+'#fragment',draft.url.replace('/api/','/%61pi/'),'https://external.example.test/new.pdf'];
  for(const url of aliases)await refused('cliente',"insert into solicitudes(cliente_id,titulo,descripcion,ubicacion,estado,archivos) values($1,'Alias','Descripción','Madrid','abierta',$2::jsonb)",[ids.cliente,JSON.stringify([url])]);
  assert.equal((await db.query('select compartido from archivos_privados where id=$1',[draft.id])).rows[0].compartido,false);await reads('cliente',draft);return{aliasVariantsDenied:aliases.length,draftRemainsOwned:true};
 });
 await test('Service RPC rechaza URL alias o externa nueva antes de modificar cancelación',async()=>{
  const j=await jobFixture('cliente','proveedor',null,null,'pendiente_pago');
  for(const url of [draft.url+'?otra=1',draft.url+'#fragment',draft.url.replace('/api/','/%61pi/'),'https://external.example.test/new.pdf'])await refused(null,'select diime_gestionar_solicitud_cancelacion($1,$2,$3,$4,$5)',[j.id,ids.cliente,'solicitar','Motivo',[url]],'service_role');
  assert.equal((await db.query('select cancelacion_estado from trabajos where id=$1',[j.id])).rows[0].cancelacion_estado,null);return{allAliasesDenied:true,noPartialState:true};
 });
 await test('URL histórica vinculada a padre accesible puede conservarse al editar o adjuntar',async()=>{
  const historical='https://legacy.example.test/historical-'+randomUUID()+'.pdf',j=await jobFixture('cliente','proveedor',null,null,'pendiente_pago');
  await db.query("update solicitudes set estado='en_progreso',archivos=$1::jsonb where id=$2",[JSON.stringify([historical]),j.request]);
  await serviceRPC('diime_gestionar_solicitud_cancelacion',[j.id,ids.cliente,'solicitar','Motivo',[historical]]);
  assert.deepEqual((await db.query('select cancelacion_adjuntos_solicitante from trabajos where id=$1',[j.id])).rows[0].cancelacion_adjuntos_solicitante,[historical]);
  await refused('ajeno',"insert into solicitudes(cliente_id,titulo,descripcion,ubicacion,estado,archivos) values($1,'Ajeno','Descripción','Madrid','abierta',$2::jsonb)",[ids.ajeno,JSON.stringify([historical])]);return{accessibleLegacyAllowed:true,outsiderDenied:true};
 });
 const c=await chat();
 await test('Chat: compartir borrador concede acceso al destinatario y excluye al ajeno',async()=>{await message('cliente',c,draft);await reads('cliente',draft);await reads('proveedor',draft);await hidden('ajeno',draft);assert.equal((await db.query('select compartido from archivos_privados where id=$1',[draft.id])).rows[0].compartido,true);return{participants:true,outsider:false};});
 await test('Bilateral: bloqueo elimina acceso al adjunto del chat incluso al uploader',async()=>{await actor('proveedor','insert into usuarios_bloqueados(bloqueador_id,bloqueado_id) values($1,$2)',[ids.proveedor,ids.cliente]);await hidden('cliente',draft);await hidden('proveedor',draft);return{blockedBoth:true};});
 await test('Copiar URL bloqueada a una demanda propia no recupera acceso',async()=>{await refused('cliente',"insert into solicitudes(cliente_id,titulo,descripcion,ubicacion,estado,archivos) values($1,'Copiar adjunto','Descripción','Madrid','abierta',$2::jsonb)",[ids.cliente,JSON.stringify([draft.url])]);await hidden('cliente',draft);return{insertionDenied:true};});
 await actor('proveedor','delete from usuarios_bloqueados where bloqueador_id=$1 and bloqueado_id=$2',[ids.proveedor,ids.cliente]);
 await test('Al desbloquear se restablece acceso vigente del chat',async()=>{await reads('cliente',draft);await reads('proveedor',draft);return{restored:true};});
 await test('Ajeno no enlaza la URL de chat en solicitud propia',async()=>{await refused('ajeno',"insert into solicitudes(cliente_id,titulo,descripcion,ubicacion,estado,archivos) values($1,'Copiar adjunto','Descripción','Madrid','abierta',$2::jsonb)",[ids.ajeno,JSON.stringify([draft.url])]);return{denied:true};});
 const reqFile=await file();let openRequest;
 await test('Solicitud admite URL repetida sin perder autorización durante su inserción',async()=>{openRequest=(await actor('cliente',"insert into solicitudes(cliente_id,titulo,descripcion,ubicacion,estado,archivos) values($1,'Con adjuntos','Descripción','Madrid','abierta',$2::jsonb) returning id",[ids.cliente,JSON.stringify([reqFile.url,reqFile.url])])).rows[0].id;await reads('proveedor',reqFile);await reads('ajeno',reqFile);return{duplicateURLsAccepted:true,registeredOpenRequestReadable:true};});
 await test('Al cerrar la demanda, ajenos pierden acceso y el cliente lo conserva',async()=>{assert.ok(openRequest,'Required successful create fixture');assert.equal((await actor('cliente',"update solicitudes set estado='cancelada' where id=$1 returning id",[openRequest])).rowCount,1);await hidden('ajeno',reqFile);await hidden('proveedor',reqFile);await reads('cliente',reqFile);return{closedRequestPrivate:true};});
 const base=await jobFixture('cliente','proveedor',null,null,'en_progreso');
 const offerFile=await file('proveedor');
 await test('Oferta: cliente y proveedor leen; ajeno no',async()=>{await db.query('update ofertas set archivos=$1::jsonb where id=$2',[JSON.stringify([offerFile.url]),base.offer]);await reads('cliente',offerFile);await reads('proveedor',offerFile);await hidden('ajeno',offerFile);return{contractParticipants:true,outsider:false};});
 const jFile=await file('proveedor');
 await test('Trabajo: ambas partes leen adjunto contractual; ajeno no',async()=>{await db.query('update trabajos set archivos=$1::jsonb where id=$2',[JSON.stringify([jFile.url]),base.id]);await reads('cliente',jFile);await reads('proveedor',jFile);await hidden('ajeno',jFile);return{parties:true,outsider:false};});
 const updateFile=await file('proveedor');
 await test('Actualización permite adjunto del proveedor y ambos participantes lo leen',async()=>{await actor('proveedor',"insert into actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje,archivos) values($1,$2,'mensaje','Avance',$3)",[base.id,ids.proveedor,[updateFile.url]]);await reads('cliente',updateFile);await reads('proveedor',updateFile);await hidden('ajeno',updateFile);return{validAttachment:true};});
 const foreign=await file('ajeno');
 await test('Copiar borrador ajeno en actualización propia se rechaza',async()=>{await refused('proveedor',"insert into actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje,archivos) values($1,$2,'mensaje','Copiado',$3)",[base.id,ids.proveedor,[foreign.url]]);await hidden('proveedor',foreign);return{denied:true};});
 await test('Copiar borrador ajeno en oferta propia se rechaza',async()=>{const r=await request();await refused('proveedor',"insert into ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,unidad_tiempo,descripcion,estado,archivos) values($1,$2,100,8,'horas','Oferta','pendiente',$3::jsonb)",[r,ids.proveedor,JSON.stringify([foreign.url])]);return{denied:true};});
 await test('Copiar borrador ajeno en mensaje propio se rechaza',async()=>{await refused('cliente',"insert into mensajes(conversacion_id,remitente_id,contenido,tipo,archivo_url) values($1,$2,'Copiado','archivo',$3)",[c,ids.cliente,foreign.url]);return{denied:true};});
 for(const side of ['cliente','proveedor'])await test(`Service RPC cancelación valida p_actor ${side} y no su privilegio técnico`,async()=>{const j=await jobFixture('cliente','proveedor',null,null,'pendiente_pago');await refused(null,'select diime_gestionar_solicitud_cancelacion($1,$2,$3,$4,$5)',[j.id,ids[side],'solicitar','Motivo sintético',[foreign.url]],'service_role');assert.equal((await db.query('select cancelacion_estado from trabajos where id=$1',[j.id])).rows[0].cancelacion_estado,null);const f=await file(side);await serviceRPC('diime_gestionar_solicitud_cancelacion',[j.id,ids[side],'solicitar','Motivo sintético',[f.url]]);await reads('cliente',f);await reads('proveedor',f);await hidden('ajeno',f);return{foreignDenied:'42501',noPartialState:true,validAccepted:true};},[side]);
 await test('Service RPC rechazo/disputa valida adjunto del actor que se opone',async()=>{const j=await jobFixture('cliente','proveedor',null,null,'pendiente_pago');await serviceRPC('diime_gestionar_solicitud_cancelacion',[j.id,ids.cliente,'solicitar','Motivo sintético',[]]);await refused(null,'select diime_abrir_disputa($1,$2,$3,$4,$5)',[j.id,ids.proveedor,'Oposición sintética',true,[foreign.url]],'service_role');assert.equal((await db.query('select count(*)::int n from disputas where trabajo_id=$1',[j.id])).rows[0].n,0);const f=await file('proveedor');await serviceRPC('diime_abrir_disputa',[j.id,ids.proveedor,'Oposición sintética',true,[f.url]]);await reads('cliente',f);await reads('proveedor',f);await hidden('ajeno',f);return{foreignDenied:'42501',noPartialDispute:true,validAccepted:true};});
 await test('Usuario eliminado no conserva acceso de borrador ni contrato',async()=>{await db.query('update profiles set cuenta_eliminada=now() where id=$1',[ids.proveedor]);await hidden('proveedor',jFile);const f=await file('proveedor');await hidden('proveedor',f);await db.query('update profiles set cuenta_eliminada=null where id=$1',[ids.proveedor]);return{inactiveDenied:true};});
 await test('Admin vigente puede consultar adjuntos para soporte',async()=>{await reads('admin1',foreign);await reads('admin1',jFile);return{adminAllowed:true};},['admin']);
 const all={perfil:true,mensajes:true,presupuestos:true,encargos:true,equipo:true,ver_cobros:true,gestionar_cobros:true};
 for(const alias of ['empresa_titular','empresa_administrador','empresa_miembro','empresa_original'])await createUser(alias);
 const company=await rpc('empresa_titular','vincular_mi_empresa',[null,'Empresa archivos','BTESTARCHIVOS','DOC-SINTETICO','Titular',null,'Madrid']);
 await db.query("update empresas set verificada=true,estado_verificacion='verificada' where id=$1",[company]);
 for(const suffix of ['administrador','miembro','original']){const alias=`empresa_${suffix}`,invite=await rpc('empresa_titular','empresa_crear_invitacion',[`${alias}@example.test`,'Operador',suffix==='administrador'?'administrador':'miembro',JSON.stringify(all),false]);await rpc(alias,'empresa_aceptar_invitacion',[invite.token]);}
 const corpJob=await jobFixture('cliente','empresa_original',null,company,'en_progreso');
 await rpc('empresa_titular','empresa_reasignar_trabajo',[corpJob.id,ids.empresa_miembro,'proveedor']);
 const corpFile=await file('empresa_original');await db.query('update trabajos set archivos=$1::jsonb where id=$2',[JSON.stringify([corpFile.url]),corpJob.id]);
 const ec=(await db.query('insert into empresa_conversaciones(participante_1,participante_2,empresa_1_id,responsable_1_id,responsable_2_id,trabajo_id) values($1,$2,$3,$4,$2,$5) returning id',[ids.empresa_original,ids.cliente,company,ids.empresa_miembro,corpJob.id])).rows[0].id;
 const corpMessageFile=await file('empresa_miembro');
 await test('Chat empresarial permite adjunto y participantes vigentes acceden',async()=>{const r=await rpc('empresa_miembro','empresa_mensaje_enviar',[ec,'Adjunto empresarial','archivo',corpMessageFile.url,'Prueba.pdf']);assert.ok(r?.id);for(const who of ['cliente','empresa_titular','empresa_administrador','empresa_miembro'])await reads(who,corpMessageFile);await hidden('ajeno',corpMessageFile);return{currentRolesAllowed:4,outsider:false};});
 await test('Chat empresarial rechaza URL ajena aunque la RPC ejecute con privilegios internos',async()=>{await refused('empresa_miembro','select empresa_mensaje_enviar($1,$2,$3,$4,$5)',[ec,'Adjunto ajeno','archivo',foreign.url,'Ajeno.pdf']);return{foreignDenied:'42501'};});
 for(const suffix of ['titular','administrador','miembro'])await test(`Trabajo empresarial permite acceso al ${suffix} vigente`,async()=>{await reads(`empresa_${suffix}`,corpFile);return{allowed:true};},[`empresa_${suffix}`]);
 await test('Revocar uploader empresarial elimina acceso al archivo contractual',async()=>{await rpc('empresa_titular','empresa_actualizar_miembro',[ids.empresa_original,null,true,null,null,null]);await hidden('empresa_original',corpFile);await reads('empresa_miembro',corpFile);return{uploaderRevoked:true,currentOperator:true};});
 await test('Revocar uploader de chat empresarial elimina acceso incluso siendo autor del mensaje',async()=>{await rpc('empresa_titular','empresa_actualizar_miembro',[ids.empresa_miembro,null,true,null,null,null]);await hidden('empresa_miembro',corpMessageFile);await reads('empresa_titular',corpMessageFile);await reads('cliente',corpMessageFile);return{uploaderRevoked:true,otherParticipants:true};});
 await test('Admin sin encargos pierde archivo contractual; lectura del chat conserva semántica del padre',async()=>{await rpc('empresa_titular','empresa_actualizar_miembro',[ids.empresa_administrador,'Operador',false,null,JSON.stringify({...all,encargos:false,mensajes:false}),null]);await hidden('empresa_administrador',corpFile);await reads('empresa_administrador',corpMessageFile);const messages=await rpc('empresa_administrador','empresa_mensajes_listar',[ec]);assert.ok(JSON.stringify(messages).includes(corpMessageFile.url));await refused('empresa_administrador','select empresa_mensaje_enviar($1,$2,$3,$4,$5)',[ec,'Sin permiso de escritura','archivo',corpMessageFile.url,'Archivo.pdf']);return{contractReadDenied:true,chatReadMatchesParent:true,chatWriteDenied:true};});
 await test('Un adjunto compartido y posteriormente desvinculado no vuelve a ser borrador',async()=>{const f=await file('cliente');const r=(await actor('cliente',"insert into solicitudes(cliente_id,titulo,descripcion,ubicacion,estado,archivos) values($1,'Borrador','Descripción','Madrid','abierta',$2::jsonb) returning id",[ids.cliente,JSON.stringify([f.url])])).rows[0].id;await actor('cliente',"update solicitudes set archivos='[]' where id=$1",[r]);await hidden('cliente',f);assert.equal((await db.query('select compartido from archivos_privados where id=$1',[f.id])).rows[0].compartido,true);return{noOwnerFallback:true};});
 await test('Migración legacy sustituye las seis tablas y ambos adjuntos de cancelación; reintento idempotente',async()=>{
  const f=await file('cliente',true),j=await jobFixture('cliente','proveedor',null,null,'pendiente_pago');await db.query("update solicitudes set estado='en_progreso' where id=$1",[j.request]);
  await db.query('update solicitudes set archivos=$1::jsonb where id=$2',[JSON.stringify([f.legacyUrl,f.legacyUrl,'https://external.example.test/other.pdf']),j.request]);
  await db.query('update ofertas set archivos=$1::jsonb where id=$2',[JSON.stringify([f.legacyUrl]),j.offer]);
  await db.query('update trabajos set archivos=$1::jsonb,cancelacion_adjuntos_solicitante=$2,cancelacion_adjuntos_respuesta=$2 where id=$3',[JSON.stringify([f.legacyUrl]),[f.legacyUrl],j.id]);
  const u=(await db.query("insert into actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje,archivos) values($1,$2,'mensaje','Histórico',$3) returning id",[j.id,ids.proveedor,[f.legacyUrl]])).rows[0].id;
  const m=(await db.query("insert into mensajes(conversacion_id,remitente_id,contenido,archivo_url) values($1,$2,'Histórico',$3) returning id",[c,ids.cliente,f.legacyUrl])).rows[0].id;
  const em=(await db.query("insert into empresa_mensajes(conversacion_id,remitente_id,remitente_nombre,contenido,archivo_url) values($1,$2,'Autor histórico','Histórico',$3) returning id",[ec,ids.cliente,f.legacyUrl])).rows[0].id;
  await serviceRPC('migrar_referencia_archivo_privado',[f.id]);
  const snapshot=async()=>({s:(await db.query('select archivos from solicitudes where id=$1',[j.request])).rows[0],o:(await db.query('select archivos from ofertas where id=$1',[j.offer])).rows[0],t:(await db.query('select archivos,cancelacion_adjuntos_solicitante,cancelacion_adjuntos_respuesta,estado from trabajos where id=$1',[j.id])).rows[0],u:(await db.query('select archivos from actualizaciones_trabajo where id=$1',[u])).rows[0],m:(await db.query('select archivo_url from mensajes where id=$1',[m])).rows[0],em:(await db.query('select archivo_url from empresa_mensajes where id=$1',[em])).rows[0]});
  const before=await snapshot();assert.ok(!JSON.stringify(before).includes(f.legacyUrl));assert.equal(before.s.archivos.filter(x=>x===f.url).length,2);assert.ok(before.s.archivos.includes('https://external.example.test/other.pdf'));assert.equal(before.t.estado,'pendiente_pago');assert.equal(before.em.archivo_url,f.url);assert.equal(before.m.archivo_url,f.url);assert.deepEqual(before.u.archivos,[f.url]);assert.deepEqual(before.t.cancelacion_adjuntos_solicitante,[f.url]);assert.deepEqual(before.t.cancelacion_adjuntos_respuesta,[f.url]);
  await serviceRPC('migrar_referencia_archivo_privado',[f.id]);assert.deepEqual(await snapshot(),before);await reads('cliente',f);await reads('proveedor',f);await hidden('ajeno',f);await refused('cliente','select migrar_referencia_archivo_privado($1)',[f.id]);return{allSixTables:true,cancellationArrays:true,duplicatesPreserved:true,idempotent:true,financialStateIntact:true};
 });
 await test('Permisos y search_path de funciones no exponen helpers privilegiados',async()=>{const functions=(await db.query("select n.nspname,p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname=ANY($1)",[['archivo_solicitud_acceso','archivo_oferta_acceso','archivo_url_acceso','archivo_puede_leer','archivo_privado_metadata','validar_vinculos_archivos_privados','validar_adjuntos_actor','migrar_referencia_archivo_privado']])).rows;assert.ok(functions.length>=9);assert.ok(functions.every(x=>!x.anon));assert.ok(functions.filter(x=>x.proname!=='archivo_privado_metadata').every(x=>!x.authenticated));assert.ok(functions.filter(x=>x.nspname==='diime_private').every(x=>x.prosecdef&&x.proconfig.includes('search_path=""')));assert.ok(functions.filter(x=>x.nspname==='public').every(x=>!x.prosecdef));return{functions:functions.length,anonDenied:true,privilegedHelpersDenied:true};});
}finally{
 await fs.writeFile(path.join(reportDir,'results.json'),JSON.stringify({newMigrations,baselineMigrations:migrationFiles,remoteMigrations,scope:'PostgreSQL 17 local desechable con snapshot completo, migraciones locales, dos remotas exportadas y las tres correcciones. Storage representa esquema y RLS; no valida HTTP, subida, bytes ni URLs firmadas. Sin servicios ni cuentas reales.',checks:evidence},null,2));
 if(db)await db.end();await server.stop();
}
process.exit(evidence.some(x=>x.status!=='pass')?1:0);
