begin;
-- Accepted product rule: start at payment; calendar edits are private, audited planning.
-- No historical contractual dates or notes are rewritten by this migration.
create table if not exists diime_private.planificacion_trabajo_proveedor (
 trabajo_id uuid primary key references public.trabajos(id) on delete cascade,
 datos jsonb not null, actualizado_por uuid not null references public.profiles(id),
 actualizado_at timestamptz not null default now()
);
create table if not exists diime_private.historial_planificacion_trabajo (
 id uuid primary key default gen_random_uuid(), trabajo_id uuid not null references public.trabajos(id),
 actor_id uuid not null references public.profiles(id), estado_contrato text not null,
 anterior jsonb not null, posterior jsonb not null, creado_at timestamptz not null default now()
);
create index if not exists historial_planificacion_por_trabajo on diime_private.historial_planificacion_trabajo(trabajo_id,creado_at);
alter table diime_private.planificacion_trabajo_proveedor enable row level security;
alter table diime_private.historial_planificacion_trabajo enable row level security;
revoke all on diime_private.planificacion_trabajo_proveedor,diime_private.historial_planificacion_trabajo from public,anon,authenticated;

create or replace function diime_private.planificacion_trabajos_proveedor(p_trabajo_ids uuid[])
returns table(trabajo_id uuid,datos jsonb,actualizado_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
 if coalesce(cardinality(p_trabajo_ids),0)>500 then raise exception 'Demasiados trabajos' using errcode='22023'; end if;
 return query select p.trabajo_id,p.datos,p.actualizado_at from diime_private.planificacion_trabajo_proveedor p
 where p.trabajo_id=any(p_trabajo_ids) and diime_private.empresa_puede_operar_trabajo(p.trabajo_id,auth.uid(),'encargos','proveedor');
end; $$;
create or replace function public.planificacion_trabajos_proveedor(p_trabajo_ids uuid[])
returns table(trabajo_id uuid,datos jsonb,actualizado_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from diime_private.planificacion_trabajos_proveedor(p_trabajo_ids); $$;
revoke all on function diime_private.planificacion_trabajos_proveedor(uuid[]),public.planificacion_trabajos_proveedor(uuid[]) from public,anon;
grant execute on function diime_private.planificacion_trabajos_proveedor(uuid[]),public.planificacion_trabajos_proveedor(uuid[]) to authenticated;

create or replace function diime_private.actualizar_planificacion_trabajo(p_trabajo_id uuid,p_datos jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare t public.trabajos; antes jsonb; despues jsonb; nota text; h_est numeric; h_reg numeric; inicio date; fin timestamptz;
begin
 if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
 select * into t from public.trabajos where id=p_trabajo_id for update;
 if t.id is null or not diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','proveedor') then
  raise exception 'No tienes permiso para editar este trabajo' using errcode='42501'; end if;
 if p_datos is null or jsonb_typeof(p_datos)<>'object' or exists(select 1 from jsonb_object_keys(p_datos) k
  where k not in('horas_estimadas','horas_registradas','notas_privadas_proveedor','prioridad','fecha_inicio','fecha_estimada_fin')) then
  raise exception 'Datos de planificación no válidos' using errcode='22023'; end if;
 select p.datos into antes from diime_private.planificacion_trabajo_proveedor p where p.trabajo_id=t.id;
 antes:=coalesce(antes,jsonb_build_object('horas_estimadas',t.horas_estimadas,'horas_registradas',t.horas_registradas,
  'fecha_inicio',t.fecha_inicio,'fecha_estimada_fin',t.fecha_estimada_fin,'prioridad',t.prioridad));
 despues:=antes||(p_datos-'notas_privadas_proveedor');
 h_est:=(despues->>'horas_estimadas')::numeric; h_reg:=(despues->>'horas_registradas')::numeric;
 inicio:=(despues->>'fecha_inicio')::date; fin:=(despues->>'fecha_estimada_fin')::timestamptz;
 if coalesce(h_est,0)<0 or coalesce(h_reg,0)<0 or (inicio is not null and fin is not null and fin<inicio)
  or coalesce(despues->>'prioridad','media') not in('alta','media','baja','urgente') then
  raise exception 'Indica fechas y horas válidas' using errcode='22023'; end if;
 if p_datos?'notas_privadas_proveedor' and jsonb_typeof(p_datos->'notas_privadas_proveedor') not in('string','null') then
  raise exception 'La nota debe ser un texto' using errcode='22023'; end if;
 select n.notas into nota from diime_private.notas_trabajo_proveedor n where n.trabajo_id=t.id;
 insert into diime_private.historial_planificacion_trabajo(trabajo_id,actor_id,estado_contrato,anterior,posterior)
 values(t.id,auth.uid(),t.estado,antes||jsonb_build_object('notas_privadas_proveedor',nota),
  despues||jsonb_build_object('notas_privadas_proveedor',case when p_datos?'notas_privadas_proveedor' then coalesce(p_datos->>'notas_privadas_proveedor','') else nota end));
 insert into diime_private.planificacion_trabajo_proveedor(trabajo_id,datos,actualizado_por)
 values(t.id,despues,auth.uid()) on conflict(trabajo_id) do update set datos=excluded.datos,actualizado_por=excluded.actualizado_por,actualizado_at=now();
 if p_datos?'notas_privadas_proveedor' then
  insert into diime_private.notas_trabajo_proveedor(trabajo_id,notas) values(t.id,coalesce(p_datos->>'notas_privadas_proveedor',''))
  on conflict(trabajo_id) do update set notas=excluded.notas,updated_at=now();
 end if;
end; $$;

create or replace function diime_private.iniciar_plazo_pagado()
returns trigger language plpgsql security definer set search_path='' as $$
declare pagado timestamptz; cantidad numeric; unidad text; fin timestamptz;
begin
 if old.estado='pendiente_pago' and new.estado='en_progreso' then
  select e.fecha_retencion into pagado from public.transacciones_escrow e where e.trabajo_id=old.id
   and e.estado in('fondos_retenidos','retenido') and e.stripe_charge_id is not null and e.fecha_retencion is not null limit 1;
  if pagado is null then raise exception 'El plazo requiere un pago confirmado' using errcode='55000'; end if;
  select o.tiempo_estimado,o.unidad_tiempo into cantidad,unidad from public.ofertas o where o.id=old.oferta_id;
  if cantidad is null or cantidad<=0 or unidad not in('horas','dias','semanas','meses') then
   raise exception 'La duración contratada no es válida' using errcode='55000'; end if;
  fin:=case unidad when 'horas' then pagado+cantidad*interval '1 hour'
   when 'dias' then ((pagado at time zone 'Europe/Madrid')+cantidad*interval '1 day') at time zone 'Europe/Madrid'
   when 'semanas' then ((pagado at time zone 'Europe/Madrid')+cantidad*interval '1 week') at time zone 'Europe/Madrid'
   when 'meses' then ((pagado at time zone 'Europe/Madrid')+cantidad*interval '30 days') at time zone 'Europe/Madrid' end;
  new.fecha_inicio:=(pagado at time zone 'Europe/Madrid')::date;new.fecha_estimada_fin:=fin;
 elsif row(new.fecha_inicio,new.fecha_estimada_fin,new.horas_estimadas,new.horas_registradas,new.prioridad)
  is distinct from row(old.fecha_inicio,old.fecha_estimada_fin,old.horas_estimadas,old.horas_registradas,old.prioridad) then
  raise exception 'Los términos del contrato están congelados. Usa la planificación privada del calendario.' using errcode='55000';
 end if;
 return new;
end; $$;
revoke all on function diime_private.iniciar_plazo_pagado() from public,anon,authenticated;
drop trigger if exists plazo_pagado_y_terminos_congelados on public.trabajos;
create trigger plazo_pagado_y_terminos_congelados before update on public.trabajos for each row execute function diime_private.iniciar_plazo_pagado();
commit;
