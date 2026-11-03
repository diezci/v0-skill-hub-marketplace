begin;

-- Company projects belong to the company, independently of the employee who
-- originally published them. Exact budgets stay outside the Data API.
create table diime_private.empresa_portfolio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  trabajo_id uuid references public.trabajos(id) on delete set null,
  creado_por uuid references public.profiles(id) on delete set null,
  titulo text not null,
  descripcion text,
  categoria text,
  imagenes text[] not null default '{}',
  ubicacion text,
  duracion text,
  presupuesto numeric(10,2),
  fecha_proyecto date,
  contexto_proveedor text,
  visible boolean not null default true,
  participantes_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table diime_private.empresa_portfolio enable row level security;
revoke all on diime_private.empresa_portfolio from public,anon,authenticated,service_role;
create index empresa_portfolio_empresa_fecha_idx on diime_private.empresa_portfolio(empresa_id,created_at desc);
create index empresa_portfolio_trabajo_idx on diime_private.empresa_portfolio(trabajo_id) where trabajo_id is not null;

-- Preserve every historical company portfolio entry and its original ID.
-- Personal portfolios and contracts are not updated or deleted.
insert into diime_private.empresa_portfolio(id,empresa_id,trabajo_id,creado_por,titulo,descripcion,categoria,
  imagenes,ubicacion,duracion,presupuesto,fecha_proyecto,contexto_proveedor,visible,participantes_ids,created_at)
select p.id,t.empresa_proveedora_id,case when t.estado='completado' then p.trabajo_id end,p.profesional_id,p.titulo,p.descripcion,p.categoria,
  coalesce(p.imagenes,'{}'),p.ubicacion,p.duracion,p.presupuesto,p.fecha_proyecto,p.contexto_proveedor,p.visible,
  array[p.profesional_id],coalesce(p.created_at,now())
from public.portfolio p join public.trabajos t on t.id=p.trabajo_id where t.empresa_proveedora_id is not null;

create function diime_private.empresa_portfolio_guardar(p_datos jsonb,p_item_id uuid default null)
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
      ('titulo','descripcion','imagen_url','categoria','fecha_completado','ubicacion','duracion','presupuesto','trabajo_id','contexto_proveedor')
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
      imagenes,ubicacion,duracion,presupuesto,fecha_proyecto,contexto_proveedor,participantes_ids)
    values(item,empresa,trabajo,auth.uid(),titulo,descripcion,categoria,
      case when imagen is null then '{}'::text[] else array[imagen] end,ubicacion,nullif(btrim(p_datos->>'duracion'),''),
      presupuesto,nullif(p_datos->>'fecha_completado','')::date,nullif(btrim(p_datos->>'contexto_proveedor'),''),participantes);
  else
    update diime_private.empresa_portfolio p set trabajo_id=trabajo,titulo=datos.titulo,
      descripcion=datos.descripcion,categoria=datos.categoria,
      imagenes=case when imagen is null then '{}'::text[] else array[imagen] end,ubicacion=datos.ubicacion,
      duracion=nullif(btrim(p_datos->>'duracion'),''),presupuesto=datos.presupuesto,
      fecha_proyecto=nullif(p_datos->>'fecha_completado','')::date,contexto_proveedor=nullif(btrim(p_datos->>'contexto_proveedor'),''),
      participantes_ids=participantes,updated_at=now()
      where p.id=item and p.empresa_id=empresa;
    if not found then raise exception 'Ese proyecto no está disponible para tu empresa.' using errcode='42501'; end if;
  end if;
  perform diime_private.empresa_registrar_actividad(empresa,case when p_item_id is null then 'Proyecto añadido al portfolio' else 'Proyecto del portfolio actualizado' end,
    'portfolio',item,jsonb_build_object('titulo',titulo));
  return jsonb_build_object('id',item);
end; $$;

create function diime_private.empresa_portfolio_eliminar(p_item_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('perfil'); titulo text;
begin
  delete from diime_private.empresa_portfolio p where p.id=p_item_id and p.empresa_id=empresa returning p.titulo into titulo;
  if not found then raise exception 'Ese proyecto no está disponible para tu empresa.' using errcode='42501'; end if;
  perform diime_private.empresa_registrar_actividad(empresa,'Proyecto eliminado del portfolio','portfolio',p_item_id,jsonb_build_object('titulo',titulo));
end; $$;

create function diime_private.empresa_portfolio()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('perfil');
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'trabajo_id',p.trabajo_id,'titulo',p.titulo,
    'descripcion',p.descripcion,'categoria',p.categoria,'imagenes',p.imagenes,'ubicacion',p.ubicacion,
    'duracion',p.duracion,'presupuesto',p.presupuesto,'fecha_proyecto',p.fecha_proyecto,
    'contexto_proveedor',p.contexto_proveedor,'visible',p.visible,'created_at',p.created_at)
    order by p.created_at desc,p.id) from diime_private.empresa_portfolio p where p.empresa_id=empresa),'[]');
end; $$;

create function diime_private.empresa_trabajos_completados_portfolio()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('perfil');
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'ubicacion',t.ubicacion,'precio_acordado',t.precio_acordado,
    'fecha_fin',t.fecha_fin,'oferta',jsonb_build_object('archivos',coalesce(o.archivos,'[]')),
    'solicitud',jsonb_build_object('titulo',s.titulo,'descripcion',s.descripcion,'ubicacion',s.ubicacion,
      'categoria',jsonb_build_object('nombre',c.nombre))) order by t.fecha_fin desc nulls last,t.id)
    from public.trabajos t join public.solicitudes s on s.id=t.solicitud_id
    left join public.categorias c on c.id=s.categoria_id left join public.ofertas o on o.id=t.oferta_id
    where t.empresa_proveedora_id=empresa and t.estado='completado'),'[]');
end; $$;

-- Only called inside the existing authorized public/private profile projections.
-- Never expose this helper directly: it can also assemble unverified profiles.
create function diime_private.empresa_portfolio_publico(p_empresa_id uuid)
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
    'participantes_ids',p.participantes_ids) order by p.created_at desc,p.id),'[]')
  from diime_private.empresa_portfolio p where p.empresa_id=p_empresa_id and p.visible;
$$;
revoke all on function diime_private.empresa_portfolio_publico(uuid) from public,anon,authenticated,service_role;

create function public.empresa_portfolio_guardar(p_datos jsonb,p_item_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select diime_private.empresa_portfolio_guardar(p_datos,p_item_id); $$;
create function public.empresa_portfolio_eliminar(p_item_id uuid)
returns void language sql security invoker set search_path='' as $$ select diime_private.empresa_portfolio_eliminar(p_item_id); $$;
create function public.empresa_portfolio()
returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.empresa_portfolio(); $$;
create function public.empresa_trabajos_completados_portfolio()
returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.empresa_trabajos_completados_portfolio(); $$;
revoke all on function public.empresa_portfolio_guardar(jsonb,uuid),diime_private.empresa_portfolio_guardar(jsonb,uuid),
  public.empresa_portfolio_eliminar(uuid),diime_private.empresa_portfolio_eliminar(uuid),
  public.empresa_portfolio(),diime_private.empresa_portfolio(),public.empresa_trabajos_completados_portfolio(),
  diime_private.empresa_trabajos_completados_portfolio() from public,anon,authenticated,service_role;
grant execute on function public.empresa_portfolio_guardar(jsonb,uuid),diime_private.empresa_portfolio_guardar(jsonb,uuid),
  public.empresa_portfolio_eliminar(uuid),diime_private.empresa_portfolio_eliminar(uuid),
  public.empresa_portfolio(),diime_private.empresa_portfolio(),public.empresa_trabajos_completados_portfolio(),
  diime_private.empresa_trabajos_completados_portfolio() to authenticated;

notify pgrst,'reload schema';
commit;
