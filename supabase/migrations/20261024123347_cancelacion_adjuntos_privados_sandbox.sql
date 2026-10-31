-- Only registered private loopback files; exact actor/file authorization stays mandatory.
CREATE OR REPLACE FUNCTION public.diime_gestionar_solicitud_cancelacion(p_trabajo uuid, p_actor uuid, p_accion text, p_razon text DEFAULT ''::text, p_adjuntos text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t public.trabajos; parte text;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo for update;
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);
  perform diime_private.validar_adjuntos_actor(p_adjuntos,p_actor);
  if p_accion not in('solicitar','editar','retirar') or p_accion is null then raise exception 'Acción de cancelación no válida'; end if;
  if t.estado not in('pendiente_pago','en_progreso') or t.pago_bloqueado or t.cancelacion_aceptada_por is not null then raise exception 'El trabajo ya no admite modificar esta cancelación'; end if;
  if p_accion<>'retirar' and nullif(btrim(p_razon),'') is null then raise exception 'Explica por qué quieres cancelar el servicio.'; end if;
  if cardinality(p_adjuntos)>5 or exists(select 1 from unnest(p_adjuntos) x where x is null or (x !~ '^https://[^[:space:]]+$' and not (x ~ '^http://127[.]0[.]0[.]1:3200/api/archivos/[0-9a-f-]{36}([?][^[:space:]]*)?$' and exists(select 1 from public.archivos_privados a where a.url=x)))) then raise exception 'Archivos adjuntos no válidos'; end if;
  parte:=case when diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos','cliente') then 'cliente' else 'proveedor' end;
  if p_accion='solicitar' then
    if t.cancelacion_estado='pendiente' then raise exception 'Ya hay una solicitud de cancelación pendiente'; end if;
    update public.trabajos set cancelacion_solicitada_por=p_actor,cancelacion_razon=btrim(p_razon),
      cancelacion_adjuntos_solicitante=coalesce(p_adjuntos,'{}'),cancelacion_respuesta_razon=null,
      cancelacion_adjuntos_respuesta='{}',cancelacion_estado='pendiente',updated_at=now() where id=t.id returning * into t;
  else
    if t.cancelacion_estado is distinct from 'pendiente' or diime_private.parte_cancelacion(t.id) is distinct from parte then
      raise exception 'Solo la parte que solicitó la cancelación puede modificarla mientras esté pendiente' using errcode='42501'; end if;
    if p_accion='editar' then
      update public.trabajos set cancelacion_razon=btrim(p_razon),cancelacion_adjuntos_solicitante=coalesce(p_adjuntos,'{}'),updated_at=now() where id=t.id returning * into t;
    else
      update public.trabajos set cancelacion_estado=null,cancelacion_solicitada_por=null,cancelacion_razon=null,
        cancelacion_adjuntos_solicitante='{}',cancelacion_respuesta_razon=null,cancelacion_adjuntos_respuesta='{}',updated_at=now() where id=t.id returning * into t;
    end if;
  end if;
  insert into public.actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje)
    values(t.id,p_actor,'mensaje',case p_accion when 'solicitar' then 'Cancelación solicitada: '||btrim(p_razon) when 'editar' then 'Solicitud de cancelación actualizada: '||btrim(p_razon) else 'Solicitud de cancelación retirada. El servicio continúa.' end);
  return jsonb_build_object('id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,
    'cliente_id',t.cliente_id,'profesional_id',t.profesional_id,'empresa_cliente_id',t.empresa_cliente_id,'empresa_proveedora_id',t.empresa_proveedora_id,
    'operador_cliente_id',t.operador_cliente_id,'operador_proveedor_id',t.operador_proveedor_id,
    'estado',t.estado,'titulo',t.titulo,'parte_actor',parte,'cancelacion_parte_solicitante',t.cancelacion_parte_solicitante);
end; $function$
