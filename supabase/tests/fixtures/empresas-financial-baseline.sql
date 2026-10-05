-- Current RPC bodies for the isolated SQL test baseline.
CREATE OR REPLACE FUNCTION public.diime_abrir_disputa(p_trabajo uuid, p_actor uuid, p_motivo text, p_rechazo_cancelacion boolean DEFAULT false, p_adjuntos text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare t public.trabajos%rowtype; e public.transacciones_escrow%rowtype; d public.disputas%rowtype; autor uuid;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo;
  if p_actor is null or p_actor not in(t.cliente_id,t.profesional_id) or nullif(trim(p_motivo),'') is null then raise exception 'Sin permiso o motivo'; end if;
  if t.cancelacion_aceptada_por is not null then raise exception 'La cancelación ya está aceptada'; end if;
  if exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision')) then raise exception 'Ya existe una disputa abierta'; end if;
  if t.estado not in('pendiente_pago','en_progreso','entregado') then raise exception 'El trabajo ya no admite disputas'; end if;
  autor := p_actor;
  if p_rechazo_cancelacion then
    if t.cancelacion_estado is distinct from 'pendiente' or t.cancelacion_solicitada_por=p_actor then raise exception 'La cancelación ya no está pendiente'; end if;
    autor := t.cancelacion_solicitada_por;
  elsif t.estado='pendiente_pago' and not coalesce(t.cancelacion_estado='rechazada' and t.cancelacion_solicitada_por=p_actor,false) then
    raise exception 'Sin pago, solicita primero una cancelación';
  end if;
  if exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and estado in('pendiente','liquidando','pago_tardio')) then
    raise exception 'Hay un pago pendiente de conciliar o una liquidación en curso'; end if;
  if (select count(*) from public.transacciones_escrow where trabajo_id=t.id and estado in('retenido','fondos_retenidos'))>1 then raise exception 'Hay pagos históricos duplicados que requieren conciliación'; end if;
  select * into e from public.transacciones_escrow where trabajo_id=t.id
    and estado in('retenido','fondos_retenidos') for update;
  if e.id is not null and (e.stripe_payment_intent_id is null or e.liquidacion_operacion_id is not null or e.stripe_disputa_id is not null) then
    raise exception 'El pago ya tiene una operación en curso'; end if;
  if e.id is null and t.estado<>'pendiente_pago' then raise exception 'No se encontró el pago cobrado; requiere conciliación'; end if;
  insert into public.disputas(trabajo_id,cliente_id,profesional_id,tipo,motivo,estado,estado_trabajo_previo,estado_escrow_previo,escrow_id,origen)
    values(t.id,t.cliente_id,t.profesional_id,case when autor=t.cliente_id then 'cliente' else 'proveedor' end,
      case when p_rechazo_cancelacion then 'Cancelación solicitada y rechazada. Motivo original: '||coalesce(t.cancelacion_razon,'')||'. Oposición: '||p_motivo else p_motivo end,
      'abierta',t.estado,e.estado,e.id,'usuario') returning * into d;
  if e.id is not null then update public.transacciones_escrow set estado='disputa' where id=e.id; end if;
  update public.trabajos set estado='en_disputa',pago_bloqueado=true,
    cancelacion_estado=case when p_rechazo_cancelacion then 'rechazada' else cancelacion_estado end,
    cancelacion_respuesta_razon=case when p_rechazo_cancelacion then p_motivo else cancelacion_respuesta_razon end,
    cancelacion_adjuntos_respuesta=case when p_rechazo_cancelacion then p_adjuntos else cancelacion_adjuntos_respuesta end,
    updated_at=now() where id=t.id;
  insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
    select id,'disputa_abierta_admin','Nueva disputa para revisar', 'Revisa la disputa de "'||coalesce(t.titulo,'el trabajo')||'".',concat('/admin/disputas?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','disputa_abierta_admin','&disputa=',d.id),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo,'disputa_id',d.id))
    from public.profiles where es_admin=true;
  return to_jsonb(d);
end; $function$;

CREATE OR REPLACE FUNCTION public.diime_bloquear_checkout(p_trabajo uuid, p_actor uuid, p_cancelacion boolean DEFAULT false, p_rechazo_cancelacion boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare t public.trabajos%rowtype;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo;
  if p_actor is null or p_actor not in (t.cliente_id,t.profesional_id) then raise exception 'Sin permiso'; end if;
  if p_cancelacion then
    if t.cancelacion_aceptada_por=p_actor then return to_jsonb(t); end if;
    if t.estado not in ('pendiente_pago','en_progreso') or t.cancelacion_estado is distinct from 'pendiente'
      or t.cancelacion_solicitada_por=p_actor then raise exception 'La cancelación ya no admite esta respuesta'; end if;
    update public.trabajos set pago_bloqueado=true,cancelacion_aceptada_por=p_actor where id=p_trabajo returning * into t;
  else
    if t.estado not in ('pendiente_pago','en_progreso','entregado') or t.cancelacion_aceptada_por is not null then
      raise exception 'El trabajo ya no admite abrir una disputa'; end if;
    if p_rechazo_cancelacion then
      if t.cancelacion_estado is distinct from 'pendiente' or t.cancelacion_solicitada_por=p_actor then raise exception 'La cancelación ya no admite rechazo'; end if;
    elsif t.estado='pendiente_pago' and not coalesce(t.cancelacion_estado='rechazada' and t.cancelacion_solicitada_por=p_actor,false) then
      raise exception 'Sin pago, solicita primero una cancelación';
    end if;
    update public.trabajos set pago_bloqueado=true where id=p_trabajo returning * into t;
  end if;
  return to_jsonb(t);
end; $function$;

CREATE OR REPLACE FUNCTION public.diime_cerrar_cancelacion(p_trabajo uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare t public.trabajos%rowtype;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo;
  if p_actor is null or t.cancelacion_aceptada_por is distinct from p_actor then raise exception 'Cancelación no aceptada'; end if;
  if t.estado='cancelado' then return jsonb_build_object('ok',true,'nuevo_cierre',false); end if;
  if t.estado not in('pendiente_pago','en_progreso') then raise exception 'El trabajo ya cambió de estado'; end if;
  if exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and estado not in('cancelado','reembolsado')) then raise exception 'Queda un pago por conciliar'; end if;
  update public.trabajos set estado='cancelado',cancelacion_estado=null,pago_bloqueado=true,
    cancelacion_respuesta_razon=null,cancelacion_adjuntos_respuesta='{}',fecha_fin=now(),updated_at=now() where id=t.id;
  update public.solicitudes set estado='abierta' where id=t.solicitud_id;
  update public.ofertas set estado='retirada' where id=t.oferta_id;
  -- Other rejected offers retain their history. A new bid explicitly accepts
  -- the current terms and commission; manual rejections are never resurrected.
  return jsonb_build_object('ok',true,'nuevo_cierre',true);
end; $function$;

CREATE OR REPLACE FUNCTION public.diime_confirmar_pago(p_escrow uuid, p_session text, p_payment_intent text, p_charge text, p_total numeric, p_moneda text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; tardio boolean; cambio boolean := false; aviso jsonb; avisos jsonb := '[]';
begin
  select * into e from public.transacciones_escrow where id=p_escrow;
  if not found then raise exception 'Pago preparado no encontrado'; end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into e from public.transacciones_escrow where id=p_escrow for update;
  select * into t from public.trabajos where id=e.trabajo_id;
  if p_moneda is distinct from 'eur' or p_total is distinct from round(e.monto*100)
    or nullif(p_payment_intent,'') is null or nullif(p_charge,'') is null
    or (e.stripe_session_id is not null and e.stripe_session_id<>p_session)
    or (e.stripe_payment_intent_id is not null and e.stripe_payment_intent_id<>p_payment_intent) then
    raise exception 'Stripe no coincide con el pago preparado';
  end if;
  if e.estado not in ('pendiente','cancelado') then
    return jsonb_build_object('escrow',to_jsonb(e),'activado',false,'tardio',e.estado='pago_tardio' or coalesce(e.liquidacion_contexto->>'tipo'='pago_tardio',false),'avisos',avisos);
  end if;
  tardio := t.estado<>'pendiente_pago' or e.estado='cancelado' or t.cancelacion_aceptada_por is not null;
  -- A payment racing with an accepted cancellation is retained solely for the
  -- full refund; the contract never changes to in-progress in this branch.
  update public.transacciones_escrow set
    estado=case when tardio then 'pago_tardio' else 'fondos_retenidos' end,
    stripe_session_id=p_session,stripe_payment_intent_id=p_payment_intent,stripe_charge_id=p_charge,
    fecha_retencion=coalesce(fecha_retencion,now()),
    notas=case when tardio then 'Pago tardío: devolver íntegramente sin reactivar el servicio.' else notas end
  where id=e.id returning * into e;
  if not tardio and t.cancelacion_aceptada_por is null then
    update public.trabajos set estado='en_progreso',fecha_inicio=coalesce(fecha_inicio,now()),updated_at=now() where id=t.id;
    update public.solicitudes set estado='en_progreso' where id=t.solicitud_id;
    cambio := true;
    insert into public.actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje,progreso)
      values(t.id,t.cliente_id,'mensaje','Pago recibido. La transferencia queda pendiente de confirmación o resolución.',0);
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
      values(t.profesional_id,'pago_recibido','El cliente ha pagado: puedes empezar',
      'El pago de "'||coalesce(t.titulo,'el trabajo')||'" está confirmado. La transferencia queda pendiente de confirmación o resolución.',concat('/mis-trabajos?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','pago_recibido'),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo))) returning to_jsonb(notificaciones) into aviso;
    avisos := avisos || jsonb_build_array(aviso);
  end if;
  return jsonb_build_object('escrow',to_jsonb(e),'activado',cambio,'tardio',tardio,'avisos',avisos);
end; $function$;

CREATE OR REPLACE FUNCTION public.diime_retirar_disputa(p_disputa uuid, p_actor uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare d public.disputas%rowtype; e public.transacciones_escrow%rowtype;
begin
  select * into d from public.disputas where id=p_disputa;
  if not found then return 'no_encontrada'; end if;
  perform public.diime_bloquear_trabajo_financiero(d.trabajo_id);
  select * into d from public.disputas where id=p_disputa for update;
  if p_actor is null or p_actor<>(case when d.tipo='cliente' then d.cliente_id else d.profesional_id end) then return 'no_autorizado'; end if;
  if d.estado<>'abierta' then return 'no_abierta'; end if;
  if d.origen<>'usuario' or d.stripe_disputa_id is not null then return 'contracargo'; end if;
  if exists(select 1 from public.disputas where trabajo_id=d.trabajo_id and id<>d.id and estado in('abierta','en_revision')) then return 'requiere_conciliacion'; end if;
  select * into e from public.transacciones_escrow where id=d.escrow_id for update;
  if e.liquidacion_operacion_id is not null or e.stripe_disputa_id is not null then return 'liquidacion_iniciada'; end if;
  if d.estado_trabajo_previo is null or (d.escrow_id is null and d.estado_trabajo_previo<>'pendiente_pago') then return 'requiere_conciliacion'; end if;
  if e.id is not null then
    if e.estado<>'disputa' or d.estado_escrow_previo not in('retenido','fondos_retenidos') then return 'requiere_conciliacion'; end if;
    update public.transacciones_escrow set estado=d.estado_escrow_previo where id=e.id;
  end if;
  update public.trabajos set estado=d.estado_trabajo_previo,pago_bloqueado=false,updated_at=now() where id=d.trabajo_id and estado='en_disputa';
  if not found then raise exception 'El trabajo ya cambió de estado'; end if;
  update public.disputas set estado='retirada',updated_at=now() where id=d.id;
  return 'ok';
end; $function$;
