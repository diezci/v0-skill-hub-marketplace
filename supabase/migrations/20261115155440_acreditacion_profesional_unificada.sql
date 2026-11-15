begin;

-- A professional remains one account. This discriminator does not create a
-- legacy workspace/company membership or reassign any existing contract.
alter table public.profesionales add column tipo_proveedor text not null default 'particular'
  check(tipo_proveedor in ('particular','empresa'));
create function diime_private.proteger_tipo_proveedor() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if (tg_op='INSERT' and new.tipo_proveedor<>'particular') or (tg_op='UPDATE' and new.tipo_proveedor is distinct from old.tipo_proveedor) then
  raise exception 'El tipo de proveedor se modifica mediante el expediente de acreditación.' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function diime_private.proteger_tipo_proveedor() from public,anon,authenticated;
create trigger proteger_tipo_proveedor before insert or update on public.profesionales for each row execute function diime_private.proteger_tipo_proveedor();

create table diime_private.documentos_acreditacion_profesional (
 id uuid primary key, propietario_id uuid not null references public.profiles(id),
 categoria text not null check(categoria in ('identidad','cualificacion','representacion')),
 storage_path text not null unique, nombre text not null check(length(nombre) between 1 and 180),
 bytes integer not null check(bytes between 6 and 5242880),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 creado_at timestamptz not null default now()
);
create table diime_private.acreditaciones_profesionales (
 profesional_id uuid primary key references public.profesionales(id),
 datos jsonb not null check(jsonb_typeof(datos)='object'),version integer not null default 1 check(version>0),
 actualizada_at timestamptz not null default now()
);
create table diime_private.historial_acreditacion_profesional (
 id uuid primary key default gen_random_uuid(),profesional_id uuid not null references public.profesionales(id),
 version integer not null,datos jsonb not null,estado text not null,actor_id uuid references public.profiles(id),
 comprobaciones jsonb,creado_at timestamptz not null default now()
);
alter table diime_private.documentos_acreditacion_profesional enable row level security;
alter table diime_private.acreditaciones_profesionales enable row level security;
alter table diime_private.historial_acreditacion_profesional enable row level security;
revoke all on diime_private.documentos_acreditacion_profesional,diime_private.acreditaciones_profesionales,diime_private.historial_acreditacion_profesional from public,anon,authenticated,service_role;

-- No client storage policies. Upload/read URLs are created only by the server.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('acreditaciones-profesionales','acreditaciones-profesionales',false,5242880,array['application/pdf'])
  on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf'];
 end if;
 if to_regclass('storage.objects') is not null then
  create policy acreditaciones_profesionales_solo_servidor on storage.objects as restrictive
   for all to anon,authenticated using(bucket_id<>'acreditaciones-profesionales')
   with check(bucket_id<>'acreditaciones-profesionales');
 end if;
end $$;

create function public.registrar_documento_acreditacion_profesional(p_id uuid,p_usuario_id uuid,p_categoria text,p_storage_path text,p_nombre text,p_bytes integer,p_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_usuario_id and cuenta_eliminada is null) or
  p_storage_path is distinct from p_usuario_id::text||'/'||p_id::text||'.pdf' then raise exception 'Documento no disponible.' using errcode='42501'; end if;
 insert into diime_private.documentos_acreditacion_profesional(id,propietario_id,categoria,storage_path,nombre,bytes,sha256)
 values(p_id,p_usuario_id,p_categoria,p_storage_path,p_nombre,p_bytes,p_sha256);
end; $$;
revoke all on function public.registrar_documento_acreditacion_profesional(uuid,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.registrar_documento_acreditacion_profesional(uuid,uuid,text,text,text,integer,text) to service_role;

create function public.documento_acreditacion_profesional_metadata(p_url text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d diime_private.documentos_acreditacion_profesional;
begin
 if auth.uid() is null or p_url !~ '^acreditacion://[0-9a-f-]{36}$' then return null; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and cuenta_eliminada is null) then return null; end if;
 select * into d from diime_private.documentos_acreditacion_profesional where id=substring(p_url from 16)::uuid;
 if not found or (d.propietario_id<>auth.uid() and not public.is_admin()) then return null; end if;
 return jsonb_build_object('storage_path',d.storage_path,'nombre',d.nombre);
end; $$;
revoke all on function public.documento_acreditacion_profesional_metadata(text) from public,anon;
grant execute on function public.documento_acreditacion_profesional_metadata(text) to authenticated;

create function public.mi_acreditacion_profesional()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('acreditacion',a.datos,'tipoCobrosBloqueado',p.stripe_account_id is not null,
  'identidadCobrosBloqueada',p.stripe_account_id is not null and a.profesional_id is not null)
 from public.profesionales p join public.profiles u on u.id=p.id
 left join diime_private.acreditaciones_profesionales a on a.profesional_id=p.id
 where p.id=auth.uid() and u.cuenta_eliminada is null;
$$;
create function public.acreditaciones_profesionales_admin(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and es_admin and cuenta_eliminada is null) then raise exception 'No tienes permiso para gestionar verificaciones.' using errcode='42501'; end if;
 if cardinality(p_ids)>200 then raise exception 'Demasiados perfiles.' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('profesional_id',p.id,'acreditacion',a.datos,'tipoCobrosBloqueado',p.stripe_account_id is not null,
  'identidadCobrosBloqueada',p.stripe_account_id is not null and a.profesional_id is not null,'cuentaStripe',p.stripe_account_id))
 from public.profesionales p left join diime_private.acreditaciones_profesionales a on a.profesional_id=p.id where p.id=any(p_ids)),'[]');
end; $$;
revoke all on function public.mi_acreditacion_profesional(),public.acreditaciones_profesionales_admin(uuid[]) from public,anon;
grant execute on function public.mi_acreditacion_profesional(),public.acreditaciones_profesionales_admin(uuid[]) to authenticated;

create function diime_private.validar_datos_acreditacion(p_datos jsonb,p_usuario uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb; doc jsonb; guardado diime_private.documentos_acreditacion_profesional; campo text;
begin
 if p_datos is null or jsonb_typeof(p_datos)<>'object' then raise exception 'Completa los datos y documentos de acreditación.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('tipoProveedor','nombreLegal','nif','domicilioFiscal','actividad','cualificacion','representanteNombre','cargoRepresentacion','documentos','consentimiento')) then raise exception 'Datos de acreditación no válidos.' using errcode='22023'; end if;
 if p_datos->>'tipoProveedor' is null or p_datos->>'tipoProveedor' not in ('particular','empresa') or p_datos->'consentimiento' is distinct from 'true'::jsonb then raise exception 'Selecciona el tipo de proveedor y confirma la declaración.' using errcode='22023'; end if;
 d:=p_datos;
 foreach campo in array array['nombreLegal','nif','domicilioFiscal','actividad','cualificacion'] loop
  if jsonb_typeof(d->campo) is distinct from 'string' or length(btrim(d->>campo)) not between 2 and (case when campo='cualificacion' then 4000 when campo='actividad' then 2000 when campo='nif' then 30 when campo='domicilioFiscal' then 500 else 200 end)
   or (case when campo in ('actividad','cualificacion','domicilioFiscal') then translate(d->>campo,E'\n\r\t','') else d->>campo end) ~ '[[:cntrl:]]' then raise exception 'Completa los datos de identidad, actividad y cualificación.' using errcode='22023'; end if;
  d:=jsonb_set(d,array[campo],to_jsonb(btrim(d->>campo)));
 end loop;
 d:=jsonb_set(d,'{nif}',to_jsonb(upper(regexp_replace(d->>'nif','[[:space:]-]','','g'))));
 if d->>'nif' !~ '^[A-Z0-9]{5,20}$' then raise exception 'Revisa el NIF o documento fiscal.' using errcode='22023'; end if;
 if d->>'tipoProveedor'='empresa' then
  foreach campo in array array['representanteNombre','cargoRepresentacion'] loop
   if jsonb_typeof(d->campo) is distinct from 'string' or length(btrim(d->>campo)) not between 2 and 200 or (d->>campo) ~ '[[:cntrl:]]' then raise exception 'Identifica al representante y sus facultades.' using errcode='22023'; end if;
  end loop;
  if d->>'cargoRepresentacion' not in ('Administrador único','Administrador solidario','Administrador mancomunado','Consejero delegado','Miembro del consejo con facultades de representación','Apoderado individual o solidario','Apoderado mancomunado','Representante de administrador persona jurídica','Otra representación acreditada') then raise exception 'Selecciona unas facultades de representación válidas.' using errcode='22023'; end if;
 else d:=d-'representanteNombre'-'cargoRepresentacion'; end if;
 if jsonb_typeof(d->'documentos') is distinct from 'array' or jsonb_array_length(d->'documentos') not between 2 and 8 then raise exception 'Adjunta los documentos de identidad y cualificación.' using errcode='22023'; end if;
 for doc in select * from jsonb_array_elements(d->'documentos') loop
  if jsonb_typeof(doc)<>'object' or doc->>'url' is null or doc->>'url' !~ '^acreditacion://[0-9a-f-]{36}$' or doc->>'categoria' is null or doc->>'categoria' not in ('identidad','cualificacion','representacion') then raise exception 'Adjunta documentos privados válidos.' using errcode='22023'; end if;
  select * into guardado from diime_private.documentos_acreditacion_profesional where id=substring(doc->>'url' from 16)::uuid;
  if not found or guardado.propietario_id<>p_usuario or guardado.categoria is distinct from doc->>'categoria' or guardado.nombre is distinct from doc->>'nombre' then raise exception 'Un documento no pertenece a tu expediente.' using errcode='42501'; end if;
 end loop;
 if not exists(select 1 from jsonb_array_elements(d->'documentos') x where x->>'categoria'='identidad') or
  not exists(select 1 from jsonb_array_elements(d->'documentos') x where x->>'categoria'='cualificacion') or
  (d->>'tipoProveedor'='empresa' and not exists(select 1 from jsonb_array_elements(d->'documentos') x where x->>'categoria'='representacion')) then
  raise exception 'Adjunta identidad y cualificación y, para empresas, representación.' using errcode='22023'; end if;
 return d;
end; $$;
revoke all on function diime_private.validar_datos_acreditacion(jsonb,uuid) from public,anon,authenticated,service_role;

create function public.solicitar_acreditacion_profesional(p_mensaje text,p_datos jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); perfil public.profiles; profesional public.profesionales; anterior diime_private.acreditaciones_profesionales;
 solicitud public.solicitudes_verificacion_profesional; datos jsonb; empresa_actual uuid; siguiente integer;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Inicia sesión y confirma tu correo.' using errcode='42501'; end if;
 select * into profesional from public.profesionales where id=actor for update;
 if not found then raise exception 'Primero completa tu perfil profesional.' using errcode='42501'; end if;
 select * into perfil from public.profiles where id=actor and cuenta_eliminada is null for update;
 if not found then raise exception 'Perfil no disponible.' using errcode='42501'; end if;
 if length(coalesce(p_mensaje,''))>2000 then raise exception 'El mensaje debe tener como máximo 2.000 caracteres.' using errcode='22023'; end if;
 datos:=diime_private.validar_datos_acreditacion(p_datos,actor);
 empresa_actual:=diime_private.empresa_actual_verificacion(actor);
 if empresa_actual is not null and datos->>'tipoProveedor'='empresa' then raise exception 'Tu cuenta ya pertenece a una empresa existente. Contacta con Diime para revisar su identidad sin trasladar sus contratos.' using errcode='22023'; end if;
 select * into anterior from diime_private.acreditaciones_profesionales where profesional_id=actor;
 if profesional.stripe_account_id is not null and (
  datos->>'tipoProveedor' is distinct from coalesce(anterior.datos->>'tipoProveedor','particular') or
  (anterior.profesional_id is not null and (datos->>'nif' is distinct from anterior.datos->>'nif' or datos->>'nombreLegal' is distinct from anterior.datos->>'nombreLegal'))) then
  raise exception 'La identidad de cobros ya está vinculada. Contacta con Diime para corregir el tipo de proveedor, el nombre legal o el NIF sin alterar los contratos existentes.' using errcode='22023'; end if;
 select * into solicitud from public.solicitudes_verificacion_profesional where profesional_id=actor for update;
 if anterior.datos=datos and solicitud.estado in ('pendiente','en_revision','verificado') then return solicitud.id; end if;
 siguiente:=coalesce(anterior.version,0)+1;
 insert into diime_private.acreditaciones_profesionales(profesional_id,datos,version) values(actor,datos,siguiente)
 on conflict(profesional_id) do update set datos=excluded.datos,version=excluded.version,actualizada_at=clock_timestamp();
 update public.profesionales set tipo_proveedor=datos->>'tipoProveedor' where id=actor;
 update public.profiles set verificado=false where id=actor;
 insert into public.solicitudes_verificacion_profesional(profesional_id,estado,mensaje,empresa_id)
 values(actor,'pendiente',btrim(coalesce(p_mensaje,'')),empresa_actual)
 on conflict(profesional_id) do update set estado='pendiente',mensaje=excluded.mensaje,empresa_id=excluded.empresa_id,
 comentario_publico=null,solicitada_at=now(),actualizada_at=clock_timestamp(),resuelta_at=null returning * into solicitud;
 insert into public.historial_verificacion_profesional(solicitud_id,profesional_id,actor_id,estado,empresa_id) values(solicitud.id,actor,actor,'pendiente',empresa_actual);
 insert into diime_private.historial_acreditacion_profesional(profesional_id,version,datos,estado,actor_id) values(actor,siguiente,datos,'pendiente',actor);
 return solicitud.id;
end; $$;
revoke all on function public.solicitar_acreditacion_profesional(text,jsonb) from public,anon;
grant execute on function public.solicitar_acreditacion_profesional(text,jsonb) to authenticated;

-- Old text-only clients cannot submit an incomplete new dossier.
create or replace function diime_private.solicitar_verificacion_profesional(p_mensaje text)
returns uuid language plpgsql security definer set search_path='' as $$
begin raise exception 'Completa los datos y documentos de acreditación desde Mi perfil.' using errcode='22023'; end; $$;

-- Preserve the established state machine, history and optimistic review lock,
-- but take its approval capability away from old wrappers and direct callers.
alter function diime_private.revisar_verificacion_profesional(uuid,text,text,text,boolean,timestamptz) rename to revisar_verificacion_profesional_base;
revoke all on function diime_private.revisar_verificacion_profesional_base(uuid,text,text,text,boolean,timestamptz) from public,anon,authenticated,service_role;
create function diime_private.revisar_verificacion_profesional(p_profesional_id uuid,p_estado text,p_comentario_publico text,p_nota_interna text,p_compatibilidad boolean default false,p_actualizada_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if p_estado='verificado' then raise exception 'Revisa la identidad y cualificación del expediente actualizado para aprobar.' using errcode='22023'; end if;
 return diime_private.revisar_verificacion_profesional_base(p_profesional_id,p_estado,p_comentario_publico,p_nota_interna,p_compatibilidad,p_actualizada_at);
end; $$;
revoke all on function diime_private.revisar_verificacion_profesional(uuid,text,text,text,boolean,timestamptz) from public,anon;
grant execute on function diime_private.revisar_verificacion_profesional(uuid,text,text,text,boolean,timestamptz) to authenticated;
create function public.revisar_acreditacion_profesional(p_profesional_id uuid,p_estado text,p_comentario_publico text,p_nota_interna text,p_actualizada_at timestamptz,p_identidad_comprobada boolean,p_cualificacion_comprobada boolean,p_representacion_comprobada boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare a diime_private.acreditaciones_profesionales; solicitud_id uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and es_admin and cuenta_eliminada is null) then raise exception 'Solo un administrador puede revisar la verificación.' using errcode='42501'; end if;
 if p_profesional_id=auth.uid() then raise exception 'No puedes aprobar tu propio expediente.' using errcode='42501'; end if;
 perform 1 from public.profesionales where id=p_profesional_id for update;
 perform 1 from public.profiles where id=p_profesional_id for update;
 select * into a from diime_private.acreditaciones_profesionales where profesional_id=p_profesional_id;
 if p_estado='verificado' then
  if a.profesional_id is null or p_identidad_comprobada is distinct from true or p_cualificacion_comprobada is distinct from true or
   (a.datos->>'tipoProveedor'='empresa' and p_representacion_comprobada is distinct from true) then raise exception 'Confirma la identidad, la cualificación y la representación aplicable antes de aprobar.' using errcode='22023'; end if;
  perform diime_private.validar_datos_acreditacion(a.datos,p_profesional_id);
  if length(btrim(coalesce(p_nota_interna,'')))<20 then raise exception 'Describe las comprobaciones realizadas.' using errcode='22023'; end if;
 end if;
 solicitud_id:=diime_private.revisar_verificacion_profesional_base(p_profesional_id,p_estado,p_comentario_publico,p_nota_interna,false,p_actualizada_at);
 if a.profesional_id is not null then insert into diime_private.historial_acreditacion_profesional(profesional_id,version,datos,estado,actor_id,comprobaciones)
 values(p_profesional_id,a.version,a.datos,p_estado,auth.uid(),jsonb_build_object('identidad',p_identidad_comprobada,'cualificacion',p_cualificacion_comprobada,'representacion',p_representacion_comprobada)); end if;
 return solicitud_id;
end; $$;
revoke all on function public.revisar_acreditacion_profesional(uuid,text,text,text,timestamptz,boolean,boolean,boolean) from public,anon;
grant execute on function public.revisar_acreditacion_profesional(uuid,text,text,text,timestamptz,boolean,boolean,boolean) to authenticated;

create function diime_private.identidad_proveedor_cobros(p_profesional_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('tipo_proveedor',coalesce(a.datos->>'tipoProveedor','particular'),
  'nombre_legal',coalesce(a.datos->>'nombreLegal',btrim(u.nombre||' '||coalesce(u.apellido,''))),
  'nif',coalesce(a.datos->>'nif',u.documento),'domicilio_fiscal',a.datos->>'domicilioFiscal',
  'verificado',u.verificado and (a.profesional_id is null or s.estado='verificado'),'version',coalesce(a.version,0))
 from public.profesionales p join public.profiles u on u.id=p.id
 left join diime_private.acreditaciones_profesionales a on a.profesional_id=p.id
 left join public.solicitudes_verificacion_profesional s on s.profesional_id=p.id
 where p.id=p_profesional_id and u.cuenta_eliminada is null;
$$;
revoke all on function diime_private.identidad_proveedor_cobros(uuid) from public,anon,authenticated;
grant execute on function diime_private.identidad_proveedor_cobros(uuid) to service_role;
create function public.identidad_proveedor_cobros(p_profesional_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.identidad_proveedor_cobros(p_profesional_id); $$;
revoke all on function public.identidad_proveedor_cobros(uuid) from public,anon,authenticated;
grant execute on function public.identidad_proveedor_cobros(uuid) to service_role;
create function public.mi_identidad_proveedor_cobros()
returns jsonb language sql stable security definer set search_path='' as $$ select diime_private.identidad_proveedor_cobros(auth.uid()); $$;
revoke all on function public.mi_identidad_proveedor_cobros() from public,anon;
grant execute on function public.mi_identidad_proveedor_cobros() to authenticated;

create function public.registrar_cuenta_stripe_proveedor(p_profesional_id uuid,p_account_id text,p_version_esperada integer,p_tipo_esperado text)
returns text language plpgsql security definer set search_path='' as $$
declare p public.profesionales; identidad jsonb;
begin
 -- Same lock order as submission and review. Account creation uses a snapshot;
 -- registration must fail if that snapshot changed while Stripe was called.
 select * into p from public.profesionales where id=p_profesional_id for update;
 if not found then raise exception 'Perfil no disponible.' using errcode='42501'; end if;
 perform 1 from public.profiles where id=p_profesional_id and cuenta_eliminada is null for update;
 if not found then raise exception 'Perfil no disponible.' using errcode='42501'; end if;
 identidad:=diime_private.identidad_proveedor_cobros(p_profesional_id);
 if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9]+$' then raise exception 'Cuenta de cobros no válida.' using errcode='22023'; end if;
 if p_version_esperada is distinct from (identidad->>'version')::integer or p_tipo_esperado is distinct from identidad->>'tipo_proveedor' then
  raise exception 'La identidad ha cambiado. Actualiza el perfil antes de conectar los cobros.' using errcode='40001'; end if;
 if (identidad->>'verificado')::boolean is distinct from true then raise exception 'Completa la acreditación de Diime antes de activar los cobros.' using errcode='42501'; end if;
 if p.stripe_account_id is not null and p.stripe_account_id<>p_account_id then raise exception 'Ya existe una cuenta de cobros. Contacta con Diime para revisar su titularidad.' using errcode='22023'; end if;
 if p.stripe_account_id=p_account_id then return p_account_id; end if;
 update public.profesionales set stripe_account_id=p_account_id,stripe_onboarding_completado=false,
  stripe_transferencias_habilitadas=false,stripe_payouts_habilitados=false,stripe_estado_actualizado_at=now()
 where id=p_profesional_id;
 return p_account_id;
end; $$;
revoke all on function public.registrar_cuenta_stripe_proveedor(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.registrar_cuenta_stripe_proveedor(uuid,text,integer,text) to service_role;

alter table public.ofertas add column acreditacion_version integer;
alter table public.trabajos add column proveedor_tipo text check(proveedor_tipo in ('particular','empresa'));
create function diime_private.exigir_acreditacion_nueva_operacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare proveedor uuid; empresa uuid; identidad jsonb; version_oferta integer;
begin
 if tg_table_name='ofertas' then
  proveedor:=new.profesional_id;empresa:=new.empresa_id;
  if tg_op='UPDATE' then
   new.acreditacion_version:=old.acreditacion_version;
   if new.estado<>'pendiente' or auth.uid() is distinct from new.profesional_id then return new; end if;
  end if;
 else proveedor:=new.profesional_id;empresa:=new.empresa_proveedora_id; end if;
 if empresa is not null then return new; end if;
 perform 1 from public.profesionales where id=proveedor for share;
 identidad:=diime_private.identidad_proveedor_cobros(proveedor);
 if identidad is null or (identidad->>'verificado')::boolean is distinct from true then
  raise exception 'Diime debe acreditar tu identidad y cualificación antes de enviar ofertas o contratar nuevos trabajos.' using errcode='42501'; end if;
 if tg_table_name='ofertas' then new.acreditacion_version:=(identidad->>'version')::integer;
 else
  new.proveedor_tipo:=identidad->>'tipo_proveedor';
  if new.oferta_id is not null then
  select coalesce(acreditacion_version,0) into version_oferta from public.ofertas where id=new.oferta_id;
  if version_oferta is distinct from (identidad->>'version')::integer then raise exception 'La identidad o acreditación del proveedor ha cambiado. Debe actualizar la oferta antes de contratar.' using errcode='22023'; end if;
  end if;
 end if;
 return new;
end; $$;
revoke all on function diime_private.exigir_acreditacion_nueva_operacion() from public,anon,authenticated,service_role;
create trigger zz_oferta_acreditacion before insert or update on public.ofertas for each row execute function diime_private.exigir_acreditacion_nueva_operacion();
create trigger zz_contrato_acreditacion before insert on public.trabajos for each row execute function diime_private.exigir_acreditacion_nueva_operacion();

create function diime_private.proteger_tipo_proveedor_trabajo()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.proveedor_tipo is distinct from old.proveedor_tipo then raise exception 'La identidad contratada no se puede modificar.' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function diime_private.proteger_tipo_proveedor_trabajo() from public,anon,authenticated,service_role;
create trigger proteger_tipo_proveedor_trabajo before update of proveedor_tipo on public.trabajos for each row execute function diime_private.proteger_tipo_proveedor_trabajo();

create function diime_private.sellar_tipo_proveedor_liquidacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare tipo text;
begin
 if new.liquidacion_contexto is null then return new; end if;
 if tg_op='UPDATE' and old.liquidacion_contexto is not null then return new; end if;
 select proveedor_tipo into tipo from public.trabajos where id=new.trabajo_id;
 if tipo is not null then new.liquidacion_contexto:=new.liquidacion_contexto||jsonb_build_object('proveedor_tipo',tipo); end if;
 return new;
end; $$;
revoke all on function diime_private.sellar_tipo_proveedor_liquidacion() from public,anon,authenticated,service_role;
create trigger a_sellar_tipo_proveedor_liquidacion before insert or update of liquidacion_contexto on public.transacciones_escrow
 for each row execute function diime_private.sellar_tipo_proveedor_liquidacion();

-- Material qualification edits invalidate both approved and pending dossiers.
-- Other profile edits and Stripe state updates do not change this review.
create function diime_private.invalidar_acreditacion_por_actividad()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.solicitudes_verificacion_profesional; a diime_private.acreditaciones_profesionales; verificado_previo boolean;
 motivo text:='Has cambiado la actividad o las acreditaciones del perfil. Envía de nuevo la documentación para que Diime revise los cambios.';
begin
 if new.titulo is not distinct from old.titulo and new.categorias_interes is not distinct from old.categorias_interes
  and new.certificaciones is not distinct from old.certificaciones and new.habilidades is not distinct from old.habilidades then return new; end if;
 select verificado into verificado_previo from public.profiles where id=new.id for update;
 select * into s from public.solicitudes_verificacion_profesional where profesional_id=new.id for update;
 if not found then
  -- Historical badges survive unchanged profiles, never new capabilities.
  -- A first-time unverified draft remains editable without creating a request.
  if verificado_previo is distinct from true then return new; end if;
  insert into public.solicitudes_verificacion_profesional(profesional_id,estado,comentario_publico,empresa_id,resuelta_at)
   values(new.id,'retirada',motivo,diime_private.empresa_actual_verificacion(new.id),now()) returning * into s;
 elsif s.estado not in ('pendiente','en_revision','verificado') then return new; end if;
 update public.profiles set verificado=false where id=new.id;
 update public.solicitudes_verificacion_profesional set estado='retirada',comentario_publico=motivo,actualizada_at=clock_timestamp(),resuelta_at=now() where id=s.id;
 insert into public.historial_verificacion_profesional(solicitud_id,profesional_id,actor_id,estado,comentario_publico,empresa_id)
 values(s.id,new.id,auth.uid(),'retirada',motivo,s.empresa_id);
 select * into a from diime_private.acreditaciones_profesionales where profesional_id=new.id;
 if found then insert into diime_private.historial_acreditacion_profesional(profesional_id,version,datos,estado,actor_id,comprobaciones)
 values(new.id,a.version,a.datos,'retirada',auth.uid(),jsonb_build_object('motivo',motivo)); end if;
 return new;
end; $$;
revoke all on function diime_private.invalidar_acreditacion_por_actividad() from public,anon,authenticated,service_role;
create trigger invalidar_acreditacion_por_actividad after update of titulo,categorias_interes,certificaciones,habilidades on public.profesionales
 for each row execute function diime_private.invalidar_acreditacion_por_actividad();

-- New snapshots use the approved unified identity for the provider only.
-- No UPDATE/backfill: original contracts retain their original contracting party.
create or replace function diime_private.sellar_facturacion_trabajo()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into diime_private.trabajos_facturacion(trabajo_id,datos)
 select new.id,jsonb_agg(jsonb_build_object(
  'parte',d.parte,
  'empresa_nombre',case when a.datos->>'tipoProveedor'='empresa' then a.datos->>'nombreLegal' else e.razon_social end,
  'empresa_cif',case when a.datos->>'tipoProveedor'='empresa' then a.datos->>'nif' else e.cif end,
  'empresa_ubicacion',case when a.datos->>'tipoProveedor'='empresa' then a.datos->>'domicilioFiscal' else e.ubicacion end,
  'empresa_email',case when a.datos->>'tipoProveedor'='empresa' then p.email else e.email end,
  'persona_nombre',case when a.datos->>'tipoProveedor'='particular' then a.datos->>'nombreLegal' else p.nombre end,
  'persona_apellido',case when a.datos->>'tipoProveedor'='particular' then null else p.apellido end,
  'persona_documento',case when a.datos->>'tipoProveedor'='empresa' then null when a.datos->>'tipoProveedor'='particular' then a.datos->>'nif' when d.empresa_id is null then p.documento else null end,
  'persona_cargo',case when a.datos->>'tipoProveedor'='empresa' then a.datos->>'cargoRepresentacion' when d.empresa_id is not null then m.cargo else null end
 ) order by d.parte)
 from (values ('cliente',new.cliente_id,new.empresa_cliente_id),('profesional',new.profesional_id,new.empresa_proveedora_id)) d(parte,usuario_id,empresa_id)
 join public.profiles p on p.id=d.usuario_id
 left join public.empresas e on e.id=d.empresa_id
 left join public.empresa_miembros m on m.usuario_id=d.usuario_id and m.empresa_id=d.empresa_id
 left join diime_private.acreditaciones_profesionales a on a.profesional_id=d.usuario_id and d.parte='profesional' and d.empresa_id is null;
 return new;
end; $$;

notify pgrst,'reload schema';
commit;
