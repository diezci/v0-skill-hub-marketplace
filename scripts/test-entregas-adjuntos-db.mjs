// Regresión independiente de adjuntos privados con PostgreSQL 17 desechable.
// Ejecutar: node scripts/test-entregas-adjuntos-db.mjs
// Prerequisite: npm install --prefix .build/workflow-db embedded-postgres@17.6.0-beta.15 pg@8.23.0
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const {default:EmbeddedPostgres}=await import('../.build/workflow-db/node_modules/embedded-postgres/dist/index.js');
const {default:pg}=await import('../.build/workflow-db/node_modules/pg/lib/index.js');
const root=process.cwd();
const port=Number(process.env.ENTREGAS_TEST_PORT||55557);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local test port');
const runDir=path.join(root,'.build','workflow-verification-'+randomUUID());await fs.mkdir(runDir,{recursive:true});
const server=new EmbeddedPostgres({databaseDir:path.join(runDir,'data'),user:'postgres',password:'workflow-local-only',port,persistent:false,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:m=>{if(String(m).includes('ERROR'))console.error(String(m))}});
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
const connection={...conn,database:'workflow_entregas_adjuntos'};
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
 if(state!=='pendiente_pago')await db.query("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,estado,fecha_retencion,stripe_payment_intent_id,stripe_charge_id) values($1,$2,$3,110,100,10,10,10,90,'fondos_retenidos',now(),$4,$5)",[result.trabajo.id,ids[client],ids[provider],'pi_prueba_'+randomUUID(),'ch_prueba_'+randomUUID()]);
 await db.query('update trabajos set estado=$1 where id=$2',[state,result.trabajo.id]);return{id:result.trabajo.id,request,offer,client,provider};
}
const reportDir=path.join(root,'.build/entregas-adjuntos');await fs.mkdir(reportDir,{recursive:true});
const newMigrations=(await fs.readdir(path.join(root,'supabase/migrations'))).filter(f=>/^\d{14}_/.test(f)&&f>='20261012000000').sort();
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
 await restore('workflow_entregas_adjuntos',true);db=new pg.Client(connection);await db.connect();
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
 await db.query('SET check_function_bodies=on');
 const deliver=(who,id,files=[],message='Entrega de prueba')=>rpc(who,'entregar_trabajo_con_adjuntos',[id,message,files]);
 const state=async(id)=>(await db.query('select estado from trabajos where id=$1',[id])).rows[0].estado;
 const history=async(id)=>(await db.query("select * from actualizaciones_trabajo where trabajo_id=$1 and tipo='entrega'",[id])).rows;
 await test('Proveedor entrega con evidencias: estado, historial y descarga para ambas partes y mediador',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso'),f=await file('proveedor');
   await hidden('cliente',f);await deliver('proveedor',j.id,[f.url,f.url],'Trabajo terminado, revisar el documento.');
   assert.equal(await state(j.id),'entregado');const h=await history(j.id);assert.equal(h.length,1);assert.deepEqual(h[0].archivos,[f.url]);assert.equal(h[0].mensaje,'Trabajo terminado, revisar el documento.');
   const customerHistory=(await actor('cliente',"select archivos,mensaje from actualizaciones_trabajo where trabajo_id=$1 and tipo='entrega'",[j.id])).rows;assert.equal(customerHistory.length,1);assert.deepEqual(customerHistory[0].archivos,[f.url]);
   for(const who of ['cliente','proveedor','admin1'])await reads(who,f);await hidden('ajeno',f);
   await assert.rejects(deliver('proveedor',j.id,[f.url]),e=>e.code==='55000');assert.equal((await history(j.id)).length,1);
   return{attachmentsSaved:true,duplicateRemoved:true,participantsRead:true,outsiderDenied:true,repeatedDeliveryDenied:true};
 });
 await test('La entrega sin archivos sigue siendo opcional',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso');await deliver('proveedor',j.id,[],null);
   assert.equal(await state(j.id),'entregado');assert.deepEqual((await history(j.id))[0].archivos,[]);return{optional:true};
 });
 await test('Cliente y ajeno no pueden entregar, tampoco mediante llamada RPC directa',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso');for(const who of ['cliente','ajeno'])await assert.rejects(deliver(who,j.id),e=>e.code==='42501');
   assert.equal(await state(j.id),'en_progreso');assert.equal((await history(j.id)).length,0);return{denied:true};
 });
 await test('Archivo ajeno o URL manipulada rechazan toda la entrega sin cambiar estado',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso'),f=await file('ajeno'),own=await file('proveedor');
   for(const url of [f.url,own.url+'#alias','https://external.example.test/evidencia.pdf'])await assert.rejects(deliver('proveedor',j.id,[url]),e=>e.code==='42501');
   assert.equal(await state(j.id),'en_progreso');assert.equal((await history(j.id)).length,0);assert.equal((await db.query('select compartido from archivos_privados where id=$1',[own.id])).rows[0].compartido,false);return{atomic:true};
 });
 await test('Límites y elementos vacíos se validan en SQL',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso');
   for(const urls of [[null],[''],['http://example.test/a'],Array.from({length:6},(_,i)=>'https://example.test/'+i)])await assert.rejects(deliver('proveedor',j.id,urls),e=>e.code==='22023');
   assert.equal(await state(j.id),'en_progreso');return{serverLimits:true};
 });
 await test('Cancelación pendiente y pago bloqueado impiden entregar',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso');await serviceRPC('diime_gestionar_solicitud_cancelacion',[j.id,ids.cliente,'solicitar','Motivo sintético',[]]);await assert.rejects(deliver('proveedor',j.id),e=>e.code==='55000');
   await serviceRPC('diime_gestionar_solicitud_cancelacion',[j.id,ids.cliente,'retirar','',[]]);await db.query("update trabajos set pago_bloqueado=true where id=$1",[j.id]);await assert.rejects(deliver('proveedor',j.id),e=>e.code==='55000');assert.equal((await history(j.id)).length,0);return{incidentsBlock:true};
 });
 await test('Fallo de historial revierte estado y marca compartido del adjunto',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso'),f=await file('proveedor');
   await db.query(`create function public.fixture_rechazar_entrega() returns trigger language plpgsql as $$ begin if new.tipo='entrega' then raise exception 'Fallo sintético de historial'; end if; return new; end; $$;
     create trigger zz_fixture_rechazar_entrega before insert on actualizaciones_trabajo for each row execute function fixture_rechazar_entrega();`);
   try {await assert.rejects(deliver('proveedor',j.id,[f.url]),/Fallo sintético/);assert.equal(await state(j.id),'en_progreso');assert.equal((await history(j.id)).length,0);assert.equal((await db.query('select compartido from archivos_privados where id=$1',[f.id])).rows[0].compartido,false);}finally{await db.query('drop trigger zz_fixture_rechazar_entrega on actualizaciones_trabajo; drop function fixture_rechazar_entrega()');}
   return{rollbackOnHistoryFailure:true};
 });
 const all={perfil:true,mensajes:true,presupuestos:true,encargos:true,equipo:true,ver_cobros:true,gestionar_cobros:true};
 for(const alias of ['empresa_titular','empresa_miembro','empresa_original'])await createUser(alias);
 const company=await rpc('empresa_titular','vincular_mi_empresa',[null,'Empresa entregas','BTESTENTREGAS','DOC-SINTETICO','Titular',null,'Madrid']);
 await db.query("update empresas set verificada=true,estado_verificacion='verificada' where id=$1",[company]);
 for(const alias of ['empresa_miembro','empresa_original']){const invite=await rpc('empresa_titular','empresa_crear_invitacion',[`${alias}@example.test`,'Operador','miembro',JSON.stringify(all),false]);await rpc(alias,'empresa_aceptar_invitacion',[invite.token]);}
 await test('Empresa: operador asignado entrega archivos, cliente revisa y workspace incluye evidencias',async()=>{
   const j=await jobFixture('cliente','empresa_original',null,company,'en_progreso'),f=await file('empresa_miembro');
   await rpc('empresa_titular','empresa_reasignar_trabajo',[j.id,ids.empresa_miembro,'proveedor']);
   await assert.rejects(rpc('empresa_original','empresa_actualizar_trabajo',[j.id,100,true,[f.url],'Entrega']),e=>e.code==='42501');
   await rpc('empresa_miembro','empresa_actualizar_trabajo',[j.id,100,true,[f.url],'Entrega empresarial']);
   assert.equal(await state(j.id),'entregado');for(const who of ['cliente','empresa_titular','empresa_miembro'])await reads(who,f);await hidden('empresa_original',f);await hidden('ajeno',f);
   const workspace=await rpc('empresa_miembro','empresa_workspace');const work=workspace.operaciones.trabajos.find(t=>t.id===j.id);assert.deepEqual(work.archivos_entrega,[f.url]);assert.equal(work.mensaje_entrega,'Entrega empresarial');
   const notices=(await db.query("select link from notificaciones where tipo='trabajo_entregado' and metadata->>'trabajo_id'=$1",[j.id])).rows;assert.equal(notices.length,1);assert.match(notices[0].link,/mis-solicitudes/);
   await rpc('empresa_titular','empresa_actualizar_miembro',[ids.empresa_miembro,null,true,null,null,null]);await hidden('empresa_miembro',f);await reads('cliente',f);await reads('empresa_titular',f);
   return{companyDelivery:true,workspaceEvidence:true,revokedUploaderDenied:true};
 });
 await test('Compatibilidad: la acción empresarial de tres parámetros conserva el guardado de progreso',async()=>{
   const j=await jobFixture('cliente','empresa_original',null,company,'en_progreso');await rpc('empresa_original','empresa_actualizar_trabajo',[j.id,45,false]);assert.equal(await state(j.id),'en_progreso');assert.equal((await db.query('select progreso from trabajos where id=$1',[j.id])).rows[0].progreso,45);return{oldProgressWorks:true};
 });
 const reject=(who,id,files=[],reason='Faltan los remates acordados')=>serviceRPC('diime_rechazar_entrega',[id,ids[who],reason,files]);
 const rejections=async(id)=>(await db.query("select * from actualizaciones_trabajo where trabajo_id=$1 and tipo='rechazo_entrega'",[id])).rows;
 const escrowState=async(id)=>(await db.query('select estado from transacciones_escrow where trabajo_id=$1',[id])).rows[0].estado;
 await test('Rechazo conserva pruebas de proveedor y cliente, inmoviliza pago y permite revisión del admin',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso'),provider=await file('proveedor'),customer=await file('cliente');await deliver('proveedor',j.id,[provider.url]);
   const d=await reject('cliente',j.id,[customer.url,customer.url]);assert.equal(d.estado,'abierta');assert.equal(d.actor_apertura_id,ids.cliente);assert.equal(await state(j.id),'en_disputa');assert.equal(await escrowState(j.id),'disputa');
   assert.equal((await db.query('select pago_bloqueado from trabajos where id=$1',[j.id])).rows[0].pago_bloqueado,true);
   assert.deepEqual((await history(j.id))[0].archivos,[provider.url]);const h=(await rejections(j.id))[0];assert.deepEqual(h.archivos,[customer.url]);assert.equal(h.usuario_id,ids.cliente);
   const adminHistory=(await actor('admin1','select tipo,archivos from actualizaciones_trabajo where trabajo_id=$1',[j.id])).rows;assert.equal(adminHistory.length,2);assert.ok(adminHistory.some(h=>h.tipo==='entrega'));assert.ok(adminHistory.some(h=>h.tipo==='rechazo_entrega'));
   for(const f of [provider,customer]){for(const who of ['cliente','proveedor','admin1'])await reads(who,f);await hidden('ajeno',f);}
   await assert.rejects(reject('cliente',j.id,[customer.url]),e=>e.code==='55000');assert.equal((await rejections(j.id)).length,1);
   return{bothEvidenceSets:true,fundsRemainBlocked:true,adminReadsBoth:true,outsiderDenied:true,noDuplicateRejection:true};
 });
 await test('Rechazo sin adjuntos es opcional; proveedor y ajeno no pueden rechazar ni llamar RPC interna',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso');await deliver('proveedor',j.id);
   for(const who of ['proveedor','ajeno'])await assert.rejects(reject(who,j.id),e=>e.code==='42501');
   for(const role of ['anon','authenticated'])await refused('cliente','select diime_rechazar_entrega($1,$2,$3,$4)',[j.id,ids.cliente,'Faltan remates',[]],role);
   await reject('cliente',j.id);assert.deepEqual((await rejections(j.id))[0].archivos,[]);return{optional:true,onlyAuthorizedCustomer:true,serviceOnly:true};
 });
 await test('Rechazo rechaza archivos ajenos, alias, más de cinco y motivo vacío sin bloquear el trabajo',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso'),foreign=await file('ajeno'),own=await file('cliente');await deliver('proveedor',j.id);
   for(const files of [[foreign.url],[own.url+'#alias']])await assert.rejects(reject('cliente',j.id,files),e=>e.code==='42501');
   for(const files of [[null],[''],Array.from({length:6},(_,i)=>'https://example.test/'+i)])await assert.rejects(reject('cliente',j.id,files),e=>e.code==='22023');
   await assert.rejects(reject('cliente',j.id,[],'  '),e=>e.code==='22023');assert.equal(await state(j.id),'entregado');assert.equal(await escrowState(j.id),'fondos_retenidos');assert.equal((await rejections(j.id)).length,0);assert.equal((await db.query('select count(*)::int n from disputas where trabajo_id=$1',[j.id])).rows[0].n,0);return{noPartialDispute:true};
 });
 await test('Error al guardar evidencia revierte disputa, custodia, historial, avisos y archivo compartido',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso'),f=await file('cliente');await deliver('proveedor',j.id);
   await db.query(`create function public.fixture_rechazar_historial() returns trigger language plpgsql as $$ begin if new.tipo='rechazo_entrega' then raise exception 'FALLO_HISTORIAL_RECHAZO'; end if; return new; end; $$; create trigger zz_fixture_rechazar_historial before insert on actualizaciones_trabajo for each row execute function fixture_rechazar_historial();`);
   try {await assert.rejects(reject('cliente',j.id,[f.url]),/FALLO_HISTORIAL_RECHAZO/);assert.equal(await state(j.id),'entregado');assert.equal(await escrowState(j.id),'fondos_retenidos');assert.equal((await rejections(j.id)).length,0);assert.equal((await db.query('select count(*)::int n from disputas where trabajo_id=$1',[j.id])).rows[0].n,0);assert.equal((await db.query("select count(*)::int n from notificaciones where metadata->>'trabajo_id'=$1 and tipo='disputa_abierta_admin'",[j.id])).rows[0].n,0);assert.equal((await db.query('select compartido from archivos_privados where id=$1',[f.id])).rows[0].compartido,false);}finally{await db.query('drop trigger zz_fixture_rechazar_historial on actualizaciones_trabajo; drop function fixture_rechazar_historial()');}
   return{atomicRollback:true};
 });
 await test('Dos rechazos simultáneos conservan un único expediente y una única evidencia',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso'),f=await file('cliente');await deliver('proveedor',j.id);const results=await Promise.allSettled([reject('cliente',j.id,[f.url]),reject('cliente',j.id,[f.url])]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await rejections(j.id)).length,1);assert.equal((await db.query('select count(*)::int n from disputas where trabajo_id=$1',[j.id])).rows[0].n,1);return{serialized:true};
 });
 await test('Rechazo valida estado entregado y pagos conciliados dentro de la transacción',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso');await assert.rejects(reject('cliente',j.id),e=>e.code==='55000');await deliver('proveedor',j.id);await db.query("update transacciones_escrow set estado='liquidando' where trabajo_id=$1",[j.id]);await assert.rejects(reject('cliente',j.id),/liquidación en curso/);assert.equal(await state(j.id),'entregado');assert.equal((await rejections(j.id)).length,0);return{deliveredRequired:true,settlementInProgressDenied:true};
 });
 await test('Empresa cliente: solo operador vigente rechaza; autor reasignado o revocado no accede a las pruebas',async()=>{
   const j=await jobFixture('empresa_original','proveedor',company,null,'en_progreso');await deliver('proveedor',j.id);await rpc('empresa_titular','empresa_reasignar_trabajo',[j.id,ids.empresa_titular,'cliente']);
   await assert.rejects(reject('empresa_original',j.id),e=>e.code==='42501');const f=await file('empresa_titular');await reject('empresa_titular',j.id,[f.url]);assert.equal((await rejections(j.id))[0].usuario_id,ids.empresa_titular);for(const who of ['empresa_titular','proveedor','admin1'])await reads(who,f);await hidden('empresa_original',f);return{currentCompanyActor:true,oldActorDenied:true};
 });
 await test('Eventos oficiales no pueden falsificarse, atribuirse a otro usuario, modificarse ni borrarse por API',async()=>{
   const j=await jobFixture('cliente','proveedor',null,null,'en_progreso');
   for(const who of ['cliente','proveedor'])for(const type of ['entrega','rechazo_entrega'])for(const claimed of ['cliente','proveedor'])await refused(who,"insert into actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje) values($1,$2,$3,'Evento falsificado')",[j.id,ids[claimed],type]);
   await refused('cliente',"insert into actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje) values($1,$2,'mensaje','Autor falsificado')",[j.id,ids.proveedor]);
   await actor('cliente',"insert into actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje) values($1,$2,'mensaje','Mensaje propio')",[j.id,ids.cliente]);await deliver('proveedor',j.id);const h=(await history(j.id))[0];
   for(const who of ['cliente','proveedor','admin1']){const edit=await actor(who,"update actualizaciones_trabajo set mensaje='Manipulado' where id=$1 returning id",[h.id]);assert.equal(edit.rowCount,0);const del=await actor(who,'delete from actualizaciones_trabajo where id=$1 returning id',[h.id]);assert.equal(del.rowCount,0);}
   assert.equal((await history(j.id))[0].mensaje,'Entrega de prueba');return{forgeryDenied:true,authorBound:true,immutableHistory:true};
 });
 await test('Clientes anteriores conservan entrega personal y de empresa sin archivos',async()=>{
   const personal=await jobFixture('cliente','proveedor',null,null,'en_progreso');await rpc('proveedor','entregar_trabajo_con_historial',[personal.id,'Entrega antigua']);assert.equal(await state(personal.id),'entregado');assert.deepEqual((await history(personal.id))[0].archivos,[]);
   const companyJob=await jobFixture('cliente','empresa_original',null,company,'en_progreso');await rpc('empresa_original','empresa_actualizar_trabajo',[companyJob.id,100,true]);assert.equal(await state(companyJob.id),'entregado');assert.equal((await history(companyJob.id)).length,1);return{personalCompatibility:true,companyCompatibility:true};
 });
 await test('RPC anónima denegada y funciones públicas invoker con search_path fijo',async()=>{
   const rows=(await db.query("select n.nspname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='entregar_trabajo_con_adjuntos' or (p.proname='empresa_actualizar_trabajo' and p.pronargs=5)")).rows;
   assert.equal(rows.length,4);assert.ok(rows.every(r=>!r.anon && r.authenticated && r.proconfig.includes('search_path=""')));assert.ok(rows.filter(r=>r.nspname==='public').every(r=>!r.prosecdef));assert.ok(rows.filter(r=>r.nspname==='diime_private').every(r=>r.prosecdef));return{functions:4,anonDenied:true,authenticatedGranted:true};
 });
}finally{
 await fs.writeFile(path.join(reportDir,'results.json'),JSON.stringify({migrations:[...migrationFiles,...newMigrations],scope:'PostgreSQL 17 local aislado; snapshot base y todas las migraciones del checkout actual. Sin llamadas a producción. No prueba almacenamiento HTTP.',checks:evidence},null,2));
 if(db)await db.end();await server.stop();
}
process.exit(evidence.some(x=>x.status!=='pass')?1:0);
