begin;

-- Review evidence is private. Approval is stored separately from user-editable
-- project fields, and every content change produces a new revision to review.
alter table public.portfolio add column evidencia_acreditacion text check(length(evidencia_acreditacion)<=4000);
alter table diime_private.empresa_portfolio add column evidencia_acreditacion text check(length(evidencia_acreditacion)<=4000);
create table diime_private.portfolio_acreditaciones (
 tipo text not null check(tipo in ('personal','empresa')),
 item_id uuid not null,
 revision_id uuid not null default gen_random_uuid(),
 estado text not null default 'pendiente' check(estado in ('pendiente','acreditado','requiere_informacion')),
 nota text,
 revisado_por uuid references public.profiles(id) on delete set null,
 presentado_en timestamptz not null default now(),
 revisado_en timestamptz,
 primary key(tipo,item_id)
);
alter table diime_private.portfolio_acreditaciones enable row level security;
revoke all on diime_private.portfolio_acreditaciones from public,anon,authenticated,service_role;
create table diime_private.portfolio_acreditaciones_historial (
 id uuid primary key default gen_random_uuid(), tipo text not null, item_id uuid not null,
 revision_id uuid not null, decision text not null, nota text not null,
 revisado_por uuid references public.profiles(id) on delete set null, revisado_en timestamptz not null default now()
);
alter table diime_private.portfolio_acreditaciones_historial enable row level security;
revoke all on diime_private.portfolio_acreditaciones_historial from public,anon,authenticated,service_role;

create function diime_private.portfolio_reiniciar_acreditacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_tipo text:=case when tg_table_schema='public' then 'personal' else 'empresa' end;
begin
 if tg_op='DELETE' then
  delete from diime_private.portfolio_acreditaciones a where a.tipo=v_tipo and a.item_id=old.id;
  return old;
 end if;
 if tg_op='UPDATE' and (to_jsonb(new)-'updated_at'-'visible')=(to_jsonb(old)-'updated_at'-'visible') then return new; end if;
 insert into diime_private.portfolio_acreditaciones(tipo,item_id)
 values(v_tipo,new.id)
 on conflict (tipo,item_id) do update set revision_id=gen_random_uuid(),estado='pendiente',nota=null,
   revisado_por=null,presentado_en=now(),revisado_en=null;
 return new;
end; $$;
revoke all on function diime_private.portfolio_reiniciar_acreditacion() from public,anon,authenticated,service_role;
create trigger portfolio_acreditacion_revision after insert or update or delete on public.portfolio
 for each row execute function diime_private.portfolio_reiniciar_acreditacion();
create trigger empresa_portfolio_acreditacion_revision after insert or update or delete on diime_private.empresa_portfolio
 for each row execute function diime_private.portfolio_reiniciar_acreditacion();
insert into diime_private.portfolio_acreditaciones(tipo,item_id) select 'personal',id from public.portfolio;
insert into diime_private.portfolio_acreditaciones(tipo,item_id) select 'empresa',id from diime_private.empresa_portfolio;

-- A historical work ID is insufficient: its current completion and ownership
-- must still match. External projects require a Diime review of this revision.
create function diime_private.portfolio_publicable(p_tipo text,p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case p_tipo
 when 'personal' then exists(select 1 from public.portfolio p where p.id=p_id and p.visible and
  ((p.trabajo_id is not null and exists(select 1 from public.trabajos t where t.id=p.trabajo_id and t.estado='completado' and t.profesional_id=p.profesional_id))
   or (p.trabajo_id is null and exists(select 1 from diime_private.portfolio_acreditaciones a where a.tipo=p_tipo and a.item_id=p.id and a.estado='acreditado'))))
 when 'empresa' then exists(select 1 from diime_private.empresa_portfolio p where p.id=p_id and p.visible and
  ((p.trabajo_id is not null and exists(select 1 from public.trabajos t where t.id=p.trabajo_id and t.estado='completado' and t.empresa_proveedora_id=p.empresa_id))
   or (p.trabajo_id is null and exists(select 1 from diime_private.portfolio_acreditaciones a where a.tipo=p_tipo and a.item_id=p.id and a.estado='acreditado'))))
 else false end;
$$;
revoke all on function diime_private.portfolio_publicable(text,uuid) from public,anon,authenticated,service_role;
grant execute on function diime_private.portfolio_publicable(text,uuid) to anon,authenticated;
-- Restrictive policy protects against any older permissive SELECT policy.
create policy portfolio_solo_acreditados on public.portfolio as restrictive for select to anon,authenticated
 using(profesional_id=(select auth.uid()) or diime_private.portfolio_publicable('personal',id));

create function diime_private.mis_acreditaciones_portfolio(p_tipo text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare empresa uuid;
begin
 if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
 if p_tipo='empresa' then empresa:=diime_private.empresa_exigir_permiso('perfil');
 elsif p_tipo<>'personal' then raise exception 'Tipo de portfolio no válido'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.item_id,'acreditacion',a.estado,'nota_acreditacion',a.nota))
  from diime_private.portfolio_acreditaciones a where a.tipo=p_tipo and
  ((p_tipo='personal' and exists(select 1 from public.portfolio p where p.id=a.item_id and p.profesional_id=auth.uid()))
    or (p_tipo='empresa' and exists(select 1 from diime_private.empresa_portfolio p where p.id=a.item_id and p.empresa_id=empresa)))),'[]');
end; $$;

create function diime_private.portfolio_acreditaciones_listar()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and es_admin and cuenta_eliminada is null) then
  raise exception 'Solo el equipo de Diime puede revisar proyectos.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.presentado_en) from (
  select a.*,p.titulo,p.descripcion,p.imagenes,p.evidencia_acreditacion,p.contexto_proveedor,
   u.nombre as proveedor,p.profesional_id as proveedor_id
  from diime_private.portfolio_acreditaciones a join public.portfolio p on a.tipo='personal' and a.item_id=p.id
  join public.profiles u on u.id=p.profesional_id where p.trabajo_id is null
  union all
  select a.*,p.titulo,p.descripcion,p.imagenes,p.evidencia_acreditacion,p.contexto_proveedor,
   e.nombre as proveedor,p.empresa_id as proveedor_id
  from diime_private.portfolio_acreditaciones a join diime_private.empresa_portfolio p on a.tipo='empresa' and a.item_id=p.id
  join public.empresas e on e.id=p.empresa_id where p.trabajo_id is null
 ) q),'[]');
end; $$;

create function diime_private.portfolio_acreditacion_revisar(p_tipo text,p_item_id uuid,p_revision_id uuid,p_decision text,p_nota text)
returns void language plpgsql security definer set search_path='' as $$
declare revision diime_private.portfolio_acreditaciones; propietario uuid; empresa uuid; evidencia text; trabajo uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and es_admin and cuenta_eliminada is null) then
  raise exception 'Solo el equipo de Diime puede revisar proyectos.' using errcode='42501'; end if;
 if p_decision not in ('acreditado','requiere_informacion') or length(btrim(coalesce(p_nota,''))) not between 10 and 2000 then
  raise exception 'Indica una decisión y el motivo de la revisión (10–2.000 caracteres).' using errcode='22023'; end if;
 -- Lock project before review, matching the write trigger lock order.
 if p_tipo='personal' then
  select p.profesional_id,p.evidencia_acreditacion,p.trabajo_id into propietario,evidencia,trabajo from public.portfolio p where p.id=p_item_id for share;
 elsif p_tipo='empresa' then
  select p.creado_por,p.empresa_id,p.evidencia_acreditacion,p.trabajo_id into propietario,empresa,evidencia,trabajo from diime_private.empresa_portfolio p where p.id=p_item_id for share;
 else raise exception 'Tipo de portfolio no válido'; end if;
 if not found or trabajo is not null then raise exception 'Este proyecto no está disponible para revisión.' using errcode='22023'; end if;
 if propietario=auth.uid() or exists(select 1 from public.empresa_miembros m where m.empresa_id=empresa and m.usuario_id=auth.uid()) then
  raise exception 'No puedes acreditar tus propios proyectos ni los de tu empresa.' using errcode='42501'; end if;
 select * into revision from diime_private.portfolio_acreditaciones a where a.tipo=p_tipo and a.item_id=p_item_id for update;
 if revision.revision_id is distinct from p_revision_id then raise exception 'El proyecto ha cambiado. Recarga antes de revisar.' using errcode='40001'; end if;
 if p_decision='acreditado' and length(btrim(coalesce(evidencia,'')))<20 then
  raise exception 'Faltan referencias o evidencias para acreditar este proyecto.' using errcode='22023'; end if;
 update diime_private.portfolio_acreditaciones a set estado=p_decision,nota=btrim(p_nota),revisado_por=auth.uid(),revisado_en=now()
 where a.tipo=p_tipo and a.item_id=p_item_id;
 insert into diime_private.portfolio_acreditaciones_historial(tipo,item_id,revision_id,decision,nota,revisado_por)
 values(p_tipo,p_item_id,p_revision_id,p_decision,btrim(p_nota),auth.uid());
end; $$;

create function public.mis_acreditaciones_portfolio(p_tipo text) returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.mis_acreditaciones_portfolio(p_tipo); $$;
create function public.portfolio_acreditaciones_listar() returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.portfolio_acreditaciones_listar(); $$;
create function public.portfolio_acreditacion_revisar(p_tipo text,p_item_id uuid,p_revision_id uuid,p_decision text,p_nota text) returns void language sql security invoker set search_path='' as $$ select diime_private.portfolio_acreditacion_revisar(p_tipo,p_item_id,p_revision_id,p_decision,p_nota); $$;
revoke all on function public.mis_acreditaciones_portfolio(text),diime_private.mis_acreditaciones_portfolio(text),
 public.portfolio_acreditaciones_listar(),diime_private.portfolio_acreditaciones_listar(),
 public.portfolio_acreditacion_revisar(text,uuid,uuid,text,text),diime_private.portfolio_acreditacion_revisar(text,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.mis_acreditaciones_portfolio(text),diime_private.mis_acreditaciones_portfolio(text),
 public.portfolio_acreditaciones_listar(),diime_private.portfolio_acreditaciones_listar(),
 public.portfolio_acreditacion_revisar(text,uuid,uuid,text,text),diime_private.portfolio_acreditacion_revisar(text,uuid,uuid,text,text) to authenticated;
create or replace function diime_private.empresa_portfolio_guardar(p_datos jsonb,p_item_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
<<datos>>
declare
  empresa uuid:=diime_private.empresa_exigir_permiso('perfil');
  item uuid:=coalesce(p_item_id,gen_random_uuid());
  trabajo uuid;
  titulo text:=nullif(btrim(p_datos->>'titulo'),'');
  descripcion text:=nullif(btrim(p_datos->>'descripcion'),'');
  categoria text:=nullif(btrim(p_datos->>'categoria'),'');
  ubicacion text:=nullif(btrim(p_datos->>'ubicacion'),'');
  imagen text:=nullif(btrim(p_datos->>'imagen_url'),'');
  presupuesto numeric;
  participantes uuid[]:=array[auth.uid()];
begin
  if p_datos is null or jsonb_typeof(p_datos)<>'object' then
    raise exception 'Revisa los datos del proyecto.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_each(p_datos) campo where campo.key not in
      ('titulo','descripcion','imagen_url','categoria','fecha_completado','ubicacion','duracion','presupuesto','trabajo_id','contexto_proveedor','evidencia_acreditacion')
      or (campo.key<>'presupuesto' and jsonb_typeof(campo.value) not in ('string','null'))) then
    raise exception 'Revisa los datos del proyecto.' using errcode='22023';
  end if;
  if p_datos?'presupuesto' and jsonb_typeof(p_datos->'presupuesto') not in ('number','null') then
    raise exception 'Indica un presupuesto válido.' using errcode='22023';
  end if;
  trabajo:=nullif(p_datos->>'trabajo_id','')::uuid;
  presupuesto:=(p_datos->>'presupuesto')::numeric;
  if p_item_id is not null and not exists(select 1 from diime_private.empresa_portfolio p where p.id=p_item_id and p.empresa_id=empresa) then
    raise exception 'Ese proyecto no está disponible para tu empresa.' using errcode='42501';
  end if;
  if trabajo is not null then
    select s.titulo,s.descripcion,c.nombre,s.ubicacion,array[t.profesional_id]
      into titulo,descripcion,categoria,ubicacion,participantes
      from public.trabajos t join public.solicitudes s on s.id=t.solicitud_id
      left join public.categorias c on c.id=s.categoria_id
      where t.id=trabajo and t.empresa_proveedora_id=empresa and t.estado='completado';
    if not found then raise exception 'Ese trabajo no está disponible para el portfolio.' using errcode='42501'; end if;
  end if;
  if titulo is null or descripcion is null then raise exception 'Completa título y descripción.' using errcode='22023'; end if;
  if imagen is not null and (length(imagen)>2048 or imagen !~ '^https://[^[:space:]@]+$') then
    raise exception 'La imagen debe estar alojada mediante https://' using errcode='22023';
  end if;
  if presupuesto is not null and presupuesto not between 0 and 99999999.99 then
    raise exception 'Indica un presupuesto válido.' using errcode='22023';
  end if;
  if p_item_id is null then
    insert into diime_private.empresa_portfolio(id,empresa_id,trabajo_id,creado_por,titulo,descripcion,categoria,
      imagenes,ubicacion,duracion,presupuesto,fecha_proyecto,contexto_proveedor,participantes_ids,evidencia_acreditacion)
    values(item,empresa,trabajo,auth.uid(),titulo,descripcion,categoria,
      case when imagen is null then '{}'::text[] else array[imagen] end,ubicacion,nullif(btrim(p_datos->>'duracion'),''),
      presupuesto,nullif(p_datos->>'fecha_completado','')::date,nullif(btrim(p_datos->>'contexto_proveedor'),''),participantes,nullif(btrim(p_datos->>'evidencia_acreditacion'),''));
  else
    update diime_private.empresa_portfolio p set trabajo_id=trabajo,titulo=datos.titulo,
      descripcion=datos.descripcion,categoria=datos.categoria,
      imagenes=case when imagen is null then '{}'::text[] else array[imagen] end,ubicacion=datos.ubicacion,
      duracion=nullif(btrim(p_datos->>'duracion'),''),presupuesto=datos.presupuesto,
      fecha_proyecto=nullif(p_datos->>'fecha_completado','')::date,contexto_proveedor=nullif(btrim(p_datos->>'contexto_proveedor'),''),
      evidencia_acreditacion=nullif(btrim(p_datos->>'evidencia_acreditacion'),''),participantes_ids=participantes,updated_at=now()
      where p.id=item and p.empresa_id=empresa;
    if not found then raise exception 'Ese proyecto no está disponible para tu empresa.' using errcode='42501'; end if;
  end if;
  perform diime_private.empresa_registrar_actividad(empresa,case when p_item_id is null then 'Proyecto añadido al portfolio' else 'Proyecto del portfolio actualizado' end,
    'portfolio',item,jsonb_build_object('titulo',titulo));
  return jsonb_build_object('id',item);
end; $$;

create or replace function diime_private.empresa_portfolio()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('perfil');
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'trabajo_id',p.trabajo_id,'titulo',p.titulo,
    'descripcion',p.descripcion,'categoria',p.categoria,'imagenes',p.imagenes,'ubicacion',p.ubicacion,
    'duracion',p.duracion,'presupuesto',p.presupuesto,'fecha_proyecto',p.fecha_proyecto,
    'contexto_proveedor',p.contexto_proveedor,'evidencia_acreditacion',p.evidencia_acreditacion,'visible',p.visible,'created_at',p.created_at)
    order by p.created_at desc,p.id) from diime_private.empresa_portfolio p where p.empresa_id=empresa),'[]');
end; $$;

create or replace function diime_private.empresa_portfolio_publico(p_empresa_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'trabajo_id',p.trabajo_id,'titulo',p.titulo,
    'descripcion',p.descripcion,'categoria',p.categoria,'ubicacion',p.ubicacion,'duracion',p.duracion,
    'contexto_proveedor',p.contexto_proveedor,'imagenes',p.imagenes,'imagen',p.imagenes[1],
    'rango_precio',case when p.presupuesto is null or p.presupuesto<=0 then null
      when p.presupuesto<100 then 'Menos de 100 €' when p.presupuesto<250 then '100–250 €'
      when p.presupuesto<500 then '250–500 €' when p.presupuesto<1000 then '500–1.000 €'
      when p.presupuesto<2500 then '1.000–2.500 €' when p.presupuesto<5000 then '2.500–5.000 €'
      when p.presupuesto<10000 then '5.000–10.000 €' when p.presupuesto<25000 then '10.000–25.000 €'
      when p.presupuesto<50000 then '25.000–50.000 €' when p.presupuesto<100000 then '50.000–100.000 €'
      else 'Más de 100.000 €' end,'fecha_proyecto',p.fecha_proyecto,'created_at',p.created_at,
    'participantes_ids',p.participantes_ids,'acreditacion',case when p.trabajo_id is not null then 'diime' else 'acreditado' end) order by p.created_at desc,p.id),'[]')
  from diime_private.empresa_portfolio p where p.empresa_id=p_empresa_id and diime_private.portfolio_publicable('empresa',p.id);
$$;
create or replace function public.portfolio_publico(p_profesional_id uuid)
returns table (
  id uuid,
  trabajo_id uuid,
  titulo text,
  descripcion text,
  categoria text,
  imagenes text[],
  ubicacion text,
  duracion text,
  fecha_proyecto date,
  contexto_proveedor text,
  tramo_precio smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.trabajo_id,
    p.titulo,
    p.descripcion,
    p.categoria,
    p.imagenes,
    p.ubicacion,
    p.duracion,
    p.fecha_proyecto,
    p.contexto_proveedor,
    case
      when p.presupuesto is null or p.presupuesto <= 0 then null
      when p.presupuesto < 100 then 0
      when p.presupuesto < 250 then 1
      when p.presupuesto < 500 then 2
      when p.presupuesto < 1000 then 3
      when p.presupuesto < 2500 then 4
      when p.presupuesto < 5000 then 5
      when p.presupuesto < 10000 then 6
      when p.presupuesto < 25000 then 7
      when p.presupuesto < 50000 then 8
      when p.presupuesto < 100000 then 9
      else 10
    end::smallint as tramo_precio
  from public.portfolio p
  where p.profesional_id = p_profesional_id
    and diime_private.portfolio_publicable('personal',p.id)
  order by p.fecha_proyecto desc nulls last, p.created_at desc;
$$;


notify pgrst,'reload schema';
commit;
