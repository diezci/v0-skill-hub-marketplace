begin;

-- Each later milestone revalidates the same frozen recipient before Checkout.
-- A continuing milestone contract may reuse its destination; it cannot choose
-- a new one. Legacy single-payment contracts keep their original state gate.
create or replace function public.empresa_fijar_destino_cobro_trabajo(p_trabajo uuid,p_actor uuid,p_destino text)
returns text language plpgsql security invoker set search_path='' as $$
declare t public.trabajos%rowtype; cuenta text;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo for update;
  if not found or not diime_private.empresa_puede_operar_trabajo(p_trabajo,p_actor,'gestionar_cobros','cliente') then
    raise exception 'Solo un cliente autorizado puede preparar este pago' using errcode='42501'; end if;
  perform diime_private.validar_actor_cobros_empresa(t.id,p_actor,'cliente');
  if (t.empresa_cliente_id is not null and not exists(select 1 from public.empresas where id=t.empresa_cliente_id and estado_verificacion='verificada'))
    or (t.empresa_proveedora_id is not null and not exists(select 1 from public.empresas where id=t.empresa_proveedora_id and estado_verificacion='verificada')) then
    raise exception 'Las empresas del contrato deben estar verificadas antes de preparar nuevos pagos'; end if;
  if t.empresa_proveedora_id is not null and not diime_private.empresa_puede_operar_trabajo(t.id,coalesce(t.operador_proveedor_id,t.profesional_id),'encargos','proveedor') then
    raise exception 'La empresa proveedora necesita un responsable de trabajo activo y estar verificada' using errcode='42501'; end if;
  perform set_config('diime.actor_usuario_id',p_actor::text,true);
  if (t.estado<>'pendiente_pago' and not (t.modalidad_pago='hitos' and t.estado='en_progreso' and t.proveedor_stripe_account_id is not null))
    or t.pago_bloqueado or t.cancelacion_estado='pendiente' then
    raise exception 'El trabajo no admite preparar un pago' using errcode='55000'; end if;
  if nullif(btrim(p_destino),'') is null then raise exception 'La cuenta de cobros no está configurada'; end if;
  -- Even an invalid historical destination is never silently replaced.
  if t.proveedor_stripe_account_id is not null then
    if t.proveedor_stripe_account_id<>p_destino then raise exception 'El destinatario de cobros ya está fijado'; end if;
    return t.proveedor_stripe_account_id;
  end if;
  if exists(select 1 from public.transacciones_escrow where trabajo_id=t.id
    and (stripe_charge_id is not null or stripe_session_id is not null or estado in('retenido','fondos_retenidos','liquidando','completado'))) then
    raise exception 'No se puede cambiar el destinatario de un pago ya preparado'; end if;
  if t.empresa_proveedora_id is not null then
    select stripe_account_id into cuenta from public.empresa_cuentas_stripe where empresa_id=t.empresa_proveedora_id
      and stripe_onboarding_completado and stripe_transferencias_habilitadas and stripe_payouts_habilitados;
  else
    select stripe_account_id into cuenta from public.profesionales where id=coalesce(t.proveedor_cobros_usuario_id,t.profesional_id)
      and stripe_onboarding_completado and stripe_transferencias_habilitadas and stripe_payouts_habilitados;
  end if;
  if cuenta is distinct from p_destino then raise exception 'El destino no pertenece al titular del contrato o no está habilitado'; end if;
  update public.trabajos set proveedor_stripe_account_id=p_destino where id=t.id;
  return p_destino;
end; $$;
revoke all on function public.empresa_fijar_destino_cobro_trabajo(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.empresa_fijar_destino_cobro_trabajo(uuid,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
