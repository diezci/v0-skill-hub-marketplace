import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_PATH ? pathToFileURL(process.env.PGLITE_PATH).href : '@electric-sql/pglite')
const db = new PGlite()
const read=p=>readFile(new URL(p,import.meta.url),'utf8')
let checks=0
const check=(value,label)=>{assert.ok(value,label);checks++}
const one=async(q,args=[]) => (await db.query(q,args)).rows[0]
const rpc=async(name,args=[]) => (await one(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).value
const role=async(r='postgres',actor='')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);if(r!=='postgres')await db.exec(`set role ${r}`)}
const denied=async(fn,pattern,label)=>{await assert.rejects(fn,pattern,label);checks++}
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema diime_private;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth,diime_private to anon,authenticated,service_role;`)
 await db.exec(await read('../supabase/tests/fixtures/empresas-baseline.sql'))
 await db.exec(`create function public.is_admin() returns boolean language sql stable security definer as $$ select coalesce((select es_admin from public.profiles where id=auth.uid()),false) $$;
 create table public.empresa_miembros(empresa_id uuid,usuario_id uuid,estado text,rol text,cargo text);
 alter table public.empresas add column razon_social text;
 alter table public.ofertas add column empresa_id uuid;
 alter table public.trabajos add column empresa_cliente_id uuid;alter table public.trabajos add column empresa_proveedora_id uuid;alter table public.trabajos add column actor_contratacion_id uuid;
 create function diime_private.es_miembro_empresa(e uuid,u uuid) returns boolean language sql stable as $$ select exists(select 1 from public.empresa_miembros where empresa_id=e and usuario_id=u and estado='activo') $$;
 grant select,update,insert on public.profiles,public.profesionales,public.ofertas,public.trabajos to authenticated;
 grant all on all tables in schema public to service_role;`)
 await db.exec(await read('../supabase/migrations/20260909220319_verificacion_profesional_manual.sql'))
 await db.exec(await read('../supabase/migrations/20261023162708_verificacion_profesional_membresia_vigente.sql'))
 await db.exec(await read('../supabase/migrations/20260921223402_empresa_facturacion_snapshot.sql'))
 await db.exec(await read('../supabase/migrations/20261115155440_acreditacion_profesional_unificada.sql'))
 await db.exec(`create trigger proteger_perfil before insert or update on public.profiles for each row execute function public.proteger_campos_administrativos_perfil();`)
 const ids=Object.fromEntries(['persona','empresa','admin','ajeno','cliente','legacy','legacyActividad'].map((k,i)=>[k,`90000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]))
 for(const [key,id] of Object.entries(ids)){
  await db.query('insert into auth.users values($1,$2,now())',[id,`${key}@test.local`])
  await db.query('insert into public.profiles(id,email,nombre,es_admin,verificado,documento) values($1,$2,$3,$4,$5,$6)',[id,`${key}@test.local`,key,key==='admin',key.startsWith('legacy'),'12345678Z'])
  await db.query('insert into public.profesionales(id,titulo) values($1,$2)',[id,'Actividad original'])
 }
 const documents={}
 for(const key of ['persona','empresa','admin','ajeno','legacy']){
  documents[key]=[]
  for(const [i,categoria] of ['identidad','cualificacion','representacion'].entries()){
   const id=`91000000-0000-4000-8000-${String(Object.keys(ids).indexOf(key)*3+i+1).padStart(12,'0')}`
   await role('service_role');await rpc('registrar_documento_acreditacion_profesional',[id,ids[key],categoria,`${ids[key]}/${id}.pdf`,`${categoria}.pdf`,100,'a'.repeat(64)])
   documents[key].push({categoria,url:`acreditacion://${id}`,nombre:`${categoria}.pdf`})
  }
 }
 const data=(key,extra={})=>({tipoProveedor:key==='empresa'?'empresa':'particular',nombreLegal:key==='empresa'?'Sociedad Prueba SL':'Persona Prueba',nif:key==='empresa'?'B12345678':'12345678Z',domicilioFiscal:'Calle Prueba 1 Madrid',actividad:'Fontanería',cualificacion:'Experiencia documentada y formación en instalación.',...(key==='empresa'?{representanteNombre:'Persona Prueba',cargoRepresentacion:'Administrador único'}:{}),documentos:documents[key].filter(d=>key==='empresa'||d.categoria!=='representacion'),consentimiento:true,...extra})
 const submit=async(key,extra={})=>{await role('authenticated',ids[key]);return rpc('solicitar_acreditacion_profesional',['Revisión',JSON.stringify(data(key,extra))])}
 const version=async(key)=>(await one('select actualizada_at::text v from public.solicitudes_verificacion_profesional where profesional_id=$1',[ids[key]])).v
 const approve=async(key,flags=[true,true,true],stamp)=>{await role('authenticated',ids.admin);return rpc('revisar_acreditacion_profesional',[ids[key],'verificado','','Identidad, actividad y documentos revisados por Diime.',stamp??await version(key),...flags])}
 await role('authenticated',ids.legacyActividad)
 await db.query('update public.profesionales set titulo=$2 where id=$1',[ids.legacyActividad,'Nueva actividad legacy'])
 const legacyChanged=await one('select s.estado,p.verificado from public.profiles p join public.solicitudes_verificacion_profesional s on s.profesional_id=p.id where p.id=$1',[ids.legacyActividad])
 check(legacyChanged.estado==='retirada'&&!legacyChanged.verificado,'Legacy sin expediente pierde insignia y genera auditoría al cambiar actividad')
 await role('authenticated',ids.persona)
 await db.query('update public.profesionales set titulo=$2 where id=$1',[ids.persona,'Actividad borrador'])
 check(!(await one('select id from public.solicitudes_verificacion_profesional where profesional_id=$1',[ids.persona])),'Perfil nuevo noverificado puede completar borrador sin expediente prematuro')
 await denied(()=>rpc('solicitar_verificacion_profesional',['Texto solo']),/documentos/,'No hay bypass texto antiguo')
 await denied(()=>rpc('solicitar_acreditacion_profesional',['',JSON.stringify(data('persona',{documentos:[]}))]),/documentos/,'Exige evidencias')
 await denied(()=>rpc('solicitar_acreditacion_profesional',['',JSON.stringify(data('persona',{documentos:documents.ajeno}))]),/pertenece/,'No admite documentos de otro usuario')
 await denied(()=>rpc('solicitar_acreditacion_profesional',['',JSON.stringify(data('persona',{documentos:[{categoria:'identidad',url:'https://public.test/id.pdf',nombre:'id.pdf'},documents.persona[1]]}))]),/privados/,'No acepta enlaces públicos')
 await denied(()=>db.query("update public.profesionales set tipo_proveedor='empresa' where id=$1",[ids.persona]),/expediente/,'Tipo protegido de edición directa')
 await submit('persona');await submit('empresa')
 await role('authenticated',ids.empresa)
 let identity=await rpc('mi_identidad_proveedor_cobros');check(identity.tipo_proveedor==='empresa'&&identity.verificado===false&&identity.version===1,'Empresa pendiente jamás se identifica como particular')
 check((await rpc('mi_acreditacion_profesional')).acreditacion.nif==='B12345678','Titular recupera datos privados')
 await role('authenticated',ids.ajeno)
 check(await rpc('documento_acreditacion_profesional_metadata',[documents.persona[0].url])===null,'Ajeno no descarga documentos')
 await denied(()=>db.query('select * from diime_private.acreditaciones_profesionales'),/permission denied/,'Tabla privada no accesible directamente')
 await denied(()=>rpc('identidad_proveedor_cobros',[ids.persona]),/permission denied/,'Usuario no enumera identidad fiscal ajena')
 await role('authenticated',ids.admin)
 check(!!(await rpc('documento_acreditacion_profesional_metadata',[documents.persona[0].url]))?.storage_path,'Administrador puede revisar PDF')
 await denied(async()=>rpc('revisar_verificacion_profesional',[ids.persona,'verificado','','',await version('persona')]),/identidad.*cualificación/,'Wrapper antiguo no acredita sin controles')
 await denied(async()=>db.query("select diime_private.revisar_verificacion_profesional_base($1,'verificado','','',false,$2)",[ids.persona,await version('persona')]),/permission denied/,'Helper base no es accesible')
 await denied(()=>approve('empresa',[true,true,false]),/representación/,'Empresa exige revisión representación')
 await approve('persona');await approve('empresa')
 await submit('admin');await denied(()=>approve('admin'),/propio/,'Administrador no aprueba su expediente')
 await role('service_role');check((await rpc('identidad_proveedor_cobros',[ids.legacy])).version===0,'Identidad legacy conserva fallback particular versión cero')
 await denied(()=>rpc('registrar_cuenta_stripe_proveedor',[ids.empresa,'acct_emp',0,'empresa']),/identidad ha cambiado/,'CAS no registra cuenta con versión obsoleta')
 check(await rpc('registrar_cuenta_stripe_proveedor',[ids.empresa,'acct_emp',1,'empresa'])==='acct_emp','CAS registra cuenta bajo identidad acreditada')
 check(await rpc('registrar_cuenta_stripe_proveedor',[ids.empresa,'acct_emp',1,'empresa'])==='acct_emp','CAS idempotente no reemplaza cuenta')
 await denied(()=>rpc('registrar_cuenta_stripe_proveedor',[ids.empresa,'acct_otra',1,'empresa']),/Ya existe/,'No sustituye cuenta vinculada')
 await denied(()=>submit('empresa',{nif:'B87654321'}),/identidad de cobros/,'NIF bloqueado con cuenta Stripe')
 await denied(()=>submit('empresa',{nombreLegal:'Otra Sociedad SL'}),/identidad de cobros/,'Nombre legal bloqueado con cuenta Stripe')
 await role();await db.query("update public.profesionales set stripe_account_id='acct_legacy' where id=$1",[ids.legacy]);await db.query('update public.profiles set documento=null where id=$1',[ids.legacy]);
 await role('authenticated',ids.legacy)
 const legacyInitial=await rpc('mi_acreditacion_profesional')
 check(legacyInitial.tipoCobrosBloqueado&&!legacyInitial.identidadCobrosBloqueada&&legacyInitial.acreditacion===null,'Legacy con cuenta y sin expediente permite declarar identidad con pruebas')
 await denied(()=>submit('legacy',{tipoProveedor:'empresa',representanteNombre:'Persona Prueba',cargoRepresentacion:'Administrador único',documentos:documents.legacy}),/identidad de cobros/,'Legacy individual conectado no se convierte en sociedad')
 await submit('legacy',{nombreLegal:'Titular Persona Legacy',nif:'23456789D'})
 check(!(await rpc('mi_identidad_proveedor_cobros')).verificado,'Primera acreditación legacy retira insignia hasta comprobar titularidad Stripe')
 check((await rpc('mi_acreditacion_profesional')).identidadCobrosBloqueada,'Legacy identidad queda bloqueada al presentar primer expediente')
 await denied(()=>submit('legacy',{nombreLegal:'Otro Titular',nif:'23456789D'}),/identidad de cobros/,'No cambia titular después del primer expediente')
 await approve('legacy')
 check((await rpc('acreditaciones_profesionales_admin',[[ids.legacy]]))[0].cuentaStripe==='acct_legacy','Solo consulta admin incluye cuenta Stripe para comprobar titularidad')
 await role('authenticated',ids.persona)
 const offer=(await db.query("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,estado) values(gen_random_uuid(),$1,100,1,'Servicio','pendiente') returning id,acreditacion_version",[ids.persona])).rows[0]
 check(offer.acreditacion_version===1,'Oferta sella versión acreditada')
 await role('authenticated',ids.empresa)
 const enterpriseOffer=(await db.query("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,estado) values(gen_random_uuid(),$1,100,1,'Servicio','pendiente') returning id",[ids.empresa])).rows[0]
 const job=(await db.query("insert into public.trabajos(cliente_id,profesional_id,titulo,precio_acordado,oferta_id) values($1,$2,'Trabajo',100,$3) returning id",[ids.cliente,ids.empresa,enterpriseOffer.id])).rows[0]
 await role();const fiscal=(await one('select datos from diime_private.trabajos_facturacion where trabajo_id=$1',[job.id])).datos.find(x=>x.parte==='profesional')
 check(fiscal.empresa_nombre==='Sociedad Prueba SL'&&fiscal.empresa_cif==='B12345678'&&fiscal.persona_documento===null,'Nuevo contrato empresarial toma snapshot fiscal sociedad sin empresa_id legacy')
 check((await one('select proveedor_tipo from public.trabajos where id=$1',[job.id])).proveedor_tipo==='empresa','Contrato congela tipo empresa')
 await denied(()=>db.query("update public.trabajos set proveedor_tipo='particular' where id=$1",[job.id]),/identidad contratada/,'Tipo contratado no se modifica')
 const escrow=(await one("insert into public.transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,comision_proveedor_original) values($1,$2,$3,100,10) returning id",[job.id,ids.cliente,ids.empresa]))
 await db.query('update public.transacciones_escrow set liquidacion_contexto=$2 where id=$1',[escrow.id,JSON.stringify({destino:'acct_emp',proveedor_tipo:'particular'})])
 const payout=(await one('select liquidacion_contexto from public.transacciones_escrow where id=$1',[escrow.id])).liquidacion_contexto
 check(payout.proveedor_tipo==='empresa'&&payout.destino==='acct_emp','Liquidación toma tipo del contrato sin alterar destino')
 await role('authenticated',ids.persona)
 await db.query('update public.profesionales set tarifa_por_hora=40 where id=$1',[ids.persona])
 check((await rpc('mi_identidad_proveedor_cobros')).verificado,'Precio no retira cualificación')
 await db.query('update public.profesionales set certificaciones=$2 where id=$1',[ids.persona,JSON.stringify(['Nueva habilitación'])])
 check(!(await rpc('mi_identidad_proveedor_cobros')).verificado,'Cambio material retira acreditación')
 await denied(()=>db.query("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,estado) values(gen_random_uuid(),$1,100,1,'Servicio','pendiente')",[ids.persona]),/acreditar/,'No puede ofertar pendiente')
 await submit('persona');await approve('persona')
 await role('authenticated',ids.persona)
 await denied(()=>db.query("insert into public.trabajos(cliente_id,profesional_id,titulo,precio_acordado,oferta_id) values($1,$2,'Trabajo',100,$3)",[ids.cliente,ids.persona,offer.id]),/actualizar la oferta/,'Presupuesto de versión antigua no contrata bajo nueva acreditación')
 await db.query('update public.ofertas set descripcion=descripcion where id=$1',[offer.id])
 check((await one('select acreditacion_version from public.ofertas where id=$1',[offer.id])).acreditacion_version===2,'Proveedor renueva explícitamente presupuesto')
 const stale=await version('persona');await submit('persona',{domicilioFiscal:'Calle Nueva 2 Madrid'})
 await denied(()=>approve('persona',[true,true,true],stale),/ha cambiado/,'Admin obsoleto no acredita nueva identidad')
 await role();check(JSON.stringify((await one('select datos from diime_private.trabajos_facturacion where trabajo_id=$1',[job.id])).datos.find(x=>x.parte==='profesional'))===JSON.stringify(fiscal),'Contratos anteriores no se reatribuyen')
 console.log(`OK ${checks} comprobaciones PostgreSQL de acreditación profesional unificada`)
} finally { await db.close() }
