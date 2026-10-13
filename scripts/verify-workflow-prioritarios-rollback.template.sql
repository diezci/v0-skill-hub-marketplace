-- PREPARADO PARA REVISIÓN: no ejecutar hasta que el coordinador lo indique.
-- Se usan identidades QA existentes para particulares y nuevas identidades/empresas
-- enteramente sintéticas para la rama empresarial, sin contraseñas ni sesiones Auth.
-- TODAS las fixtures viven en una subtransacción que SIEMPRE se revierte.
-- El SELECT final devuelve booleans DESPUÉS de esa reversión. No se llama a Stripe,
-- Auth API, Storage ni a RPC de avisos; no se cambian miembros/empresas/usuarios existentes.
set local lock_timeout='2s';
set local statement_timeout='15s';
create or replace function pg_temp.diime_qa_assert(p_label text,p_actor uuid,p_sql text,p_code text default null,p_role text default 'authenticated')
returns jsonb language plpgsql security invoker as $$
declare matched boolean; passed boolean:=false; actual text:='00000'; previous_claims text:=coalesce(current_setting('request.jwt.claims',true),'{}');
begin
 if p_role not in('authenticated','anon') then raise exception 'Unsupported QA role'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role',p_role)::text,true);
 execute format('set local role %I',p_role);
 begin
  execute p_sql into matched;
  if p_code is not null then raise exception 'Unexpected permission' using errcode='ZQ002'; end if;
  if matched is distinct from true then raise exception 'Assertion false' using errcode='ZQ003'; end if;
  passed:=true;
 exception when others then
  actual:=sqlstate;passed:=p_code is not null and actual=p_code;
 end;
 reset role;
 perform set_config('request.jwt.claims',previous_claims,true);
 return jsonb_build_object('name',p_label,'pass',passed,'code',actual);
end; $$;

create or replace function pg_temp.diime_qa_job(p_client uuid,p_provider uuid,p_client_company uuid,p_provider_company uuid,p_operator uuid,p_marker text)
returns uuid language plpgsql security invoker as $$
declare s uuid:=gen_random_uuid();o uuid:=gen_random_uuid();t uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p_client)::text,true);
 insert into public.solicitudes(id,cliente_id,empresa_id,titulo,descripcion,ubicacion,estado)
 values(s,p_client,p_client_company,p_marker,'Fixture sintética transaccional; se revierte antes de devolver resultados','Madrid','abierta');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p_provider)::text,true);
 insert into public.ofertas(id,solicitud_id,profesional_id,empresa_id,precio,tiempo_estimado,unidad_tiempo,descripcion,estado)
 values(o,s,p_provider,p_provider_company,100,8,'horas','Fixture sintética transaccional','pendiente');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p_client)::text,true);
 insert into public.trabajos(id,solicitud_id,oferta_id,cliente_id,profesional_id,empresa_cliente_id,empresa_proveedora_id,operador_proveedor_id,titulo,precio_acordado,estado)
 values(t,s,o,p_client,p_provider,p_client_company,p_provider_company,p_operator,p_marker,100,'pendiente_pago');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 update public.ofertas set estado='aceptada' where id=o;
 update public.trabajos set estado='completado',operador_proveedor_id=p_operator where id=t;
 return t;
end; $$;

do $qa$
declare
 cp uuid:='__QA_CP__';pp uuid:='__QA_PP__';ce uuid:='__QA_CE__';pe uuid:='__QA_PE__';ep uuid:='__QA_EP__';aj uuid:='__QA_AJ__';
 marker text:='__QA_MARKER__'; client_company uuid;provider_company uuid;qa_client_company uuid;qa_provider_company uuid;
 sc uuid:=gen_random_uuid();sp uuid:=gen_random_uuid();se uuid:=gen_random_uuid();person uuid;
 personal_job uuid;company_job uuid;file_id uuid:=gen_random_uuid();file_url text;results jsonb:='[]';
 before_rating jsonb;after_rating jsonb;before_qa_state jsonb;after_qa_state jsonb;fixture_rows integer;setup_completed boolean:=false;stage text:='preconditions';
begin
 select jsonb_agg(jsonb_build_array(id,rating_promedio,total_reseñas) order by id) into before_rating from public.profesionales where id in(pp,pe);
 select jsonb_build_object(
  'profiles',(select jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p where p.id in(cp,pp,ce,pe,ep,aj)),
  'memberships',(select jsonb_agg(to_jsonb(m) order by m.empresa_id,m.usuario_id) from public.empresa_miembros m where m.usuario_id in(ce,pe,ep)),
  'companies',(select jsonb_agg(to_jsonb(e) order by e.id) from public.empresas e where e.propietario_id in(ce,pe))) into before_qa_state;
 begin
  if (select count(*) from public.profiles where id in(cp,pp,ce,pe,ep,aj) and cuenta_eliminada is null)<>6
   or (select count(*) from public.profesionales where id in(pp,pe))<>2 then raise exception 'QA profiles unavailable'; end if;
  select empresa_id into qa_client_company from public.profiles where id=ce;
  select empresa_id into qa_provider_company from public.profiles where id=pe;
  if qa_client_company is null or qa_provider_company is null or not exists(select 1 from public.empresa_miembros where empresa_id=qa_provider_company and usuario_id=ep and estado='activo') then raise exception 'QA company membership unavailable'; end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  stage:='qa_permissions';
  results:=results||pg_temp.diime_qa_assert('current_qa_company_owner_permission',ce,format('select public.empresa_comprobar_permiso(%L,%L)',qa_client_company,'encargos'));
  results:=results||pg_temp.diime_qa_assert('current_qa_delegate_permission',ep,format('select public.empresa_comprobar_permiso(%L,%L)',qa_provider_company,'encargos'));
  results:=results||pg_temp.diime_qa_assert('current_qa_delegate_finance_denied',ep,format('select not public.empresa_comprobar_permiso(%L,%L)',qa_provider_company,'gestionar_cobros'));
  results:=results||pg_temp.diime_qa_assert('current_qa_outsider_company_denied',aj,format('select not public.empresa_comprobar_permiso(%L,%L)',qa_provider_company,'encargos'));
  stage:='synthetic_company_users';
  foreach person in array array[sc,sp,se] loop
   insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
    values(person,'qa-rollback-'||person::text||'@example.invalid',now(),'{"nombre":"QA rollback synthetic"}','{}');
   -- handle_new_user creates the profile in Supabase; ON CONFLICT also supports minimal local fixtures.
   insert into public.profiles(id,email,nombre) values(person,'qa-rollback-'||person::text||'@example.invalid','QA rollback synthetic') on conflict(id) do nothing;
  end loop;
  insert into public.profesionales(id,titulo) values(sp,'QA rollback provider');
  stage:='synthetic_companies';
  insert into public.empresas(nombre,cif,propietario_id,estado_verificacion) values(marker,'QA-'||sc::text,sc,'verificada') returning id into client_company;
  insert into public.empresas(nombre,cif,propietario_id,estado_verificacion) values(marker,'QA-'||sp::text,sp,'verificada') returning id into provider_company;
  update public.profiles set empresa_id=client_company where id=sc;
  update public.profiles set empresa_id=provider_company where id in(sp,se);
  update public.empresa_miembros set permisos=(select permisos from public.empresa_miembros where empresa_id=qa_client_company and usuario_id=ce) where empresa_id=client_company and usuario_id=sc;
  update public.empresa_miembros set permisos=(select permisos from public.empresa_miembros where empresa_id=qa_provider_company and usuario_id=pe) where empresa_id=provider_company and usuario_id=sp;
  insert into public.empresa_miembros(empresa_id,usuario_id,cargo,origen,rol,permisos)
   select provider_company,se,'QA rollback operador','invitacion',rol,permisos from public.empresa_miembros where empresa_id=qa_provider_company and usuario_id=ep;
  stage:='personal_job';
  personal_job:=pg_temp.diime_qa_job(cp,pp,null,null,null,marker);
  stage:='company_job';
  company_job:=pg_temp.diime_qa_job(sc,sp,client_company,provider_company,se,marker);
  stage:='file_metadata';
  file_url:='https://diime.es/api/archivos/'||file_id::text||'?nombre=QA-rollback.pdf';
  insert into public.archivos_privados(id,propietario_id,storage_path,url,nombre,tipo,bytes)
   values(file_id,pp,'qa-rollback/'||file_id::text,file_url,'QA-rollback.pdf','application/pdf',1);
  setup_completed:=true;stage:='assertions';
  results:=results||pg_temp.diime_qa_assert('metadata_owner_draft',pp,format('select public.archivo_privado_metadata(%L::uuid) is not null',file_id));
  results:=results||pg_temp.diime_qa_assert('metadata_outsider_draft',aj,format('select public.archivo_privado_metadata(%L::uuid) is null',file_id));
  results:=results||pg_temp.diime_qa_assert('metadata_anon_denied',null,format('select public.archivo_privado_metadata(%L::uuid) is null',file_id),'42501','anon');
  update public.trabajos set archivos=jsonb_build_array(file_url) where id=personal_job;
  results:=results||pg_temp.diime_qa_assert('metadata_client_contract',cp,format('select public.archivo_privado_metadata(%L::uuid) is not null',file_id));
  results:=results||pg_temp.diime_qa_assert('metadata_outsider_contract',aj,format('select public.archivo_privado_metadata(%L::uuid) is null',file_id));
  results:=results||pg_temp.diime_qa_assert('metadata_table_direct_denied',pp,'select count(*)=0 from public.archivos_privados','42501');
  results:=results||pg_temp.diime_qa_assert('notes_provider_write',pp,format('select count(*)=1 from public.actualizar_planificacion_trabajo(%L::uuid,%L::jsonb)',personal_job,'{"notas_privadas_proveedor":"QA rollback note"}'));
  results:=results||pg_temp.diime_qa_assert('notes_provider_read',pp,format('select count(*)=1 from public.notas_trabajos_proveedor(array[%L::uuid]) where notas_privadas_proveedor=%L',personal_job,'QA rollback note'));
  results:=results||pg_temp.diime_qa_assert('notes_client_hidden',cp,format('select count(*)=0 from public.notas_trabajos_proveedor(array[%L::uuid])',personal_job));
  results:=results||pg_temp.diime_qa_assert('notes_outsider_hidden',aj,format('select count(*)=0 from public.notas_trabajos_proveedor(array[%L::uuid])',personal_job));
  results:=results||pg_temp.diime_qa_assert('notes_shared_contract_null',cp,format('select notas_privadas_proveedor is null from public.trabajos where id=%L::uuid',personal_job));
  results:=results||pg_temp.diime_qa_assert('notes_client_write_denied',cp,format('select count(*)=1 from public.actualizar_planificacion_trabajo(%L::uuid,%L::jsonb)',personal_job,'{"notas_privadas_proveedor":"Unauthorized"}'),'42501');
  results:=results||pg_temp.diime_qa_assert('notes_direct_table_denied',cp,'select count(*)=0 from diime_private.notas_trabajo_proveedor','42501');
  results:=results||pg_temp.diime_qa_assert('review_outsider_direct_denied',aj,format('insert into public."reseñas"(trabajo_id,profesional_id,autor_id,rating,comentario) values(%L,%L,%L,5,%L) returning true',personal_job,pp,aj,'QA rollback'),'42501');
  results:=results||pg_temp.diime_qa_assert('review_wrong_provider_denied',cp,format('select (public.crear_resena_trabajo(%L,%L,5,%L,null)->>%L) is not null',personal_job,pe,'QA rollback','id'),'42501');
  results:=results||pg_temp.diime_qa_assert('review_client_valid',cp,format('select (public.crear_resena_trabajo(%L,%L,5,%L,null)->>%L) is not null',personal_job,pp,'QA rollback','id'));
  results:=results||pg_temp.diime_qa_assert('review_duplicate_direct_denied',cp,format('insert into public."reseñas"(trabajo_id,profesional_id,autor_id,rating,comentario) values(%L,%L,%L,5,%L) returning true',personal_job,pp,cp,'QA duplicate rollback'),'23505');
  results:=results||jsonb_build_object('name','review_atomic_link','pass',exists(select 1 from public.trabajos t join public."reseñas" r on r.id=t.review_cliente_id where t.id=personal_job and r.profesional_id=pp and r.autor_id=cp and r.integridad_version=2));
  results:=results||pg_temp.diime_qa_assert('portfolio_provider_valid',pp,format('insert into public.portfolio(profesional_id,trabajo_id,titulo,descripcion) values(%L,%L,%L,%L) returning titulo=%L',pp,personal_job,'Modified label','QA rollback',marker));
  results:=results||pg_temp.diime_qa_assert('portfolio_foreign_contract_denied',pp,format('insert into public.portfolio(profesional_id,trabajo_id,titulo,descripcion) values(%L,%L,%L,%L) returning true',pp,company_job,'Foreign','QA rollback'),'42501');
  results:=results||pg_temp.diime_qa_assert('company_delegate_notes_write',se,format('select count(*)=1 from public.actualizar_planificacion_trabajo(%L::uuid,%L::jsonb)',company_job,'{"notas_privadas_proveedor":"QA company rollback note"}'));
  results:=results||pg_temp.diime_qa_assert('company_owner_notes_read',sp,format('select count(*)=1 from public.notas_trabajos_proveedor(array[%L::uuid]) where notas_privadas_proveedor=%L',company_job,'QA company rollback note'));
  results:=results||pg_temp.diime_qa_assert('company_delegate_notes_read',se,format('select count(*)=1 from public.notas_trabajos_proveedor(array[%L::uuid])',company_job));
  results:=results||pg_temp.diime_qa_assert('company_client_notes_hidden',sc,format('select count(*)=0 from public.notas_trabajos_proveedor(array[%L::uuid])',company_job));
  results:=results||pg_temp.diime_qa_assert('company_unrelated_client_review_denied',cp,format('select (public.crear_resena_trabajo(%L,%L,5,%L,null)->>%L) is not null',company_job,sp,'QA company rollback','id'),'42501');
  results:=results||pg_temp.diime_qa_assert('company_client_review_valid',sc,format('select (public.crear_resena_trabajo(%L,%L,5,%L,null)->>%L) is not null',company_job,sp,'QA company rollback','id'));
  results:=results||pg_temp.diime_qa_assert('company_provider_portfolio_valid',sp,format('insert into public.portfolio(profesional_id,trabajo_id,titulo,descripcion) values(%L,%L,%L,%L) returning titulo=%L',sp,company_job,'Modified label','QA rollback',marker));
  raise exception 'FORCE_QA_ROLLBACK' using errcode='ZQ001';
 exception
  when sqlstate 'ZQ001' then null;
  when others then results:=results||jsonb_build_object('name','fixture_or_test_setup_'||stage,'pass',false,'code',sqlstate);
 end;
 -- The whole inner transaction has rolled back before these checks.
 select jsonb_agg(jsonb_build_array(id,rating_promedio,total_reseñas) order by id) into after_rating from public.profesionales where id in(pp,pe);
 select jsonb_build_object(
  'profiles',(select jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p where p.id in(cp,pp,ce,pe,ep,aj)),
  'memberships',(select jsonb_agg(to_jsonb(m) order by m.empresa_id,m.usuario_id) from public.empresa_miembros m where m.usuario_id in(ce,pe,ep)),
  'companies',(select jsonb_agg(to_jsonb(e) order by e.id) from public.empresas e where e.propietario_id in(ce,pe))) into after_qa_state;
 select count(*) into fixture_rows from public.solicitudes where titulo=marker;
 perform set_config('diime.qa.rollback_result',jsonb_build_object('setup_completed',setup_completed,'checks',results,'all_checks_pass',not exists(select 1 from jsonb_array_elements(results) x where (x->>'pass')::boolean is distinct from true),'checks_count',jsonb_array_length(results),'fixture_requests_after_rollback',fixture_rows,'metadata_after_rollback',(select count(*) from public.archivos_privados where id=file_id),'synthetic_users_after_rollback',(select count(*) from auth.users where id in(sc,sp,se)),'synthetic_companies_after_rollback',(select count(*) from public.empresas where id in(client_company,provider_company)),'qa_reputation_unchanged',before_rating is not distinct from after_rating,'qa_profiles_memberships_companies_unchanged',before_qa_state is not distinct from after_qa_state,'synthetic_reviews_after_rollback',(select count(*) from public."reseñas" where trabajo_id in(personal_job,company_job)),'synthetic_portfolio_after_rollback',(select count(*) from public.portfolio where trabajo_id in(personal_job,company_job)),'synthetic_notes_after_rollback',(select count(*) from diime_private.notas_trabajo_proveedor where trabajo_id in(personal_job,company_job)))::text,true);
end; $qa$;
select current_setting('diime.qa.rollback_result')::jsonb as verification;
