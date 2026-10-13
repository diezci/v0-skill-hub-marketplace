begin;

-- Las notas no forman parte de la fila contractual compartida. Se conserva la
-- columna antigua vacía para no romper lectores históricos que usan t.*.
create table diime_private.notas_trabajo_proveedor (
  trabajo_id uuid primary key references public.trabajos(id) on delete cascade,
  notas text not null,
  updated_at timestamptz not null default now()
);
alter table diime_private.notas_trabajo_proveedor enable row level security;
revoke all on diime_private.notas_trabajo_proveedor from public, anon, authenticated;
insert into diime_private.notas_trabajo_proveedor(trabajo_id, notas)
  select id, notas_privadas_proveedor from public.trabajos where notas_privadas_proveedor is not null;
update public.trabajos set notas_privadas_proveedor = null where notas_privadas_proveedor is not null;
alter table public.trabajos add constraint trabajos_notas_solo_privadas check (notas_privadas_proveedor is null);
comment on column public.trabajos.notas_privadas_proveedor is 'Obsoleta; siempre NULL. Usar notas_trabajos_proveedor y actualizar_planificacion_trabajo.';

create function diime_private.notas_trabajos_proveedor(p_trabajo_ids uuid[])
returns table(trabajo_id uuid, notas_privadas_proveedor text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if coalesce(cardinality(p_trabajo_ids),0)>500 then raise exception 'Demasiados trabajos' using errcode='22023'; end if;
  return query select n.trabajo_id,n.notas from diime_private.notas_trabajo_proveedor n
    where n.trabajo_id=any(p_trabajo_ids)
      and diime_private.empresa_puede_operar_trabajo(n.trabajo_id,auth.uid(),'encargos','proveedor');
end; $$;
create function public.notas_trabajos_proveedor(p_trabajo_ids uuid[])
returns table(trabajo_id uuid, notas_privadas_proveedor text)
language sql stable security invoker set search_path = '' as $$
  select * from diime_private.notas_trabajos_proveedor(p_trabajo_ids);
$$;
revoke all on function diime_private.notas_trabajos_proveedor(uuid[]),public.notas_trabajos_proveedor(uuid[]) from public,anon;
grant execute on function diime_private.notas_trabajos_proveedor(uuid[]),public.notas_trabajos_proveedor(uuid[]) to authenticated;

-- La planificación y su nota se guardan en la misma transacción. El permiso
-- se comprueba contra el operador actual, nunca solo contra el autor original.
create function diime_private.actualizar_planificacion_trabajo(p_trabajo_id uuid,p_datos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.trabajos; h_est numeric; h_reg numeric; inicio date; fin timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select * into t from public.trabajos where id=p_trabajo_id for update;
  if t.id is null or not diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','proveedor') then
    raise exception 'No tienes permiso para editar este trabajo' using errcode='42501'; end if;
  if p_datos is null or jsonb_typeof(p_datos)<>'object' or exists(
    select 1 from jsonb_object_keys(p_datos) k where k not in ('horas_estimadas','horas_registradas','notas_privadas_proveedor','prioridad','fecha_inicio','fecha_estimada_fin')) then
    raise exception 'Datos de planificación no válidos' using errcode='22023'; end if;
  h_est:=case when p_datos?'horas_estimadas' then (p_datos->>'horas_estimadas')::numeric else t.horas_estimadas end;
  h_reg:=case when p_datos?'horas_registradas' then (p_datos->>'horas_registradas')::numeric else t.horas_registradas end;
  inicio:=case when p_datos?'fecha_inicio' then (p_datos->>'fecha_inicio')::date else t.fecha_inicio end;
  fin:=case when p_datos?'fecha_estimada_fin' then (p_datos->>'fecha_estimada_fin')::timestamptz else t.fecha_estimada_fin end;
  if coalesce(h_est,0)<0 or coalesce(h_reg,0)<0 or (inicio is not null and fin is not null and fin<inicio) then
    raise exception 'Indica fechas y horas válidas' using errcode='22023'; end if;
  if p_datos?'notas_privadas_proveedor' and jsonb_typeof(p_datos->'notas_privadas_proveedor') not in ('string','null') then
    raise exception 'La nota debe ser un texto' using errcode='22023'; end if;
  update public.trabajos set horas_estimadas=h_est,horas_registradas=h_reg,fecha_inicio=inicio,fecha_estimada_fin=fin,
    prioridad=case when p_datos?'prioridad' then p_datos->>'prioridad' else t.prioridad end
    where id=t.id;
  if p_datos?'notas_privadas_proveedor' then
    insert into diime_private.notas_trabajo_proveedor(trabajo_id,notas) values(t.id,coalesce(p_datos->>'notas_privadas_proveedor',''))
      on conflict(trabajo_id) do update set notas=excluded.notas,updated_at=now();
  end if;
end; $$;
create function public.actualizar_planificacion_trabajo(p_trabajo_id uuid,p_datos jsonb)
returns void language sql security invoker set search_path = '' as $$
  select diime_private.actualizar_planificacion_trabajo(p_trabajo_id,p_datos);
$$;
revoke all on function diime_private.actualizar_planificacion_trabajo(uuid,jsonb),public.actualizar_planificacion_trabajo(uuid,jsonb) from public,anon;
grant execute on function diime_private.actualizar_planificacion_trabajo(uuid,jsonb),public.actualizar_planificacion_trabajo(uuid,jsonb) to authenticated;

-- No se eliminan ni fusionan reseñas históricas. Toda alta nueva queda sellada
-- como versión 2; el índice protege concurrencia incluso con snapshot antiguo.
alter table public."reseñas" add column integridad_version smallint;
alter table public."reseñas" alter column integridad_version set default 2;
create unique index resena_nueva_unica_por_trabajo on public."reseñas"(trabajo_id) where integridad_version=2;
create function diime_private.validar_resena_trabajo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.trabajos;
begin
  if auth.uid() is null or new.autor_id is distinct from auth.uid() then
    raise exception 'La reseña debe pertenecer al cliente autenticado' using errcode='42501'; end if;
  select * into t from public.trabajos where id=new.trabajo_id for update;
  if t.id is null or not diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','cliente') then
    raise exception 'No tienes permiso para dejar una reseña en este trabajo' using errcode='42501'; end if;
  if t.estado is distinct from 'completado' then raise exception 'Solo puedes dejar reseña en trabajos completados' using errcode='55000'; end if;
  if new.profesional_id is distinct from t.profesional_id then raise exception 'El profesional no corresponde al trabajo' using errcode='42501'; end if;
  if new.rating not between 1 and 5 or nullif(btrim(new.comentario),'') is null then
    raise exception 'Indica una puntuación entre 1 y 5 y un comentario' using errcode='22023'; end if;
  if tg_op='UPDATE' and (new.trabajo_id,new.profesional_id,new.autor_id,new.integridad_version) is distinct from (old.trabajo_id,old.profesional_id,old.autor_id,old.integridad_version) then
    raise exception 'La identidad de la reseña es inmutable' using errcode='42501'; end if;
  if tg_op='INSERT' and (t.review_cliente_id is not null or exists(select 1 from public."reseñas" r where r.trabajo_id=t.id)) then
    raise exception 'Este trabajo ya tiene una reseña' using errcode='23505'; end if;
  if tg_op='INSERT' then new.integridad_version:=2; end if;
  new.tipo_proyecto:=coalesce(nullif(btrim(new.tipo_proyecto),''),t.titulo);
  return new;
end; $$;
revoke all on function diime_private.validar_resena_trabajo() from public,anon,authenticated;
create trigger validar_resena_trabajo before insert or update on public."reseñas" for each row execute function diime_private.validar_resena_trabajo();

-- El vínculo y la reputación pertenecen al mismo INSERT: cualquier error
-- revierte la reseña completa, también para escrituras directas de Data API.
create function diime_private.vincular_y_recalcular_resena()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.trabajos set review_cliente_id=new.id where id=new.trabajo_id;
  -- Las FK de reseñas retienen KEY SHARE sobre el profesional. Bloqueamos solo
  -- campos no clave para serializar el recálculo sin ampliar a FOR UPDATE,
  -- que interbloquearía dos contratos distintos del mismo profesional.
  perform 1 from public.profesionales where id=new.profesional_id for no key update;
  update public.profesionales set rating_promedio=r.promedio,total_reseñas=r.total
    from (select round(avg(rating),1) promedio,count(*)::integer total from public."reseñas" where profesional_id=new.profesional_id) r
    where id=new.profesional_id;
  return new;
end; $$;
revoke all on function diime_private.vincular_y_recalcular_resena() from public,anon,authenticated;
create trigger vincular_y_recalcular_resena after insert or update on public."reseñas" for each row execute function diime_private.vincular_y_recalcular_resena();

create function diime_private.crear_resena_trabajo(p_trabajo_id uuid,p_profesional_id uuid,p_rating numeric,p_comentario text,p_tipo_proyecto text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public."reseñas";
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  if p_rating is null or p_rating<>trunc(p_rating) or p_rating not between 1 and 5 then
    raise exception 'Indica una puntuación entera entre 1 y 5' using errcode='22023'; end if;
  -- La guarda anterior se ejecuta tanto aquí como en INSERT directo.
  insert into public."reseñas"(trabajo_id,profesional_id,autor_id,rating,comentario,tipo_proyecto)
    values(p_trabajo_id,p_profesional_id,auth.uid(),p_rating::integer,p_comentario,p_tipo_proyecto) returning * into r;
  return to_jsonb(r)-'integridad_version';
end; $$;
create function public.crear_resena_trabajo(p_trabajo_id uuid,p_profesional_id uuid,p_rating numeric,p_comentario text,p_tipo_proyecto text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select diime_private.crear_resena_trabajo(p_trabajo_id,p_profesional_id,p_rating,p_comentario,p_tipo_proyecto);
$$;
revoke all on function diime_private.crear_resena_trabajo(uuid,uuid,numeric,text,text),public.crear_resena_trabajo(uuid,uuid,numeric,text,text) from public,anon;
grant execute on function diime_private.crear_resena_trabajo(uuid,uuid,numeric,text,text),public.crear_resena_trabajo(uuid,uuid,numeric,text,text) to authenticated;

-- La ficha no admite reputación escrita manualmente por su propietario.
create function diime_private.proteger_reputacion_profesional()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') and (
    (tg_op='INSERT' and (coalesce(new.rating_promedio,0)<>0 or coalesce(new.total_reseñas,0)<>0)) or
    (tg_op='UPDATE' and (new.rating_promedio,new.total_reseñas) is distinct from (old.rating_promedio,old.total_reseñas))) then
    raise exception 'La reputación se calcula a partir de reseñas verificadas' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function diime_private.proteger_reputacion_profesional() from public,anon,authenticated;
create trigger proteger_reputacion_profesional before insert or update on public.profesionales for each row execute function diime_private.proteger_reputacion_profesional();

-- El vínculo del portfolio es una prueba del contrato, no una etiqueta que el
-- navegador pueda adjudicarse. Los textos se obtienen de la demanda original.
create function diime_private.validar_portfolio_trabajo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.trabajos; s public.solicitudes; nombre_categoria text;
begin
  if new.trabajo_id is null then return new; end if;
  if auth.uid() is null or new.profesional_id is distinct from auth.uid() then
    raise exception 'No puedes publicar este trabajo en tu portfolio' using errcode='42501'; end if;
  select * into t from public.trabajos where id=new.trabajo_id for share;
  if t.id is null or t.estado is distinct from 'completado' or t.profesional_id is distinct from new.profesional_id
    or not diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','proveedor') then
    raise exception 'Ese trabajo no está disponible para el portfolio' using errcode='42501'; end if;
  select * into s from public.solicitudes where id=t.solicitud_id;
  if s.id is null then raise exception 'La demanda original no está disponible' using errcode='55000'; end if;
  select nombre into nombre_categoria from public.categorias where id=s.categoria_id;
  new.titulo:=s.titulo;new.descripcion:=s.descripcion;new.ubicacion:=s.ubicacion;
  new.categoria:=coalesce(nombre_categoria,new.categoria);
  return new;
end; $$;
revoke all on function diime_private.validar_portfolio_trabajo() from public,anon,authenticated;
create trigger validar_portfolio_trabajo before insert or update on public.portfolio for each row execute function diime_private.validar_portfolio_trabajo();

create function diime_private.trabajos_valorables_profesional(p_profesional_id uuid)
returns table(id uuid,titulo text,review_cliente_id uuid,estado text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  return query select t.id,t.titulo::text,t.review_cliente_id,t.estado::text from public.trabajos t
    where t.profesional_id=p_profesional_id and t.estado='completado'
      and diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','cliente')
    order by t.created_at desc;
end; $$;
create function public.trabajos_valorables_profesional(p_profesional_id uuid)
returns table(id uuid,titulo text,review_cliente_id uuid,estado text)
language sql stable security invoker set search_path='' as $$
  select * from diime_private.trabajos_valorables_profesional(p_profesional_id);
$$;
revoke all on function diime_private.trabajos_valorables_profesional(uuid),public.trabajos_valorables_profesional(uuid) from public,anon;
grant execute on function diime_private.trabajos_valorables_profesional(uuid),public.trabajos_valorables_profesional(uuid) to authenticated;

commit;
