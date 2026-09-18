-- Contexto de los avisos creados por SQL: enlaces al trabajo y a la solicitud.
-- Definiciones obtenidas de pg_get_functiondef en producción el 2026-09-18.
-- Solo cambia la proyección de datos de notificación (link/metadata); se
-- conservan firmas, atributos, autorizaciones, bloqueos, importes y estados.
-- CREATE OR REPLACE conserva el propietario y los permisos existentes.

CREATE OR REPLACE FUNCTION public.avisar_entregas_fuera_de_plazo()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  insertadas integer := 0;
begin
  with vencidos as (
    select t.id, t.titulo, t.cliente_id, t.profesional_id, t.fecha_estimada_fin, t.solicitud_id, t.oferta_id
    from public.trabajos t
    where t.fecha_estimada_fin is not null
      and t.fecha_estimada_fin < current_date
      and t.estado = 'en_progreso'
      and not exists (
        select 1 from public.notificaciones n
        where n.tipo = 'entrega_retrasada'
          and n.metadata ->> 'trabajo_id' = t.id::text
      )
  ),
  nuevas as (
    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, link, leida, metadata)
    select
      destinatario.usuario_id,
      'entrega_retrasada',
      'Entrega fuera de plazo',
      case
        when destinatario.es_cliente then
          'La fecha de entrega prevista de "' || v.titulo || '" (' ||
          to_char(v.fecha_estimada_fin, 'DD/MM/YYYY') ||
          ') ya ha pasado y el trabajo sigue en curso. Habla con el profesional; si no hay avances, puedes abrir una incidencia.'
        else
          'La fecha de entrega prevista de "' || v.titulo || '" (' ||
          to_char(v.fecha_estimada_fin, 'DD/MM/YYYY') ||
          ') ya ha pasado. Actualiza el progreso o entrega el trabajo para que el cliente sepa cómo va.'
      end,
      concat(case when destinatario.es_cliente then '/mis-solicitudes' else '/mis-trabajos' end,
        '?trabajo=',v.id,'&solicitud=',v.solicitud_id,'&oferta=',v.oferta_id,'&aspecto=entrega_retrasada'),
      false,
      jsonb_strip_nulls(jsonb_build_object('trabajo_id',v.id,'solicitud_id',v.solicitud_id,'oferta_id',v.oferta_id,'titulo_trabajo',v.titulo))
    from vencidos v
    cross join lateral (
      values (v.cliente_id, true), (v.profesional_id, false)
    ) as destinatario(usuario_id, es_cliente)
    where destinatario.usuario_id is not null
    returning 1
  )
  select count(*) into insertadas from nuevas;

  return insertadas;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.diime_finalizar_liquidacion(p_escrow uuid, p_operacion text, p_charge text, p_refund text DEFAULT NULL::text, p_refund_status text DEFAULT NULL::text, p_transfer text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; c jsonb; d public.disputas%rowtype; nuevo_cierre boolean := false; aviso jsonb; avisos jsonb := '[]';
begin
  select * into e from public.transacciones_escrow where id=p_escrow;
  if not found then raise exception 'Pago no encontrado'; end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into e from public.transacciones_escrow where id=p_escrow for update;
  select * into t from public.trabajos where id=e.trabajo_id;
  if e.liquidacion_operacion_id is distinct from p_operacion or e.liquidacion_contexto is null then raise exception 'La liquidación no tiene una decisión fijada'; end if;
  c:=e.liquidacion_contexto;
  if e.stripe_disputa_id is not null then raise exception 'Contracargo recibido: concilia los movimientos antes de cerrar'; end if;
  if e.liquidacion_estado<>'completada' then
    if p_charge is null or (e.stripe_charge_id is not null and e.stripe_charge_id<>p_charge)
      or (e.monto_reembolsado>0 and (p_refund is null or p_refund_status is distinct from 'succeeded'))
      or (e.pago_neto_proveedor>0 and p_transfer is null) then raise exception 'Faltan movimientos confirmados de Stripe'; end if;
    update public.transacciones_escrow set estado=case when e.monto_bruto_proveedor>0 then 'completado' else 'reembolsado' end,
      liquidacion_estado='completada',liquidacion_error=null,stripe_charge_id=p_charge,
      stripe_refund_id=p_refund,stripe_refund_status=p_refund_status,stripe_transfer_id=p_transfer,
      fecha_reembolso=case when e.monto_reembolsado>0 then now() else fecha_reembolso end,
      fecha_liberacion=case when e.pago_neto_proveedor>0 then now() else fecha_liberacion end where id=e.id;
  end if;
  if c->>'tipo'='confirmacion' then
    if t.estado<>'completado' then
      insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
        values(t.profesional_id,'pago_liberado','Pago liberado','El cliente confirmó la entrega. Se te ha transferido '||e.pago_neto_proveedor||' EUR netos.',concat('/mis-trabajos?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','pago_liberado'),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo))) returning to_jsonb(notificaciones) into aviso;
      avisos := avisos || jsonb_build_array(aviso);
    end if;
    if t.estado not in('entregado','completado') then raise exception 'El trabajo ya no admite confirmar'; end if;
    update public.trabajos set estado='completado',fecha_fin=coalesce(fecha_fin,now()),updated_at=now() where id=t.id;
    update public.solicitudes set estado='completada' where id=t.solicitud_id;
  elsif c->>'tipo'='cancelacion' then
    nuevo_cierre := (public.diime_cerrar_cancelacion(t.id,(c->>'actor')::uuid)->>'nuevo_cierre')::boolean;
    if nuevo_cierre then
      insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
        values(t.cliente_id,'reembolso_emitido','Cancelación reembolsada','Se ha cancelado el servicio de mutuo acuerdo y se han devuelto íntegramente '||e.monto_reembolsado||' EUR.',concat('/mis-solicitudes?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','reembolso_emitido'),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo))) returning to_jsonb(notificaciones) into aviso;
      avisos := avisos || jsonb_build_array(aviso);
    end if;
  elsif c->>'tipo'='disputa' then
    select * into d from public.disputas where id=(c->>'disputa_id')::uuid for update;
    if d.estado not in('abierta','en_revision','resuelta') or d.origen<>'usuario' then raise exception 'La disputa ya no admite este cierre'; end if;
    if d.estado<>'resuelta' then
      with enviados as (
        insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata) values
        (t.cliente_id,case when c->>'resolucion'='cliente' then 'disputa_ganada' when c->>'resolucion'='proveedor' then 'disputa_perdida' else 'disputa_resuelta' end,
          'Disputa resuelta','La mediación de Diime ha concluido. Reembolso al cliente: '||e.monto_reembolsado||' EUR. Motivo: '||coalesce(c->>'nota','')||'. La decisión es privada y no impide emprender otras acciones.',concat('/mis-solicitudes?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=',case when c->>'resolucion'='cliente' then 'disputa_ganada' when c->>'resolucion'='proveedor' then 'disputa_perdida' else 'disputa_resuelta' end,'&disputa=',d.id),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo,'disputa_id',d.id))),
        (t.profesional_id,case when c->>'resolucion'='proveedor' then 'disputa_ganada' when c->>'resolucion'='cliente' then 'disputa_perdida' else 'disputa_resuelta' end,
          'Disputa resuelta','La mediación de Diime ha concluido. Transferencia neta al proveedor: '||e.pago_neto_proveedor||' EUR. Motivo: '||coalesce(c->>'nota','')||'. La decisión es privada y no impide emprender otras acciones.',concat('/mis-trabajos?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=',case when c->>'resolucion'='proveedor' then 'disputa_ganada' when c->>'resolucion'='cliente' then 'disputa_perdida' else 'disputa_resuelta' end,'&disputa=',d.id),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo,'disputa_id',d.id)))
        returning *
      ) select coalesce(jsonb_agg(to_jsonb(enviados)),'[]'::jsonb) into avisos from enviados;
    end if;
    update public.trabajos set estado=case when c->>'resolucion'='cliente' then 'rechazado' else 'completado' end,
      fecha_fin=coalesce(fecha_fin,now()),updated_at=now() where id=t.id;
    update public.solicitudes set estado=case when c->>'resolucion'='cliente' then 'cancelada' else 'completada' end where id=t.solicitud_id;
    update public.disputas set estado='resuelta',resolucion=c->>'resolucion',resultado=c->>'nota',
      resuelto_por=(c->>'actor')::uuid,fecha_resolucion=coalesce(fecha_resolucion,now()),updated_at=now() where id=d.id;
  elsif c->>'tipo'='pago_tardio' then
    if t.cancelacion_aceptada_por is not null and t.estado in('pendiente_pago','en_progreso')
      and not exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and estado not in('cancelado','reembolsado')) then
      nuevo_cierre := (public.diime_cerrar_cancelacion(t.id,t.cancelacion_aceptada_por)->>'nuevo_cierre')::boolean;
    end if;
    if e.liquidacion_estado<>'completada' then
      insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
        values(t.cliente_id,'reembolso_emitido','Pago tardío reembolsado','El pago llegó tras el cierre de su intento y se ha devuelto íntegramente. El servicio no se ha reactivado.',concat('/mis-solicitudes?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','reembolso_emitido'),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo))) returning to_jsonb(notificaciones) into aviso;
      avisos := avisos || jsonb_build_array(aviso);
    end if;
  else raise exception 'Tipo de cierre no válido';
  end if;
  return jsonb_build_object('ok',true,'reembolso',e.monto_reembolsado,'neto',e.pago_neto_proveedor,'nuevo_cierre',nuevo_cierre,'avisos',avisos);
end; $function$;

CREATE OR REPLACE FUNCTION public.diime_resolver_mediacion(p_disputa uuid, p_actor uuid, p_resolucion text, p_nota text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare d public.disputas%rowtype; t public.trabajos%rowtype; avisos jsonb := '[]'; mensaje text;
begin
  if not exists(select 1 from public.profiles where id=p_actor and es_admin=true) then raise exception 'Solo administración resuelve'; end if;
  select * into d from public.disputas where id=p_disputa;
  if not found then raise exception 'Disputa no encontrada'; end if;
  perform public.diime_bloquear_trabajo_financiero(d.trabajo_id);
  select * into d from public.disputas where id=p_disputa for update;
  select * into t from public.trabajos where id=d.trabajo_id;
  if d.escrow_id is not null or d.origen<>'usuario' or d.estado_trabajo_previo is distinct from 'pendiente_pago'
    or exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and not (estado='cancelado'
      or (estado='reembolsado' and liquidacion_estado='completada' and liquidacion_contexto->>'tipo'='pago_tardio'))) then
    raise exception 'No es una mediación sin pago conciliada'; end if;
  if d.estado='resuelta' and d.resolucion=p_resolucion then return jsonb_build_object('ok',true); end if;
  if d.estado not in('abierta','en_revision') or t.estado<>'en_disputa' or p_resolucion is null or p_resolucion not in('cliente','proveedor') then raise exception 'Resolución sin pago no válida'; end if;
  -- Upholding the contract restores the obligation to pay; it does not pretend
  -- that an unpaid service has been completed or any money has been released.
  update public.trabajos set estado=case when p_resolucion='cliente' then 'cancelado' else 'pendiente_pago' end,
    pago_bloqueado=(p_resolucion='cliente'),cancelacion_estado=null,
    fecha_fin=case when p_resolucion='cliente' then now() else null end,updated_at=now() where id=t.id;
  update public.solicitudes set estado='abierta' where id=t.solicitud_id;
  if p_resolucion='cliente' then update public.ofertas set estado='retirada' where id=t.oferta_id; end if;
  update public.disputas set estado='resuelta',resolucion=p_resolucion,resultado=p_nota,
    resuelto_por=p_actor,fecha_resolucion=now(),updated_at=now() where id=d.id;
  mensaje := case when p_resolucion='cliente' then 'La mediación cancela la contratación y la demanda vuelve a estar abierta. No se ha movido dinero.'
    else 'La mediación mantiene la contratación: queda pendiente de pago y el servicio no debe empezar hasta que se pague.' end;
  with enviados as (
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata) values
      (t.cliente_id,'disputa_resuelta','Mediación resuelta sin pago',mensaje||' Motivo: '||coalesce(p_nota,''),concat('/mis-solicitudes?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','disputa_resuelta','&disputa=',d.id),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo,'disputa_id',d.id))),
      (t.profesional_id,'disputa_resuelta','Mediación resuelta sin pago',mensaje||' Motivo: '||coalesce(p_nota,''),concat('/mis-trabajos?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','disputa_resuelta','&disputa=',d.id),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo,'disputa_id',d.id)))
    returning *
  ) select coalesce(jsonb_agg(to_jsonb(enviados)),'[]'::jsonb) into avisos from enviados;
  return jsonb_build_object('ok',true,'avisos',avisos);
end; $function$;
