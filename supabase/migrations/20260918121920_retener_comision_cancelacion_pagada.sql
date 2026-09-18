-- Cancelación de un servicio ya pagado: devuelve el precio base y conserva
-- únicamente la comisión del cliente. No cobra comisión al profesional.
-- Los cobros tardíos o de intentos sustituidos siguen reembolsándose íntegros.
--
-- No se reescriben datos ni repartos históricos. Las operaciones ya reclamadas
-- mantienen importes, clave idempotente y movimientos incluso si aún fallan o
-- están pendientes. Se conserva la recuperación legacy sin contexto.
-- La guarda y restricción de 048_liquidacion_inmutable ya admiten ambos repartos.
--
-- Reclamación: definición vigente de 20260909191217_pagos_disputas_atomicos.
-- Cierre: definición de 20260918113744_notificaciones_pagos_contexto; conserva
-- sus destinos y metadata. El aviso refleja la retención efectivamente fijada,
-- sin atribuir a operaciones anteriores una comisión que no retuvieron.

create or replace function public.diime_reclamar_liquidacion(p_escrow uuid,p_actor uuid,p_tipo text,p_reembolso numeric default 0,p_disputa uuid default null,p_resolucion text default null,p_nota text default '')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; d public.disputas%rowtype; op text; bruto numeric; comision numeric; retenida numeric; destino text;
begin
  select * into e from public.transacciones_escrow where id=p_escrow;
  if not found then raise exception 'Pago no encontrado'; end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into t from public.trabajos where id=e.trabajo_id;
  select * into e from public.transacciones_escrow where id=p_escrow for update;
  if p_tipo='confirmacion' then
    if p_actor is null or p_actor<>t.cliente_id then raise exception 'Solo el cliente confirma'; end if;
    op:='confirmacion-'||e.id;
  elsif p_tipo='cancelacion' then
    if p_actor is null or t.cancelacion_aceptada_por is distinct from p_actor then raise exception 'La cancelación no está aceptada'; end if;
    op:='cancelacion-mutua-'||e.id;
  elsif p_tipo='disputa' then
    if not exists(select 1 from public.profiles where id=p_actor and es_admin=true) then raise exception 'Solo administración resuelve'; end if;
    select * into d from public.disputas where id=p_disputa for update;
    if d.id is null or d.escrow_id is distinct from e.id or d.trabajo_id<>t.id or d.origen<>'usuario' or d.stripe_disputa_id is not null then raise exception 'La disputa no corresponde a este pago o es un contracargo'; end if;
    op:='disputa-'||d.id;
  elsif p_tipo='pago_tardio' then
    if p_actor is not null or e.estado not in('pago_tardio','reembolsado') then raise exception 'No es un pago tardío'; end if;
    op:='pago-tardio-'||e.id;
  else raise exception 'Operación no válida'; end if;
  if e.stripe_disputa_id is not null then raise exception 'Contracargo bancario: concilia primero en Stripe'; end if;
  -- Una operación fijada antes de esta migración conserva su reparto, incluso
  -- si reembolsa la comisión o todavía no tiene liquidacion_contexto. La regla
  -- nueva solo se evalúa tras este retorno, al reclamar por primera vez.
  if e.liquidacion_operacion_id is not null then
    if e.liquidacion_operacion_id<>op then raise exception 'Existe otra liquidación iniciada'; end if;
    if p_tipo='disputa' and e.liquidacion_contexto is not null and (e.liquidacion_contexto->>'resolucion' is distinct from p_resolucion
      or e.monto_reembolsado is distinct from round(p_reembolso,2)) then raise exception 'La decisión económica ya quedó fijada'; end if;
    if e.liquidacion_contexto is null then
      if e.monto_reembolsado is distinct from (case when p_tipo in('cancelacion','pago_tardio') then e.monto else p_reembolso end) then raise exception 'El reparto anterior no coincide'; end if;
      select stripe_account_id into destino from public.profesionales where id=e.profesional_id;
      update public.transacciones_escrow set liquidacion_contexto=jsonb_build_object('tipo',p_tipo,'disputa_id',p_disputa,'actor',p_actor,'resolucion',p_resolucion,'nota',p_nota,'destino',destino) where id=e.id returning * into e;
    end if;
    return to_jsonb(e);
  end if;
  if e.stripe_payment_intent_id is null or e.monto_base<=0 or e.monto is distinct from e.monto_base+e.comision_cliente then raise exception 'Importes o cobro sin conciliar'; end if;
  if p_tipo='confirmacion' and (t.estado<>'entregado' or t.cancelacion_estado='pendiente'
    or e.estado not in('retenido','fondos_retenidos') or exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision'))) then raise exception 'El trabajo no admite liberar fondos'; end if;
  if p_tipo='cancelacion' and (t.estado not in('pendiente_pago','en_progreso') or e.estado not in('retenido','fondos_retenidos')) then raise exception 'El trabajo no admite reembolso por cancelación'; end if;
  if p_tipo='disputa' and (d.estado not in('abierta','en_revision') or t.estado<>'en_disputa' or e.estado<>'disputa') then raise exception 'La disputa ya no admite liquidación'; end if;
  -- Solo una cancelación nueva de un pago válido conserva la comisión cliente.
  -- Los pagos tardíos o de intentos sustituidos se devuelven por completo.
  if p_tipo='pago_tardio' then p_reembolso:=e.monto; bruto:=0; comision:=0; retenida:=0;
  elsif p_tipo='cancelacion' then p_reembolso:=e.monto_base; bruto:=0; comision:=0; retenida:=e.comision_cliente;
  else
    if p_tipo='confirmacion' then p_reembolso:=0; end if;
    if p_reembolso is null or p_reembolso<0 or p_reembolso>e.monto_base or p_reembolso<>round(p_reembolso,2) then raise exception 'Reembolso no válido'; end if;
    if p_tipo='disputa' and (p_resolucion is null or p_resolucion not in('cliente','proveedor','parcial')
      or (p_resolucion='cliente' and p_reembolso<>e.monto_base)
      or (p_resolucion='proveedor' and p_reembolso<>0)
      or (p_resolucion='parcial' and (p_reembolso<=0 or p_reembolso>=e.monto_base))) then raise exception 'Reparto incoherente'; end if;
    bruto:=e.monto_base-p_reembolso;
    comision:=least(round(e.comision_proveedor_original*bruto/e.monto_base,2),bruto);
    retenida:=e.comision_cliente;
  end if;
  if bruto-comision>0 then
    select stripe_account_id into destino from public.profesionales where id=e.profesional_id
      and stripe_transferencias_habilitadas and stripe_payouts_habilitados;
    if destino is null then raise exception 'El profesional no tiene una cuenta de cobros habilitada'; end if;
  end if;
  update public.transacciones_escrow set estado=case when p_tipo='pago_tardio' then 'pago_tardio' else 'liquidando' end,
    liquidacion_estado='procesando',liquidacion_error=null,liquidacion_operacion_id=op,
    monto_reembolsado=p_reembolso,monto_bruto_proveedor=bruto,comision_proveedor=comision,pago_neto_proveedor=bruto-comision,
    comision_cliente_retenida=retenida,retencion_plataforma=retenida+comision,
    liquidacion_contexto=jsonb_build_object('tipo',p_tipo,'disputa_id',p_disputa,'actor',p_actor,'resolucion',p_resolucion,'nota',p_nota,'destino',destino)
    where id=e.id returning * into e;
  return to_jsonb(e);
end; $$;

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
        values(t.cliente_id,'reembolso_emitido','Cancelación reembolsada',case when coalesce(e.comision_cliente_retenida,0)>0
          then 'Se ha cancelado el servicio de mutuo acuerdo. Se han reembolsado '||e.monto_reembolsado||' EUR. Diime conserva '||e.comision_cliente_retenida||' EUR de comisión del cliente.'
          else 'Se ha cancelado el servicio de mutuo acuerdo y se han devuelto íntegramente '||e.monto_reembolsado||' EUR.' end,concat('/mis-solicitudes?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','reembolso_emitido'),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo))) returning to_jsonb(notificaciones) into aviso;
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

-- Mantiene las RPC financieras reservadas al servidor autenticado.
revoke all on function public.diime_reclamar_liquidacion(uuid,uuid,text,numeric,uuid,text,text) from public,anon,authenticated;
grant execute on function public.diime_reclamar_liquidacion(uuid,uuid,text,numeric,uuid,text,text) to service_role;
revoke all on function public.diime_finalizar_liquidacion(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.diime_finalizar_liquidacion(uuid,text,text,text,text,text) to service_role;
