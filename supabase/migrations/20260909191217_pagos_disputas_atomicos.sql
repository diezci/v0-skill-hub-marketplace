-- All money paths share solicitud -> trabajo -> escrow locks. External Stripe
-- calls occur only after a durable claim, and are completed by one transaction.
alter table public.trabajos
  add column if not exists pago_bloqueado boolean not null default false,
  add column if not exists cancelacion_aceptada_por uuid references auth.users(id);
alter table public.disputas
  add column if not exists escrow_id uuid references public.transacciones_escrow(id),
  add column if not exists origen text not null default 'usuario',
  add column if not exists stripe_disputa_id text;
alter table public.transacciones_escrow
  add column if not exists liquidacion_contexto jsonb,
  add column if not exists stripe_disputa_id text;
alter table public.disputas alter column resultado type text;
alter table public.transacciones_escrow drop constraint if exists transacciones_escrow_estado_check;
alter table public.transacciones_escrow add constraint transacciones_escrow_estado_check
  check (estado in ('pendiente','retenido','fondos_retenidos','liquidando','liberado','completado','reembolsado','disputa','cancelado','pago_tardio'));

-- Backfill only an unambiguous real payment; an abandoned Checkout is never
-- considered money held. Unknown old records require reconciliation, not guesses.
update public.disputas d set escrow_id = e.id
from public.transacciones_escrow e
where d.escrow_id is null and e.trabajo_id = d.trabajo_id
  and e.stripe_payment_intent_id is not null
  and e.estado in ('retenido','fondos_retenidos','disputa','liquidando','completado','liberado','reembolsado')
  and not exists (select 1 from public.transacciones_escrow other
    where other.trabajo_id=e.trabajo_id and other.id<>e.id
      and other.stripe_payment_intent_id is not null
      and other.estado in ('retenido','fondos_retenidos','disputa','liquidando','completado','liberado','reembolsado'));
update public.disputas set origen='stripe'
where motivo like 'Stripe ha recibido un contracargo bancario (%';

-- Repair only unambiguous open disputes left half-created by the previous
-- multi-statement code. This changes workflow states, never historical money.
update public.transacciones_escrow e set estado='disputa'
from public.disputas d, public.trabajos t
where d.escrow_id=e.id and d.trabajo_id=t.id and d.estado in('abierta','en_revision') and d.origen='usuario'
  and t.estado in('en_progreso','entregado','en_disputa') and e.estado in('retenido','fondos_retenidos')
  and e.liquidacion_operacion_id is null
  and not exists(select 1 from public.disputas other where other.trabajo_id=t.id and other.id<>d.id and other.estado in('abierta','en_revision'))
  and not exists(select 1 from public.transacciones_escrow other where other.trabajo_id=t.id and other.id<>e.id and other.estado in('pendiente','retenido','fondos_retenidos','disputa','liquidando'));
update public.trabajos t set estado='en_disputa',pago_bloqueado=true
from public.disputas d,public.transacciones_escrow e
where d.trabajo_id=t.id and d.escrow_id=e.id and d.estado in('abierta','en_revision')
  and e.estado='disputa' and t.estado in('en_progreso','entregado');

create or replace function public.diime_bloquear_trabajo_financiero(p_trabajo uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare v_solicitud uuid;
begin
  select solicitud_id into v_solicitud from public.trabajos where id=p_trabajo;
  if v_solicitud is not null then perform 1 from public.solicitudes where id=v_solicitud for update; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trabajo::text,0));
  perform 1 from public.trabajos where id=p_trabajo for update;
  if not found then raise exception 'Trabajo no encontrado'; end if;
end; $$;

-- A stale request cannot create another Checkout after cancellation/mediation.
create or replace function public.diime_guardar_checkout_y_contexto()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if tg_op='INSERT' and new.estado='pendiente' then
    perform public.diime_bloquear_trabajo_financiero(new.trabajo_id);
    if not exists(select 1 from public.trabajos where id=new.trabajo_id
      and estado='pendiente_pago' and not pago_bloqueado and cancelacion_estado is distinct from 'pendiente') then
      raise exception 'El trabajo no admite preparar un pago en este momento';
    end if;
  end if;
  if tg_op='UPDATE' and old.liquidacion_contexto is not null
    and new.liquidacion_contexto is distinct from old.liquidacion_contexto then
    raise exception 'El destino y la decisión de una liquidación ya iniciada son inmutables';
  end if;
  return new;
end; $$;
create trigger trg_diime_guardar_checkout_y_contexto before insert or update on public.transacciones_escrow
for each row execute function public.diime_guardar_checkout_y_contexto();

create or replace function public.diime_cerrar_intento(p_escrow uuid,p_session text default null)
returns boolean language plpgsql security invoker set search_path=public as $$
declare e public.transacciones_escrow%rowtype;
begin
  select * into e from public.transacciones_escrow where id=p_escrow;
  if not found then raise exception 'Intento no encontrado'; end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into e from public.transacciones_escrow where id=p_escrow for update;
  if e.estado<>'pendiente' then return false; end if;
  if e.stripe_session_id is distinct from p_session then return false; end if;
  update public.transacciones_escrow set estado='cancelado' where id=e.id;
  return true;
end; $$;

create or replace function public.diime_bloquear_checkout(p_trabajo uuid,p_actor uuid,p_cancelacion boolean default false,p_rechazo_cancelacion boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
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
end; $$;

create or replace function public.diime_confirmar_pago(p_escrow uuid,p_session text,p_payment_intent text,p_charge text,p_total numeric,p_moneda text)
returns jsonb language plpgsql security invoker set search_path=public as $$
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
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida)
      values(t.profesional_id,'pago_recibido','El cliente ha pagado: puedes empezar',
      'El pago de "'||coalesce(t.titulo,'el trabajo')||'" está confirmado. La transferencia queda pendiente de confirmación o resolución.','/mis-trabajos',false) returning to_jsonb(notificaciones) into aviso;
    avisos := avisos || jsonb_build_array(aviso);
  end if;
  return jsonb_build_object('escrow',to_jsonb(e),'activado',cambio,'tardio',tardio,'avisos',avisos);
end; $$;

create or replace function public.diime_abrir_disputa(p_trabajo uuid,p_actor uuid,p_motivo text,p_rechazo_cancelacion boolean default false,p_adjuntos text[] default '{}')
returns jsonb language plpgsql security invoker set search_path=public as $$
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
  insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida)
    select id,'disputa_abierta_admin','Nueva disputa para revisar', 'Revisa la disputa de "'||coalesce(t.titulo,'el trabajo')||'".','/admin/disputas',false
    from public.profiles where es_admin=true;
  return to_jsonb(d);
end; $$;

create or replace function public.diime_retirar_disputa(p_disputa uuid,p_actor uuid)
returns text language plpgsql security invoker set search_path=public as $$
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
end; $$;
-- Disable the old public routine that bulk-updated historical escrows.
revoke execute on function public.retirar_disputa(uuid) from public,anon,authenticated;

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
  if p_tipo in('cancelacion','pago_tardio') then p_reembolso:=e.monto; bruto:=0; comision:=0; retenida:=0;
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

create or replace function public.diime_cerrar_cancelacion(p_trabajo uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
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
end; $$;

create or replace function public.diime_finalizar_liquidacion(p_escrow uuid,p_operacion text,p_charge text,p_refund text default null,p_refund_status text default null,p_transfer text default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
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
      insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida)
        values(t.profesional_id,'pago_liberado','Pago liberado','El cliente confirmó la entrega. Se te ha transferido '||e.pago_neto_proveedor||' EUR netos.','/mis-trabajos',false) returning to_jsonb(notificaciones) into aviso;
      avisos := avisos || jsonb_build_array(aviso);
    end if;
    if t.estado not in('entregado','completado') then raise exception 'El trabajo ya no admite confirmar'; end if;
    update public.trabajos set estado='completado',fecha_fin=coalesce(fecha_fin,now()),updated_at=now() where id=t.id;
    update public.solicitudes set estado='completada' where id=t.solicitud_id;
  elsif c->>'tipo'='cancelacion' then
    nuevo_cierre := (public.diime_cerrar_cancelacion(t.id,(c->>'actor')::uuid)->>'nuevo_cierre')::boolean;
    if nuevo_cierre then
      insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida)
        values(t.cliente_id,'reembolso_emitido','Cancelación reembolsada','Se ha cancelado el servicio de mutuo acuerdo y se han devuelto íntegramente '||e.monto_reembolsado||' EUR.','/mis-solicitudes',false) returning to_jsonb(notificaciones) into aviso;
      avisos := avisos || jsonb_build_array(aviso);
    end if;
  elsif c->>'tipo'='disputa' then
    select * into d from public.disputas where id=(c->>'disputa_id')::uuid for update;
    if d.estado not in('abierta','en_revision','resuelta') or d.origen<>'usuario' then raise exception 'La disputa ya no admite este cierre'; end if;
    if d.estado<>'resuelta' then
      with enviados as (
        insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida) values
        (t.cliente_id,case when c->>'resolucion'='cliente' then 'disputa_ganada' when c->>'resolucion'='proveedor' then 'disputa_perdida' else 'disputa_resuelta' end,
          'Disputa resuelta','La mediación de Diime ha concluido. Reembolso al cliente: '||e.monto_reembolsado||' EUR. Motivo: '||coalesce(c->>'nota','')||'. La decisión es privada y no impide emprender otras acciones.','/mis-solicitudes',false),
        (t.profesional_id,case when c->>'resolucion'='proveedor' then 'disputa_ganada' when c->>'resolucion'='cliente' then 'disputa_perdida' else 'disputa_resuelta' end,
          'Disputa resuelta','La mediación de Diime ha concluido. Transferencia neta al proveedor: '||e.pago_neto_proveedor||' EUR. Motivo: '||coalesce(c->>'nota','')||'. La decisión es privada y no impide emprender otras acciones.','/mis-trabajos',false)
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
      insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida)
        values(t.cliente_id,'reembolso_emitido','Pago tardío reembolsado','El pago llegó tras el cierre de su intento y se ha devuelto íntegramente. El servicio no se ha reactivado.','/mis-solicitudes',false) returning to_jsonb(notificaciones) into aviso;
      avisos := avisos || jsonb_build_array(aviso);
    end if;
  else raise exception 'Tipo de cierre no válido';
  end if;
  return jsonb_build_object('ok',true,'reembolso',e.monto_reembolsado,'neto',e.pago_neto_proveedor,'nuevo_cierre',nuevo_cierre,'avisos',avisos);
end; $$;

create or replace function public.diime_resolver_mediacion(p_disputa uuid,p_actor uuid,p_resolucion text,p_nota text)
returns jsonb language plpgsql security invoker set search_path=public as $$
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
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida) values
      (t.cliente_id,'disputa_resuelta','Mediación resuelta sin pago',mensaje||' Motivo: '||coalesce(p_nota,''),'/mis-solicitudes',false),
      (t.profesional_id,'disputa_resuelta','Mediación resuelta sin pago',mensaje||' Motivo: '||coalesce(p_nota,''),'/mis-trabajos',false)
    returning *
  ) select coalesce(jsonb_agg(to_jsonb(enviados)),'[]'::jsonb) into avisos from enviados;
  return jsonb_build_object('ok',true,'avisos',avisos);
end; $$;

create or replace function public.diime_registrar_contracargo(p_payment_intent text,p_stripe_disputa text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; d public.disputas%rowtype;
begin
  select * into e from public.transacciones_escrow where stripe_payment_intent_id=p_payment_intent;
  if not found then raise exception 'Contracargo sin pago conciliado'; end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into e from public.transacciones_escrow where id=e.id for update;
  select * into t from public.trabajos where id=e.trabajo_id;
  update public.transacciones_escrow set stripe_disputa_id=p_stripe_disputa,
    estado=case when estado in('retenido','fondos_retenidos') then 'disputa' else estado end,
    liquidacion_error='Contracargo bancario pendiente de conciliación en Stripe' where id=e.id;
  select * into d from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision') for update;
  if d.id is null then
    insert into public.disputas(trabajo_id,cliente_id,profesional_id,tipo,motivo,estado,estado_trabajo_previo,estado_escrow_previo,escrow_id,origen,stripe_disputa_id)
    values(t.id,t.cliente_id,t.profesional_id,'cliente','Stripe ha recibido un contracargo bancario ('||p_stripe_disputa||'). Gestionar en Stripe.','abierta',t.estado,e.estado,e.id,'stripe',p_stripe_disputa) returning * into d;
  else
    update public.disputas set origen='stripe',stripe_disputa_id=p_stripe_disputa,escrow_id=e.id where id=d.id;
  end if;
  update public.trabajos set estado='en_disputa',pago_bloqueado=true,updated_at=now() where id=t.id;
  return to_jsonb(d);
end; $$;

-- These functions have no user-controlled elevated authority: only the backend
-- service role can call them, after authenticating p_actor in a server action.
do $$ declare f record;
begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
    and proname in('diime_bloquear_trabajo_financiero','diime_guardar_checkout_y_contexto','diime_bloquear_checkout',
      'diime_cerrar_intento','diime_confirmar_pago','diime_abrir_disputa','diime_retirar_disputa','diime_reclamar_liquidacion',
      'diime_cerrar_cancelacion','diime_finalizar_liquidacion','diime_resolver_mediacion','diime_registrar_contracargo')
  loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end; $$;

-- RLS alone is not enough here: old admin UPDATE policies and participant
-- INSERT policies must not expose a bypass around the atomic money workflows.
revoke insert,update,delete,truncate,references,trigger on public.transacciones_escrow,public.disputas from public,anon,authenticated;
do $$ declare t text; columnas text;
begin
  foreach t in array array['transacciones_escrow','disputas'] loop
    select string_agg(quote_ident(attname),',') into columnas from pg_attribute
      where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',columnas,columnas,columnas,t);
  end loop;
end; $$;
