-- Bank proceedings retain their own identity, independently of user mediation.
alter table public.disputas
  add column stripe_disputa_estado text,
  add column stripe_disputa_importe bigint,
  add column stripe_disputa_moneda text,
  add column stripe_disputa_plazo timestamptz,
  add column stripe_disputa_evento_id text,
  add column contracargo_conciliacion jsonb,
  add column stripe_transfer_reversal_id text;
create unique index disputas_stripe_disputa_unica on public.disputas(stripe_disputa_id) where stripe_disputa_id is not null;

create or replace function public.diime_registrar_contracargo(p_payment_intent text,p_stripe_disputa text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; d public.disputas%rowtype;
begin
  select * into strict e from public.transacciones_escrow where stripe_payment_intent_id=p_payment_intent;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into e from public.transacciones_escrow where id=e.id for update;
  select * into t from public.trabajos where id=e.trabajo_id;
  select * into d from public.disputas where stripe_disputa_id=p_stripe_disputa for update;
  if d.id is not null then
    if d.escrow_id<>e.id or d.trabajo_id<>t.id then raise exception 'Contracargo ajeno al pago'; end if;
    -- Replayed bank events cannot reopen a reconciled obligation.
    if d.contracargo_conciliacion->>'estado'='completada' then return to_jsonb(d); end if;
  else
    insert into public.disputas(trabajo_id,cliente_id,profesional_id,tipo,motivo,estado,estado_trabajo_previo,estado_escrow_previo,escrow_id,origen,stripe_disputa_id)
    values(t.id,t.cliente_id,t.profesional_id,'cliente','Stripe ha recibido un contracargo bancario ('||p_stripe_disputa||'). Gestionar en Stripe.','abierta',t.estado,e.estado,e.id,'stripe',p_stripe_disputa) returning * into d;
  end if;
  if e.stripe_disputa_id is not null and e.stripe_disputa_id<>p_stripe_disputa then raise exception 'Otro contracargo requiere conciliación'; end if;
  update public.transacciones_escrow set stripe_disputa_id=p_stripe_disputa,
    estado=case when estado in('retenido','fondos_retenidos') then 'disputa' else estado end,
    liquidacion_error='Contracargo bancario pendiente de conciliación en Stripe' where id=e.id;
  update public.trabajos set estado='en_disputa',pago_bloqueado=true,updated_at=now() where id=t.id;
  return to_jsonb(d);
exception when no_data_found then raise exception 'Contracargo sin pago conciliado';
end; $$;

-- Called with a current, verified Stripe retrieval, never browser-supplied amounts.
create function public.diime_actualizar_contracargo(p_payment_intent text,p_stripe_disputa text,p_charge text,p_estado text,p_importe bigint,p_moneda text,p_plazo timestamptz,p_evento text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.transacciones_escrow%rowtype; d public.disputas%rowtype; r jsonb;
begin
  select * into e from public.transacciones_escrow where stripe_payment_intent_id=p_payment_intent;
  if e.id is null then raise exception 'Contracargo sin pago conciliado'; end if;
  if e.stripe_charge_id is distinct from p_charge or p_importe<=0 or p_importe>round(e.monto*100) or p_moneda<>'eur' then raise exception 'El contracargo no corresponde al cargo'; end if;
  r:=public.diime_registrar_contracargo(p_payment_intent,p_stripe_disputa);
  select * into d from public.disputas where id=(r->>'id')::uuid;
  if d.stripe_disputa_estado in('won','lost') and d.stripe_disputa_estado is distinct from p_estado then
    raise exception 'Resultado bancario contradictorio';
  end if;
  update public.disputas set stripe_disputa_estado=p_estado,stripe_disputa_importe=p_importe,
    stripe_disputa_moneda=p_moneda,stripe_disputa_plazo=p_plazo,
    stripe_disputa_evento_id=coalesce(p_evento,stripe_disputa_evento_id),updated_at=now()
    where id=d.id returning * into d;
  return to_jsonb(d);
end; $$;

create function public.diime_preparar_conciliacion_contracargo(p_disputa uuid,p_stripe_disputa text,p_actor uuid,p_sesion uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.disputas%rowtype; e public.transacciones_escrow%rowtype; plan jsonb;
begin
  if not exists(select 1 from public.profiles where id=p_actor and es_admin and cuenta_eliminada is null)
    or not exists(select 1 from auth.sessions where id=p_sesion and user_id=p_actor and (not_after is null or not_after>now())) then raise exception 'No autorizado'; end if;
  select * into d from public.disputas where id=p_disputa;
  if d.id is null or d.origen<>'stripe' or d.stripe_disputa_id is distinct from p_stripe_disputa then raise exception 'Expediente bancario no válido'; end if;
  perform public.diime_bloquear_trabajo_financiero(d.trabajo_id);
  select * into d from public.disputas where id=d.id for update;
  select * into e from public.transacciones_escrow where id=d.escrow_id for update;
  if d.contracargo_conciliacion->>'estado'='completada' then return jsonb_build_object('disputa',to_jsonb(d),'escrow',to_jsonb(e),'completada',true); end if;
  if d.stripe_disputa_estado not in('won','lost') or d.stripe_disputa_estado is null
    or d.stripe_disputa_importe is distinct from round(e.monto*100)::bigint
    or e.stripe_disputa_id is distinct from d.stripe_disputa_id then raise exception 'El banco no ha cerrado este cargo íntegro'; end if;
  if e.stripe_refund_id is not null or (e.liquidacion_operacion_id is not null and e.liquidacion_estado is distinct from 'completada') then raise exception 'Hay otros movimientos que requieren conciliación'; end if;
  plan:=jsonb_build_object('estado','procesando','resultado',d.stripe_disputa_estado,'actor',p_actor,'fecha',now(),
    'transfer',e.stripe_transfer_id,'operacion',e.liquidacion_operacion_id,'neto',e.pago_neto_proveedor);
  if d.contracargo_conciliacion is null then
    update public.disputas set contracargo_conciliacion=plan where id=d.id returning * into d;
  elsif d.contracargo_conciliacion->>'resultado' is distinct from d.stripe_disputa_estado
    or d.contracargo_conciliacion->>'transfer' is distinct from e.stripe_transfer_id
    or d.contracargo_conciliacion->>'operacion' is distinct from e.liquidacion_operacion_id then raise exception 'La conciliación cambió'; end if;
  return jsonb_build_object('disputa',to_jsonb(d),'escrow',to_jsonb(e),'completada',false);
end; $$;

create function public.diime_finalizar_conciliacion_contracargo(p_disputa uuid,p_stripe_disputa text,p_actor uuid,p_sesion uuid,p_reversal text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare d public.disputas%rowtype; e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; r jsonb; mediacion boolean;
begin
  r:=public.diime_preparar_conciliacion_contracargo(p_disputa,p_stripe_disputa,p_actor,p_sesion);
  if (r->>'completada')::boolean then return r; end if;
  select * into d from public.disputas where id=p_disputa;
  select * into e from public.transacciones_escrow where id=d.escrow_id;
  select * into t from public.trabajos where id=d.trabajo_id;
  if d.stripe_disputa_estado='lost' and e.stripe_transfer_id is not null and nullif(p_reversal,'') is null then raise exception 'Falta recuperar la transferencia'; end if;
  if p_reversal is not null and (d.stripe_disputa_estado<>'lost' or e.stripe_transfer_id is null) then raise exception 'Reversión no esperada'; end if;
  select exists(select 1 from public.disputas where trabajo_id=t.id and id<>d.id and estado in('abierta','en_revision')) into mediacion;
  if d.stripe_disputa_estado='lost' and e.stripe_transfer_id is null then
    -- The bank has already returned the payment. Never issue a Stripe Refund.
    update public.transacciones_escrow set estado='reembolsado',monto_reembolsado=monto,
      monto_bruto_proveedor=0,pago_neto_proveedor=0,comision_proveedor=0,comision_cliente_retenida=0,retencion_plataforma=0,
      liquidacion_operacion_id='contracargo-'||d.stripe_disputa_id,liquidacion_estado='completada',
      liquidacion_contexto=jsonb_build_object('tipo','contracargo','disputaId',d.id,'resultado','lost'),
      fecha_reembolso=now(),stripe_disputa_id=null,liquidacion_error=null,updated_at=now() where id=e.id;
    update public.trabajos set estado=case when mediacion then 'en_disputa' else 'cancelado' end,
      pago_bloqueado=mediacion,fecha_fin=coalesce(fecha_fin,now()),updated_at=now() where id=t.id;
  else
    -- Preserve completed settlement amounts and IDs; recovery has its own record.
    update public.transacciones_escrow set estado=coalesce(d.estado_escrow_previo,e.estado),stripe_disputa_id=null,
      liquidacion_error=null,updated_at=now() where id=e.id;
    update public.trabajos set estado=case when mediacion then 'en_disputa' else coalesce(d.estado_trabajo_previo,t.estado) end,
      pago_bloqueado=mediacion,updated_at=now() where id=t.id;
  end if;
  update public.disputas set estado='resuelta',resultado=case when stripe_disputa_estado='won' then 'Contracargo ganado y conciliado en Stripe.' else 'Contracargo perdido y conciliado en Stripe; sin reembolso adicional.' end,
    resuelto_por=p_actor,fecha_resolucion=now(),stripe_transfer_reversal_id=p_reversal,
    contracargo_conciliacion=contracargo_conciliacion||jsonb_build_object('estado','completada','finalizada_en',now(),'finalizada_por',p_actor),updated_at=now()
    where id=d.id returning * into d;
  return jsonb_build_object('disputa',to_jsonb(d),'completada',true);
end; $$;

revoke all on function public.diime_actualizar_contracargo(text,text,text,text,bigint,text,timestamptz,text),public.diime_preparar_conciliacion_contracargo(uuid,text,uuid,uuid),public.diime_finalizar_conciliacion_contracargo(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.diime_actualizar_contracargo(text,text,text,text,bigint,text,timestamptz,text),public.diime_preparar_conciliacion_contracargo(uuid,text,uuid,uuid),public.diime_finalizar_conciliacion_contracargo(uuid,text,uuid,uuid,text) to service_role;
