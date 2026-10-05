-- Los justificantes usan la identidad fiscal contratada. El snapshot es privado:
-- un select('*') de trabajos no incorpora documentos ni datos fiscales ajenos.
-- No reconstruimos ni reatribuimos contratos históricos con datos inventados.
create table diime_private.trabajos_facturacion (
  trabajo_id uuid primary key references public.trabajos(id) on delete cascade,
  datos jsonb not null check (jsonb_typeof(datos)='array'),
  creado_at timestamptz not null default now()
);
alter table diime_private.trabajos_facturacion enable row level security;
revoke all on diime_private.trabajos_facturacion from public,anon,authenticated,service_role;

create or replace function diime_private.sellar_facturacion_trabajo()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into diime_private.trabajos_facturacion(trabajo_id,datos)
  select new.id,jsonb_agg(jsonb_build_object(
    'parte',d.parte,'empresa_nombre',e.nombre,'empresa_cif',e.cif,
    'empresa_ubicacion',e.ubicacion,'empresa_email',e.email,
    'persona_nombre',p.nombre,'persona_apellido',p.apellido,
    'persona_documento',case when d.empresa_id is null then p.documento else null end,
    'persona_cargo',case when d.empresa_id is not null then m.cargo else null end
  ) order by d.parte)
  from (values ('cliente',new.cliente_id,new.empresa_cliente_id),
               ('profesional',new.profesional_id,new.empresa_proveedora_id)) d(parte,usuario_id,empresa_id)
  join public.profiles p on p.id=d.usuario_id
  left join public.empresas e on e.id=d.empresa_id
  left join public.empresa_miembros m on m.usuario_id=d.usuario_id and m.empresa_id=d.empresa_id;
  return new;
end; $$;
revoke all on function diime_private.sellar_facturacion_trabajo() from public,anon,authenticated,service_role;
-- AFTER INSERT ve la identidad que ya sellaron las guardas BEFORE INSERT.
create trigger zz_empresa_sellar_facturacion after insert on public.trabajos
  for each row execute function diime_private.sellar_facturacion_trabajo();

create or replace function diime_private.facturacion_trabajo(p_trabajo_id uuid)
returns table(parte text,empresa_nombre text,empresa_cif text,empresa_ubicacion text,empresa_email text,
  persona_nombre text,persona_apellido text,persona_documento text,persona_cargo text)
language plpgsql stable security definer set search_path='' as $$
declare t public.trabajos%rowtype; actor uuid:=auth.uid(); datos jsonb;
begin
  if actor is null or not exists(select 1 from public.profiles p where p.id=actor and p.cuenta_eliminada is null) then return; end if;
  select * into t from public.trabajos where id=p_trabajo_id;
  if not found or (actor is distinct from t.cliente_id and actor is distinct from t.profesional_id
    and not exists(select 1 from public.profiles p where p.id=actor and p.es_admin=true)) then return; end if;
  select f.datos into datos from diime_private.trabajos_facturacion f where f.trabajo_id=t.id;
  if datos is not null then
    return query select x.parte,x.empresa_nombre,x.empresa_cif,x.empresa_ubicacion,x.empresa_email,
      x.persona_nombre,x.persona_apellido,x.persona_documento,x.persona_cargo
      from jsonb_to_recordset(datos) x(parte text,empresa_nombre text,empresa_cif text,empresa_ubicacion text,empresa_email text,
        persona_nombre text,persona_apellido text,persona_documento text,persona_cargo text);
    return;
  end if;
  -- Compatibilidad sin backfill: sólo la generación anterior conserva el lookup
  -- anterior. Si un contrato nuevo carece de snapshot, usa su identidad sellada.
  return query select d.parte::text,e.nombre,e.cif,e.ubicacion,e.email,p.nombre,p.apellido,
    case when d.empresa_id is null then p.documento else null end,
    case when t.actor_contratacion_id is null then p.cargo_empresa else m.cargo end
  from (
    select v.parte,v.usuario_id,case when t.actor_contratacion_id is null then p0.empresa_id else v.empresa_id end empresa_id
    from (values ('cliente',t.cliente_id,t.empresa_cliente_id),('profesional',t.profesional_id,t.empresa_proveedora_id)) v(parte,usuario_id,empresa_id)
    join public.profiles p0 on p0.id=v.usuario_id
  ) d join public.profiles p on p.id=d.usuario_id
  left join public.empresas e on e.id=d.empresa_id
  left join public.empresa_miembros m on m.usuario_id=d.usuario_id and m.empresa_id=d.empresa_id;
end; $$;
revoke all on function diime_private.facturacion_trabajo(uuid) from public,anon;
grant execute on function diime_private.facturacion_trabajo(uuid) to authenticated;

create or replace function public.facturacion_trabajo(p_trabajo_id uuid)
returns table(parte text,empresa_nombre text,empresa_cif text,empresa_ubicacion text,empresa_email text,
  persona_nombre text,persona_apellido text,persona_documento text,persona_cargo text)
language sql stable security invoker set search_path='' as $$
  select * from diime_private.facturacion_trabajo(p_trabajo_id);
$$;
revoke all on function public.facturacion_trabajo(uuid) from public,anon;
grant execute on function public.facturacion_trabajo(uuid) to authenticated;
