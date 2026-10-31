-- Explicit administrative closure of mediation after a fully returned bank charge.
-- Financial rows, the original reason and evidence remain untouched.
alter table public.disputas add column cierre_bancario_contexto jsonb;

create function public.diime_cerrar_mediacion_tras_contracargo(p_disputa uuid,p_contracargo uuid,p_actor uuid,p_sesion uuid,p_motivo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.disputas%rowtype; b public.disputas%rowtype; e public.transacciones_escrow%rowtype;
  t public.trabajos%rowtype; abiertos boolean; motivo text:=btrim(p_motivo);
begin
  if motivo is null or motivo='' or length(motivo)>2000 then raise exception 'Motivo de cierre obligatorio'; end if;
  if not exists(select 1 from public.profiles where id=p_actor and es_admin and cuenta_eliminada is null)
    or not exists(select 1 from auth.sessions where id=p_sesion and user_id=p_actor and (not_after is null or not_after>now())) then
    raise exception 'No autorizado';
  end if;
  select * into d from public.disputas where id=p_disputa;
  if d.id is null or d.origen is distinct from 'usuario' or d.stripe_disputa_id is not null or d.escrow_id is null then
    raise exception 'Mediación no válida';
  end if;
  perform public.diime_bloquear_trabajo_financiero(d.trabajo_id);
  select * into d from public.disputas where id=p_disputa for update;
  select * into e from public.transacciones_escrow where id=d.escrow_id for update;
  select * into b from public.disputas where id=p_contracargo for update;
  select * into t from public.trabajos where id=d.trabajo_id;
  -- A session or administrator role may have been revoked while this request waited for the lock.
  if not exists(select 1 from public.profiles where id=p_actor and es_admin and cuenta_eliminada is null)
    or not exists(select 1 from auth.sessions where id=p_sesion and user_id=p_actor and (not_after is null or not_after>now())) then
    raise exception 'No autorizado';
  end if;
  if b.id is null or e.id is null or b.origen is distinct from 'stripe' or b.estado is distinct from 'resuelta'
    or b.escrow_id is distinct from e.id or b.trabajo_id is distinct from d.trabajo_id or e.trabajo_id is distinct from d.trabajo_id
    or b.stripe_disputa_id is null or b.stripe_disputa_estado is distinct from 'lost'
    or b.contracargo_conciliacion->>'estado' is distinct from 'completada'
    or b.contracargo_conciliacion->>'resultado' is distinct from 'lost'
    or b.stripe_disputa_importe is distinct from round(e.monto*100)::bigint or b.stripe_disputa_moneda is distinct from 'eur'
    or e.monto is null or e.monto<=0 or e.stripe_charge_id is null or e.stripe_payment_intent_id is null
    or e.estado is distinct from 'reembolsado' or e.liquidacion_estado is distinct from 'completada'
    or e.liquidacion_contexto->>'tipo' is distinct from 'contracargo'
    or e.liquidacion_contexto->>'resultado' is distinct from 'lost'
    or e.liquidacion_contexto->>'disputaId' is distinct from b.id::text
    or e.liquidacion_operacion_id is distinct from 'contracargo-'||b.stripe_disputa_id
    or e.monto_reembolsado is distinct from e.monto or e.pago_neto_proveedor is distinct from 0::numeric
    or e.stripe_refund_id is not null or e.stripe_transfer_id is not null or e.stripe_disputa_id is not null then
    raise exception 'El cargo íntegro no está devuelto y conciliado por el banco';
  end if;
  if d.estado='resuelta' and d.resolucion='cierre_bancario'
    and d.cierre_bancario_contexto->>'contracargo_id'=b.id::text then
    return jsonb_build_object('cerrada',true,'nuevo_cierre',false);
  end if;
  if d.estado not in('abierta','en_revision') then raise exception 'La mediación ya tiene una decisión'; end if;
  update public.disputas set estado='resuelta',resolucion='cierre_bancario',resultado=motivo,
    resuelto_por=p_actor,fecha_resolucion=now(),updated_at=now(),
    cierre_bancario_contexto=jsonb_build_object('contracargo_id',b.id,'stripe_disputa_id',b.stripe_disputa_id,
      'actor',p_actor,'fecha',now(),'motivo',motivo,'sin_movimientos',true)
    where id=d.id;
  select exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision')) into abiertos;
  update public.trabajos set estado=case when abiertos then 'en_disputa' else 'cancelado' end,
    pago_bloqueado=abiertos,fecha_fin=case when abiertos then fecha_fin else coalesce(fecha_fin,now()) end,updated_at=now()
    where id=t.id;
  if not abiertos and not exists(select 1 from public.trabajos where solicitud_id=t.solicitud_id and id<>t.id
    and estado not in('cancelado','rechazado')) then
    update public.solicitudes set estado='cancelada',updated_at=now() where id=t.solicitud_id;
  end if;
  insert into public.actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje)
    values(t.id,p_actor,'mensaje','Mediación cerrada tras la conciliación bancaria, sin mover fondos. Motivo: '||motivo);
  return jsonb_build_object('cerrada',true,'nuevo_cierre',true,'otros_expedientes_abiertos',abiertos);
end; $$;

revoke all on function public.diime_cerrar_mediacion_tras_contracargo(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.diime_cerrar_mediacion_tras_contracargo(uuid,uuid,uuid,uuid,text) to service_role;
