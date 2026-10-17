-- Vincular un contrato requiere una participación vigente, también por API.
-- Un reporte general sigue siendo posible sin asociar un trabajo.
create or replace function diime_private.validar_alta_incidencia()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or new.reportado_por is distinct from auth.uid() then
    raise exception 'No autenticado' using errcode='42501';
  end if;
  if new.trabajo_id is not null and not diime_private.empresa_puede_operar_trabajo(new.trabajo_id,auth.uid(),'encargos') then
    raise exception 'Solo puedes asociar una incidencia a un trabajo en el que participas' using errcode='42501';
  end if;
  if new.trabajo_id is not null and new.usuario_reportado is not null and not exists (
    select 1 from public.trabajos t where t.id=new.trabajo_id and
      new.usuario_reportado in (t.cliente_id,t.profesional_id,t.operador_cliente_id,t.operador_proveedor_id)
  ) then
    raise exception 'El usuario reportado no participa en el trabajo seleccionado' using errcode='42501';
  end if;
  -- No se pueden fabricar respuestas, resoluciones o fechas mediante INSERT.
  new.estado := 'abierta';
  new.notas_admin := null;
  new.resuelto_por := null;
  new.fecha_resolucion := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end; $$;
revoke all on function diime_private.validar_alta_incidencia() from public,anon,authenticated,service_role;
create trigger validar_alta_incidencia before insert on public.incidencias
  for each row execute function diime_private.validar_alta_incidencia();

-- El selector y la inserción comparten el mismo permiso, incluidos operadores
-- reasignados y administradores de empresa que pueden gestionar el encargo.
create function diime_private.trabajos_para_incidencia()
returns table(id uuid,titulo text,estado text,otra_parte_id uuid)
language sql stable security definer set search_path='' as $$
  select t.id,t.titulo,t.estado,
    case when diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','cliente')
      then t.profesional_id else t.cliente_id end
  from public.trabajos t
  where auth.uid() is not null and diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos')
  order by t.created_at desc;
$$;
revoke all on function diime_private.trabajos_para_incidencia() from public,anon,authenticated,service_role;
grant execute on function diime_private.trabajos_para_incidencia() to authenticated;
create function public.trabajos_para_incidencia()
returns table(id uuid,titulo text,estado text,otra_parte_id uuid)
language sql stable security invoker set search_path='' as $$
  select * from diime_private.trabajos_para_incidencia();
$$;
revoke all on function public.trabajos_para_incidencia() from public,anon;
grant execute on function public.trabajos_para_incidencia() to authenticated;

-- Una fila bloqueada serializa cierre, reintento y retirada. La actualización
-- y el aviso se confirman juntos; repetir el mismo cierre no cambia su fecha.
create function diime_private.gestionar_incidencia(p_id uuid,p_cambios jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.incidencias; nuevo_estado text; nueva_prioridad text; nueva_nota text;
  cierra boolean; aviso uuid; actor uuid:=auth.uid();
begin
  if actor is null or not public.is_admin() then
    raise exception 'No tienes permiso' using errcode='42501';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or
     (p_cambios - array['estado','prioridad','notas_admin']::text[]) <> '{}'::jsonb then
    raise exception 'Los cambios de la incidencia no son válidos' using errcode='22023';
  end if;
  if (p_cambios ? 'estado' and (jsonb_typeof(p_cambios->'estado') <> 'string' or p_cambios->>'estado' not in ('abierta','en_revision','resuelta','cerrada','retirada'))) or
     (p_cambios ? 'prioridad' and (jsonb_typeof(p_cambios->'prioridad') <> 'string' or p_cambios->>'prioridad' not in ('baja','media','alta','critica'))) or
     (p_cambios ? 'notas_admin' and (jsonb_typeof(p_cambios->'notas_admin') <> 'string' or length(p_cambios->>'notas_admin') > 5000)) then
    raise exception 'Los cambios de la incidencia no son válidos' using errcode='22023';
  end if;
  select * into i from public.incidencias where id=p_id for update;
  if not found then raise exception 'La incidencia no existe.' using errcode='P0002'; end if;
  nuevo_estado := coalesce(p_cambios->>'estado',i.estado);
  nueva_prioridad := coalesce(p_cambios->>'prioridad',i.prioridad);
  nueva_nota := coalesce(p_cambios->>'notas_admin',i.notas_admin);
  cierra := nuevo_estado in ('resuelta','cerrada') and nuevo_estado is distinct from i.estado;
  update public.incidencias set estado=nuevo_estado,prioridad=nueva_prioridad,notas_admin=nueva_nota,
    resuelto_por=case when cierra then actor when nuevo_estado in ('resuelta','cerrada') then i.resuelto_por else null end,
    fecha_resolucion=case when cierra then now() when nuevo_estado in ('resuelta','cerrada') then i.fecha_resolucion else null end
    where id=p_id;
  if cierra and i.reportado_por is not null and i.reportado_por <> actor then
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,metadata,leida)
    values(i.reportado_por,'incidencia_resuelta',case when nuevo_estado='resuelta' then 'Incidencia resuelta' else 'Incidencia cerrada' end,
      'Tu incidencia "'||i.asunto||'" se ha marcado como '||case when nuevo_estado='resuelta' then 'resuelta' else 'cerrada' end||'.'||
      case when nullif(btrim(nueva_nota),'') is not null then ' Respuesta del equipo: '||btrim(nueva_nota) else '' end,
      '/incidencias?incidencia='||p_id::text||'&aspecto=incidencia_resuelta',
      jsonb_build_object('incidencia_id',p_id,'titulo_trabajo',i.asunto),false) returning id into aviso;
  end if;
  return jsonb_build_object('success',true,'aviso_id',aviso);
end; $$;
revoke all on function diime_private.gestionar_incidencia(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function diime_private.gestionar_incidencia(uuid,jsonb) to authenticated;
create function public.gestionar_incidencia(p_id uuid,p_cambios jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select diime_private.gestionar_incidencia(p_id,p_cambios);
$$;
revoke all on function public.gestionar_incidencia(uuid,jsonb) from public,anon;
grant execute on function public.gestionar_incidencia(uuid,jsonb) to authenticated;
revoke update on public.incidencias from authenticated,anon;

create or replace function public.retirar_incidencia(p_incidencia_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare i public.incidencias; actor uuid:=auth.uid();
begin
  if actor is null then return 'no_autorizado'; end if;
  select * into i from public.incidencias where id=p_incidencia_id for update;
  if not found then return 'no_encontrada'; end if;
  if actor <> i.reportado_por then return 'no_autorizado'; end if;
  if i.estado not in ('abierta','en_revision') then return 'no_retirable'; end if;
  update public.incidencias set estado='retirada',resuelto_por=null,fecha_resolucion=null where id=p_incidencia_id;
  return 'ok';
end; $$;
revoke all on function public.retirar_incidencia(uuid) from public,anon;
grant execute on function public.retirar_incidencia(uuid) to authenticated;
-- Reparar metadatos incompatibles dejados por la reapertura anterior.
update public.incidencias set resuelto_por=null,fecha_resolucion=null
where estado not in ('resuelta','cerrada') and (resuelto_por is not null or fecha_resolucion is not null);
notify pgrst,'reload schema';
