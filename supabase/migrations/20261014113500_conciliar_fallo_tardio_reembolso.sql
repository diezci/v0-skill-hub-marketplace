begin;

-- Stripe can report a terminal failure after initially accepting a Refund.
-- Reopen only its financial settlement, never the cancelled/completed service
-- or the frozen decision. A replaced Refund must never overwrite its successor.
create or replace function public.diime_registrar_estado_reembolso(
 p_escrow uuid,p_operacion text,p_refund text,p_estado text,
 p_error text default null,p_reintento_de text default null
)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.transacciones_escrow%rowtype; fallo_nuevo boolean;
begin
 select * into e from public.transacciones_escrow where id=p_escrow;
 if not found then raise exception 'Pago no encontrado'; end if;
 perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
 select * into e from public.transacciones_escrow where id=p_escrow for update;
 if p_operacion is null or e.liquidacion_operacion_id is distinct from p_operacion
    or p_refund is null or p_estado is null
    or p_estado not in('pending','requires_action','succeeded','failed','canceled') then
   raise exception 'Estado de reembolso no válido'; end if;
 if e.stripe_refund_id is not null and e.stripe_refund_id<>p_refund and not coalesce((
   e.stripe_refund_status in('failed','canceled') and p_reintento_de=e.stripe_refund_id
   and e.stripe_refund_reintento_de=p_reintento_de
   and exists(select 1 from diime_private.reintentos_reembolso r
     where r.escrow_id=e.id and r.refund_anterior=p_reintento_de)
 ),false) then return to_jsonb(e); end if;
 if e.liquidacion_estado='completada' and not (
   e.stripe_refund_id=p_refund and p_estado in('failed','canceled')
 ) then return to_jsonb(e); end if;
 fallo_nuevo := p_estado in('failed','canceled') and
   (e.stripe_refund_id is distinct from p_refund or e.stripe_refund_status is null
     or e.stripe_refund_status not in('failed','canceled'));
 update public.transacciones_escrow set
   stripe_refund_id=p_refund,stripe_refund_status=p_estado,
   estado=case when p_estado in('failed','canceled') then
     case when liquidacion_contexto->>'tipo'='pago_tardio' then 'pago_tardio' else 'liquidando' end
     else estado end,
   liquidacion_estado=case when p_estado in('failed','canceled') then 'error' else liquidacion_estado end,
   liquidacion_error=case when p_estado in('failed','canceled') then coalesce(p_error,'Reembolso no completado') else liquidacion_error end,
   fecha_reembolso=case when p_estado in('failed','canceled') then null else fecha_reembolso end
   where id=e.id returning * into e;
 if fallo_nuevo then
   insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
   select p.id,'reembolso_fallido','El reembolso necesita revisión',
     'Stripe ha comunicado que el reembolso no se ha completado. Diime debe revisar la devolución; no tienes que volver a pagar.',
     case when p.id=e.cliente_id then '/trabajos/'||e.trabajo_id||'/factura' else '/admin/pagos' end,
     false,jsonb_build_object('trabajo_id',e.trabajo_id,'escrow_id',e.id,'refund_id',p_refund)
   from public.profiles p where p.cuenta_eliminada is null and (p.id=e.cliente_id or p.es_admin);
 end if;
 return to_jsonb(e);
end; $$;
revoke all on function public.diime_registrar_estado_reembolso(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.diime_registrar_estado_reembolso(uuid,text,text,text,text,text) to service_role;
-- Apply the same financial permissions to the new failure notification.
create or replace function diime_private.proteger_destinatario_aviso_empresa()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  t public.trabajos; parte text; empresa uuid; operador uuid; destino uuid;
  permiso text; financiera boolean; indicada text;
begin
  if coalesce(new.metadata->>'trabajo_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return new; end if;
  select * into t from public.trabajos where id=(new.metadata->>'trabajo_id')::uuid;
  if not found or (t.empresa_cliente_id is null and t.empresa_proveedora_id is null) then return new; end if;
  indicada:=new.metadata->>'parte_destinataria';
  if indicada in('cliente','proveedor') then
    empresa:=case when indicada='cliente' then t.empresa_cliente_id else t.empresa_proveedora_id end;
    if new.usuario_id in(case when indicada='cliente' then t.cliente_id else t.profesional_id end,
      case when indicada='cliente' then t.operador_cliente_id else t.operador_proveedor_id end)
      or exists(select 1 from public.empresa_miembros m where m.empresa_id=empresa and m.usuario_id=new.usuario_id) then parte:=indicada; end if;
  elsif new.usuario_id in(t.cliente_id,t.operador_cliente_id) and new.usuario_id not in(t.profesional_id,coalesce(t.operador_proveedor_id,t.profesional_id)) then parte:='cliente';
  elsif new.usuario_id in(t.profesional_id,t.operador_proveedor_id) and new.usuario_id not in(t.cliente_id,coalesce(t.operador_cliente_id,t.cliente_id)) then parte:='proveedor';
  end if;
  -- Platform admin notices and unrelated/personal destinations are untouched.
  if parte is null then return new; end if;
  empresa:=case when parte='cliente' then t.empresa_cliente_id else t.empresa_proveedora_id end;
  if empresa is null then return new; end if;
  operador:=case when parte='cliente' then coalesce(t.operador_cliente_id,t.cliente_id) else coalesce(t.operador_proveedor_id,t.profesional_id) end;
  financiera:=new.tipo in('pago_liberado','reembolso_emitido','reembolso_fallido','disputa_ganada','disputa_perdida','disputa_resuelta');
  permiso:=case when financiera then 'ver_cobros' else 'encargos' end;
  select m.usuario_id into destino from public.empresa_miembros m
    where m.empresa_id=empresa and diime_private.es_miembro_empresa(empresa,m.usuario_id)
      and (m.usuario_id=operador or m.rol in('principal','administrador'))
      and (diime_private.empresa_tiene_permiso(empresa,m.usuario_id,permiso)
        or (not financiera and m.rol in('principal','administrador')))
    order by case when m.usuario_id=new.usuario_id and (m.usuario_id=operador or m.rol in('principal','administrador')) then 0
      when m.usuario_id=operador then 1 when m.rol='principal' then 2 else 3 end,m.usuario_id
    limit 1 for share of m;
  if destino is null then return null; end if;
  new.usuario_id:=destino;
  new.link:='/perfil-empresa';
  new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('empresa_id',empresa,'parte_destinataria',parte);
  return new;
end; $$;

-- Guard against an in-flight finalizer holding an older Stripe success.
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
  -- A success read before a later failure cannot close the failed attempt.
  if e.stripe_refund_id=p_refund and e.stripe_refund_status in('failed','canceled') then
    raise exception 'El reembolso vigente falló. Autoriza otro intento antes de cerrar.'; end if;
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
    nuevo_cierre := (diime_private.cerrar_cancelacion_aceptada(t.id)->>'nuevo_cierre')::boolean;
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
      nuevo_cierre := (diime_private.cerrar_cancelacion_aceptada(t.id)->>'nuevo_cierre')::boolean;
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



commit;
