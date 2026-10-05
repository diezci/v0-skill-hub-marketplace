-- El contrato conserva al actor trabajador y al titular económico por separado.
-- No modifica liquidaciones reclamadas: sus importes y destinos son inmutables.
-- El servidor contrasta este destino con la identidad real de Stripe antes de
-- fijarlo o de entregar un Checkout al cliente.
create or replace function public.empresa_fijar_destino_cobro_trabajo(p_trabajo uuid,p_actor uuid,p_destino text)
returns text language plpgsql security invoker set search_path='' as $$
declare t public.trabajos%rowtype; cuenta text; titular uuid;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo for update;
  if not found or p_actor is null or p_actor is distinct from t.cliente_id then
    raise exception 'Solo el cliente puede preparar este pago' using errcode='42501';
  end if;
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);
  if t.empresa_proveedora_id is not null then
    perform 1 from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id
      where m.empresa_id=t.empresa_proveedora_id and m.usuario_id=t.profesional_id
        and m.estado='activo' and p.cuenta_eliminada is null for share of m;
    if not found then raise exception 'El profesional ya no pertenece al equipo activo de la empresa'; end if;
  end if;
  if t.estado<>'pendiente_pago' or t.pago_bloqueado or t.cancelacion_estado='pendiente' then
    raise exception 'El trabajo no admite preparar un pago' using errcode='55000';
  end if;
  if nullif(btrim(p_destino),'') is null then raise exception 'La cuenta de cobros no está configurada'; end if;
  if t.proveedor_stripe_account_id is not null then
    if t.proveedor_stripe_account_id<>p_destino then raise exception 'El destinatario de cobros ya está fijado'; end if;
    return t.proveedor_stripe_account_id;
  end if;
  if exists(select 1 from public.transacciones_escrow where trabajo_id=t.id
    and (stripe_charge_id is not null or (t.empresa_proveedora_id is not null and stripe_session_id is not null)
      or estado in('retenido','fondos_retenidos','liquidando','completado'))) then
    raise exception 'No se puede cambiar el destinatario de un pago ya preparado';
  end if;
  titular:=t.proveedor_cobros_usuario_id;
  if titular is null and t.empresa_proveedora_id is null then titular:=t.profesional_id; end if;
  if titular is null then raise exception 'La empresa del contrato no tiene un titular de cobros identificado'; end if;
  select stripe_account_id into cuenta from public.profesionales where id=titular;
  if cuenta is distinct from p_destino then raise exception 'El destino no pertenece al titular del contrato'; end if;
  update public.trabajos set proveedor_stripe_account_id=p_destino where id=t.id;
  return p_destino;
end; $$;
revoke all on function public.empresa_fijar_destino_cobro_trabajo(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.empresa_fijar_destino_cobro_trabajo(uuid,uuid,text) to service_role;

create or replace function public.diime_reclamar_liquidacion(p_escrow uuid,p_actor uuid,p_tipo text,p_reembolso numeric default 0,p_disputa uuid default null,p_resolucion text default null,p_nota text default '')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.transacciones_escrow%rowtype; t public.trabajos%rowtype; d public.disputas%rowtype; op text; bruto numeric; comision numeric; retenida numeric; destino text;
begin
  select * into e from public.transacciones_escrow where id=p_escrow;
  if not found then raise exception 'Pago no encontrado'; end if;
  perform public.diime_bloquear_trabajo_financiero(e.trabajo_id);
  select * into t from public.trabajos where id=e.trabajo_id;
  select * into e from public.transacciones_escrow where id=p_escrow for update;
  if p_tipo in ('confirmacion','cancelacion') then
    perform diime_private.validar_actor_trabajo_empresa(t.id,p_actor);
  end if;
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
      destino:=t.proveedor_stripe_account_id;
      if destino is null and t.empresa_proveedora_id is null then
        select stripe_account_id into destino from public.profesionales where id=coalesce(t.proveedor_cobros_usuario_id,e.profesional_id);
      end if;
      if e.pago_neto_proveedor>0 and destino is null then raise exception 'El contrato no tiene un destinatario de cobros fijado'; end if;
      update public.transacciones_escrow set liquidacion_contexto=jsonb_build_object('tipo',p_tipo,'disputa_id',p_disputa,'actor',p_actor,'resolucion',p_resolucion,'nota',p_nota,'destino',destino,'empresa_proveedora_id',t.empresa_proveedora_id,'proveedor_cobros_usuario_id',coalesce(t.proveedor_cobros_usuario_id,e.profesional_id)) where id=e.id returning * into e;
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
    destino:=t.proveedor_stripe_account_id;
    if destino is null and t.empresa_proveedora_id is null then
      select stripe_account_id into destino from public.profesionales where id=coalesce(t.proveedor_cobros_usuario_id,e.profesional_id)
        and stripe_transferencias_habilitadas and stripe_payouts_habilitados;
    end if;
    if destino is null then raise exception 'El profesional no tiene una cuenta de cobros habilitada'; end if;
  end if;
  update public.transacciones_escrow set estado=case when p_tipo='pago_tardio' then 'pago_tardio' else 'liquidando' end,
    liquidacion_estado='procesando',liquidacion_error=null,liquidacion_operacion_id=op,
    monto_reembolsado=p_reembolso,monto_bruto_proveedor=bruto,comision_proveedor=comision,pago_neto_proveedor=bruto-comision,
    comision_cliente_retenida=retenida,retencion_plataforma=retenida+comision,
    liquidacion_contexto=jsonb_build_object('tipo',p_tipo,'disputa_id',p_disputa,'actor',p_actor,'resolucion',p_resolucion,'nota',p_nota,'destino',destino,'empresa_proveedora_id',t.empresa_proveedora_id,'proveedor_cobros_usuario_id',coalesce(t.proveedor_cobros_usuario_id,e.profesional_id))
    where id=e.id returning * into e;
  return to_jsonb(e);
end; $$;
