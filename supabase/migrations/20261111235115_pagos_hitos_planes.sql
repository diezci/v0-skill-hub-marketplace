begin;

-- Legacy contracts keep their single payment. New plans are agreed, versioned
-- contract terms; funded milestones are never rewritten by negotiation.
alter table public.solicitudes add column modalidad_pago text not null default 'unico' check(modalidad_pago in('unico','hitos')), add column hitos_sugeridos jsonb not null default '[]' check(jsonb_typeof(hitos_sugeridos)='array');
alter table public.ofertas
  add column modalidad_pago text not null default 'unico' check(modalidad_pago in('unico','hitos')),
  add column plan_hitos jsonb not null default '[]', add column plan_version integer not null default 0,
  add column plan_propuesto_por uuid references auth.users(id), add column plan_propuesto_parte text check(plan_propuesto_parte in('cliente','proveedor')),
  add column plan_aceptado_cliente boolean not null default false, add column plan_aceptado_proveedor boolean not null default true,
  add column plan_estado text not null default 'propuesto' check(plan_estado in('propuesto','acordado','rechazado'));
alter table public.trabajos
  add column modalidad_pago text not null default 'unico' check(modalidad_pago in('unico','hitos')),
  add column plan_version integer not null default 0,
  add column comision_cliente_hitos_centimos bigint,
  add column comision_proveedor_hitos_centimos bigint;
create table public.trabajos_hitos (
  id uuid primary key, trabajo_id uuid not null references public.trabajos(id), orden integer not null check(orden between 1 and 20),
  titulo text not null check(length(btrim(titulo)) between 1 and 160), descripcion text not null default '', criterio_aceptacion text not null,
  fecha_limite date not null, importe_centimos bigint not null check(importe_centimos>0),
  comision_cliente_centimos bigint not null check(comision_cliente_centimos>=0),
  comision_proveedor_centimos bigint not null check(comision_proveedor_centimos between 0 and importe_centimos),
  estado text not null default 'pendiente' check(estado in('pendiente','financiado','entregado','cambios_solicitados','aprobado','completado','cancelado','en_disputa')),
  activo boolean not null default true,
  mensaje_entrega text, archivos_entrega text[] not null default '{}', observaciones_revision text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,trabajo_id)
);
create index trabajos_hitos_trabajo_idx on public.trabajos_hitos(trabajo_id,orden);
create unique index trabajos_hitos_orden_activo on public.trabajos_hitos(trabajo_id,orden) where activo;
create table public.trabajos_planes_hitos (
  id uuid primary key default gen_random_uuid(), trabajo_id uuid not null references public.trabajos(id),
  version integer not null, base_version integer not null, plan_hitos jsonb not null,
  propuesto_por uuid not null references auth.users(id), propuesto_parte text not null check(propuesto_parte in('cliente','proveedor')),
  estado text not null check(estado in('pendiente','aceptado','rechazado','sustituido')),
  created_at timestamptz not null default now(), resuelto_por uuid references auth.users(id), resuelto_at timestamptz,
  unique(trabajo_id,version)
);
create unique index trabajos_planes_hitos_pendiente on public.trabajos_planes_hitos(trabajo_id) where estado='pendiente';
create table public.ofertas_planes_hitos (
  oferta_id uuid not null references public.ofertas(id), version integer not null, modalidad_pago text not null, plan_hitos jsonb not null,
  propuesto_por uuid references auth.users(id), propuesto_parte text not null, aceptado_cliente boolean not null, aceptado_proveedor boolean not null,
  estado text not null, created_at timestamptz not null default now(), primary key(oferta_id,version)
);
alter table public.transacciones_escrow add column hito_id uuid;
alter table public.transacciones_escrow add constraint escrow_hito_trabajo_fk foreign key(hito_id,trabajo_id) references public.trabajos_hitos(id,trabajo_id);
alter table public.actualizaciones_trabajo add column hito_id uuid references public.trabajos_hitos(id);
create function public.guardar_integridad_hito() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.id is distinct from old.id or new.trabajo_id is distinct from old.trabajo_id then raise exception 'Un hito no se puede trasladar a otro contrato'; end if;
  if old.estado<>'pendiente' or exists(select 1 from public.transacciones_escrow e where e.hito_id=old.id and not ((e.estado='cancelado' and e.fecha_retencion is null) or (e.estado='reembolsado' and e.liquidacion_estado='completada' and coalesce(e.liquidacion_contexto->>'tipo'='pago_tardio',false)))) then
    if (to_jsonb(new)-array['estado','mensaje_entrega','archivos_entrega','observaciones_revision','updated_at']) is distinct from (to_jsonb(old)-array['estado','mensaje_entrega','archivos_entrega','observaciones_revision','updated_at']) then raise exception 'Los términos de un hito financiado son inmutables'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.guardar_integridad_hito() from public,anon,authenticated;
create trigger trg_hitos_inmutables before update on public.trabajos_hitos for each row execute function public.guardar_integridad_hito();
create index escrow_hito_idx on public.transacciones_escrow(hito_id) where hito_id is not null;
create index actualizaciones_hito_idx on public.actualizaciones_trabajo(hito_id) where hito_id is not null;
-- Normal activation remains sequential. A later refund failure on a previous
-- stage may legitimately reopen its financial reconciliation beside a new one.
drop index if exists public.transacciones_escrow_un_abierto_por_trabajo;
do $$ begin
  if not exists(select 1 from public.transacciones_escrow where hito_id is null and estado in('pendiente','retenido','fondos_retenidos','liquidando','disputa') group by trabajo_id having count(*)>1) then
    create unique index transacciones_escrow_un_abierto_por_trabajo on public.transacciones_escrow(trabajo_id) where hito_id is null and estado in('pendiente','retenido','fondos_retenidos','liquidando','disputa');
  else raise warning 'Historical duplicate payments retain the trigger guard and require reconciliation'; end if;
end; $$;
create unique index transacciones_escrow_un_abierto_por_hito on public.transacciones_escrow(hito_id) where hito_id is not null and estado in('pendiente','retenido','fondos_retenidos','liquidando','disputa');
create or replace function public.impedir_escrow_abierto_duplicado() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.estado in('pendiente','retenido','fondos_retenidos','liquidando','disputa') then
    perform public.diime_bloquear_trabajo_financiero(new.trabajo_id);
    if exists(select 1 from public.transacciones_escrow e where e.trabajo_id=new.trabajo_id and e.hito_id is not distinct from new.hito_id and e.id is distinct from new.id and e.estado in('pendiente','retenido','fondos_retenidos','liquidando','disputa')) then raise exception 'Ya existe un pago abierto para este hito o trabajo' using errcode='23505'; end if;
  end if;
  return new;
end; $$;

-- No authenticated table access: the RPC projection hides the other party's fees.
alter table public.trabajos_hitos enable row level security;
alter table public.trabajos_planes_hitos enable row level security;
alter table public.ofertas_planes_hitos enable row level security;
revoke all on public.trabajos_hitos,public.trabajos_planes_hitos,public.ofertas_planes_hitos from public,anon,authenticated;
grant all on public.trabajos_hitos,public.trabajos_planes_hitos,public.ofertas_planes_hitos to service_role;

create function diime_private.validar_plan_hitos(p_hitos jsonb,p_total bigint,p_sugerido boolean default false)
returns void language plpgsql immutable set search_path='' as $$
declare h jsonb; suma bigint:=0; ids uuid[]:='{}'; id uuid; cantidad integer; importe bigint;
begin
  if p_hitos is null or jsonb_typeof(p_hitos)<>'array' then raise exception 'El plan de hitos no es válido' using errcode='22023'; end if;
  cantidad:=jsonb_array_length(p_hitos);
  if cantidad>20 or (not p_sugerido and cantidad<2) then raise exception 'Indica entre 2 y 20 hitos, o elige pago único' using errcode='22023'; end if;
  for h in select value from jsonb_array_elements(p_hitos) loop
    if jsonb_typeof(h)<>'object' or coalesce(h->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Identificador de hito no válido'; end if;
    id:=(h->>'id')::uuid;
    if id=any(ids) then raise exception 'Los hitos no pueden estar duplicados'; end if;
    ids:=array_append(ids,id);
    if jsonb_typeof(h->'titulo') is distinct from 'string' or length(btrim(h->>'titulo')) not between 1 and 160
      or jsonb_typeof(h->'criterio_aceptacion') is distinct from 'string' or length(h->>'criterio_aceptacion')>2000
      or length(coalesce(h->>'descripcion',''))>4000 then raise exception 'Revisa el título y los criterios de cada hito'; end if;
    if jsonb_typeof(h->'importe_centimos') is distinct from 'number' or (h->>'importe_centimos') !~ '^[0-9]+$' then raise exception 'Importe de hito no válido'; end if;
    importe:=(h->>'importe_centimos')::bigint;
    if importe<0 or importe>999999999 then raise exception 'Importe de hito no válido'; end if;
    if not p_sugerido and importe<50 then raise exception 'Cada hito debe tener un importe mínimo de 0,50 €.'; end if;
    if jsonb_typeof(h->'fecha_limite') is distinct from 'string' then raise exception 'Fecha de hito no válida'; end if;
    if coalesce(h->>'fecha_limite','')<>'' then
      if (h->>'fecha_limite') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((h->>'fecha_limite')::date,'YYYY-MM-DD')<>h->>'fecha_limite' then raise exception 'Fecha de hito no válida'; end if;
    elsif not p_sugerido then raise exception 'Indica una fecha para cada hito'; end if;
    if not p_sugerido and btrim(h->>'criterio_aceptacion')='' then raise exception 'Indica qué debe entregarse para aprobar cada hito'; end if;
    suma:=suma+importe;
  end loop;
  if not p_sugerido and (p_total is null or p_total<=0 or p_total>999999999 or suma<>p_total) then raise exception 'La suma de los hitos debe coincidir con el precio acordado'; end if;
end; $$;
revoke all on function diime_private.validar_plan_hitos(jsonb,bigint,boolean) from public,anon,authenticated;

create function diime_private.guardar_plan_solicitud() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform diime_private.validar_plan_hitos(new.hitos_sugeridos,null,true);
  if new.modalidad_pago='unico' and new.hitos_sugeridos<>'[]' then raise exception 'El pago único no tiene hitos'; end if;
  return new;
end; $$;
create trigger trg_hitos_solicitud before insert or update of modalidad_pago,hitos_sugeridos on public.solicitudes for each row execute function diime_private.guardar_plan_solicitud();

create function diime_private.parte_plan_oferta(p_oferta uuid,p_actor uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare o public.ofertas; s public.solicitudes;
begin
  if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and cuenta_eliminada is null) then return null; end if;
  select * into o from public.ofertas where id=p_oferta; select * into s from public.solicitudes where id=o.solicitud_id;
  if (s.empresa_id is null and s.cliente_id=p_actor) or (s.empresa_id is not null and diime_private.empresa_tiene_permiso(s.empresa_id,p_actor,'encargos') and (s.cliente_id=p_actor or diime_private.empresa_es_administrador(s.empresa_id,p_actor))) then return 'cliente'; end if;
  if (o.empresa_id is null and o.profesional_id=p_actor) or (o.empresa_id is not null and diime_private.empresa_tiene_permiso(o.empresa_id,p_actor,'presupuestos') and (o.profesional_id=p_actor or diime_private.empresa_es_administrador(o.empresa_id,p_actor))) then return 'proveedor'; end if;
  return null;
end; $$;
revoke all on function diime_private.parte_plan_oferta(uuid,uuid) from public,anon,authenticated;

create function public.guardar_integridad_plan_oferta() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.modalidad_pago='hitos' then perform diime_private.validar_plan_hitos(new.plan_hitos,round(new.precio*100)::bigint,false);
  elsif new.plan_hitos<>'[]' then raise exception 'El pago único no tiene hitos'; end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and old.estado in('retirada','rechazada') and new.estado='pendiente' and not exists(select 1 from public.trabajos where oferta_id=new.id)) then
    new.plan_version:=case when tg_op='UPDATE' then old.plan_version+1 when new.modalidad_pago='hitos' then 1 else 0 end;
    new.plan_propuesto_por:=new.profesional_id; new.plan_propuesto_parte:='proveedor'; new.plan_aceptado_proveedor:=true; new.plan_aceptado_cliente:=false; new.plan_estado:='propuesto';
  elsif current_user not in('postgres','service_role','supabase_admin') and (
    new.modalidad_pago is distinct from old.modalidad_pago or new.plan_hitos is distinct from old.plan_hitos or new.plan_version is distinct from old.plan_version
    or new.plan_propuesto_por is distinct from old.plan_propuesto_por or new.plan_propuesto_parte is distinct from old.plan_propuesto_parte
    or new.plan_aceptado_proveedor is distinct from old.plan_aceptado_proveedor or new.plan_aceptado_cliente is distinct from old.plan_aceptado_cliente or new.plan_estado is distinct from old.plan_estado
    or (old.modalidad_pago='hitos' and new.precio is distinct from old.precio)) then
    raise exception 'Los cambios del plan deben proponerse y aceptarse por ambas partes' using errcode='42501';
  end if;
  return new;
end; $$;
-- The invoker guard must be able to validate, without exposing any data.
grant execute on function diime_private.validar_plan_hitos(jsonb,bigint,boolean) to authenticated,service_role;
create trigger trg_hitos_oferta before insert or update on public.ofertas for each row execute function public.guardar_integridad_plan_oferta();
create function diime_private.historial_plan_oferta() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.ofertas_planes_hitos(oferta_id,version,modalidad_pago,plan_hitos,propuesto_por,propuesto_parte,aceptado_cliente,aceptado_proveedor,estado)
    values(new.id,new.plan_version,new.modalidad_pago,new.plan_hitos,new.plan_propuesto_por,coalesce(new.plan_propuesto_parte,'proveedor'),new.plan_aceptado_cliente,new.plan_aceptado_proveedor,new.plan_estado)
    on conflict(oferta_id,version) do update set aceptado_cliente=excluded.aceptado_cliente,aceptado_proveedor=excluded.aceptado_proveedor,estado=excluded.estado;
  return new;
end; $$;
revoke all on function diime_private.historial_plan_oferta() from public,anon,authenticated;
create trigger trg_hitos_oferta_historial after insert or update of plan_version,plan_aceptado_cliente,plan_aceptado_proveedor,plan_estado on public.ofertas for each row execute function diime_private.historial_plan_oferta();


create function diime_private.obtener_plan_oferta(p_oferta uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.ofertas; parte text:=diime_private.parte_plan_oferta(p_oferta,auth.uid());
begin
  if parte is null then raise exception 'No tienes permiso sobre esta oferta' using errcode='42501'; end if;
  select * into o from public.ofertas where id=p_oferta;
  return jsonb_build_object('oferta_id',o.id,'titulo',(select titulo from public.solicitudes where id=o.solicitud_id),'estado',o.estado,'rol',parte,'modalidad_pago',o.modalidad_pago,'plan_hitos',o.plan_hitos,'plan_version',o.plan_version,
    'plan_propuesto_por',o.plan_propuesto_por,'plan_propuesto_parte',o.plan_propuesto_parte,'plan_aceptado_cliente',o.plan_aceptado_cliente,'plan_aceptado_proveedor',o.plan_aceptado_proveedor,'plan_estado',o.plan_estado,
    'comision_proveedor_prevista',case when parte='proveedor' then o.comision_proveedor_prevista end,'pago_neto_proveedor_previsto',case when parte='proveedor' then o.pago_neto_proveedor_previsto end,'precio_centimos',round(o.precio*100),'puede_editar',o.estado in('pendiente','enviada','en_negociacion') and not exists(select 1 from public.trabajos where oferta_id=o.id and estado<>'cancelado'));
end; $$;
create function public.obtener_plan_oferta(p_oferta uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.obtener_plan_oferta(p_oferta); $$;

create function diime_private.proponer_plan_oferta(p_oferta uuid,p_modalidad text,p_hitos jsonb,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.ofertas; parte text; solicitud uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  select solicitud_id into solicitud from public.ofertas where id=p_oferta;
  perform 1 from public.solicitudes where id=solicitud and estado='abierta' for update;
  if not found then raise exception 'La demanda ya no admite cambios'; end if;
  select * into o from public.ofertas where id=p_oferta for update;
  perform 1 from public.empresa_miembros m where m.usuario_id=auth.uid() and m.empresa_id in(o.empresa_id,(select empresa_id from public.solicitudes where id=o.solicitud_id)) order by m.empresa_id for share;
  parte:=diime_private.parte_plan_oferta(p_oferta,auth.uid());
  if parte is null then raise exception 'No tienes permiso sobre esta oferta' using errcode='42501'; end if;
  if o.plan_version is distinct from p_version then raise exception 'El plan ha cambiado. Recarga antes de proponer cambios' using errcode='40001'; end if;
  if o.estado not in('pendiente','enviada','en_negociacion') or exists(select 1 from public.trabajos where oferta_id=o.id and estado<>'cancelado') then raise exception 'La oferta ya no admite cambios'; end if;
  if p_modalidad='hitos' then perform diime_private.validar_plan_hitos(p_hitos,round(o.precio*100)::bigint,false);
  elsif p_modalidad is distinct from 'unico' or p_hitos is distinct from '[]' then raise exception 'Modalidad de pago no válida'; end if;
  insert into public.ofertas_planes_hitos values(o.id,o.plan_version,o.modalidad_pago,o.plan_hitos,o.plan_propuesto_por,coalesce(o.plan_propuesto_parte,'proveedor'),o.plan_aceptado_cliente,o.plan_aceptado_proveedor,o.plan_estado,now()) on conflict do nothing;
  update public.ofertas set modalidad_pago=p_modalidad,plan_hitos=p_hitos,plan_version=plan_version+1,plan_propuesto_por=auth.uid(),plan_propuesto_parte=parte,
    plan_aceptado_cliente=parte='cliente',plan_aceptado_proveedor=parte='proveedor',plan_estado='propuesto',updated_at=now() where id=o.id;
  return diime_private.obtener_plan_oferta(o.id);
end; $$;
create function public.proponer_plan_oferta(p_oferta uuid,p_modalidad text,p_hitos jsonb,p_version integer) returns jsonb language sql security invoker set search_path='' as $$ select diime_private.proponer_plan_oferta(p_oferta,p_modalidad,p_hitos,p_version); $$;

create function diime_private.responder_plan_oferta(p_oferta uuid,p_version integer,p_aceptar boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.ofertas; parte text; solicitud uuid;
begin
  select solicitud_id into solicitud from public.ofertas where id=p_oferta;
  perform 1 from public.solicitudes where id=solicitud and estado='abierta' for update;
  if not found then raise exception 'La demanda ya no admite cambios'; end if;
  select * into o from public.ofertas where id=p_oferta for update;
  perform 1 from public.empresa_miembros m where m.usuario_id=auth.uid() and m.empresa_id in(o.empresa_id,(select empresa_id from public.solicitudes where id=o.solicitud_id)) order by m.empresa_id for share;
  parte:=diime_private.parte_plan_oferta(p_oferta,auth.uid());
  if parte is null or parte=o.plan_propuesto_parte then raise exception 'Debe responder la otra parte' using errcode='42501'; end if;
  if o.plan_version is distinct from p_version then raise exception 'El plan ha cambiado. Revisa la última propuesta' using errcode='40001'; end if;
  if p_aceptar is null or o.estado not in('pendiente','enviada','en_negociacion') or o.plan_estado='rechazado' then raise exception 'Esta propuesta ya no admite respuesta'; end if;
  update public.ofertas set plan_aceptado_cliente=case when parte='cliente' then p_aceptar else plan_aceptado_cliente end,
    plan_aceptado_proveedor=case when parte='proveedor' then p_aceptar else plan_aceptado_proveedor end,
    plan_estado=case when p_aceptar then 'acordado' else 'rechazado' end,updated_at=now() where id=o.id;
  return diime_private.obtener_plan_oferta(o.id);
end; $$;
create function public.responder_plan_oferta(p_oferta uuid,p_version integer,p_aceptar boolean) returns jsonb language sql security invoker set search_path='' as $$ select diime_private.responder_plan_oferta(p_oferta,p_version,p_aceptar); $$;

-- Snapshot accepted fees only once. Cumulative allocation keeps even a one-cent
-- last milestone non-negative; all rounded cents sum exactly to the contract.
create function diime_private.materializar_plan_hitos(p_trabajo uuid,p_hitos jsonb) returns void language plpgsql security definer set search_path='' as $$
declare t public.trabajos; h jsonb; actual public.trabajos_hitos; orden integer:=0; restante bigint; cc bigint; cp bigint; acumulado bigint:=0; asignado_c bigint:=0; asignado_p bigint:=0; fc bigint; fp bigint;
begin
  select * into t from public.trabajos where id=p_trabajo;
  perform diime_private.validar_plan_hitos(p_hitos,round(t.precio_acordado*100)::bigint,false);
  -- A former ID can never be reassigned to another job or revived after removal.
  if exists(select 1 from jsonb_array_elements(p_hitos) candidate join public.trabajos_hitos x on x.id=(candidate->>'id')::uuid where x.trabajo_id<>t.id or not x.activo) then raise exception 'Un identificador de hito ya pertenece a otro plan'; end if;
  for actual in select * from public.trabajos_hitos where trabajo_id=t.id and activo and (estado<>'pendiente' or exists(select 1 from public.transacciones_escrow e where e.hito_id=trabajos_hitos.id and not ((e.estado='cancelado' and e.fecha_retencion is null) or (e.estado='reembolsado' and e.liquidacion_estado='completada' and coalesce(e.liquidacion_contexto->>'tipo'='pago_tardio',false))))) loop
    select value into h from jsonb_array_elements(p_hitos) with ordinality a(value,n) where (value->>'id')::uuid=actual.id and n=actual.orden;
    if h is null or (h->>'titulo') is distinct from actual.titulo or coalesce(h->>'descripcion','') is distinct from actual.descripcion or (h->>'criterio_aceptacion') is distinct from actual.criterio_aceptacion or (h->>'fecha_limite')::date is distinct from actual.fecha_limite or (h->>'importe_centimos')::bigint is distinct from actual.importe_centimos then raise exception 'Los hitos financiados o en curso no se pueden modificar ni eliminar'; end if;
  end loop;
  select round(t.precio_acordado*100)::bigint-coalesce(sum(importe_centimos),0), t.comision_cliente_hitos_centimos-coalesce(sum(comision_cliente_centimos),0),t.comision_proveedor_hitos_centimos-coalesce(sum(comision_proveedor_centimos),0)
    into restante,cc,cp from public.trabajos_hitos where trabajo_id=t.id and activo and (estado<>'pendiente' or exists(select 1 from public.transacciones_escrow e where e.hito_id=trabajos_hitos.id and not ((e.estado='cancelado' and e.fecha_retencion is null) or (e.estado='reembolsado' and e.liquidacion_estado='completada' and coalesce(e.liquidacion_contexto->>'tipo'='pago_tardio',false)))));
  -- Temporarily deactivate only editable rows to permit reordering under unique index.
  update public.trabajos_hitos set activo=false where trabajo_id=t.id and activo and estado='pendiente' and not exists(select 1 from public.transacciones_escrow e where e.hito_id=trabajos_hitos.id and not ((e.estado='cancelado' and e.fecha_retencion is null) or (e.estado='reembolsado' and e.liquidacion_estado='completada' and coalesce(e.liquidacion_contexto->>'tipo'='pago_tardio',false))));
  for h in select value from jsonb_array_elements(p_hitos) loop
    orden:=orden+1;
    select * into actual from public.trabajos_hitos where id=(h->>'id')::uuid;
    if actual.id is not null and actual.activo then
      if actual.importe_centimos+actual.comision_cliente_centimos>99999999 then raise exception 'El cobro de un hito supera el máximo de 999.999,99 €'; end if;
      continue;
    end if;
    acumulado:=acumulado+(h->>'importe_centimos')::bigint;
    fc:=floor(cc::numeric*acumulado/nullif(restante,0))::bigint-asignado_c; fp:=floor(cp::numeric*acumulado/nullif(restante,0))::bigint-asignado_p;
    asignado_c:=asignado_c+fc; asignado_p:=asignado_p+fp;
    if (h->>'importe_centimos')::bigint+fc>99999999 then raise exception 'El cobro de un hito, incluidos los gastos de servicio del cliente, no puede superar 999.999,99 €. Divide ese importe en más hitos.'; end if;
    insert into public.trabajos_hitos(id,trabajo_id,orden,titulo,descripcion,criterio_aceptacion,fecha_limite,importe_centimos,comision_cliente_centimos,comision_proveedor_centimos)
      values((h->>'id')::uuid,t.id,orden,btrim(h->>'titulo'),coalesce(h->>'descripcion',''),btrim(h->>'criterio_aceptacion'),(h->>'fecha_limite')::date,(h->>'importe_centimos')::bigint,fc,fp)
      on conflict(id) do update set orden=excluded.orden,titulo=excluded.titulo,descripcion=excluded.descripcion,criterio_aceptacion=excluded.criterio_aceptacion,fecha_limite=excluded.fecha_limite,importe_centimos=excluded.importe_centimos,comision_cliente_centimos=excluded.comision_cliente_centimos,comision_proveedor_centimos=excluded.comision_proveedor_centimos,activo=true,updated_at=now();
  end loop;
end; $$;

create function diime_private.iniciar_contrato_hitos() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.ofertas;
begin
  select * into o from public.ofertas where id=new.oferta_id;
  if o.modalidad_pago='hitos' then
    if not o.plan_aceptado_proveedor or o.plan_estado='rechazado' then raise exception 'El proveedor debe aceptar el plan antes de contratar'; end if;
    perform diime_private.validar_plan_hitos(o.plan_hitos,round(new.precio_acordado*100)::bigint,false);
    new.modalidad_pago:='hitos';new.plan_version:=o.plan_version;
    new.comision_cliente_hitos_centimos:=greatest(round(new.precio_acordado*10),200)::bigint;
    new.comision_proveedor_hitos_centimos:=round(o.comision_proveedor_prevista*100)::bigint;
  end if;
  return new;
end; $$;
create trigger trg_hitos_contrato before insert on public.trabajos for each row execute function diime_private.iniciar_contrato_hitos();
create function diime_private.crear_hitos_contrato() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.ofertas;
begin
  if new.modalidad_pago='hitos' then
    select * into o from public.ofertas where id=new.oferta_id;
    perform diime_private.materializar_plan_hitos(new.id,o.plan_hitos);
    insert into public.trabajos_planes_hitos(trabajo_id,version,base_version,plan_hitos,propuesto_por,propuesto_parte,estado,resuelto_por,resuelto_at)
      values(new.id,new.plan_version,new.plan_version,o.plan_hitos,coalesce(o.plan_propuesto_por,o.profesional_id),coalesce(o.plan_propuesto_parte,'proveedor'),'aceptado',auth.uid(),now());
  end if;
  return new;
end; $$;
create trigger trg_hitos_contrato_creado after insert on public.trabajos for each row execute function diime_private.crear_hitos_contrato();

-- The old RPC remains available for untouched single-payment offers. No caller
-- (including a direct private-schema RPC) may contract a stale milestone plan.
alter function private.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz) rename to aceptar_oferta_y_crear_trabajo_sin_plan;
revoke all on function private.aceptar_oferta_y_crear_trabajo_sin_plan(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
create function private.aceptar_oferta_y_crear_trabajo(p_oferta_id uuid,p_solicitud_id uuid,p_profesional_id uuid,p_fecha_estimada_fin timestamptz default null,p_plan_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.ofertas; resultado jsonb;
begin
  perform 1 from public.solicitudes where id=p_solicitud_id for update;
  select * into o from public.ofertas where id=p_oferta_id for update;
  if o.id is null or (o.modalidad_pago='hitos' or o.plan_version>0) and o.plan_version is distinct from p_plan_version then raise exception 'El plan ha cambiado. Revisa y acepta su última versión' using errcode='40001'; end if;
  if not o.plan_aceptado_proveedor or o.plan_estado='rechazado' then raise exception 'El proveedor debe aceptar la propuesta antes de contratar'; end if;
  resultado:=private.aceptar_oferta_y_crear_trabajo_sin_plan(p_oferta_id,p_solicitud_id,p_profesional_id,p_fecha_estimada_fin);
  update public.ofertas set plan_aceptado_cliente=true,plan_estado='acordado' where id=o.id;
  return resultado;
end; $$;
create or replace function public.aceptar_oferta_y_crear_trabajo(p_oferta_id uuid,p_solicitud_id uuid,p_profesional_id uuid,p_fecha_estimada_fin timestamptz default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.aceptar_oferta_y_crear_trabajo(p_oferta_id,p_solicitud_id,p_profesional_id,p_fecha_estimada_fin,null); $$;
create function public.aceptar_oferta_y_crear_trabajo(p_oferta_id uuid,p_solicitud_id uuid,p_profesional_id uuid,p_fecha_estimada_fin timestamptz,p_plan_version integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.aceptar_oferta_y_crear_trabajo(p_oferta_id,p_solicitud_id,p_profesional_id,p_fecha_estimada_fin,p_plan_version); $$;

create function diime_private.obtener_plan_hitos(p_trabajo uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.trabajos; parte text; hitos jsonb; propuesta jsonb; operar boolean; cobrar boolean; ver_cobros boolean;
begin
  select * into t from public.trabajos where id=p_trabajo;
  if diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','cliente') then parte:='cliente';
  elsif diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','proveedor') then parte:='proveedor';
  else raise exception 'No tienes permiso sobre este trabajo' using errcode='42501'; end if;
  cobrar:=diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'gestionar_cobros',parte);
  ver_cobros:=cobrar or diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'ver_cobros',parte);
  operar:=t.estado in('pendiente_pago','en_progreso') and not t.pago_bloqueado and t.cancelacion_estado is distinct from 'pendiente';
  select to_jsonb(p) into propuesta from public.trabajos_planes_hitos p where trabajo_id=t.id and estado='pendiente';
  select coalesce(jsonb_agg((to_jsonb(h)-case when not ver_cobros then array['comision_proveedor_centimos','comision_cliente_centimos'] when parte='cliente' then array['comision_proveedor_centimos'] else array['comision_cliente_centimos'] end)||jsonb_build_object(
    'bloqueado',h.estado<>'pendiente' or exists(select 1 from public.transacciones_escrow x where x.hito_id=h.id and not ((x.estado='cancelado' and x.fecha_retencion is null) or (x.estado='reembolsado' and x.liquidacion_estado='completada' and coalesce(x.liquidacion_contexto->>'tipo'='pago_tardio',false)))),
    'escrow',(select jsonb_build_object('id',e.id,'estado',e.estado,'liquidacion_estado',e.liquidacion_estado,'liquidacion_error',e.liquidacion_error,'fecha_liberacion',e.fecha_liberacion,'fecha_retencion',e.fecha_retencion,'monto_reembolsado',case when ver_cobros and parte='cliente' then e.monto_reembolsado end,'base_liquidada_centimos',case when e.liquidacion_estado='completada' then round(coalesce(e.monto_bruto_proveedor,0)*100) else 0 end,'reembolso_servicio_centimos',case when e.liquidacion_estado='completada' then greatest(0,round((e.monto_base-coalesce(e.monto_bruto_proveedor,e.monto_base))*100)) else 0 end,'neto_proveedor_centimos',case when ver_cobros and parte='proveedor' and e.liquidacion_estado='completada' then round(e.pago_neto_proveedor*100) end)
       from public.transacciones_escrow e where e.hito_id=h.id order by (e.estado in('pendiente','retenido','fondos_retenidos','liquidando','disputa','pago_tardio')) desc,(e.fecha_retencion is not null) desc,e.created_at desc limit 1)) order by h.orden),'[]'::jsonb)
    into hitos from public.trabajos_hitos h where h.trabajo_id=t.id and h.activo;
  return jsonb_build_object('trabajo_id',t.id,'titulo',t.titulo,'estado',t.estado,'rol',parte,'modalidad_pago',t.modalidad_pago,'plan_version',t.plan_version,'precio_centimos',round(t.precio_acordado*100),
    'cancelacion_estado',t.cancelacion_estado,'cancelacion_parte_solicitante',t.cancelacion_parte_solicitante,'cancelacion_razon',t.cancelacion_razon,'cancelacion_revision',to_jsonb(t)->>'cancelacion_revision','puede_gestionar_cancelacion',t.estado in('pendiente_pago','en_progreso') and t.cancelacion_aceptada_por is null and not t.pago_bloqueado,'puede_aceptar_cancelacion',cobrar and t.estado in('pendiente_pago','en_progreso') and t.cancelacion_aceptada_por is null,'hitos',hitos,'propuesta',propuesta,'puede_editar',operar,'puede_pagar',operar and cobrar and parte='cliente' and propuesta is null,
    'puede_entregar',operar and parte='proveedor','puede_aprobar',operar and cobrar and parte='cliente');
end; $$;
create function public.obtener_plan_hitos(p_trabajo uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.obtener_plan_hitos(p_trabajo); $$;

create function diime_private.validar_cambio_plan_trabajo(p_trabajo uuid,p_hitos jsonb) returns void language plpgsql security definer set search_path='' as $$
declare t public.trabajos; actual public.trabajos_hitos; h jsonb;
begin
  select * into t from public.trabajos where id=p_trabajo;
  perform diime_private.validar_plan_hitos(p_hitos,round(t.precio_acordado*100)::bigint,false);
  if exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and (estado in('pendiente','pago_tardio','liquidando') or stripe_disputa_id is not null)) then raise exception 'Finaliza o cierra el pago pendiente antes de cambiar los hitos'; end if;
  if exists(select 1 from jsonb_array_elements(p_hitos) candidate join public.trabajos_hitos x on x.id=(candidate->>'id')::uuid where x.trabajo_id<>t.id or not x.activo) then raise exception 'Un identificador de hito ya pertenece a otro plan'; end if;
  for actual in select * from public.trabajos_hitos where trabajo_id=t.id and activo and (estado<>'pendiente' or exists(select 1 from public.transacciones_escrow e where e.hito_id=trabajos_hitos.id and not ((e.estado='cancelado' and e.fecha_retencion is null) or (e.estado='reembolsado' and e.liquidacion_estado='completada' and coalesce(e.liquidacion_contexto->>'tipo'='pago_tardio',false))))) loop
    select value into h from jsonb_array_elements(p_hitos) with ordinality a(value,n) where (value->>'id')::uuid=actual.id and n=actual.orden;
    if h is null or (h->>'titulo') is distinct from actual.titulo or coalesce(h->>'descripcion','') is distinct from actual.descripcion or (h->>'criterio_aceptacion') is distinct from actual.criterio_aceptacion or (h->>'fecha_limite')::date is distinct from actual.fecha_limite or (h->>'importe_centimos')::bigint is distinct from actual.importe_centimos then raise exception 'Los hitos financiados o en curso no se pueden modificar ni eliminar'; end if;
  end loop;
end; $$;

create function diime_private.proponer_plan_trabajo(p_trabajo uuid,p_modalidad text,p_hitos jsonb,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trabajos; parte text; version_nueva integer;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,auth.uid());
  select * into t from public.trabajos where id=p_trabajo;
  if diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','cliente') then parte:='cliente';
  elsif diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','proveedor') then parte:='proveedor';
  else raise exception 'No tienes permiso sobre este trabajo' using errcode='42501'; end if;
  if t.modalidad_pago<>'hitos' or p_modalidad is distinct from 'hitos' then raise exception 'La modalidad contratada se conserva. Puedes redistribuir los hitos aún sin financiar'; end if;
  if t.plan_version is distinct from p_version then raise exception 'El plan ha cambiado. Recarga antes de proponer cambios' using errcode='40001'; end if;
  if t.estado not in('pendiente_pago','en_progreso') or t.pago_bloqueado or t.cancelacion_estado='pendiente' then raise exception 'Resuelve la incidencia antes de cambiar el plan'; end if;
  perform diime_private.validar_cambio_plan_trabajo(t.id,p_hitos);
  select greatest(t.plan_version,coalesce(max(version),0))+1 into version_nueva from public.trabajos_planes_hitos where trabajo_id=t.id;
  update public.trabajos_planes_hitos set estado='sustituido',resuelto_por=auth.uid(),resuelto_at=now() where trabajo_id=t.id and estado='pendiente';
  insert into public.trabajos_planes_hitos(trabajo_id,version,base_version,plan_hitos,propuesto_por,propuesto_parte,estado)
    values(t.id,version_nueva,t.plan_version,p_hitos,auth.uid(),parte,'pendiente');
  return diime_private.obtener_plan_hitos(t.id);
end; $$;
create function public.proponer_plan_trabajo(p_trabajo uuid,p_modalidad text,p_hitos jsonb,p_version integer) returns jsonb language sql security invoker set search_path='' as $$ select diime_private.proponer_plan_trabajo(p_trabajo,p_modalidad,p_hitos,p_version); $$;

create function diime_private.responder_plan_trabajo(p_trabajo uuid,p_version integer,p_aceptar boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trabajos; p public.trabajos_planes_hitos; parte text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,auth.uid());
  select * into t from public.trabajos where id=p_trabajo;
  select * into p from public.trabajos_planes_hitos where trabajo_id=t.id and version=p_version for update;
  if diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','cliente') then parte:='cliente';
  elsif diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','proveedor') then parte:='proveedor'; end if;
  if parte is null or parte=p.propuesto_parte then raise exception 'Debe responder la otra parte' using errcode='42501'; end if;
  if p.id is null or p.estado<>'pendiente' or p.base_version<>t.plan_version or p_aceptar is null then raise exception 'La propuesta ha cambiado. Revisa la última versión' using errcode='40001'; end if;
  if t.estado not in('pendiente_pago','en_progreso') or t.pago_bloqueado or t.cancelacion_estado='pendiente' then raise exception 'Resuelve la incidencia antes de cambiar el plan'; end if;
  if p_aceptar then
    perform diime_private.validar_cambio_plan_trabajo(t.id,p.plan_hitos);
    perform diime_private.materializar_plan_hitos(t.id,p.plan_hitos);
    update public.trabajos set plan_version=p.version,updated_at=now() where id=t.id;
  end if;
  update public.trabajos_planes_hitos set estado=case when p_aceptar then 'aceptado' else 'rechazado' end,resuelto_por=auth.uid(),resuelto_at=now() where id=p.id;
  insert into public.actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje,progreso) values(t.id,auth.uid(),'mensaje',case when p_aceptar then 'Ambas partes han aceptado la versión '||p.version||' del plan de hitos.' else 'La propuesta de cambio de hitos se ha rechazado. Se conserva el plan acordado.' end,t.progreso);
  return diime_private.obtener_plan_hitos(t.id);
end; $$;
create function public.responder_plan_trabajo(p_trabajo uuid,p_version integer,p_aceptar boolean) returns jsonb language sql security invoker set search_path='' as $$ select diime_private.responder_plan_trabajo(p_trabajo,p_version,p_aceptar); $$;

create function diime_private.entregar_hito(p_trabajo uuid,p_hito uuid,p_mensaje text,p_archivos text[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trabajos; h public.trabajos_hitos;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,auth.uid());
  if not diime_private.empresa_puede_operar_trabajo(p_trabajo,auth.uid(),'encargos','proveedor') then raise exception 'Solo el proveedor puede entregar este hito' using errcode='42501'; end if;
  select * into t from public.trabajos where id=p_trabajo;
  select * into h from public.trabajos_hitos where id=p_hito and trabajo_id=t.id and activo for update;
  if h.id is null or h.estado not in('financiado','cambios_solicitados') or t.estado<>'en_progreso' or t.pago_bloqueado or t.cancelacion_estado='pendiente'
    or not exists(select 1 from public.transacciones_escrow where hito_id=h.id and estado in('retenido','fondos_retenidos') and fecha_retencion is not null and stripe_disputa_id is null) then raise exception 'El hito debe estar pagado y sin incidencias para entregarlo'; end if;
  if length(btrim(coalesce(p_mensaje,''))) not between 1 and 4000 then raise exception 'Describe la entrega del hito'; end if;
  if p_archivos is null or cardinality(p_archivos)>5 or exists(select 1 from unnest(p_archivos) u where u is null or u !~ '^https://') then raise exception 'Los archivos adjuntos no son válidos'; end if;
  perform diime_private.validar_adjuntos_actor(p_archivos,auth.uid());
  update public.trabajos_hitos set estado='entregado',mensaje_entrega=btrim(p_mensaje),archivos_entrega=p_archivos,observaciones_revision=null,updated_at=now() where id=h.id;
  insert into public.actualizaciones_trabajo(trabajo_id,hito_id,usuario_id,tipo,mensaje,progreso,archivos) values(t.id,h.id,auth.uid(),'entrega',btrim(p_mensaje),t.progreso,p_archivos);
  return diime_private.obtener_plan_hitos(t.id);
end; $$;
create function public.entregar_hito(p_trabajo uuid,p_hito uuid,p_mensaje text,p_archivos text[] default '{}') returns jsonb language sql security invoker set search_path='' as $$ select diime_private.entregar_hito(p_trabajo,p_hito,p_mensaje,p_archivos); $$;

create function diime_private.rechazar_entrega_hito(p_trabajo uuid,p_hito uuid,p_mensaje text,p_archivos text[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trabajos; h public.trabajos_hitos;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,auth.uid());
  if not diime_private.empresa_puede_operar_trabajo(p_trabajo,auth.uid(),'encargos','cliente') then raise exception 'Solo el cliente puede revisar este hito' using errcode='42501'; end if;
  select * into t from public.trabajos where id=p_trabajo;
  select * into h from public.trabajos_hitos where id=p_hito and trabajo_id=t.id and activo for update;
  if h.id is null or h.estado<>'entregado' or t.estado<>'en_progreso' or t.pago_bloqueado or t.cancelacion_estado='pendiente'
    or exists(select 1 from public.transacciones_escrow where hito_id=h.id and (liquidacion_operacion_id is not null or stripe_disputa_id is not null)) then raise exception 'Esta entrega ya no admite cambios'; end if;
  if length(btrim(coalesce(p_mensaje,''))) not between 1 and 4000 then raise exception 'Explica qué debe corregirse'; end if;
  if p_archivos is null or cardinality(p_archivos)>5 or exists(select 1 from unnest(p_archivos) u where u is null or u !~ '^https://') then raise exception 'Los archivos adjuntos no son válidos'; end if;
  perform diime_private.validar_adjuntos_actor(p_archivos,auth.uid());
  update public.trabajos_hitos set estado='cambios_solicitados',observaciones_revision=btrim(p_mensaje),updated_at=now() where id=h.id;
  insert into public.actualizaciones_trabajo(trabajo_id,hito_id,usuario_id,tipo,mensaje,progreso,archivos) values(t.id,h.id,auth.uid(),'mensaje','Cambios solicitados: '||btrim(p_mensaje),t.progreso,p_archivos);
  return diime_private.obtener_plan_hitos(t.id);
end; $$;
create function public.rechazar_entrega_hito(p_trabajo uuid,p_hito uuid,p_mensaje text,p_archivos text[] default '{}') returns jsonb language sql security invoker set search_path='' as $$ select diime_private.rechazar_entrega_hito(p_trabajo,p_hito,p_mensaje,p_archivos); $$;

-- The only creation path for milestone payments. The job lock serializes
-- prepare/retry, proposal acceptance, cancellation and payment webhooks.
create function public.preparar_pago_hito(p_trabajo uuid,p_hito uuid,p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.trabajos; h public.trabajos_hitos; e public.transacciones_escrow;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  perform diime_private.validar_actor_cobros_empresa(p_trabajo,p_actor,'cliente');
  if not diime_private.empresa_puede_operar_trabajo(p_trabajo,p_actor,'gestionar_cobros','cliente') then raise exception 'Solo el cliente autorizado puede pagar' using errcode='42501'; end if;
  select * into t from public.trabajos where id=p_trabajo;
  select * into h from public.trabajos_hitos where id=p_hito and trabajo_id=t.id and activo for update;
  if t.modalidad_pago<>'hitos' or h.id is null or h.estado<>'pendiente' or t.estado not in('pendiente_pago','en_progreso') or t.pago_bloqueado or t.cancelacion_estado='pendiente' or t.cancelacion_aceptada_por is not null then raise exception 'El hito no admite un pago en este momento'; end if;
  if h.importe_centimos<50 then raise exception 'Cada hito debe tener un importe mínimo de 0,50 €.'; end if;
  if h.importe_centimos+h.comision_cliente_centimos>99999999 then raise exception 'El cobro de un hito, incluidos los gastos de servicio del cliente, no puede superar 999.999,99 €. Divide ese importe en más hitos.'; end if;
  if t.proveedor_stripe_account_id is null then raise exception 'El proveedor debe completar su configuración de cobros'; end if;
  if exists(select 1 from public.trabajos_planes_hitos where trabajo_id=t.id and estado='pendiente') then raise exception 'Resuelve la propuesta de hitos antes de pagar'; end if;
  if exists(select 1 from public.trabajos_hitos where trabajo_id=t.id and activo and orden<h.orden and estado not in('completado','cancelado')) then raise exception 'Completa el hito anterior antes de pagar el siguiente'; end if;
  if exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and (estado in('pago_tardio','liquidando','disputa') or stripe_disputa_id is not null)) then raise exception 'Hay movimientos pendientes de conciliar'; end if;
  if exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision')) then raise exception 'Hay una disputa pendiente'; end if;
  select * into e from public.transacciones_escrow where hito_id=h.id and estado='pendiente' for update;
  if e.id is not null then return to_jsonb(e); end if;
  if exists(select 1 from public.transacciones_escrow where hito_id=h.id and not ((estado='cancelado' and fecha_retencion is null) or (estado='reembolsado' and liquidacion_estado='completada' and coalesce(liquidacion_contexto->>'tipo'='pago_tardio',false)))) then raise exception 'Este hito ya tiene un pago'; end if;
  insert into public.transacciones_escrow(trabajo_id,hito_id,actor_pago_id,monto_bruto_proveedor,liquidacion_estado,cliente_id,profesional_id,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,monto,estado,stripe_transfer_group)
    values(t.id,h.id,p_actor,h.importe_centimos/100.0,'pendiente',t.cliente_id,t.profesional_id,h.importe_centimos/100.0,h.comision_cliente_centimos/100.0,h.comision_proveedor_centimos/100.0,h.comision_proveedor_centimos/100.0,(h.importe_centimos-h.comision_proveedor_centimos)/100.0,(h.importe_centimos+h.comision_cliente_centimos)/100.0,'pendiente','trabajo_'||t.id||'_hito_'||h.id) returning * into e;
  return to_jsonb(e);
end; $$;
revoke all on function public.preparar_pago_hito(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.preparar_pago_hito(uuid,uuid,uuid) to service_role;

create or replace function public.diime_guardar_checkout_y_contexto() returns trigger language plpgsql security invoker set search_path='' as $$
declare t public.trabajos; h public.trabajos_hitos;
begin
  if tg_op='INSERT' then
    perform public.diime_bloquear_trabajo_financiero(new.trabajo_id);
    select * into t from public.trabajos where id=new.trabajo_id;
    if (t.modalidad_pago='hitos') is distinct from (new.hito_id is not null) then raise exception 'El pago debe corresponder a la modalidad contratada'; end if;
    if new.hito_id is not null then
      select * into h from public.trabajos_hitos where id=new.hito_id and trabajo_id=t.id and activo for update;
      if h.id is null or h.estado<>'pendiente' or new.monto_base is distinct from h.importe_centimos/100.0 or new.comision_cliente is distinct from h.comision_cliente_centimos/100.0 or new.comision_proveedor_original is distinct from h.comision_proveedor_centimos/100.0 then raise exception 'El importe del pago no coincide con el hito acordado'; end if;
      if exists(select 1 from public.trabajos_planes_hitos where trabajo_id=t.id and estado='pendiente') then raise exception 'Hay una propuesta de hitos pendiente'; end if;
      if exists(select 1 from public.trabajos_hitos where trabajo_id=t.id and activo and orden<h.orden and estado not in('completado','cancelado')) then raise exception 'Completa el hito anterior'; end if;
    end if;
    if new.estado='pendiente' and (t.estado not in('pendiente_pago','en_progreso') or (new.hito_id is null and t.estado<>'pendiente_pago') or t.pago_bloqueado or t.cancelacion_estado='pendiente') then raise exception 'El trabajo no admite preparar un pago en este momento'; end if;
  elsif new.hito_id is distinct from old.hito_id then raise exception 'Un pago no puede trasladarse a otro hito';
  end if;
  if tg_op='UPDATE' and old.liquidacion_contexto is not null and new.liquidacion_contexto is distinct from old.liquidacion_contexto then raise exception 'El destino y la decisión de una liquidación ya iniciada son inmutables'; end if;
  return new;
end; $$;

create function public.guardar_estado_trabajo_hitos() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.modalidad_pago='hitos' and new.estado is distinct from old.estado then
    if new.estado='entregado' then raise exception 'Este trabajo se entrega y aprueba hito a hito'; end if;
    if new.estado='completado' and exists(select 1 from public.trabajos_hitos where trabajo_id=old.id and activo and estado not in('completado','cancelado')) then raise exception 'Faltan hitos por completar'; end if;
  end if;
  return new;
end; $$;
create trigger trg_hitos_estado_trabajo before update on public.trabajos for each row execute function public.guardar_estado_trabajo_hitos();

-- All privileged entry points are private; public wrappers are invokers and
-- authenticated only. Internal helpers have no direct API grant.
do $grants$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','diime_private') and p.proname in('obtener_plan_oferta','proponer_plan_oferta','responder_plan_oferta','obtener_plan_hitos','proponer_plan_trabajo','responder_plan_trabajo','entregar_hito','rechazar_entrega_hito') loop
    execute 'revoke all on function '||f.signature||' from public,anon,authenticated'; execute 'grant execute on function '||f.signature||' to authenticated';
  end loop;
end; $grants$;
revoke all on function private.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz,integer),public.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz,integer) from public,anon,authenticated;
grant execute on function private.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz,integer),public.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz,integer) to authenticated;
revoke all on function diime_private.materializar_plan_hitos(uuid,jsonb),diime_private.validar_cambio_plan_trabajo(uuid,jsonb),diime_private.iniciar_contrato_hitos(),diime_private.crear_hitos_contrato(),diime_private.guardar_plan_solicitud(),public.guardar_integridad_plan_oferta(),public.guardar_estado_trabajo_hitos() from public,anon,authenticated;
-- Extend only the rows already authorized by the company workspace and the
-- billing document. This adds no cross-company SELECT grants.
do $projection$ declare definition text; key text; begin
  definition:=pg_get_functiondef('diime_private.empresa_workspace()'::regprocedure);
  foreach key in array array['s','o','t'] loop
    if position('''estado'','||key||'.estado,' in definition)=0 then raise exception 'Company operation projection changed'; end if;
    definition:=replace(definition,'''estado'','||key||'.estado,','''estado'','||key||'.estado,''modalidad_pago'','||key||'.modalidad_pago,'||case when key='s' then '''hitos_sugeridos'',s.hitos_sugeridos,' else '''plan_version'','||key||'.plan_version,' end);
  end loop;
  execute definition;
  if to_regprocedure('diime_private.documento_contratacion(uuid)') is not null then
    definition:=pg_get_functiondef('diime_private.documento_contratacion(uuid)'::regprocedure);
    if position('''precio_acordado'',t.precio_acordado,' in definition)=0 then raise exception 'Contract document projection changed'; end if;
    execute replace(definition,'''precio_acordado'',t.precio_acordado,','''modalidad_pago'',t.modalidad_pago,''plan_version'',t.plan_version,''estado'',t.estado,''precio_acordado'',t.precio_acordado,');
  end if;
end; $projection$;
notify pgrst,'reload schema';
commit;
