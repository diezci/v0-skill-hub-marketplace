begin;

-- Una etiqueta propia permite distinguir las pruebas del cliente de la entrega
-- del proveedor, incluso si el expediente contiene otras incidencias previas.
alter table public.actualizaciones_trabajo drop constraint actualizaciones_trabajo_tipo_check;
alter table public.actualizaciones_trabajo add constraint actualizaciones_trabajo_tipo_check
  check (tipo in ('progreso','mensaje','entrega','confirmacion','disputa','rechazo_entrega'));
-- Los eventos de entrega/rechazo solo nacen de sus operaciones validadas.
-- Los demás mensajes directos deben pertenecer al actor autenticado.
create policy historial_autor_y_eventos_validos on public.actualizaciones_trabajo
  as restrictive for insert to authenticated
  with check (usuario_id=auth.uid() and tipo not in ('entrega','rechazo_entrega'));
create policy historial_inmutable_actualizacion on public.actualizaciones_trabajo
  as restrictive for update to authenticated using (false) with check (false);
create policy historial_inmutable_borrado on public.actualizaciones_trabajo
  as restrictive for delete to authenticated using (false);

-- Compatibilidad de clientes anteriores: la entrega sin archivos utiliza la
-- misma validación y registro interno, sin abrir inserciones directas de eventos.
create or replace function public.entregar_trabajo_con_historial(p_trabajo_id uuid,p_mensaje text default null)
returns jsonb language sql security invoker set search_path='' as $$
  select diime_private.entregar_trabajo_con_adjuntos(p_trabajo_id,p_mensaje,'{}'::text[]);
$$;
revoke all on function public.entregar_trabajo_con_historial(uuid,text) from public,anon;
grant execute on function public.entregar_trabajo_con_historial(uuid,text) to authenticated;

-- Solo el servidor puede suministrar el actor, después de validar su sesión.
-- Se reutiliza el cierre financiero vigente; nunca se devuelve dinero al rechazar.
create function public.diime_rechazar_entrega(p_trabajo uuid,p_actor uuid,p_motivo text,p_adjuntos text[] default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.trabajos; disputa jsonb; archivos text[]; razon text:=btrim(p_motivo);
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo for update;
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);
  if not diime_private.empresa_puede_operar_trabajo(p_trabajo,p_actor,'encargos','cliente') then
    raise exception 'No tienes permiso para rechazar la entrega de este trabajo.' using errcode='42501';
  end if;
  if t.estado is distinct from 'entregado' then
    raise exception 'Solo puedes rechazar una entrega que el profesional haya marcado como entregada.' using errcode='55000';
  end if;
  if nullif(razon,'') is null then
    raise exception 'Explica por qué la entrega no cumple lo acordado.' using errcode='22023';
  end if;
  if exists(select 1 from unnest(p_adjuntos) u where u is null or btrim(u)='' or u !~ '^https://[^[:space:]]+$') then
    raise exception 'Los archivos adjuntos no son válidos.' using errcode='22023';
  end if;
  select coalesce(array_agg(enlace order by posicion),'{}'::text[]) into archivos
    from (select btrim(u) enlace,min(pos) posicion from unnest(p_adjuntos) with ordinality as entrada(u,pos) group by btrim(u)) unicos;
  if cardinality(archivos)>5 then
    raise exception 'Puedes adjuntar un máximo de 5 archivos.' using errcode='22023';
  end if;
  perform diime_private.validar_adjuntos_actor(archivos,p_actor);
  disputa:=public.diime_abrir_disputa(p_trabajo,p_actor,'Entrega rechazada por el cliente. Motivo: '||razon,false,archivos);
  insert into public.actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje,progreso,archivos)
    values(t.id,p_actor,'rechazo_entrega','El cliente ha rechazado la entrega. El equipo de Diime decidirá según las pruebas y los términos acordados. Motivo: '||razon,100,archivos);
  return disputa;
end; $$;
revoke all on function public.diime_rechazar_entrega(uuid,uuid,text,text[]) from public,anon,authenticated;
grant execute on function public.diime_rechazar_entrega(uuid,uuid,text,text[]) to service_role;

commit;
