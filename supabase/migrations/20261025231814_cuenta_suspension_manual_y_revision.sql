begin;
-- Restrict new business only. Sessions, historical contracts and money stay accessible.
create table public.cuenta_restricciones (
 usuario_id uuid primary key references public.profiles(id), suspendida boolean not null,
 motivo text not null check(length(btrim(motivo)) between 8 and 2000),
 revision integer not null check(revision>0), decidida_por uuid not null references public.profiles(id),
 updated_at timestamptz not null default now()
);
create table public.cuenta_restriccion_historial (
 id uuid primary key default gen_random_uuid(), usuario_id uuid not null references public.profiles(id),
 actor_id uuid not null references public.profiles(id), accion text not null check(accion in ('suspender','levantar','solicitar_revision','mantener_suspension')),
 motivo text not null check(length(btrim(motivo)) between 8 and 2000), revision integer not null,
 incidencia_ids uuid[] not null default '{}', created_at timestamptz not null default now()
);
create index on public.cuenta_restriccion_historial(usuario_id,created_at);
create table public.cuenta_restriccion_revisiones (
 id uuid primary key default gen_random_uuid(), usuario_id uuid not null references public.profiles(id),
 revision integer not null, motivo text not null check(length(btrim(motivo)) between 8 and 2000),
 estado text not null default 'pendiente' check(estado in ('pendiente','resuelta')),
 respuesta text, resuelta_por uuid references public.profiles(id), resuelta_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index cuenta_revision_pendiente on public.cuenta_restriccion_revisiones(usuario_id) where estado='pendiente';
create function diime_private.cuenta_moderacion_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sesion text:=auth.jwt()->>'session_id';
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and cuenta_eliminada is null)
    or sesion is null or not exists(select 1 from auth.sessions where id::text=sesion and user_id=actor and (not_after is null or not_after>now())) then
  raise exception 'No autenticado: la sesión ha caducado' using errcode='42501';
 end if;
 return actor;
end; $$;
revoke all on function diime_private.cuenta_moderacion_actor() from public,anon,authenticated,service_role;
create function diime_private.cuenta_moderacion_visible(p_usuario uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid;
begin
 actor:=diime_private.cuenta_moderacion_actor();
 return actor=p_usuario or exists(select 1 from public.profiles where id=actor and es_admin=true);
exception when insufficient_privilege then return false;
end; $$;
revoke all on function diime_private.cuenta_moderacion_visible(uuid) from public,anon,service_role;
grant execute on function diime_private.cuenta_moderacion_visible(uuid) to authenticated;
alter table public.cuenta_restricciones enable row level security;
alter table public.cuenta_restriccion_historial enable row level security;
alter table public.cuenta_restriccion_revisiones enable row level security;
revoke all on public.cuenta_restricciones,public.cuenta_restriccion_historial,public.cuenta_restriccion_revisiones from public,anon,authenticated;
grant select on public.cuenta_restricciones,public.cuenta_restriccion_historial,public.cuenta_restriccion_revisiones to authenticated;
grant select on public.cuenta_restricciones,public.cuenta_restriccion_historial,public.cuenta_restriccion_revisiones to service_role;
create policy cuenta_restriccion_lectura on public.cuenta_restricciones for select to authenticated using(diime_private.cuenta_moderacion_visible(usuario_id));
create policy cuenta_historial_lectura on public.cuenta_restriccion_historial for select to authenticated using(diime_private.cuenta_moderacion_visible(usuario_id));
create policy cuenta_revision_lectura on public.cuenta_restriccion_revisiones for select to authenticated using(diime_private.cuenta_moderacion_visible(usuario_id));
create function public.cuenta_restriccion_obtener(p_usuario uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid; admin boolean;
begin
 actor:=diime_private.cuenta_moderacion_actor();
 admin:=exists(select 1 from public.profiles where id=actor and es_admin=true);
 if actor<>p_usuario and not admin then raise exception 'No tienes permiso para consultar esta revisión' using errcode='42501'; end if;
 return jsonb_build_object('estado',(select to_jsonb(r) from public.cuenta_restricciones r where usuario_id=p_usuario),
  'historial',coalesce((select jsonb_agg(to_jsonb(h) order by created_at desc,id) from public.cuenta_restriccion_historial h where usuario_id=p_usuario),'[]'),
  'revisiones',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc,id) from public.cuenta_restriccion_revisiones r where usuario_id=p_usuario),'[]'),
  'incidencias',case when admin then coalesce((select jsonb_agg(to_jsonb(i)) from (select id,asunto,descripcion,estado,trabajo_id,created_at from public.incidencias where usuario_reportado=p_usuario order by created_at desc limit 50)i),'[]') else '[]'::jsonb end);
end; $$;
create function public.cuenta_restriccion_decidir(p_usuario uuid,p_suspender boolean,p_motivo text,p_revision integer,p_solicitud uuid default null,p_incidencias uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; actual public.cuenta_restricciones; pendiente public.cuenta_restriccion_revisiones; nueva integer; accion text;
begin
 actor:=diime_private.cuenta_moderacion_actor();
 if not exists(select 1 from public.profiles where id=actor and es_admin=true) then raise exception 'Solo administración puede decidir una suspensión' using errcode='42501'; end if;
 if p_usuario=actor or not exists(select 1 from public.profiles where id=p_usuario and cuenta_eliminada is null and not coalesce(es_admin,false)) then
  raise exception 'Selecciona una cuenta activa ajena a administración' using errcode='42501'; end if;
 if p_suspender is null or p_motivo is null or length(btrim(p_motivo)) not between 8 and 2000 then raise exception 'Indica un motivo entre 8 y 2000 caracteres' using errcode='22023'; end if;
 perform private.bloquear_cuentas_contratacion(array[p_usuario]);
 select * into actual from public.cuenta_restricciones where usuario_id=p_usuario for update;
 if p_revision is distinct from coalesce(actual.revision,0) then raise exception 'La revisión ha cambiado. Actualiza antes de decidir' using errcode='55000'; end if;
 select * into pendiente from public.cuenta_restriccion_revisiones where usuario_id=p_usuario and estado='pendiente' for update;
 if p_solicitud is distinct from pendiente.id then raise exception 'La solicitud de revisión ha cambiado. Actualiza antes de decidir' using errcode='55000'; end if;
 if p_suspender=coalesce(actual.suspendida,false) and pendiente.id is null then raise exception 'La cuenta ya tiene ese estado' using errcode='55000'; end if;
 if exists(select 1 from unnest(coalesce(p_incidencias,'{}')) as refs(incidencia_id) where not exists(select 1 from public.incidencias i where i.id=refs.incidencia_id and i.usuario_reportado=p_usuario)) then raise exception 'Las incidencias deben corresponder a esta cuenta' using errcode='22023'; end if;
 nueva:=coalesce(actual.revision,0)+1;
 accion:=case when not p_suspender then 'levantar' when actual.suspendida then 'mantener_suspension' else 'suspender' end;
 insert into public.cuenta_restricciones(usuario_id,suspendida,motivo,revision,decidida_por) values(p_usuario,p_suspender,btrim(p_motivo),nueva,actor)
 on conflict(usuario_id) do update set suspendida=excluded.suspendida,motivo=excluded.motivo,revision=excluded.revision,decidida_por=excluded.decidida_por,updated_at=now();
 insert into public.cuenta_restriccion_historial(usuario_id,actor_id,accion,motivo,revision,incidencia_ids) values(p_usuario,actor,accion,btrim(p_motivo),nueva,coalesce(p_incidencias,'{}'));
 if pendiente.id is not null then update public.cuenta_restriccion_revisiones set estado='resuelta',respuesta=btrim(p_motivo),resuelta_por=actor,resuelta_at=now() where id=pendiente.id; end if;
 insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,metadata) values(p_usuario,'cuenta_revision',case when p_suspender then 'Nuevas contrataciones suspendidas' else 'Suspensión levantada' end,btrim(p_motivo),'/mi-cuenta#revision-cuenta',jsonb_build_object('revision',nueva,'suspendida',p_suspender));
 return public.cuenta_restriccion_obtener(p_usuario);
end; $$;
create function public.cuenta_restriccion_solicitar_revision(p_revision integer,p_motivo text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; actual public.cuenta_restricciones; existente public.cuenta_restriccion_revisiones; nueva uuid;
begin
 actor:=diime_private.cuenta_moderacion_actor();
 if p_motivo is null or length(btrim(p_motivo)) not between 8 and 2000 then raise exception 'Explica tu solicitud entre 8 y 2000 caracteres' using errcode='22023'; end if;
 perform private.bloquear_cuentas_contratacion(array[actor]);
 select * into actual from public.cuenta_restricciones where usuario_id=actor for update;
 if not coalesce(actual.suspendida,false) or p_revision is distinct from actual.revision then raise exception 'La suspensión ha cambiado. Actualiza la página' using errcode='55000'; end if;
 select * into existente from public.cuenta_restriccion_revisiones where usuario_id=actor and estado='pendiente';
 if existente.id is not null then return existente.id; end if;
 insert into public.cuenta_restriccion_revisiones(usuario_id,revision,motivo) values(actor,actual.revision,btrim(p_motivo)) returning id into nueva;
 insert into public.cuenta_restriccion_historial(usuario_id,actor_id,accion,motivo,revision) values(actor,actor,'solicitar_revision',btrim(p_motivo),actual.revision);
 return nueva;
end; $$;
revoke all on function public.cuenta_restriccion_obtener(uuid),public.cuenta_restriccion_decidir(uuid,boolean,text,integer,uuid,uuid[]),public.cuenta_restriccion_solicitar_revision(integer,text) from public,anon,service_role;
grant execute on function public.cuenta_restriccion_obtener(uuid),public.cuenta_restriccion_decidir(uuid,boolean,text,integer,uuid,uuid[]),public.cuenta_restriccion_solicitar_revision(integer,text) to authenticated;
-- The same account locks serialize suspension and INSERT of requests, offers and contracts.
-- No UPDATE trigger: delivery, payment, dispute, cancellation and settlement remain available.
create function diime_private.cuenta_permite_nueva_operacion() returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if tg_table_name='solicitudes' then ids:=array[new.cliente_id,auth.uid()];
 elsif tg_table_name='ofertas' then ids:=array[new.profesional_id,auth.uid()];
 else ids:=array[new.cliente_id,new.profesional_id,auth.uid(),new.actor_contratacion_id,new.operador_cliente_id,new.operador_proveedor_id]; end if;
 perform private.bloquear_cuentas_contratacion(ids);
 if exists(select 1 from public.cuenta_restricciones where usuario_id=any(ids) and suspendida) then
  raise exception 'Las nuevas contrataciones de esta cuenta están suspendidas. Conservas acceso a contratos y pagos existentes y puedes solicitar revisión en Mi cuenta' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function diime_private.cuenta_permite_nueva_operacion() from public,anon,authenticated,service_role;
create trigger aa_cuenta_nueva_operacion before insert on public.solicitudes for each row execute function diime_private.cuenta_permite_nueva_operacion();
create trigger aa_cuenta_nueva_operacion before insert on public.ofertas for each row execute function diime_private.cuenta_permite_nueva_operacion();
create trigger aa_cuenta_nueva_operacion before insert on public.trabajos for each row execute function diime_private.cuenta_permite_nueva_operacion();
notify pgrst,'reload schema';
commit;
