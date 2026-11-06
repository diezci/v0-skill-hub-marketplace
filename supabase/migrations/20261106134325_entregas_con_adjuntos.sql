begin;

-- Las evidencias permanecen en el historial existente: sus permisos de descarga
-- ya se resuelven por el trabajo, incluidos miembros de empresa y mediación.
create function diime_private.entregar_trabajo_con_adjuntos(p_trabajo_id uuid,p_mensaje text default null,p_archivos text[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trabajos; actor uuid:=auth.uid(); archivos text[];
begin
  if actor is null then raise exception 'No autenticado' using errcode='42501'; end if;
  perform public.diime_bloquear_trabajo_financiero(p_trabajo_id);
  select * into t from public.trabajos where id=p_trabajo_id for update;
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo_id,actor);
  if not diime_private.empresa_puede_operar_trabajo(p_trabajo_id,actor,'encargos','proveedor') then
    raise exception 'No tienes permiso para actualizar este trabajo' using errcode='42501';
  end if;
  if t.estado is distinct from 'en_progreso' then
    raise exception 'Solo se puede entregar un trabajo que esté en progreso.' using errcode='55000';
  end if;
  if t.cancelacion_estado='pendiente' then
    raise exception 'Hay una cancelación pendiente. Debe resolverse antes de entregar el trabajo.' using errcode='55000';
  end if;
  if t.pago_bloqueado or exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision')) then
    raise exception 'El trabajo tiene una incidencia pendiente.' using errcode='55000';
  end if;
  if exists(select 1 from unnest(p_archivos) u where u is null or btrim(u)='' or u !~ '^https://') then
    raise exception 'Los archivos adjuntos no son válidos.' using errcode='22023';
  end if;
  select coalesce(array_agg(enlace order by posicion),'{}'::text[]) into archivos
    from (select btrim(u) enlace,min(pos) posicion from unnest(p_archivos) with ordinality as entrada(u,pos) group by btrim(u)) unicos;
  if cardinality(archivos)>5 then
    raise exception 'Puedes adjuntar un máximo de 5 archivos.' using errcode='22023';
  end if;
  perform diime_private.validar_adjuntos_actor(archivos,actor);
  update public.trabajos set estado='entregado',progreso=100,fecha_entrega=now(),updated_at=now()
    where id=t.id returning * into t;
  insert into public.actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje,progreso,archivos)
    values(t.id,actor,'entrega',coalesce(nullif(btrim(p_mensaje),''),'El trabajo ha sido entregado y está pendiente de confirmación del cliente.'),100,archivos);
  return to_jsonb(t)-'notas_privadas_proveedor';
end; $$;

create function public.entregar_trabajo_con_adjuntos(p_trabajo_id uuid,p_mensaje text default null,p_archivos text[] default '{}')
returns jsonb language sql security invoker set search_path='' as $$
  select diime_private.entregar_trabajo_con_adjuntos(p_trabajo_id,p_mensaje,p_archivos);
$$;
revoke all on function diime_private.entregar_trabajo_con_adjuntos(uuid,text,text[]),public.entregar_trabajo_con_adjuntos(uuid,text,text[]) from public,anon,authenticated;
grant execute on function diime_private.entregar_trabajo_con_adjuntos(uuid,text,text[]),public.entregar_trabajo_con_adjuntos(uuid,text,text[]) to authenticated;

-- Sobrecarga sin argumentos predeterminados para conservar llamadas antiguas
-- de tres argumentos y el guardado de progreso sin entrega.
create function diime_private.empresa_actualizar_trabajo(p_trabajo_id uuid,p_progreso integer,p_entregar boolean,p_archivos text[],p_mensaje text)
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('encargos'); t public.trabajos; destinatario uuid;
begin
  if not coalesce(p_entregar,false) then
    perform diime_private.empresa_actualizar_trabajo(p_trabajo_id,p_progreso,false);
    return;
  end if;
  if p_progreso is null or p_progreso<0 or p_progreso>100 then raise exception 'Indica un progreso entre 0 y 100' using errcode='22023'; end if;
  select * into t from public.trabajos where id=p_trabajo_id;
  if t.empresa_proveedora_id is distinct from empresa then raise exception 'No puedes actualizar este encargo' using errcode='42501'; end if;
  perform diime_private.entregar_trabajo_con_adjuntos(p_trabajo_id,p_mensaje,p_archivos);
  destinatario:=coalesce(t.operador_cliente_id,t.cliente_id);
  insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
    values(destinatario,'trabajo_entregado','Entrega: '||t.titulo,'El equipo ha entregado el trabajo. Revisa la entrega antes de confirmar el pago.',
      case when t.empresa_cliente_id is null then '/mis-solicitudes?trabajo='||t.id else '/mi-empresa?trabajo='||t.id end,false,
      jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'titulo_trabajo',t.titulo,'parte_destinataria','cliente'));
end; $$;
create function public.empresa_actualizar_trabajo(p_trabajo_id uuid,p_progreso integer,p_entregar boolean,p_archivos text[],p_mensaje text)
returns void language sql security invoker set search_path='' as $$
  select diime_private.empresa_actualizar_trabajo(p_trabajo_id,p_progreso,p_entregar,p_archivos,p_mensaje);
$$;
revoke all on function diime_private.empresa_actualizar_trabajo(uuid,integer,boolean,text[],text),public.empresa_actualizar_trabajo(uuid,integer,boolean,text[],text) from public,anon,authenticated;
grant execute on function diime_private.empresa_actualizar_trabajo(uuid,integer,boolean,text[],text),public.empresa_actualizar_trabajo(uuid,integer,boolean,text[],text) to authenticated;

-- Añadir la última entrega solo a los trabajos que el workspace ya autoriza.
do $patch$
declare definicion text; punto text:='''progreso'',t.progreso,';
begin
  definicion:=pg_get_functiondef('diime_private.empresa_workspace()'::regprocedure);
  if position(punto in definicion)=0 then raise exception 'No se encontró la proyección de trabajos de empresa'; end if;
  execute replace(definicion,punto,punto||$campos$
    'archivos_entrega',coalesce((select to_jsonb(u.archivos) from public.actualizaciones_trabajo u where u.trabajo_id=t.id and u.tipo='entrega' order by u.created_at desc,u.id desc limit 1),'[]'::jsonb),
    'mensaje_entrega',(select u.mensaje from public.actualizaciones_trabajo u where u.trabajo_id=t.id and u.tipo='entrega' order by u.created_at desc,u.id desc limit 1),
  $campos$);
end; $patch$;

commit;
