-- La autoría histórica no mantiene el acceso fiscal tras revocar un miembro
-- o reasignar el encargo. Se conserva íntegro el snapshot contratado.
create or replace function diime_private.facturacion_trabajo(p_trabajo_id uuid)
returns table(parte text,empresa_nombre text,empresa_cif text,empresa_ubicacion text,empresa_email text,
  persona_nombre text,persona_apellido text,persona_documento text,persona_cargo text)
language plpgsql stable security definer set search_path='' as $$
declare t public.trabajos%rowtype; actor uuid:=auth.uid(); datos jsonb;
begin
  if actor is null or not exists(select 1 from public.profiles p where p.id=actor and p.cuenta_eliminada is null) then return; end if;
  select * into t from public.trabajos where id=p_trabajo_id;
  if not found or (
    not diime_private.empresa_puede_operar_trabajo(t.id,actor,'ver_cobros')
    and not exists(select 1 from public.profiles p where p.id=actor and p.es_admin=true)
  ) then return; end if;
  select f.datos into datos from diime_private.trabajos_facturacion f where f.trabajo_id=t.id;
  if datos is not null then
    return query select x.parte,x.empresa_nombre,x.empresa_cif,x.empresa_ubicacion,x.empresa_email,
      x.persona_nombre,x.persona_apellido,x.persona_documento,x.persona_cargo
      from jsonb_to_recordset(datos) x(parte text,empresa_nombre text,empresa_cif text,empresa_ubicacion text,empresa_email text,
        persona_nombre text,persona_apellido text,persona_documento text,persona_cargo text);
    return;
  end if;
  -- Misma compatibilidad sin backfill que la función anterior.
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

-- La lectura directa por PostgREST debe usar el mismo permiso vigente. No se
-- modifican las políticas administrativas ni ninguna política de escritura.
alter policy "Usuarios pueden ver sus transacciones" on public.transacciones_escrow
  to authenticated
  using (public.empresa_puede_operar_trabajo(trabajo_id,'ver_cobros',null));
