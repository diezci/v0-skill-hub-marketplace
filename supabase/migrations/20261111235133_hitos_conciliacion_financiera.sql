begin;

-- Historical one-time contracts retain the existing financial state machine.
-- All public entry points remain service-only; callers cannot choose a legacy
-- implementation to bypass milestone rules.
alter function public.diime_confirmar_pago(uuid,text,text,text,numeric,text) rename to diime_confirmar_pago_pago_unico;
alter function public.diime_reclamar_liquidacion(uuid,uuid,text,numeric,uuid,text,text) rename to diime_reclamar_liquidacion_pago_unico;
alter function public.diime_finalizar_liquidacion(uuid,text,text,text,text,text) rename to diime_finalizar_liquidacion_pago_unico;
alter function diime_private.cerrar_cancelacion_aceptada(uuid) rename to cerrar_cancelacion_aceptada_pago_unico;
alter function public.diime_registrar_contracargo(text,text) rename to diime_registrar_contracargo_pago_unico;
alter function public.diime_finalizar_conciliacion_contracargo(uuid,text,uuid,uuid,text) rename to diime_finalizar_conciliacion_contracargo_pago_unico;
alter table public.disputas add column estado_hito_previo text;

-- Completion belongs to the whole plan, whereas every money movement belongs
-- to exactly one milestone. Call under diime_bloquear_trabajo_financiero.
create function diime_private.actualizar_cierre_hitos(p_trabajo uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare terminado boolean; cancelado boolean; t public.trabajos%rowtype;
begin
  select * into t from public.trabajos where id=p_trabajo;
  if t.modalidad_pago<>'hitos' then raise exception 'No es un contrato por hitos'; end if;
  if exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision')) then
    update public.trabajos set estado='en_disputa',pago_bloqueado=true,updated_at=now() where id=t.id;
    return false;
  end if;
  terminado:=exists(select 1 from public.trabajos_hitos where trabajo_id=t.id and activo)
    and not exists(select 1 from public.trabajos_hitos where trabajo_id=t.id and activo and estado not in('completado','cancelado'));
  cancelado:=terminado and exists(select 1 from public.trabajos_hitos where trabajo_id=t.id and activo and estado='cancelado');
  update public.trabajos set estado=case when cancelado then 'cancelado' when terminado then 'completado' else 'en_progreso' end,
    pago_bloqueado=false,fecha_fin=case when terminado then coalesce(fecha_fin,now()) else null end,updated_at=now() where id=t.id;
  update public.solicitudes set estado=case when cancelado then 'cancelada' when terminado then 'completada' else 'en_progreso' end where id=t.solicitud_id;
  return terminado;
end; $$;

create function public.diime_confirmar_pago(p_escrow uuid,p_session text,p_payment_intent text,p_charge text,p_total numeric,p_moneda text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; h public.trabajos_hitos%rowtype;
  tardio boolean; aviso jsonb; avisos jsonb:='[]';
begin
  select * into e from public.transacciones_escrow where id=p_escrow;
  if not found then raise exception 'Pago preparado no encontrado'; end if;
  if e.hito_id is null then return public.diime_confirmar_pago_pago_unico(p_escrow,p_session,p_payment_intent,p_charge,p_total,p_moneda); end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into e from public.transacciones_escrow where id=p_escrow for update;
  select * into t from public.trabajos where id=e.trabajo_id;
  select * into h from public.trabajos_hitos where id=e.hito_id and trabajo_id=t.id for update;
  if h.id is null or t.modalidad_pago<>'hitos' or p_moneda is distinct from 'eur'
    or p_total is distinct from round(e.monto*100) or nullif(p_payment_intent,'') is null
    or nullif(p_charge,'') is null or nullif(p_session,'') is null
    or (e.stripe_session_id is not null and e.stripe_session_id<>p_session)
    or (e.stripe_payment_intent_id is not null and e.stripe_payment_intent_id<>p_payment_intent) then
    raise exception 'Stripe no coincide con el pago preparado del hito'; end if;
  if e.estado not in('pendiente','cancelado') then
    return jsonb_build_object('escrow',to_jsonb(e),'activado',false,'tardio',e.estado='pago_tardio' or coalesce(e.liquidacion_contexto->>'tipo'='pago_tardio',false),'avisos',avisos);
  end if;
  perform 1 from public.empresa_miembros m where
    (m.empresa_id=t.empresa_cliente_id and m.usuario_id=coalesce(e.actor_pago_id,t.operador_cliente_id,t.cliente_id)) or
    (m.empresa_id=t.empresa_proveedora_id and m.usuario_id=coalesce(t.operador_proveedor_id,t.profesional_id))
    order by m.empresa_id,m.usuario_id for share of m;
  tardio:=t.estado not in('pendiente_pago','en_progreso') or e.estado='cancelado'
    or t.cancelacion_aceptada_por is not null or t.pago_bloqueado or not h.activo or h.estado<>'pendiente'
    or exists(select 1 from public.trabajos_hitos where trabajo_id=t.id and activo and orden<h.orden and estado not in('completado','cancelado'))
    or (t.empresa_cliente_id is not null and not diime_private.empresa_puede_operar_trabajo(t.id,coalesce(e.actor_pago_id,t.operador_cliente_id,t.cliente_id),'gestionar_cobros','cliente'))
    or (t.empresa_proveedora_id is not null and not diime_private.empresa_puede_operar_trabajo(t.id,coalesce(t.operador_proveedor_id,t.profesional_id),'encargos','proveedor'));
  update public.transacciones_escrow set estado=case when tardio then 'pago_tardio' else 'fondos_retenidos' end,
    stripe_session_id=p_session,stripe_payment_intent_id=p_payment_intent,stripe_charge_id=p_charge,
    fecha_retencion=coalesce(fecha_retencion,now()),
    notas=case when tardio then 'Pago tardío del hito: devolver íntegramente sin activar el servicio.' else notas end
    where id=e.id returning * into e;
  if not tardio then
    update public.trabajos_hitos set estado='financiado',updated_at=now() where id=h.id;
    update public.trabajos set estado='en_progreso',fecha_inicio=coalesce(fecha_inicio,now()),updated_at=now() where id=t.id;
    update public.solicitudes set estado='en_progreso' where id=t.solicitud_id;
    insert into public.actualizaciones_trabajo(trabajo_id,hito_id,usuario_id,tipo,mensaje,progreso)
      values(t.id,h.id,coalesce(e.actor_pago_id,t.operador_cliente_id,t.cliente_id),'mensaje','Pago recibido para el hito: '||h.titulo||'. Los hitos futuros siguen pendientes de pago.',0);
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
      values(coalesce(t.operador_proveedor_id,t.profesional_id),'pago_recibido','Hito pagado: puedes empezar',
        'El cliente ha pagado el hito "'||h.titulo||'". La transferencia se autoriza al aprobar su entrega.',
        '/trabajos/'||t.id||'/hitos',false,jsonb_build_object('trabajo_id',t.id,'hito_id',h.id,'escrow_id',e.id,'parte_destinataria','proveedor'))
      returning to_jsonb(notificaciones) into aviso;
    if aviso is not null then avisos:=avisos||jsonb_build_array(aviso); end if;
  end if;
  return jsonb_build_object('escrow',to_jsonb(e),'activado',not tardio,'tardio',tardio,'avisos',avisos);
end; $$;

create or replace function public.diime_reclamar_liquidacion(p_escrow uuid,p_actor uuid,p_tipo text,p_reembolso numeric default 0,p_disputa uuid default null,p_resolucion text default null,p_nota text default '')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; d public.disputas%rowtype; op text; bruto numeric; comision numeric; retenida numeric; destino text; aceptacion_fijada boolean; h public.trabajos_hitos%rowtype;
begin
  select * into e from public.transacciones_escrow where id=p_escrow;
  if not found then raise exception 'Pago no encontrado'; end if;
  if e.hito_id is null then return public.diime_reclamar_liquidacion_pago_unico(p_escrow,p_actor,p_tipo,p_reembolso,p_disputa,p_resolucion,p_nota); end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into t from public.trabajos where id=e.trabajo_id;
  select * into e from public.transacciones_escrow where id=p_escrow for update;
  select * into h from public.trabajos_hitos where id=e.hito_id and trabajo_id=t.id for update;
  if h.id is null or t.modalidad_pago<>'hitos' then raise exception 'El pago no corresponde al contrato por hitos'; end if;
  aceptacion_fijada:=p_tipo='cancelacion' and p_actor is not null
    and t.cancelacion_aceptada_por is not distinct from p_actor
    and diime_private.parte_cancelacion(t.id) is not null;
  if p_tipo in ('confirmacion','cancelacion') and not aceptacion_fijada then
    perform diime_private.validar_actor_cobros_empresa(t.id,p_actor,case when p_tipo='confirmacion' then 'cliente' else null end);
  end if;
  perform set_config('diime.actor_usuario_id',coalesce(p_actor::text,''),true);
  if p_tipo='confirmacion' then
    if not diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'gestionar_cobros','cliente') then raise exception 'Solo un cliente autorizado confirma'; end if;
    op:='confirmacion-'||e.id;
  elsif p_tipo='cancelacion' then
    if t.cancelacion_aceptada_por is null or diime_private.parte_cancelacion(t.id) is null or (not aceptacion_fijada and not diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'gestionar_cobros',case when diime_private.parte_cancelacion(t.id)='cliente' then 'proveedor' else 'cliente' end)) then raise exception 'La cancelación no está aceptada por una contraparte autorizada'; end if;
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
      destino:=t.proveedor_stripe_account_id;
      -- No reconstructing a historical destination from today's account.
      if e.pago_neto_proveedor>0 and destino is null then raise exception 'El contrato no tiene un destinatario de cobros fijado'; end if;
      update public.transacciones_escrow set liquidacion_contexto=jsonb_build_object('hito_id',h.id,'contrato_id',t.id,'tipo',p_tipo,'disputa_id',p_disputa,'actor',p_actor,'resolucion',p_resolucion,'nota',p_nota,'destino',destino,'empresa_proveedora_id',t.empresa_proveedora_id,'proveedor_cobros_usuario_id',case when t.empresa_proveedora_id is not null then t.proveedor_cobros_usuario_id else coalesce(t.proveedor_cobros_usuario_id,e.profesional_id) end) where id=e.id returning * into e;
    end if;
    return to_jsonb(e);
  end if;
  if e.stripe_payment_intent_id is null or e.monto_base<=0 or e.monto is distinct from e.monto_base+e.comision_cliente then raise exception 'Importes o cobro sin conciliar'; end if;
  if p_tipo='confirmacion' and (t.estado<>'en_progreso' or h.estado<>'entregado' or not h.activo or t.pago_bloqueado or t.cancelacion_estado='pendiente'
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
    destino:=t.proveedor_stripe_account_id;
    -- A paid contract without a frozen destination requires explicit reconciliation.
    if destino is null then raise exception 'El profesional no tiene una cuenta de cobros habilitada'; end if;
  end if;
  update public.transacciones_escrow set estado=case when p_tipo='pago_tardio' then 'pago_tardio' else 'liquidando' end,
    liquidacion_estado='procesando',liquidacion_error=null,liquidacion_operacion_id=op,
    monto_reembolsado=p_reembolso,monto_bruto_proveedor=bruto,comision_proveedor=comision,pago_neto_proveedor=bruto-comision,
    comision_cliente_retenida=retenida,retencion_plataforma=retenida+comision,
    liquidacion_contexto=jsonb_build_object('hito_id',h.id,'contrato_id',t.id,'tipo',p_tipo,'disputa_id',p_disputa,'actor',p_actor,'resolucion',p_resolucion,'nota',p_nota,'destino',destino,'empresa_proveedora_id',t.empresa_proveedora_id,'proveedor_cobros_usuario_id',case when t.empresa_proveedora_id is not null then t.proveedor_cobros_usuario_id else coalesce(t.proveedor_cobros_usuario_id,e.profesional_id) end)
    where id=e.id returning * into e;
  if p_tipo='confirmacion' then update public.trabajos_hitos set estado='aprobado',updated_at=now() where id=h.id; end if;
  return to_jsonb(e);
end; $$;

create function diime_private.cerrar_cancelacion_aceptada(p_trabajo uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.trabajos%rowtype;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo;
  if t.modalidad_pago<>'hitos' then return diime_private.cerrar_cancelacion_aceptada_pago_unico(p_trabajo); end if;
  if t.cancelacion_aceptada_por is null or diime_private.parte_cancelacion(t.id) is null then
    raise exception 'La cancelación no tiene una aceptación fijada'; end if;
  if t.estado='cancelado' then return jsonb_build_object('ok',true,'nuevo_cierre',false); end if;
  if t.estado not in('pendiente_pago','en_progreso') then raise exception 'El trabajo ya cambió de estado'; end if;
  -- Earlier completed milestones are retained, never refunded by a later cancellation.
  if exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and
    (estado not in('cancelado','reembolsado','completado','liberado')
      or (estado in('reembolsado','completado','liberado') and liquidacion_estado is distinct from 'completada')
      or stripe_disputa_id is not null)) then raise exception 'Queda un pago por conciliar'; end if;
  update public.trabajos_hitos set estado='cancelado',updated_at=now()
    where trabajo_id=t.id and activo and estado not in('completado','cancelado');
  update public.trabajos_planes_hitos set estado='rechazado',resuelto_por=t.cancelacion_aceptada_por,resuelto_at=now()
    where trabajo_id=t.id and estado='pendiente';
  update public.trabajos set estado='cancelado',cancelacion_estado=null,pago_bloqueado=true,
    cancelacion_respuesta_razon=null,cancelacion_adjuntos_respuesta='{}',fecha_fin=now(),updated_at=now() where id=t.id;
  -- The accepted offer and its financial history remain contractual evidence.
  update public.solicitudes set estado='cancelada' where id=t.solicitud_id;
  return jsonb_build_object('ok',true,'nuevo_cierre',true);
end; $$;

create function public.diime_finalizar_liquidacion(p_escrow uuid,p_operacion text,p_charge text,p_refund text default null,p_refund_status text default null,p_transfer text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; h public.trabajos_hitos%rowtype;
  c jsonb; d public.disputas%rowtype; nuevo_cierre boolean:=false; aviso jsonb; avisos jsonb:='[]'; nueva boolean;
begin
  select * into e from public.transacciones_escrow where id=p_escrow;
  if not found then raise exception 'Pago no encontrado'; end if;
  if e.hito_id is null then return public.diime_finalizar_liquidacion_pago_unico(p_escrow,p_operacion,p_charge,p_refund,p_refund_status,p_transfer); end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into e from public.transacciones_escrow where id=p_escrow for update;
  select * into t from public.trabajos where id=e.trabajo_id;
  select * into h from public.trabajos_hitos where id=e.hito_id and trabajo_id=t.id for update;
  if h.id is null or e.liquidacion_operacion_id is distinct from p_operacion or e.liquidacion_contexto is null
    or e.liquidacion_contexto->>'hito_id' is distinct from h.id::text then raise exception 'La liquidación del hito no tiene una decisión fijada'; end if;
  c:=e.liquidacion_contexto;
  if e.stripe_disputa_id is not null then raise exception 'Contracargo recibido: concilia los movimientos antes de cerrar'; end if;
  if e.stripe_refund_id=p_refund and e.stripe_refund_status in('failed','canceled') then
    raise exception 'El reembolso vigente falló. Autoriza otro intento antes de cerrar.'; end if;
  nueva:=e.liquidacion_estado is distinct from 'completada';
  if nueva then
    if p_charge is null or (e.stripe_charge_id is not null and e.stripe_charge_id<>p_charge)
      or (e.monto_reembolsado>0 and (p_refund is null or p_refund_status is distinct from 'succeeded'))
      or (e.pago_neto_proveedor>0 and p_transfer is null) then raise exception 'Faltan movimientos confirmados de Stripe'; end if;
    update public.transacciones_escrow set estado=case when e.monto_bruto_proveedor>0 then 'completado' else 'reembolsado' end,
      liquidacion_estado='completada',liquidacion_error=null,stripe_charge_id=p_charge,
      stripe_refund_id=p_refund,stripe_refund_status=p_refund_status,stripe_transfer_id=p_transfer,
      fecha_reembolso=case when e.monto_reembolsado>0 then now() else fecha_reembolso end,
      fecha_liberacion=case when e.pago_neto_proveedor>0 then now() else fecha_liberacion end where id=e.id;
  else
    -- A retry must not substitute a different Stripe movement after settlement.
    if e.stripe_charge_id is distinct from p_charge or e.stripe_refund_id is distinct from p_refund
      or e.stripe_transfer_id is distinct from p_transfer then raise exception 'Los movimientos ya quedaron conciliados'; end if;
    return jsonb_build_object('ok',true,'reembolso',e.monto_reembolsado,'neto',e.pago_neto_proveedor,'nuevo_cierre',false,'avisos',avisos);
  end if;
  if c->>'tipo'='confirmacion' then
    if h.estado<>'aprobado' or not h.activo or t.estado<>'en_progreso' then raise exception 'El hito ya no admite confirmar'; end if;
    update public.trabajos_hitos set estado='completado',updated_at=now() where id=h.id;
    nuevo_cierre:=diime_private.actualizar_cierre_hitos(t.id);
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
      values(coalesce(t.operador_proveedor_id,t.profesional_id),'pago_liberado','Pago del hito transferido',
        'El cliente aprobó "'||h.titulo||'". La transferencia figura en el detalle de pagos del hito.',
        '/trabajos/'||t.id||'/hitos',false,jsonb_build_object('trabajo_id',t.id,'hito_id',h.id,'escrow_id',e.id,'parte_destinataria','proveedor'))
      returning to_jsonb(notificaciones) into aviso;
    if aviso is not null then avisos:=avisos||jsonb_build_array(aviso); end if;
  elsif c->>'tipo'='cancelacion' then
    update public.trabajos_hitos set estado='cancelado',updated_at=now() where id=h.id;
    nuevo_cierre:=(diime_private.cerrar_cancelacion_aceptada(t.id)->>'nuevo_cierre')::boolean;
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
      values(coalesce(t.operador_cliente_id,t.cliente_id),'reembolso_emitido','Cancelación reembolsada',
        'Se ha reembolsado el hito "'||h.titulo||'". Los hitos ya completados se conservan. Consulta el detalle de pagos para ver los importes y comisiones.',
        '/trabajos/'||t.id||'/hitos',false,jsonb_build_object('trabajo_id',t.id,'hito_id',h.id,'escrow_id',e.id,'parte_destinataria','cliente'))
      returning to_jsonb(notificaciones) into aviso;
    if aviso is not null then avisos:=avisos||jsonb_build_array(aviso); end if;
  elsif c->>'tipo'='disputa' then
    select * into d from public.disputas where id=(c->>'disputa_id')::uuid for update;
    if d.id is null or d.escrow_id is distinct from e.id or d.estado not in('abierta','en_revision','resuelta') or d.origen<>'usuario' then raise exception 'La disputa ya no admite este cierre'; end if;
    if d.estado='resuelta' then
      -- A late Refund failure reopens only the money. Future milestones may
      -- already be funded, so recovering it must not rewrite the work history.
      return jsonb_build_object('ok',true,'reembolso',e.monto_reembolsado,'neto',e.pago_neto_proveedor,'nuevo_cierre',false,'avisos',avisos);
    end if;
    update public.disputas set estado='resuelta',resolucion=c->>'resolucion',resultado=c->>'nota',
      resuelto_por=(c->>'actor')::uuid,fecha_resolucion=now(),updated_at=now() where id=d.id;
    update public.trabajos_hitos set estado=case when c->>'resolucion'='cliente' then 'cancelado' else 'completado' end,updated_at=now() where id=h.id;
    nuevo_cierre:=diime_private.actualizar_cierre_hitos(t.id);
    with enviados as (
      insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata) values
      (coalesce(t.operador_cliente_id,t.cliente_id),'disputa_resuelta','Disputa del hito resuelta',
        'Se ha resuelto el hito "'||h.titulo||'". Consulta la devolución en el detalle de pagos. Motivo: '||coalesce(c->>'nota',''),
        '/trabajos/'||t.id||'/hitos',false,jsonb_build_object('trabajo_id',t.id,'hito_id',h.id,'disputa_id',d.id,'parte_destinataria','cliente')),
      (coalesce(t.operador_proveedor_id,t.profesional_id),'disputa_resuelta','Disputa del hito resuelta',
        'Se ha resuelto el hito "'||h.titulo||'". Consulta la transferencia en el detalle de pagos. Motivo: '||coalesce(c->>'nota',''),
        '/trabajos/'||t.id||'/hitos',false,jsonb_build_object('trabajo_id',t.id,'hito_id',h.id,'disputa_id',d.id,'parte_destinataria','proveedor')) returning *
    ) select coalesce(jsonb_agg(to_jsonb(enviados)),'[]'::jsonb) into avisos from enviados;
  elsif c->>'tipo'='pago_tardio' then
    -- Refunding an obsolete Checkout cannot deactivate a newer paid attempt.
    if t.cancelacion_aceptada_por is not null and t.estado in('pendiente_pago','en_progreso')
      and not exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and estado not in('cancelado','reembolsado','completado','liberado')) then
      nuevo_cierre:=(diime_private.cerrar_cancelacion_aceptada(t.id)->>'nuevo_cierre')::boolean;
    end if;
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
      values(coalesce(t.operador_cliente_id,t.cliente_id),'reembolso_emitido','Pago tardío del hito reembolsado',
        'El pago del hito llegó tras el cierre de su intento y se ha devuelto íntegramente. Este pago no ha activado el hito.',
        '/trabajos/'||t.id||'/hitos',false,jsonb_build_object('trabajo_id',t.id,'hito_id',h.id,'escrow_id',e.id,'parte_destinataria','cliente'))
      returning to_jsonb(notificaciones) into aviso;
    if aviso is not null then avisos:=avisos||jsonb_build_array(aviso); end if;
  else raise exception 'Tipo de cierre del hito no válido'; end if;
  return jsonb_build_object('ok',true,'reembolso',e.monto_reembolsado,'neto',e.pago_neto_proveedor,'nuevo_cierre',nuevo_cierre,'avisos',avisos);
end; $$;

create function public.diime_registrar_contracargo(p_payment_intent text,p_stripe_disputa text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.transacciones_escrow%rowtype; h public.trabajos_hitos%rowtype; r jsonb;
begin
  select * into e from public.transacciones_escrow where stripe_payment_intent_id=p_payment_intent;
  if e.hito_id is null then return public.diime_registrar_contracargo_pago_unico(p_payment_intent,p_stripe_disputa); end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into h from public.trabajos_hitos where id=e.hito_id for update;
  r:=public.diime_registrar_contracargo_pago_unico(p_payment_intent,p_stripe_disputa);
  if r->'contracargo_conciliacion'->>'estado'='completada' then return r; end if;
  update public.disputas set estado_hito_previo=coalesce(estado_hito_previo,h.estado) where id=(r->>'id')::uuid returning to_jsonb(disputas) into r;
  update public.trabajos_hitos set estado='en_disputa',updated_at=now() where id=h.id;
  return r;
end; $$;

create function public.diime_finalizar_conciliacion_contracargo(p_disputa uuid,p_stripe_disputa text,p_actor uuid,p_sesion uuid,p_reversal text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.disputas%rowtype; e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; r jsonb;
begin
  select * into d from public.disputas where id=p_disputa;
  select * into e from public.transacciones_escrow where id=d.escrow_id;
  if e.hito_id is null then return public.diime_finalizar_conciliacion_contracargo_pago_unico(p_disputa,p_stripe_disputa,p_actor,p_sesion,p_reversal); end if;
  -- Validate the active administrator and freeze the bank result before touching
  -- work state. Restore the stage before the legacy finalizer's parent guard.
  r:=public.diime_preparar_conciliacion_contracargo(p_disputa,p_stripe_disputa,p_actor,p_sesion);
  if (r->>'completada')::boolean then return r; end if;
  select * into d from public.disputas where id=p_disputa;
  select * into e from public.transacciones_escrow where id=d.escrow_id;
  select * into t from public.trabajos where id=e.trabajo_id;
  update public.trabajos_hitos set estado=case when d.stripe_disputa_estado='lost' and e.stripe_transfer_id is null
    then 'cancelado' else coalesce(d.estado_hito_previo,'financiado') end,updated_at=now() where id=e.hito_id;
  -- The original finalizer checks the exact reversal and preserves settled IDs.
  r:=public.diime_finalizar_conciliacion_contracargo_pago_unico(p_disputa,p_stripe_disputa,p_actor,p_sesion,p_reversal);
  if d.estado_trabajo_previo='cancelado' or t.cancelacion_aceptada_por is not null then
    if not exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision')) then
      update public.trabajos set estado='cancelado',pago_bloqueado=true,updated_at=now() where id=t.id;
      update public.solicitudes set estado='cancelada' where id=t.solicitud_id;
    end if;
  else perform diime_private.actualizar_cierre_hitos(e.trabajo_id);
  end if;
  return r;
end; $$;

-- A user dispute names the only funded milestone; the rest of the contract is
-- paused while mediation is open, without changing previously settled money.
alter function public.diime_abrir_disputa(uuid,uuid,text,boolean,text[]) rename to diime_abrir_disputa_pago_unico;
alter function public.diime_retirar_disputa(uuid,uuid) rename to diime_retirar_disputa_pago_unico;
create function public.diime_abrir_disputa(p_trabajo uuid,p_actor uuid,p_motivo text,p_rechazo_cancelacion boolean default false,p_adjuntos text[] default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; e public.transacciones_escrow%rowtype; h public.trabajos_hitos%rowtype; t public.trabajos%rowtype; d public.disputas%rowtype; parte text;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo;
  if t.modalidad_pago='hitos' and t.estado='en_progreso' and p_rechazo_cancelacion
    and not exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and estado not in('cancelado','reembolsado','completado','liberado')) then
    -- A rejected cancellation between stages is mediation about the remaining
    -- obligation. It cannot reopen or refund any previously settled milestone.
    perform diime_private.validar_actor_trabajo_empresa(t.id,p_actor);
    parte:=diime_private.parte_cancelacion(t.id);
    if parte is null or t.cancelacion_estado is distinct from 'pendiente' or t.cancelacion_aceptada_por is not null
      or diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos',parte)
      or nullif(btrim(p_motivo),'') is null or length(p_motivo)>4000 then raise exception 'La cancelación ya no admite este rechazo'; end if;
    if exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision'))
      or exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and (stripe_disputa_id is not null or (estado<>'cancelado' and liquidacion_estado is distinct from 'completada'))) then raise exception 'Hay movimientos o disputas pendientes de conciliar'; end if;
    perform diime_private.validar_adjuntos_actor(p_adjuntos,p_actor);
    insert into public.disputas(trabajo_id,cliente_id,profesional_id,tipo,motivo,estado,estado_trabajo_previo,escrow_id,origen,actor_apertura_id)
      values(t.id,t.cliente_id,t.profesional_id,parte,'Cancelación del resto del contrato rechazada. Motivo: '||coalesce(t.cancelacion_razon,'')||'. Oposición: '||p_motivo,'abierta',t.estado,null,'usuario',p_actor) returning * into d;
    update public.trabajos set estado='en_disputa',pago_bloqueado=true,cancelacion_estado='rechazada',cancelacion_respuesta_razon=p_motivo,cancelacion_adjuntos_respuesta=p_adjuntos,updated_at=now() where id=t.id;
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
      select id,'disputa_abierta_admin','Mediación del resto del contrato','Revisa la cancelación de los hitos pendientes de "'||t.titulo||'".',
        '/admin/disputas?disputa='||d.id,false,jsonb_build_object('trabajo_id',t.id,'disputa_id',d.id) from public.profiles where es_admin=true;
    return to_jsonb(d)||jsonb_build_object('parte_actor',case when diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos','cliente') then 'cliente' else 'proveedor' end);
  end if;
  r:=public.diime_abrir_disputa_pago_unico(p_trabajo,p_actor,p_motivo,p_rechazo_cancelacion,p_adjuntos);
  select * into e from public.transacciones_escrow where id=(r->>'escrow_id')::uuid;
  if e.hito_id is not null then
    select * into h from public.trabajos_hitos where id=e.hito_id for update;
    update public.disputas set estado_hito_previo=h.estado where id=(r->>'id')::uuid;
    update public.trabajos_hitos set estado='en_disputa',updated_at=now() where id=h.id;
    r:=r||jsonb_build_object('hito_id',h.id,'estado_hito_previo',h.estado);
  end if;
  return r;
end; $$;
create function public.diime_retirar_disputa(p_disputa uuid,p_actor uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare d public.disputas%rowtype; e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; r text;
begin
  select * into d from public.disputas where id=p_disputa;
  if d.id is null then return 'no_encontrada'; end if;
  perform public.diime_bloquear_trabajo_financiero(d.trabajo_id);
  select * into d from public.disputas where id=p_disputa for update;
  select * into e from public.transacciones_escrow where id=d.escrow_id;
  select * into t from public.trabajos where id=d.trabajo_id;
  if t.modalidad_pago='hitos' and d.escrow_id is null and d.estado_trabajo_previo='en_progreso' then
    perform diime_private.validar_actor_trabajo_empresa(t.id,p_actor);
    if not diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos',d.tipo) then return 'no_autorizado'; end if;
    if d.estado<>'abierta' then return 'no_abierta'; end if;
    if d.origen<>'usuario' or d.stripe_disputa_id is not null then return 'contracargo'; end if;
    if t.estado<>'en_disputa' or exists(select 1 from public.disputas where trabajo_id=t.id and id<>d.id and estado in('abierta','en_revision')) then return 'requiere_conciliacion'; end if;
    update public.disputas set estado='retirada',updated_at=now() where id=d.id;
    update public.trabajos set estado='en_progreso',pago_bloqueado=false,updated_at=now() where id=t.id;
    return 'ok';
  end if;
  r:=public.diime_retirar_disputa_pago_unico(p_disputa,p_actor);
  if r='ok' and e.hito_id is not null then
    if d.estado_hito_previo not in('financiado','entregado','cambios_solicitados') or d.estado_hito_previo is null then raise exception 'El estado previo del hito necesita conciliación'; end if;
    update public.trabajos_hitos set estado=d.estado_hito_previo,updated_at=now() where id=e.hito_id;
  end if;
  return r;
end; $$;
revoke all on function public.diime_abrir_disputa(uuid,uuid,text,boolean,text[]),public.diime_retirar_disputa(uuid,uuid) from public,anon,authenticated;
grant execute on function public.diime_abrir_disputa(uuid,uuid,text,boolean,text[]),public.diime_retirar_disputa(uuid,uuid) to service_role;

create function public.diime_abrir_disputa_hito(p_trabajo uuid,p_hito uuid,p_actor uuid,p_motivo text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.trabajos%rowtype; h public.trabajos_hitos%rowtype; e public.transacciones_escrow%rowtype;
  d public.disputas%rowtype; parte text;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);
  select * into t from public.trabajos where id=p_trabajo;
  select * into h from public.trabajos_hitos where id=p_hito and trabajo_id=p_trabajo for update;
  if h.id is null or not h.activo or h.estado not in('financiado','entregado','cambios_solicitados')
    or t.modalidad_pago<>'hitos' or t.estado<>'en_progreso' or t.cancelacion_aceptada_por is not null or t.pago_bloqueado
    or nullif(btrim(p_motivo),'') is null or length(p_motivo)>4000 then
    raise exception 'El hito ya no admite abrir esta disputa. Actualiza el contrato.'; end if;
  if exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision')) then raise exception 'Ya existe una disputa abierta'; end if;
  -- Old refunded stages can reopen financially. Never infer this payment from
  -- the parent job or select the first active row across different milestones.
  select * into e from public.transacciones_escrow where trabajo_id=t.id and hito_id=h.id
    and estado in('retenido','fondos_retenidos') for update;
  if e.id is null or e.liquidacion_operacion_id is not null or e.stripe_disputa_id is not null or e.stripe_payment_intent_id is null then raise exception 'El pago de este hito ya tiene una operación en curso'; end if;
  parte:=case when diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos','cliente') then 'cliente' else 'proveedor' end;
  insert into public.disputas(trabajo_id,cliente_id,profesional_id,tipo,motivo,estado,estado_trabajo_previo,estado_escrow_previo,estado_hito_previo,escrow_id,origen,actor_apertura_id)
    values(t.id,t.cliente_id,t.profesional_id,parte,p_motivo,'abierta',t.estado,e.estado,h.estado,e.id,'usuario',p_actor) returning * into d;
  update public.transacciones_escrow set estado='disputa' where id=e.id;
  update public.trabajos_hitos set estado='en_disputa',updated_at=now() where id=h.id;
  update public.trabajos set estado='en_disputa',pago_bloqueado=true,updated_at=now() where id=t.id;
  insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
    select id,'disputa_abierta_admin','Nueva disputa de un hito','Revisa el hito "'||h.titulo||'" de "'||t.titulo||'".',
      '/admin/disputas?disputa='||d.id,false,jsonb_build_object('trabajo_id',t.id,'hito_id',h.id,'disputa_id',d.id)
    from public.profiles where es_admin=true;
  return to_jsonb(d)||jsonb_build_object('hito_id',h.id,'parte_actor',parte);
end; $$;
revoke all on function public.diime_abrir_disputa_hito(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.diime_abrir_disputa_hito(uuid,uuid,uuid,text) to service_role;

alter function public.diime_resolver_mediacion(uuid,uuid,text,text) rename to diime_resolver_mediacion_pago_unico;
create function public.diime_resolver_mediacion(p_disputa uuid,p_actor uuid,p_resolucion text,p_nota text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.disputas%rowtype; t public.trabajos%rowtype; avisos jsonb:='[]'; mensaje text;
begin
  select * into d from public.disputas where id=p_disputa;
  select * into t from public.trabajos where id=d.trabajo_id;
  if t.modalidad_pago is distinct from 'hitos' then return public.diime_resolver_mediacion_pago_unico(p_disputa,p_actor,p_resolucion,p_nota); end if;
  if not exists(select 1 from public.profiles where id=p_actor and es_admin=true and cuenta_eliminada is null) then raise exception 'Solo administración resuelve'; end if;
  perform public.diime_bloquear_trabajo_financiero(t.id);
  select * into d from public.disputas where id=p_disputa for update;
  select * into t from public.trabajos where id=d.trabajo_id;
  if d.escrow_id is not null or d.origen<>'usuario' or d.estado_trabajo_previo not in('pendiente_pago','en_progreso')
    or exists(select 1 from public.transacciones_escrow where trabajo_id=t.id and
      (estado not in('cancelado','completado','liberado','reembolsado') or stripe_disputa_id is not null
        or (estado<>'cancelado' and liquidacion_estado is distinct from 'completada'))) then raise exception 'No es una mediación sin pago pendiente conciliada'; end if;
  if d.estado='resuelta' and d.resolucion=p_resolucion then return jsonb_build_object('ok',true,'avisos',avisos); end if;
  if d.estado not in('abierta','en_revision') or t.estado<>'en_disputa' or p_resolucion is null or p_resolucion not in('cliente','proveedor') then raise exception 'Resolución sin pago no válida'; end if;
  if p_resolucion='cliente' then
    update public.trabajos_hitos set estado='cancelado',updated_at=now() where trabajo_id=t.id and activo and estado='pendiente';
    update public.trabajos_planes_hitos set estado='rechazado',resuelto_por=p_actor,resuelto_at=now() where trabajo_id=t.id and estado='pendiente';
  end if;
  update public.trabajos set estado=case when p_resolucion='cliente' then 'cancelado' else d.estado_trabajo_previo end,
    pago_bloqueado=p_resolucion='cliente',cancelacion_estado=null,
    fecha_fin=case when p_resolucion='cliente' then now() else null end,updated_at=now() where id=t.id;
  update public.solicitudes set estado=case when p_resolucion='cliente' then 'cancelada' when d.estado_trabajo_previo='en_progreso' then 'en_progreso' else 'abierta' end where id=t.solicitud_id;
  update public.disputas set estado='resuelta',resolucion=p_resolucion,resultado=p_nota,resuelto_por=p_actor,fecha_resolucion=now(),updated_at=now() where id=d.id;
  mensaje:=case when p_resolucion='cliente' then 'La mediación cancela los hitos pendientes. Los hitos ya completados y sus pagos se conservan.' else 'La mediación mantiene los hitos pendientes. Cada uno debe pagarse antes de iniciarse.' end;
  with enviados as (
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata) values
      (coalesce(t.operador_cliente_id,t.cliente_id),'disputa_resuelta','Mediación resuelta sin nuevos movimientos',mensaje||' Motivo: '||coalesce(p_nota,''),'/trabajos/'||t.id||'/hitos',false,jsonb_build_object('trabajo_id',t.id,'disputa_id',d.id,'parte_destinataria','cliente')),
      (coalesce(t.operador_proveedor_id,t.profesional_id),'disputa_resuelta','Mediación resuelta sin nuevos movimientos',mensaje||' Motivo: '||coalesce(p_nota,''),'/trabajos/'||t.id||'/hitos',false,jsonb_build_object('trabajo_id',t.id,'disputa_id',d.id,'parte_destinataria','proveedor')) returning *
    ) select coalesce(jsonb_agg(to_jsonb(enviados)),'[]'::jsonb) into avisos from enviados;
  return jsonb_build_object('ok',true,'avisos',avisos);
end; $$;
revoke all on function public.diime_resolver_mediacion(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.diime_resolver_mediacion(uuid,uuid,text,text) to service_role;

revoke all on function
  diime_private.actualizar_cierre_hitos(uuid),diime_private.cerrar_cancelacion_aceptada(uuid),
  public.diime_confirmar_pago(uuid,text,text,text,numeric,text),
  public.diime_reclamar_liquidacion(uuid,uuid,text,numeric,uuid,text,text),
  public.diime_finalizar_liquidacion(uuid,text,text,text,text,text),
  public.diime_registrar_contracargo(text,text),public.diime_finalizar_conciliacion_contracargo(uuid,text,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function
  diime_private.actualizar_cierre_hitos(uuid),diime_private.cerrar_cancelacion_aceptada(uuid),
  public.diime_confirmar_pago(uuid,text,text,text,numeric,text),
  public.diime_reclamar_liquidacion(uuid,uuid,text,numeric,uuid,text,text),
  public.diime_finalizar_liquidacion(uuid,text,text,text,text,text),
  public.diime_registrar_contracargo(text,text),public.diime_finalizar_conciliacion_contracargo(uuid,text,uuid,uuid,text)
  to service_role;

-- Company routing still validates membership and permissions first. Keep the
-- exact milestone page for this same contract; unknown routes use the legacy
-- company fallback. This preserves both in-app and externally delivered links.
do $hitos_aviso_ruta$
declare definition text; original_route text:=$ruta$new.link:='/mi-empresa?trabajo='||t.id||'&aspecto='||new.tipo;$ruta$;
begin
  definition:=pg_get_functiondef('diime_private.proteger_destinatario_aviso_empresa()'::regprocedure);
  if position(original_route in definition)=0 then raise exception 'La protección de avisos de empresa cambió; revisa su ruta antes de migrar'; end if;
  definition:=replace(definition,original_route,'if new.link is distinct from (''/trabajos/''||t.id||''/hitos'') then '||original_route||' end if;');
  execute definition;
end; $hitos_aviso_ruta$;

commit;
