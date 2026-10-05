-- Empresa como identidad explícita. No atribuye operaciones históricas a la
-- empresa actual de una persona: solo los INSERT nuevos guardan el contexto.
begin;

alter table public.empresas add column if not exists servicios text[] not null default '{}';
alter table public.empresas alter column token_invitacion drop default;
update public.empresas set token_invitacion = null where token_invitacion is not null;

create table public.empresa_miembros (
  empresa_id uuid not null references public.empresas(id),
  usuario_id uuid not null references public.profiles(id),
  cargo text not null check (length(btrim(cargo)) between 1 and 120),
  estado text not null default 'activo' check (estado in ('activo','revocado')),
  origen text not null check (origen in ('titular','invitacion','legado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revocado_at timestamptz,
  primary key (empresa_id, usuario_id)
);
create unique index empresa_miembros_usuario_activo_idx on public.empresa_miembros(usuario_id) where estado = 'activo';
create table public.empresa_invitaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  email text not null,
  cargo text not null check (length(btrim(cargo)) between 1 and 120),
  token_hash text not null unique,
  creada_por uuid not null,
  aceptada_por uuid,
  estado text not null default 'pendiente' check (estado in ('pendiente','aceptada','revocada')),
  created_at timestamptz not null default now(),
  expira_at timestamptz not null default now() + interval '7 days',
  aceptada_at timestamptz,
  revocada_at timestamptz
);
create index empresa_invitaciones_empresa_fecha_idx on public.empresa_invitaciones(empresa_id,created_at desc);
create table public.empresa_actividad (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  actor_usuario_id uuid,
  actor_nombre text not null,
  accion text not null,
  entidad_tipo text not null,
  entidad_id uuid,
  detalle jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index empresa_actividad_empresa_fecha_idx on public.empresa_actividad(empresa_id,created_at desc);
alter table public.empresa_miembros enable row level security;
alter table public.empresa_invitaciones enable row level security;
alter table public.empresa_actividad enable row level security;
revoke all on public.empresa_miembros, public.empresa_invitaciones, public.empresa_actividad from public, anon, authenticated;
grant all on public.empresa_miembros, public.empresa_invitaciones, public.empresa_actividad to service_role;

-- Se conserva la pertenencia preexistente, sin convertirla en autoría de trabajos.
insert into public.empresa_miembros(empresa_id,usuario_id,cargo,origen)
select e.id,e.propietario_id,coalesce(nullif(btrim(p.cargo_empresa),''),'Titular'),'titular'
from public.empresas e join public.profiles p on p.id=e.propietario_id;
insert into public.empresa_miembros(empresa_id,usuario_id,cargo,origen)
select p.empresa_id,p.id,coalesce(nullif(btrim(p.cargo_empresa),''),'Profesional'),'legado'
from public.profiles p where p.empresa_id is not null and p.cuenta_eliminada is null
  and not exists(select 1 from public.empresa_miembros m where m.usuario_id=p.id and m.estado='activo');

create or replace function diime_private.es_miembro_empresa(p_empresa uuid,p_usuario uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_usuario is not null and exists (
    select 1 from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id
    join public.empresas e on e.id=m.empresa_id join public.profiles titular on titular.id=e.propietario_id
    where titular.cuenta_eliminada is null and m.empresa_id=p_empresa and m.usuario_id=p_usuario and m.estado='activo' and p.cuenta_eliminada is null
  );
$$;
revoke all on function diime_private.es_miembro_empresa(uuid,uuid) from public,anon;
grant usage on schema diime_private to anon,authenticated,service_role;
grant execute on function diime_private.es_miembro_empresa(uuid,uuid) to authenticated,service_role;

create or replace function diime_private.empresa_registrar_actividad(p_empresa uuid,p_accion text,p_tipo text,p_entidad uuid,p_detalle jsonb default '{}')
returns void language sql security definer set search_path='' as $$
  insert into public.empresa_actividad(empresa_id,actor_usuario_id,actor_nombre,accion,entidad_tipo,entidad_id,detalle)
  values(p_empresa,coalesce(auth.uid(),nullif(current_setting('diime.actor_usuario_id',true),'')::uuid),coalesce((select btrim(p.nombre||' '||coalesce(p.apellido,'')) from public.profiles p where p.id=coalesce(auth.uid(),nullif(current_setting('diime.actor_usuario_id',true),'')::uuid)),'Sistema'),p_accion,p_tipo,p_entidad,coalesce(p_detalle,'{}'));
$$;
revoke all on function diime_private.empresa_registrar_actividad(uuid,text,text,uuid,jsonb) from public,anon,authenticated;

create or replace function diime_private.empresa_titular_actual()
returns uuid language plpgsql security definer set search_path='' as $$
declare resultado uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  select e.id into resultado from public.empresas e join public.empresa_miembros m on m.empresa_id=e.id and m.usuario_id=e.propietario_id
  join public.profiles p on p.id=m.usuario_id where e.propietario_id=auth.uid() and m.estado='activo' and p.cuenta_eliminada is null for update of e;
  if resultado is null then raise exception 'Solo el titular puede gestionar la empresa' using errcode='42501'; end if;
  return resultado;
end;
$$;
revoke all on function diime_private.empresa_titular_actual() from public,anon,authenticated;

create or replace function diime_private.empresa_alta_titular()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.empresa_miembros(empresa_id,usuario_id,cargo,origen) values(new.id,new.propietario_id,'Titular','titular');
  perform diime_private.empresa_registrar_actividad(new.id,'Empresa creada','empresa',new.id,'{}');
  return new;
end;
$$;
revoke all on function diime_private.empresa_alta_titular() from public,anon,authenticated;
create trigger empresa_alta_titular after insert on public.empresas for each row execute function diime_private.empresa_alta_titular();

-- La edición directa permitiría cambiar el propietario o la verificación.
revoke insert,update,delete on public.empresas from public,anon,authenticated;
do $$ declare c record; begin
  for c in select distinct column_name from information_schema.column_privileges where table_schema='public' and table_name='empresas' and grantee in ('PUBLIC','anon','authenticated') and privilege_type in ('INSERT','UPDATE') loop
    execute format('revoke insert (%I), update (%I) on public.empresas from public,anon,authenticated',c.column_name,c.column_name);
  end loop;
end; $$;
create or replace function diime_private.vincular_empresa(p_token text,p_nombre text,p_cif text,p_documento_personal text,p_cargo text,p_telefono text,p_ubicacion text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); vinculada uuid; elegida uuid; email_actor text; cargo_titular text:=coalesce(nullif(btrim(p_cargo),''),'Titular');
begin
  if actor is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  if nullif(btrim(p_token),'') is not null then raise exception 'Utiliza el enlace personal de invitación de la empresa' using errcode='22023'; end if;
  select email into email_actor from auth.users where id=actor and email_confirmed_at is not null;
  if email_actor is null then raise exception 'Confirma tu correo antes de crear una empresa' using errcode='42501'; end if;
  if nullif(btrim(p_documento_personal),'') is null or nullif(btrim(p_nombre),'') is null or nullif(btrim(p_cif),'') is null then
    raise exception 'Indica el nombre, CIF y documento del titular de la empresa' using errcode='22023'; end if;
  select empresa_id into vinculada from public.profiles where id=actor and cuenta_eliminada is null for update;
  if not found then raise exception 'Completa primero tu perfil personal' using errcode='P0002'; end if;
  select id into elegida from public.empresas where propietario_id=actor and cif=upper(btrim(p_cif)) for update;
  if elegida is null then
    if vinculada is not null or exists(select 1 from public.empresa_miembros where usuario_id=actor and estado='activo') then raise exception 'Ya perteneces a una empresa' using errcode='42501'; end if;
    insert into public.empresas(nombre,cif,propietario_id,email,telefono,ubicacion) values(btrim(p_nombre),upper(btrim(p_cif)),actor,email_actor,nullif(btrim(p_telefono),''),nullif(btrim(p_ubicacion),'')) returning id into elegida;
  end if;
  if vinculada is not null and vinculada<>elegida then raise exception 'Ya perteneces a otra empresa' using errcode='42501'; end if;
  if vinculada is distinct from elegida then
    update public.profesionales set stripe_onboarding_completado=false,stripe_transferencias_habilitadas=false,stripe_payouts_habilitados=false,stripe_estado_actualizado_at=now() where id=actor and stripe_account_id is not null;
  end if;
  update public.empresa_miembros set cargo=cargo_titular,updated_at=now() where empresa_id=elegida and usuario_id=actor;
  update public.profiles set empresa_id=elegida,documento=btrim(p_documento_personal),cargo_empresa=cargo_titular where id=actor;
  return elegida;
end;
$$;

create or replace function diime_private.empresa_contexto_actual()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',e.id,'nombre',e.nombre,'propietario_id',e.propietario_id,'cargo',m.cargo)
  from public.empresa_miembros m join public.empresas e on e.id=m.empresa_id join public.profiles p on p.id=m.usuario_id
  where m.usuario_id=auth.uid() and m.estado='activo' and p.cuenta_eliminada is null and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id);
$$;
create or replace function diime_private.empresa_crear_invitacion(p_email text,p_cargo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_titular_actual(); token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''); invitacion public.empresa_invitaciones;
begin
  if length(btrim(p_email))>254 or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or nullif(btrim(p_email),'') is null or nullif(btrim(p_cargo),'') is null then raise exception 'Indica un correo y cargo válidos' using errcode='22023'; end if;
  update public.empresa_invitaciones set estado='revocada',revocada_at=now() where empresa_id=empresa and email=lower(btrim(p_email)) and estado='pendiente';
  insert into public.empresa_invitaciones(empresa_id,email,cargo,token_hash,creada_por) values(empresa,lower(btrim(p_email)),btrim(p_cargo),encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid()) returning * into invitacion;
  perform diime_private.empresa_registrar_actividad(empresa,'Invitación creada','invitacion',invitacion.id,jsonb_build_object('email',invitacion.email,'cargo',invitacion.cargo));
  return jsonb_build_object('id',invitacion.id,'token',token,'expira_at',invitacion.expira_at);
end;
$$;
create or replace function diime_private.empresa_consultar_invitacion(p_token text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('empresa_id',e.id,'empresa_nombre',e.nombre,'cargo',i.cargo,'estado',case when i.estado='pendiente' and i.expira_at<=now() then 'caducada' else i.estado end,'expira_at',i.expira_at,'coincide_email',exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=i.email))
  from public.empresa_invitaciones i join public.empresas e on e.id=i.empresa_id where i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and auth.uid() is not null;
$$;
create or replace function diime_private.empresa_aceptar_invitacion(p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.empresa_invitaciones; actor uuid:=auth.uid(); empresa uuid; perfil public.profiles;
begin
  if actor is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  select empresa_id into empresa from public.empresa_invitaciones where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if empresa is null then raise exception 'Invitación no válida' using errcode='22023'; end if;
  perform 1 from public.empresas e join public.profiles titular on titular.id=e.propietario_id where e.id=empresa and titular.cuenta_eliminada is null for update of e;
  if not found then raise exception 'La empresa ya no está disponible' using errcode='42501'; end if;
  select * into i from public.empresa_invitaciones where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if i.estado<>'pendiente' or i.expira_at<=now() then raise exception 'La invitación ha caducado o ya se ha utilizado' using errcode='55000'; end if;
  if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null and lower(email)=i.email) then raise exception 'Inicia sesión con el correo verificado al que se dirigió la invitación' using errcode='42501'; end if;
  select * into perfil from public.profiles where id=actor and cuenta_eliminada is null for update;
  if perfil.id is null or not exists(select 1 from public.profesionales where id=actor) then raise exception 'Completa tu perfil profesional antes de unirte al equipo' using errcode='55000'; end if;
  if exists(select 1 from public.empresa_miembros where usuario_id=actor and estado='activo') or perfil.empresa_id is not null then raise exception 'Ya perteneces a una empresa' using errcode='42501'; end if;
  insert into public.empresa_miembros(empresa_id,usuario_id,cargo,origen) values(empresa,actor,i.cargo,'invitacion') on conflict(empresa_id,usuario_id) do update set cargo=excluded.cargo,estado='activo',origen='invitacion',revocado_at=null,updated_at=now();
  -- Ser miembro no cambia la identidad fiscal ni Connect ni la verificación
  -- personal del profesional; profiles.empresa_id queda como legado del titular.
  update public.empresa_invitaciones set estado='aceptada',aceptada_por=actor,aceptada_at=now() where id=i.id;
  perform diime_private.empresa_registrar_actividad(empresa,'Invitación aceptada','miembro',actor,jsonb_build_object('cargo',i.cargo,'invitacion_id',i.id));
  return empresa;
end;
$$;
create or replace function diime_private.empresa_revocar_invitacion(p_invitacion_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_titular_actual();
begin
  update public.empresa_invitaciones set estado='revocada',revocada_at=now() where id=p_invitacion_id and empresa_id=empresa and estado='pendiente';
  if not found then raise exception 'La invitación no está pendiente o no pertenece a tu empresa' using errcode='42501'; end if;
  perform diime_private.empresa_registrar_actividad(empresa,'Invitación revocada','invitacion',p_invitacion_id,'{}');
end;
$$;
create or replace function diime_private.empresa_actualizar_miembro(p_usuario_id uuid,p_cargo text,p_revocar boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_titular_actual();
begin
  if p_revocar and p_usuario_id=auth.uid() then raise exception 'El titular no puede darse de baja de su propia empresa' using errcode='42501'; end if;
  if not p_revocar and nullif(btrim(p_cargo),'') is null then raise exception 'Indica el cargo del profesional' using errcode='22023'; end if;
  update public.empresa_miembros set cargo=case when p_revocar then cargo else btrim(p_cargo) end,estado=case when p_revocar then 'revocado' else 'activo' end,revocado_at=case when p_revocar then now() else null end,updated_at=now() where empresa_id=empresa and usuario_id=p_usuario_id and estado='activo';
  if not found then raise exception 'El profesional no pertenece al equipo activo' using errcode='42501'; end if;
  update public.profiles set empresa_id=case when p_revocar then null else empresa end,cargo_empresa=case when p_revocar then null else btrim(p_cargo) end where id=p_usuario_id and empresa_id=empresa;
  perform diime_private.empresa_registrar_actividad(empresa,case when p_revocar then 'Profesional dado de baja' else 'Cargo actualizado' end,'miembro',p_usuario_id,jsonb_build_object('cargo',p_cargo));
end;
$$;
create or replace function diime_private.empresa_editar_perfil(p_nombre text,p_descripcion text,p_ubicacion text,p_sitio_web text,p_logo text,p_servicios text[])
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_titular_actual();
begin
  if nullif(btrim(p_nombre),'') is null or length(p_nombre)>160 or length(p_descripcion)>6000 or length(p_ubicacion)>200 or cardinality(p_servicios)>30 then raise exception 'Revisa el nombre, descripción y servicios de la empresa' using errcode='22023'; end if;
  if nullif(btrim(p_sitio_web),'') is not null and p_sitio_web !~ '^https?://' then raise exception 'La web debe comenzar por https:// o http://' using errcode='22023'; end if;
  if nullif(btrim(p_logo),'') is not null and p_logo !~ '^https://' then raise exception 'El logo debe ser una imagen alojada mediante https://' using errcode='22023'; end if;
  update public.empresas set nombre=btrim(p_nombre),descripcion=nullif(btrim(p_descripcion),''),ubicacion=nullif(btrim(p_ubicacion),''),sitio_web=nullif(btrim(p_sitio_web),''),logo=nullif(btrim(p_logo),''),servicios=coalesce(p_servicios,'{}'),updated_at=now() where id=empresa;
  perform diime_private.empresa_registrar_actividad(empresa,'Perfil actualizado','empresa',empresa,'{}');
end;
$$;

alter table public.solicitudes add column empresa_id uuid references public.empresas(id), add column actor_usuario_id uuid;
alter table public.ofertas add column empresa_id uuid references public.empresas(id), add column actor_usuario_id uuid;
alter table public.trabajos add column empresa_cliente_id uuid references public.empresas(id), add column empresa_proveedora_id uuid references public.empresas(id), add column actor_contratacion_id uuid, add column proveedor_cobros_usuario_id uuid, add column proveedor_stripe_account_id text;
create index solicitudes_empresa_idx on public.solicitudes(empresa_id) where empresa_id is not null;
create index ofertas_empresa_idx on public.ofertas(empresa_id) where empresa_id is not null;
create index trabajos_empresa_cliente_idx on public.trabajos(empresa_cliente_id) where empresa_cliente_id is not null;
create index trabajos_empresa_proveedora_idx on public.trabajos(empresa_proveedora_id) where empresa_proveedora_id is not null;

create or replace function diime_private.empresa_sellar_operacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); empresa uuid; demanda public.solicitudes; oferta public.ofertas; fila jsonb; previo jsonb; proveedor uuid;
begin
  if tg_op='DELETE' then fila:=to_jsonb(old); else fila:=to_jsonb(new); end if;
  if tg_table_name in ('solicitudes','ofertas') then
    empresa:=(fila->>'empresa_id')::uuid;
    if tg_op='INSERT' then
      if actor is null and empresa is not null then raise exception 'La operación empresarial requiere una sesión personal' using errcode='42501'; end if;
      if actor is not null and actor is distinct from (fila->>case when tg_table_name='ofertas' then 'profesional_id' else 'cliente_id' end)::uuid then raise exception 'La operación debe conservar al profesional que la realiza' using errcode='42501'; end if;
      new.actor_usuario_id:=actor;
      if empresa is not null then
        -- El lock de miembro serializa una baja con cualquier operación nueva.
        perform 1 from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id where m.empresa_id=empresa and m.usuario_id=actor and m.estado='activo' and p.cuenta_eliminada is null and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id) for share of m;
        if not found then raise exception 'Ya no perteneces al equipo activo de esta empresa' using errcode='42501'; end if;
      end if;
      if tg_table_name='ofertas' then
        select * into demanda from public.solicitudes where id=new.solicitud_id;
        if empresa is not null and (empresa=demanda.empresa_id or diime_private.es_miembro_empresa(empresa,demanda.cliente_id))
          or demanda.empresa_id is not null and diime_private.es_miembro_empresa(demanda.empresa_id,actor) then
          raise exception 'No puedes pujar por una solicitud de tu propia empresa' using errcode='42501'; end if;
      end if;
    else
      if tg_table_name='ofertas' and actor is not null then
        select * into demanda from public.solicitudes where id=(fila->>'solicitud_id')::uuid;
        if demanda.cliente_id=actor and demanda.empresa_id is not null and not diime_private.es_miembro_empresa(demanda.empresa_id,actor) then raise exception 'La baja de la empresa impide gestionar sus ofertas recibidas' using errcode='42501'; end if;
      end if;
      if tg_op='UPDATE' and (new.empresa_id is distinct from old.empresa_id or new.actor_usuario_id is distinct from old.actor_usuario_id) then raise exception 'La identidad y autoría de la operación son inmutables' using errcode='42501'; end if;
      if empresa is not null and actor is not null and actor=(fila->>case when tg_table_name='ofertas' then 'profesional_id' else 'cliente_id' end)::uuid and not diime_private.es_miembro_empresa(empresa,actor) then raise exception 'La baja de la empresa impide operar en su nombre' using errcode='42501'; end if;
    end if;
  else
    if tg_op='INSERT' then
      select * into demanda from public.solicitudes where id=new.solicitud_id;
      select * into oferta from public.ofertas where id=new.oferta_id;
      new.empresa_cliente_id:=demanda.empresa_id; new.empresa_proveedora_id:=oferta.empresa_id; new.actor_contratacion_id:=actor;
      if demanda.empresa_id is not null then
        perform 1 from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id where m.empresa_id=demanda.empresa_id and m.usuario_id=actor and m.estado='activo' and p.cuenta_eliminada is null and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id) for share of m;
        if not found then raise exception 'No puedes contratar en nombre de esta empresa' using errcode='42501'; end if;
      end if;
      if oferta.empresa_id is not null then
        perform 1 from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id where m.empresa_id=oferta.empresa_id and m.usuario_id=oferta.profesional_id and m.estado='activo' and p.cuenta_eliminada is null and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id) for share of m;
        if not found then raise exception 'El autor de la oferta ya no pertenece a la empresa; solicita una nueva oferta' using errcode='42501'; end if;
        select propietario_id into proveedor from public.empresas where id=oferta.empresa_id;
        if oferta.empresa_id=demanda.empresa_id or diime_private.es_miembro_empresa(oferta.empresa_id,actor) then raise exception 'La empresa no puede contratarse a sí misma' using errcode='42501'; end if;
      else proveedor:=new.profesional_id; end if;
      new.proveedor_cobros_usuario_id:=proveedor;
      select stripe_account_id into new.proveedor_stripe_account_id from public.profesionales where id=proveedor;
    elsif tg_op='UPDATE' then
      if new.empresa_cliente_id is distinct from old.empresa_cliente_id or new.empresa_proveedora_id is distinct from old.empresa_proveedora_id or new.actor_contratacion_id is distinct from old.actor_contratacion_id or new.proveedor_cobros_usuario_id is distinct from old.proveedor_cobros_usuario_id then raise exception 'La identidad y autoría del contrato son inmutables' using errcode='42501'; end if;
      if new.proveedor_stripe_account_id is distinct from old.proveedor_stripe_account_id and not (old.proveedor_stripe_account_id is null and actor is null and current_setting('role',true) in ('service_role','none') and old.estado='pendiente_pago') then raise exception 'El destino de cobro del contrato es inmutable' using errcode='42501'; end if;
    end if;
    if tg_op<>'INSERT' and actor is not null then
      if actor=(fila->>'cliente_id')::uuid and (fila->>'empresa_cliente_id') is not null and not diime_private.es_miembro_empresa((fila->>'empresa_cliente_id')::uuid,actor)
        or actor=(fila->>'profesional_id')::uuid and (fila->>'empresa_proveedora_id') is not null and not diime_private.es_miembro_empresa((fila->>'empresa_proveedora_id')::uuid,actor) then raise exception 'La baja de la empresa impide operar en su nombre' using errcode='42501'; end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function diime_private.empresa_sellar_operacion() from public,anon,authenticated;
create trigger empresa_sellar_operacion before insert or update or delete on public.solicitudes for each row execute function diime_private.empresa_sellar_operacion();
create trigger empresa_sellar_operacion before insert or update or delete on public.ofertas for each row execute function diime_private.empresa_sellar_operacion();
create trigger empresa_sellar_operacion before insert or update or delete on public.trabajos for each row execute function diime_private.empresa_sellar_operacion();

create or replace function diime_private.empresa_auditar_operacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare fila jsonb; anterior jsonb; empresa uuid; accion text; cambios jsonb;
begin
  if tg_op='DELETE' then fila:=to_jsonb(old); else fila:=to_jsonb(new); end if;
  if tg_op='UPDATE' then
    anterior:=to_jsonb(old);
    select coalesce(jsonb_object_agg(key,jsonb_build_object('antes',anterior->key,'despues',value)),'{}') into cambios from jsonb_each(fila) where key not in ('id','updated_at','created_at','empresa_id','empresa_cliente_id','empresa_proveedora_id','actor_usuario_id','actor_contratacion_id','proveedor_cobros_usuario_id','proveedor_stripe_account_id','notas_privadas_proveedor') and value is distinct from anterior->key;
    if cambios='{}' then return new; end if;
  else cambios:=jsonb_build_object('titulo',fila->>'titulo','estado',fila->>'estado','precio',coalesce(fila->'precio',fila->'precio_acordado')); end if;
  cambios:=cambios||jsonb_build_object('titulo_objeto',coalesce(fila->>'titulo',(select titulo from public.solicitudes where id=(fila->>'solicitud_id')::uuid)),'solicitud_id',fila->>'solicitud_id');
  accion:=case tg_table_name when 'ofertas' then 'Oferta' when 'solicitudes' then 'Solicitud' else 'Contrato' end||case tg_op when 'INSERT' then ' cread' when 'DELETE' then ' eliminad' else ' actualizad' end||case when tg_table_name='trabajos' then 'o' else 'a' end;
  for empresa in select distinct x from unnest(case when tg_table_name='trabajos' then array[(fila->>'empresa_cliente_id')::uuid,(fila->>'empresa_proveedora_id')::uuid] else array[(fila->>'empresa_id')::uuid] end) x where x is not null loop
    perform diime_private.empresa_registrar_actividad(empresa,accion,tg_table_name,(fila->>'id')::uuid,cambios);
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function diime_private.empresa_auditar_operacion() from public,anon,authenticated;
create trigger empresa_auditar_operacion after insert or update or delete on public.solicitudes for each row execute function diime_private.empresa_auditar_operacion();
create trigger empresa_auditar_operacion after insert or update or delete on public.ofertas for each row execute function diime_private.empresa_auditar_operacion();
create trigger empresa_auditar_operacion after insert or update or delete on public.trabajos for each row execute function diime_private.empresa_auditar_operacion();

-- Proyección pública con lista explícita de campos; jamás to_jsonb(profiles).
create or replace function diime_private.empresa_perfil_publico(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'empresa',jsonb_build_object('id',e.id,'nombre',e.nombre,'descripcion',e.descripcion,'ubicacion',e.ubicacion,'sitio_web',e.sitio_web,'logo',e.logo,'verificada',coalesce(e.verificada,false),'servicios',e.servicios,'created_at',e.created_at,'contacto_usuario_id',e.propietario_id),
 'miembros',coalesce((select jsonb_agg(jsonb_build_object('usuario_id',p.id,'nombre',p.nombre,'apellido',p.apellido,'foto_perfil',p.foto_perfil,'cargo',m.cargo,'bio',p.bio,'titulo',pr.titulo,'habilidades',coalesce(pr.habilidades,'[]'),'verificado',coalesce(p.verificado,false)) order by (p.id=e.propietario_id) desc,m.created_at) from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id left join public.profesionales pr on pr.id=p.id where m.empresa_id=e.id and m.estado='activo' and p.cuenta_eliminada is null),'[]'),
 'portfolio',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'trabajo_id',p.trabajo_id,'titulo',p.titulo,'descripcion',p.descripcion,'categoria',p.categoria,'ubicacion',p.ubicacion,'rango_precio',case when p.presupuesto is null or p.presupuesto<=0 then null when p.presupuesto<100 then 'Menos de 100 €' when p.presupuesto<250 then '100–250 €' when p.presupuesto<500 then '250–500 €' when p.presupuesto<1000 then '500–1.000 €' when p.presupuesto<2500 then '1.000–2.500 €' when p.presupuesto<5000 then '2.500–5.000 €' when p.presupuesto<10000 then '5.000–10.000 €' when p.presupuesto<25000 then '10.000–25.000 €' when p.presupuesto<50000 then '25.000–50.000 €' when p.presupuesto<100000 then '50.000–100.000 €' else 'Más de 100.000 €' end,'fecha_proyecto',p.fecha_proyecto,'imagen',p.imagenes[1],'participantes_ids',array[p.profesional_id]) order by p.created_at desc) from public.portfolio p join public.trabajos t on t.id=p.trabajo_id where t.empresa_proveedora_id=e.id and p.visible),'[]'),
 'resenas',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'trabajo_id',r.trabajo_id,'autor',coalesce(a.nombre,'Cliente'),'rating',r.rating,'comentario',r.comentario,'created_at',r.created_at) order by r.created_at desc) from public."reseñas" r join public.trabajos t on t.id=r.trabajo_id left join public.profiles a on a.id=r.autor_id where t.empresa_proveedora_id=e.id and r.profesional_id=t.profesional_id),'[]')
) from public.empresas e join public.profiles titular on titular.id=e.propietario_id where e.id=p_empresa_id and titular.cuenta_eliminada is null;
$$;
create or replace function diime_private.empresas_publicas()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'nombre',e.nombre,'descripcion',e.descripcion,'ubicacion',e.ubicacion,'sitio_web',e.sitio_web,'logo',e.logo,'verificada',coalesce(e.verificada,false),'servicios',e.servicios,'created_at',e.created_at,'rating_promedio',coalesce((select round(avg(r.rating),2) from public."reseñas" r join public.trabajos t on t.id=r.trabajo_id where t.empresa_proveedora_id=e.id and r.profesional_id=t.profesional_id),0),'total_resenas',(select count(*) from public."reseñas" r join public.trabajos t on t.id=r.trabajo_id where t.empresa_proveedora_id=e.id and r.profesional_id=t.profesional_id),'miembros_count',(select count(*) from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id where m.empresa_id=e.id and m.estado='activo' and p.cuenta_eliminada is null)) order by e.nombre),'[]') from public.empresas e join public.profiles p on p.id=e.propietario_id where p.cuenta_eliminada is null;
$$;
create or replace function diime_private.empresa_identidades_publicas(p_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'logo',logo)),'[]') from public.empresas where id=any(p_ids[1:200]);
$$;
create or replace function diime_private.empresa_afiliacion_publica(p_usuario_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('empresa_id',m.empresa_id,'cargo',m.cargo) from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id where m.usuario_id=p_usuario_id and m.estado='activo' and p.cuenta_eliminada is null and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id);
$$;
create or replace function diime_private.empresa_workspace()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.empresas; base jsonb; titular boolean;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  select empresas.* into e from public.empresas empresas join public.empresa_miembros m on m.empresa_id=empresas.id join public.profiles p on p.id=m.usuario_id where m.usuario_id=auth.uid() and m.estado='activo' and p.cuenta_eliminada is null and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id);
  if e.id is null then return null; end if;
  titular:=e.propietario_id=auth.uid(); base:=diime_private.empresa_perfil_publico(e.id);
  return jsonb_build_object('empresa',(base->'empresa')||jsonb_build_object('propietario_id',e.propietario_id,'cif',case when titular then e.cif else null end,'telefono',e.telefono,'email',case when titular then e.email else null end),'usuario_id',auth.uid(),'es_titular',titular,
    'miembros',coalesce((select jsonb_agg(jsonb_build_object('usuario_id',p.id,'nombre',p.nombre,'apellido',p.apellido,'foto_perfil',p.foto_perfil,'cargo',m.cargo,'bio',p.bio,'titulo',pr.titulo,'habilidades',coalesce(pr.habilidades,'[]'),'verificado',coalesce(p.verificado,false),'estado',m.estado,'es_titular',p.id=e.propietario_id) order by (p.id=e.propietario_id) desc,m.created_at) from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id left join public.profesionales pr on pr.id=p.id where m.empresa_id=e.id and (titular or m.estado='activo')),'[]'),
    'invitaciones',case when titular then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'cargo',i.cargo,'estado',case when i.estado='pendiente' and i.expira_at<=now() then 'caducada' else i.estado end,'created_at',i.created_at,'expira_at',i.expira_at) order by i.created_at desc) from public.empresa_invitaciones i where i.empresa_id=e.id),'[]') else '[]'::jsonb end,
    'actividad',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select id,actor_usuario_id,actor_nombre,accion,entidad_tipo,entidad_id,detalle,created_at from public.empresa_actividad where empresa_id=e.id and (titular or actor_usuario_id=auth.uid()) order by created_at desc limit 100) a),'[]'));
end;
$$;

-- Endpoints invoker; los definers se mantienen fuera de los esquemas expuestos.
do $$
declare f record; args text; llamada text;
begin
  for f in select p.proname,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_arguments(p.oid) args,pg_get_function_result(p.oid) resultado,p.proargnames
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='diime_private' and p.proname in ('empresa_contexto_actual','empresa_crear_invitacion','empresa_consultar_invitacion','empresa_aceptar_invitacion','empresa_revocar_invitacion','empresa_actualizar_miembro','empresa_editar_perfil','empresa_perfil_publico','empresas_publicas','empresa_identidades_publicas','empresa_afiliacion_publica','empresa_workspace')
  loop
    llamada:=coalesce(array_to_string(f.proargnames,','),'');
    execute format('create or replace function public.%I(%s) returns %s language sql security invoker set search_path = '''' as $api$ select diime_private.%I(%s); $api$',f.proname,f.args,f.resultado,f.proname,llamada);
    execute format('revoke all on function public.%I(%s),diime_private.%I(%s) from public,anon,authenticated',f.proname,f.identity_args,f.proname,f.identity_args);
    execute format('grant execute on function public.%I(%s),diime_private.%I(%s) to authenticated',f.proname,f.identity_args,f.proname,f.identity_args);
    if f.proname in ('empresa_perfil_publico','empresas_publicas','empresa_identidades_publicas','empresa_afiliacion_publica') then
      execute format('grant execute on function public.%I(%s),diime_private.%I(%s) to anon',f.proname,f.identity_args,f.proname,f.identity_args);
    end if;
  end loop;
end;
$$;

-- RLS restrictiva cierra políticas históricas permisivas tras una baja. Las
-- operaciones personales antiguas no dependen de la afiliación actual.
create policy empresa_solicitudes_mutar on public.solicitudes as restrictive for update to authenticated using(empresa_id is null or diime_private.es_miembro_empresa(empresa_id,auth.uid())) with check(empresa_id is null or diime_private.es_miembro_empresa(empresa_id,auth.uid()));
create policy empresa_solicitudes_borrar on public.solicitudes as restrictive for delete to authenticated using(empresa_id is null or diime_private.es_miembro_empresa(empresa_id,auth.uid()));
create policy empresa_ofertas_mutar on public.ofertas as restrictive for update to authenticated using(profesional_id<>auth.uid() or empresa_id is null or diime_private.es_miembro_empresa(empresa_id,auth.uid())) with check(profesional_id<>auth.uid() or empresa_id is null or diime_private.es_miembro_empresa(empresa_id,auth.uid()));
create policy empresa_ofertas_borrar on public.ofertas as restrictive for delete to authenticated using(empresa_id is null or diime_private.es_miembro_empresa(empresa_id,auth.uid()));
create policy empresa_trabajos_mutar on public.trabajos as restrictive for update to authenticated using((cliente_id<>auth.uid() or empresa_cliente_id is null or diime_private.es_miembro_empresa(empresa_cliente_id,auth.uid())) and (profesional_id<>auth.uid() or empresa_proveedora_id is null or diime_private.es_miembro_empresa(empresa_proveedora_id,auth.uid()))) with check((cliente_id<>auth.uid() or empresa_cliente_id is null or diime_private.es_miembro_empresa(empresa_cliente_id,auth.uid())) and (profesional_id<>auth.uid() or empresa_proveedora_id is null or diime_private.es_miembro_empresa(empresa_proveedora_id,auth.uid())));

-- RPC financieras internas reciben el actor del servidor: se valida de nuevo
-- bajo bloqueo de membresía, y la auditoría conserva al humano responsable.
create or replace function diime_private.validar_actor_trabajo_empresa(p_trabajo uuid,p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare t public.trabajos; empresa uuid;
begin
  select * into t from public.trabajos where id=p_trabajo;
  if p_actor is null or (p_actor is distinct from t.cliente_id and p_actor is distinct from t.profesional_id) then raise exception 'No tienes permiso sobre este trabajo' using errcode='42501'; end if;
  empresa:=case when p_actor=t.cliente_id then t.empresa_cliente_id else t.empresa_proveedora_id end;
  if empresa is not null then
    perform 1 from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id where m.empresa_id=empresa and m.usuario_id=p_actor and m.estado='activo' and p.cuenta_eliminada is null and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id) for share of m;
    if not found then raise exception 'La baja de la empresa impide operar en su nombre' using errcode='42501'; end if;
  end if;
  perform set_config('diime.actor_usuario_id',p_actor::text,true);
end;
$$;
revoke all on function diime_private.validar_actor_trabajo_empresa(uuid,uuid) from public,anon,authenticated;
grant execute on function diime_private.validar_actor_trabajo_empresa(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.diime_abrir_disputa(p_trabajo uuid, p_actor uuid, p_motivo text, p_rechazo_cancelacion boolean DEFAULT false, p_adjuntos text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare t public.trabajos%rowtype; e public.transacciones_escrow%rowtype; d public.disputas%rowtype; autor uuid;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo;
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);
  if p_actor is null or p_actor not in(t.cliente_id,t.profesional_id) or nullif(trim(p_motivo),'') is null then raise exception 'Sin permiso o motivo'; end if;
  if t.cancelacion_aceptada_por is not null then raise exception 'La cancelación ya está aceptada'; end if;
  if exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision')) then raise exception 'Ya existe una disputa abierta'; end if;
  if t.estado not in('pendiente_pago','en_progreso','entregado') then raise exception 'El trabajo ya no admite disputas'; end if;
  autor := p_actor;
  if p_rechazo_cancelacion then
    if t.cancelacion_estado is distinct from 'pendiente' or t.cancelacion_solicitada_por=p_actor then raise exception 'La cancelación ya no está pendiente'; end if;
    autor := t.cancelacion_solicitada_por;
  elsif t.estado='pendiente_pago' and not coalesce(t.cancelacion_estado='rechazada' and t.cancelacion_solicitada_por=p_actor,false) then
    raise exception 'Sin pago, solicita primero una cancelación';
  end if;
  if exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and estado in('pendiente','liquidando','pago_tardio')) then
    raise exception 'Hay un pago pendiente de conciliar o una liquidación en curso'; end if;
  if (select count(*) from public.transacciones_escrow where trabajo_id=t.id and estado in('retenido','fondos_retenidos'))>1 then raise exception 'Hay pagos históricos duplicados que requieren conciliación'; end if;
  select * into e from public.transacciones_escrow where trabajo_id=t.id
    and estado in('retenido','fondos_retenidos') for update;
  if e.id is not null and (e.stripe_payment_intent_id is null or e.liquidacion_operacion_id is not null or e.stripe_disputa_id is not null) then
    raise exception 'El pago ya tiene una operación en curso'; end if;
  if e.id is null and t.estado<>'pendiente_pago' then raise exception 'No se encontró el pago cobrado; requiere conciliación'; end if;
  insert into public.disputas(trabajo_id,cliente_id,profesional_id,tipo,motivo,estado,estado_trabajo_previo,estado_escrow_previo,escrow_id,origen)
    values(t.id,t.cliente_id,t.profesional_id,case when autor=t.cliente_id then 'cliente' else 'proveedor' end,
      case when p_rechazo_cancelacion then 'Cancelación solicitada y rechazada. Motivo original: '||coalesce(t.cancelacion_razon,'')||'. Oposición: '||p_motivo else p_motivo end,
      'abierta',t.estado,e.estado,e.id,'usuario') returning * into d;
  if e.id is not null then update public.transacciones_escrow set estado='disputa' where id=e.id; end if;
  update public.trabajos set estado='en_disputa',pago_bloqueado=true,
    cancelacion_estado=case when p_rechazo_cancelacion then 'rechazada' else cancelacion_estado end,
    cancelacion_respuesta_razon=case when p_rechazo_cancelacion then p_motivo else cancelacion_respuesta_razon end,
    cancelacion_adjuntos_respuesta=case when p_rechazo_cancelacion then p_adjuntos else cancelacion_adjuntos_respuesta end,
    updated_at=now() where id=t.id;
  insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
    select id,'disputa_abierta_admin','Nueva disputa para revisar', 'Revisa la disputa de "'||coalesce(t.titulo,'el trabajo')||'".',concat('/admin/disputas?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','disputa_abierta_admin','&disputa=',d.id),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo,'disputa_id',d.id))
    from public.profiles where es_admin=true;
  return to_jsonb(d);
end; $function$;

CREATE OR REPLACE FUNCTION public.diime_bloquear_checkout(p_trabajo uuid, p_actor uuid, p_cancelacion boolean DEFAULT false, p_rechazo_cancelacion boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare t public.trabajos%rowtype;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo;
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);
  if p_actor is null or p_actor not in (t.cliente_id,t.profesional_id) then raise exception 'Sin permiso'; end if;
  if p_cancelacion then
    if t.cancelacion_aceptada_por=p_actor then return to_jsonb(t); end if;
    if t.estado not in ('pendiente_pago','en_progreso') or t.cancelacion_estado is distinct from 'pendiente'
      or t.cancelacion_solicitada_por=p_actor then raise exception 'La cancelación ya no admite esta respuesta'; end if;
    update public.trabajos set pago_bloqueado=true,cancelacion_aceptada_por=p_actor where id=p_trabajo returning * into t;
  else
    if t.estado not in ('pendiente_pago','en_progreso','entregado') or t.cancelacion_aceptada_por is not null then
      raise exception 'El trabajo ya no admite abrir una disputa'; end if;
    if p_rechazo_cancelacion then
      if t.cancelacion_estado is distinct from 'pendiente' or t.cancelacion_solicitada_por=p_actor then raise exception 'La cancelación ya no admite rechazo'; end if;
    elsif t.estado='pendiente_pago' and not coalesce(t.cancelacion_estado='rechazada' and t.cancelacion_solicitada_por=p_actor,false) then
      raise exception 'Sin pago, solicita primero una cancelación';
    end if;
    update public.trabajos set pago_bloqueado=true where id=p_trabajo returning * into t;
  end if;
  return to_jsonb(t);
end; $function$;

CREATE OR REPLACE FUNCTION public.diime_cerrar_cancelacion(p_trabajo uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare t public.trabajos%rowtype;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo;
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);
  if p_actor is null or t.cancelacion_aceptada_por is distinct from p_actor then raise exception 'Cancelación no aceptada'; end if;
  if t.estado='cancelado' then return jsonb_build_object('ok',true,'nuevo_cierre',false); end if;
  if t.estado not in('pendiente_pago','en_progreso') then raise exception 'El trabajo ya cambió de estado'; end if;
  if exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and estado not in('cancelado','reembolsado')) then raise exception 'Queda un pago por conciliar'; end if;
  update public.trabajos set estado='cancelado',cancelacion_estado=null,pago_bloqueado=true,
    cancelacion_respuesta_razon=null,cancelacion_adjuntos_respuesta='{}',fecha_fin=now(),updated_at=now() where id=t.id;
  update public.solicitudes set estado='abierta' where id=t.solicitud_id;
  update public.ofertas set estado='retirada' where id=t.oferta_id;
  -- Other rejected offers retain their history. A new bid explicitly accepts
  -- the current terms and commission; manual rejections are never resurrected.
  return jsonb_build_object('ok',true,'nuevo_cierre',true);
end; $function$;

CREATE OR REPLACE FUNCTION public.diime_confirmar_pago(p_escrow uuid, p_session text, p_payment_intent text, p_charge text, p_total numeric, p_moneda text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; tardio boolean; cambio boolean := false; aviso jsonb; avisos jsonb := '[]';
begin
  select * into e from public.transacciones_escrow where id=p_escrow;
  if not found then raise exception 'Pago preparado no encontrado'; end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into e from public.transacciones_escrow where id=p_escrow for update;
  select * into t from public.trabajos where id=e.trabajo_id;
  if p_moneda is distinct from 'eur' or p_total is distinct from round(e.monto*100)
    or nullif(p_payment_intent,'') is null or nullif(p_charge,'') is null
    or (e.stripe_session_id is not null and e.stripe_session_id<>p_session)
    or (e.stripe_payment_intent_id is not null and e.stripe_payment_intent_id<>p_payment_intent) then
    raise exception 'Stripe no coincide con el pago preparado';
  end if;
  if e.estado not in ('pendiente','cancelado') then
    return jsonb_build_object('escrow',to_jsonb(e),'activado',false,'tardio',e.estado='pago_tardio' or coalesce(e.liquidacion_contexto->>'tipo'='pago_tardio',false),'avisos',avisos);
  end if;
  -- Una baja concurrente se ordena antes o después de esta confirmación.
  perform 1 from public.empresa_miembros m where
    (m.empresa_id=t.empresa_cliente_id and m.usuario_id=t.cliente_id) or
    (m.empresa_id=t.empresa_proveedora_id and m.usuario_id=t.profesional_id)
    order by m.empresa_id,m.usuario_id for share of m;
  tardio := t.estado<>'pendiente_pago' or e.estado='cancelado' or t.cancelacion_aceptada_por is not null
    or (t.empresa_cliente_id is not null and not diime_private.es_miembro_empresa(t.empresa_cliente_id,t.cliente_id))
    or (t.empresa_proveedora_id is not null and not diime_private.es_miembro_empresa(t.empresa_proveedora_id,t.profesional_id));
  -- A payment racing with an accepted cancellation is retained solely for the
  -- full refund; the contract never changes to in-progress in this branch.
  update public.transacciones_escrow set
    estado=case when tardio then 'pago_tardio' else 'fondos_retenidos' end,
    stripe_session_id=p_session,stripe_payment_intent_id=p_payment_intent,stripe_charge_id=p_charge,
    fecha_retencion=coalesce(fecha_retencion,now()),
    notas=case when tardio then 'Pago tardío: devolver íntegramente sin reactivar el servicio.' else notas end
  where id=e.id returning * into e;
  if not tardio and t.cancelacion_aceptada_por is null then
    update public.trabajos set estado='en_progreso',fecha_inicio=coalesce(fecha_inicio,now()),updated_at=now() where id=t.id;
    update public.solicitudes set estado='en_progreso' where id=t.solicitud_id;
    cambio := true;
    insert into public.actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje,progreso)
      values(t.id,t.cliente_id,'mensaje','Pago recibido. La transferencia queda pendiente de confirmación o resolución.',0);
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
      values(t.profesional_id,'pago_recibido','El cliente ha pagado: puedes empezar',
      'El pago de "'||coalesce(t.titulo,'el trabajo')||'" está confirmado. La transferencia queda pendiente de confirmación o resolución.',concat('/mis-trabajos?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','pago_recibido'),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo))) returning to_jsonb(notificaciones) into aviso;
    avisos := avisos || jsonb_build_array(aviso);
  end if;
  return jsonb_build_object('escrow',to_jsonb(e),'activado',cambio,'tardio',tardio,'avisos',avisos);
end; $function$;

CREATE OR REPLACE FUNCTION public.diime_retirar_disputa(p_disputa uuid, p_actor uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare d public.disputas%rowtype; e public.transacciones_escrow%rowtype;
begin
  select * into d from public.disputas where id=p_disputa;
  if not found then return 'no_encontrada'; end if;
  perform public.diime_bloquear_trabajo_financiero(d.trabajo_id);
  select * into d from public.disputas where id=p_disputa for update;
  perform diime_private.validar_actor_trabajo_empresa(d.trabajo_id,p_actor);
  if p_actor is null or p_actor<>(case when d.tipo='cliente' then d.cliente_id else d.profesional_id end) then return 'no_autorizado'; end if;
  if d.estado<>'abierta' then return 'no_abierta'; end if;
  if d.origen<>'usuario' or d.stripe_disputa_id is not null then return 'contracargo'; end if;
  if exists(select 1 from public.disputas where trabajo_id=d.trabajo_id and id<>d.id and estado in('abierta','en_revision')) then return 'requiere_conciliacion'; end if;
  select * into e from public.transacciones_escrow where id=d.escrow_id for update;
  if e.liquidacion_operacion_id is not null or e.stripe_disputa_id is not null then return 'liquidacion_iniciada'; end if;
  if d.estado_trabajo_previo is null or (d.escrow_id is null and d.estado_trabajo_previo<>'pendiente_pago') then return 'requiere_conciliacion'; end if;
  if e.id is not null then
    if e.estado<>'disputa' or d.estado_escrow_previo not in('retenido','fondos_retenidos') then return 'requiere_conciliacion'; end if;
    update public.transacciones_escrow set estado=d.estado_escrow_previo where id=e.id;
  end if;
  update public.trabajos set estado=d.estado_trabajo_previo,pago_bloqueado=false,updated_at=now() where id=d.trabajo_id and estado='en_disputa';
  if not found then raise exception 'El trabajo ya cambió de estado'; end if;
  update public.disputas set estado='retirada',updated_at=now() where id=d.id;
  return 'ok';
end; $function$;

-- Mantener explícita la frontera service-only también al restaurar funciones.
revoke all on function public.diime_abrir_disputa(uuid,uuid,text,boolean,text[]),
  public.diime_bloquear_checkout(uuid,uuid,boolean,boolean),
  public.diime_cerrar_cancelacion(uuid,uuid),
  public.diime_confirmar_pago(uuid,text,text,text,numeric,text),
  public.diime_retirar_disputa(uuid,uuid) from public,anon,authenticated;
grant execute on function public.diime_abrir_disputa(uuid,uuid,text,boolean,text[]),
  public.diime_bloquear_checkout(uuid,uuid,boolean,boolean),
  public.diime_cerrar_cancelacion(uuid,uuid),
  public.diime_confirmar_pago(uuid,text,text,text,numeric,text),
  public.diime_retirar_disputa(uuid,uuid) to service_role;

commit;
