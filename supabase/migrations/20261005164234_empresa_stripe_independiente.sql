begin;


-- The side of a cancellation is contractual history, not today's membership.
alter table public.trabajos add column cancelacion_parte_solicitante text check(cancelacion_parte_solicitante in ('cliente','proveedor'));
alter table public.disputas add column actor_apertura_id uuid;
alter table public.transacciones_escrow add column actor_pago_id uuid;

create function diime_private.parte_cancelacion(p_trabajo uuid)
returns text language sql stable security invoker set search_path='' as $$
  select coalesce(t.cancelacion_parte_solicitante,case when t.cancelacion_solicitada_por=t.cliente_id then 'cliente' when t.cancelacion_solicitada_por=t.profesional_id then 'proveedor' end)
  from public.trabajos t where t.id=p_trabajo;
$$;
revoke all on function diime_private.parte_cancelacion(uuid) from public,anon,authenticated;
grant execute on function diime_private.parte_cancelacion(uuid) to service_role;

create function diime_private.sellar_parte_cancelacion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.cancelacion_estado='pendiente' and (old.cancelacion_estado is distinct from 'pendiente' or new.cancelacion_solicitada_por is distinct from old.cancelacion_solicitada_por) then
    if diime_private.empresa_puede_operar_trabajo(old.id,new.cancelacion_solicitada_por,'encargos','cliente') then new.cancelacion_parte_solicitante:='cliente';
    elsif diime_private.empresa_puede_operar_trabajo(old.id,new.cancelacion_solicitada_por,'encargos','proveedor') then new.cancelacion_parte_solicitante:='proveedor';
    else raise exception 'No se puede identificar la parte que solicita la cancelación' using errcode='42501'; end if;
  elsif new.cancelacion_parte_solicitante is distinct from old.cancelacion_parte_solicitante then
    raise exception 'La parte que solicitó la cancelación es inmutable' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function diime_private.sellar_parte_cancelacion() from public,anon,authenticated,service_role;
create trigger zz_empresa_sellar_parte_cancelacion before update on public.trabajos for each row execute function diime_private.sellar_parte_cancelacion();

-- Lock the acting membership through the transaction, then authorize its side.
create function diime_private.validar_actor_cobros_empresa(p_trabajo uuid,p_actor uuid,p_parte text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare t public.trabajos;
begin
  select * into t from public.trabajos where id=p_trabajo;
  perform 1 from public.empresa_miembros m where m.usuario_id=p_actor and m.empresa_id in(t.empresa_cliente_id,t.empresa_proveedora_id) order by m.empresa_id for share;
  if not diime_private.empresa_puede_operar_trabajo(p_trabajo,p_actor,'gestionar_cobros',p_parte) then
    raise exception 'No tienes permiso para gestionar los cobros de este trabajo' using errcode='42501'; end if;
  perform set_config('diime.actor_usuario_id',p_actor::text,true);
end; $$;
revoke all on function diime_private.validar_actor_cobros_empresa(uuid,uuid,text) from public,anon,authenticated;
grant execute on function diime_private.validar_actor_cobros_empresa(uuid,uuid,text) to service_role;

-- A company owns its own Connect account. Membership never transfers a personal
-- account and this migration deliberately does not copy or rewrite old accounts.
create table public.empresa_cuentas_stripe (
  empresa_id uuid primary key references public.empresas(id),
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9_]+$'),
  stripe_onboarding_completado boolean not null default false,
  stripe_transferencias_habilitadas boolean not null default false,
  stripe_payouts_habilitados boolean not null default false,
  stripe_requisitos_pendientes jsonb not null default '[]' check (jsonb_typeof(stripe_requisitos_pendientes)='array'),
  stripe_estado_actualizado_at timestamptz,
  creada_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.empresa_cuentas_stripe enable row level security;
revoke all on public.empresa_cuentas_stripe from public,anon,authenticated,service_role;
grant select,insert on public.empresa_cuentas_stripe to service_role;
grant update(stripe_onboarding_completado,stripe_transferencias_habilitadas,stripe_payouts_habilitados,stripe_requisitos_pendientes,stripe_estado_actualizado_at) on public.empresa_cuentas_stripe to service_role;

create function public.registrar_cuenta_stripe_empresa(p_empresa_id uuid,p_actor uuid,p_account_id text)
returns text language plpgsql security invoker set search_path='' as $$
declare cuenta text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(p_account_id,''),0));
  perform 1 from public.empresas where id=p_empresa_id for update;
  if not found then raise exception 'Empresa no encontrada'; end if;
  perform 1 from public.empresa_miembros m where m.empresa_id=p_empresa_id and m.usuario_id=p_actor
    and m.rol='principal' and diime_private.es_miembro_empresa(p_empresa_id,p_actor)
    and diime_private.empresa_tiene_permiso(p_empresa_id,p_actor,'ver_cobros') for share;
  if not found then raise exception 'Solo el responsable principal puede configurar Stripe' using errcode='42501'; end if;
  if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9_]+$' then raise exception 'Cuenta Stripe no válida'; end if;
  if exists(select 1 from public.profesionales where stripe_account_id=p_account_id) then
    raise exception 'Una cuenta personal no puede convertirse en cuenta de empresa'; end if;
  select stripe_account_id into cuenta from public.empresa_cuentas_stripe where empresa_id=p_empresa_id;
  if cuenta is not null then return cuenta; end if;
  insert into public.empresa_cuentas_stripe(empresa_id,stripe_account_id,creada_por) values(p_empresa_id,p_account_id,p_actor);
  return p_account_id;
end; $$;
create function public.registrar_cuenta_stripe_personal(p_profesional_id uuid,p_account_id text)
returns text language plpgsql security invoker set search_path='' as $$
declare cuenta text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(p_account_id,''),0));
  select stripe_account_id into cuenta from public.profesionales where id=p_profesional_id for update;
  if not found or not exists(select 1 from public.profiles where id=p_profesional_id and cuenta_eliminada is null) then raise exception 'Profesional no disponible'; end if;
  if cuenta is not null then return cuenta; end if;
  if p_account_id is null or p_account_id !~ '^acct_[A-Za-z0-9_]+$' then raise exception 'Cuenta Stripe no válida'; end if;
  if exists(select 1 from public.empresa_cuentas_stripe where stripe_account_id=p_account_id) then
    raise exception 'Una cuenta de empresa no puede convertirse en cuenta personal'; end if;
  update public.profesionales set stripe_account_id=p_account_id where id=p_profesional_id;
  return p_account_id;
end; $$;
create function public.actualizar_estado_cuenta_stripe_empresa(
  p_empresa_id uuid,p_account_id text,p_onboarding boolean,p_transferencias boolean,p_payouts boolean,p_requisitos jsonb
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_account_id is null or jsonb_typeof(coalesce(p_requisitos,'[]'::jsonb))<>'array' then raise exception 'Estado Stripe no válido'; end if;
  update public.empresa_cuentas_stripe set stripe_onboarding_completado=coalesce(p_onboarding,false),
    stripe_transferencias_habilitadas=coalesce(p_transferencias,false),stripe_payouts_habilitados=coalesce(p_payouts,false),
    stripe_requisitos_pendientes=coalesce(p_requisitos,'[]'::jsonb),stripe_estado_actualizado_at=now()
    where empresa_id=p_empresa_id and stripe_account_id=p_account_id;
  return found;
end; $$;
-- Keep the old signature for in-flight callers; company affiliation no longer
-- changes personal ownership. The server checks personal Stripe metadata.
create or replace function public.actualizar_estado_cuenta_stripe(
  p_profesional_id uuid,p_account_id text,p_empresa_esperada uuid,
  p_onboarding boolean,p_transferencias boolean,p_payouts boolean,p_requisitos jsonb
) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_account_id is null or jsonb_typeof(coalesce(p_requisitos,'[]'::jsonb))<>'array' then raise exception 'Estado Stripe no válido'; end if;
  perform 1 from public.profiles where id=p_profesional_id and cuenta_eliminada is null for share;
  if not found then return false; end if;
  update public.profesionales set stripe_onboarding_completado=coalesce(p_onboarding,false),
    stripe_transferencias_habilitadas=coalesce(p_transferencias,false),stripe_payouts_habilitados=coalesce(p_payouts,false),
    stripe_requisitos_pendientes=coalesce(p_requisitos,'[]'::jsonb),stripe_estado_actualizado_at=now()
    where id=p_profesional_id and stripe_account_id=p_account_id;
  return found;
end; $$;
revoke all on function public.registrar_cuenta_stripe_empresa(uuid,uuid,text),public.registrar_cuenta_stripe_personal(uuid,text),public.actualizar_estado_cuenta_stripe_empresa(uuid,text,boolean,boolean,boolean,jsonb),public.actualizar_estado_cuenta_stripe(uuid,text,uuid,boolean,boolean,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.registrar_cuenta_stripe_empresa(uuid,uuid,text),public.registrar_cuenta_stripe_personal(uuid,text),public.actualizar_estado_cuenta_stripe_empresa(uuid,text,boolean,boolean,boolean,jsonb),public.actualizar_estado_cuenta_stripe(uuid,text,uuid,boolean,boolean,boolean,jsonb) to service_role;

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
  if t.estado<>'pendiente_pago' or t.pago_bloqueado or t.cancelacion_estado='pendiente' then
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

create or replace function diime_private.empresa_sellar_operacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); empresa uuid; demanda public.solicitudes; oferta public.ofertas; fila jsonb; previo jsonb; proveedor uuid;
begin
  if tg_op='DELETE' then fila:=to_jsonb(old); else fila:=to_jsonb(new); end if;
  if tg_table_name in ('solicitudes','ofertas') then
    empresa:=(fila->>'empresa_id')::uuid;
    if tg_op='INSERT' then
      if actor is null and empresa is not null then raise exception 'La operación empresarial requiere una sesión personal' using errcode='42501'; end if;
      if actor is not null and actor is distinct from (fila->>case when tg_table_name='ofertas' then 'profesional_id' else 'cliente_id' end)::uuid then raise exception 'La operación debe conservar al profesional que la realiza' using errcode='42501'; end if;
      new.actor_usuario_id:=actor;
      if empresa is not null then
        -- El lock de miembro serializa una baja con cualquier operación nueva.
        perform 1 from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id where m.empresa_id=empresa and m.usuario_id=actor and m.estado='activo' and p.cuenta_eliminada is null and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id) for share of m;
        if not found then raise exception 'Ya no perteneces al equipo activo de esta empresa' using errcode='42501'; end if;
      end if;
      if tg_table_name='ofertas' then
        select * into demanda from public.solicitudes where id=new.solicitud_id;
        if empresa is not null and (empresa=demanda.empresa_id or diime_private.es_miembro_empresa(empresa,demanda.cliente_id))
          or demanda.empresa_id is not null and diime_private.es_miembro_empresa(demanda.empresa_id,actor) then
          raise exception 'No puedes pujar por una solicitud de tu propia empresa' using errcode='42501'; end if;
      end if;
    else
      if tg_table_name='ofertas' and actor is not null then
        select * into demanda from public.solicitudes where id=(fila->>'solicitud_id')::uuid;
        if demanda.cliente_id=actor and demanda.empresa_id is not null and not diime_private.es_miembro_empresa(demanda.empresa_id,actor) then raise exception 'La baja de la empresa impide gestionar sus ofertas recibidas' using errcode='42501'; end if;
      end if;
      if tg_op='UPDATE' and (new.empresa_id is distinct from old.empresa_id or new.actor_usuario_id is distinct from old.actor_usuario_id) then raise exception 'La identidad y autoría de la operación son inmutables' using errcode='42501'; end if;
      if empresa is not null and actor is not null and actor=(fila->>case when tg_table_name='ofertas' then 'profesional_id' else 'cliente_id' end)::uuid and not diime_private.es_miembro_empresa(empresa,actor) then raise exception 'La baja de la empresa impide operar en su nombre' using errcode='42501'; end if;
    end if;
  else
    if tg_op='INSERT' then
      select * into demanda from public.solicitudes where id=new.solicitud_id;
      select * into oferta from public.ofertas where id=new.oferta_id;
      new.empresa_cliente_id:=demanda.empresa_id; new.empresa_proveedora_id:=oferta.empresa_id; new.actor_contratacion_id:=actor;
      if demanda.empresa_id is not null then
        perform 1 from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id where m.empresa_id=demanda.empresa_id and m.usuario_id=actor and m.estado='activo' and p.cuenta_eliminada is null and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id) for share of m;
        if not found then raise exception 'No puedes contratar en nombre de esta empresa' using errcode='42501'; end if;
      end if;
      if oferta.empresa_id is not null then
        perform 1 from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id where m.empresa_id=oferta.empresa_id and m.usuario_id=oferta.profesional_id and m.estado='activo' and p.cuenta_eliminada is null and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id) for share of m;
        if not found then raise exception 'El autor de la oferta ya no pertenece a la empresa; solicita una nueva oferta' using errcode='42501'; end if;
        proveedor:=null;
        if oferta.empresa_id=demanda.empresa_id or diime_private.es_miembro_empresa(oferta.empresa_id,actor) then raise exception 'La empresa no puede contratarse a sí misma' using errcode='42501'; end if;
      else proveedor:=new.profesional_id; end if;
      new.proveedor_cobros_usuario_id:=proveedor;
      if new.empresa_proveedora_id is not null then
        select stripe_account_id into new.proveedor_stripe_account_id from public.empresa_cuentas_stripe where empresa_id=new.empresa_proveedora_id;
      else
        select stripe_account_id into new.proveedor_stripe_account_id from public.profesionales where id=proveedor;
      end if;
    elsif tg_op='UPDATE' then
      if new.empresa_cliente_id is distinct from old.empresa_cliente_id or new.empresa_proveedora_id is distinct from old.empresa_proveedora_id or new.actor_contratacion_id is distinct from old.actor_contratacion_id or new.proveedor_cobros_usuario_id is distinct from old.proveedor_cobros_usuario_id then raise exception 'La identidad y autoría del contrato son inmutables' using errcode='42501'; end if;
      if new.proveedor_stripe_account_id is distinct from old.proveedor_stripe_account_id and not (old.proveedor_stripe_account_id is null and actor is null and current_setting('role',true) in ('service_role','none') and old.estado='pendiente_pago') then raise exception 'El destino de cobro del contrato es inmutable' using errcode='42501'; end if;
    end if;
    if tg_op<>'INSERT' and actor is not null then
      if actor=(fila->>'cliente_id')::uuid and (fila->>'empresa_cliente_id') is not null and not diime_private.es_miembro_empresa((fila->>'empresa_cliente_id')::uuid,actor)
        or actor=(fila->>'profesional_id')::uuid and (fila->>'empresa_proveedora_id') is not null and not diime_private.es_miembro_empresa((fila->>'empresa_proveedora_id')::uuid,actor) then raise exception 'La baja de la empresa impide operar en su nombre' using errcode='42501'; end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function diime_private.empresa_sellar_operacion() from public,anon,authenticated;

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
    perform diime_private.validar_actor_cobros_empresa(t.id,p_actor,case when p_tipo='confirmacion' then 'cliente' else null end);
  end if;
  perform set_config('diime.actor_usuario_id',coalesce(p_actor::text,''),true);
  if p_tipo='confirmacion' then
    if not diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'gestionar_cobros','cliente') then raise exception 'Solo un cliente autorizado confirma'; end if;
    op:='confirmacion-'||e.id;
  elsif p_tipo='cancelacion' then
    if t.cancelacion_aceptada_por is null or diime_private.parte_cancelacion(t.id) is null or not diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'gestionar_cobros',case when diime_private.parte_cancelacion(t.id)='cliente' then 'proveedor' else 'cliente' end) then raise exception 'La cancelación no está aceptada por una contraparte autorizada'; end if;
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
      update public.transacciones_escrow set liquidacion_contexto=jsonb_build_object('tipo',p_tipo,'disputa_id',p_disputa,'actor',p_actor,'resolucion',p_resolucion,'nota',p_nota,'destino',destino,'empresa_proveedora_id',t.empresa_proveedora_id,'proveedor_cobros_usuario_id',case when t.empresa_proveedora_id is not null then t.proveedor_cobros_usuario_id else coalesce(t.proveedor_cobros_usuario_id,e.profesional_id) end) where id=e.id returning * into e;
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
    -- A paid contract without a frozen destination requires explicit reconciliation.
    if destino is null then raise exception 'El profesional no tiene una cuenta de cobros habilitada'; end if;
  end if;
  update public.transacciones_escrow set estado=case when p_tipo='pago_tardio' then 'pago_tardio' else 'liquidando' end,
    liquidacion_estado='procesando',liquidacion_error=null,liquidacion_operacion_id=op,
    monto_reembolsado=p_reembolso,monto_bruto_proveedor=bruto,comision_proveedor=comision,pago_neto_proveedor=bruto-comision,
    comision_cliente_retenida=retenida,retencion_plataforma=retenida+comision,
    liquidacion_contexto=jsonb_build_object('tipo',p_tipo,'disputa_id',p_disputa,'actor',p_actor,'resolucion',p_resolucion,'nota',p_nota,'destino',destino,'empresa_proveedora_id',t.empresa_proveedora_id,'proveedor_cobros_usuario_id',case when t.empresa_proveedora_id is not null then t.proveedor_cobros_usuario_id else coalesce(t.proveedor_cobros_usuario_id,e.profesional_id) end)
    where id=e.id returning * into e;
  return to_jsonb(e);
end; $$;

create or replace function diime_private.validar_actor_trabajo_empresa(p_trabajo uuid,p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare t public.trabajos;
begin
  select * into t from public.trabajos where id=p_trabajo;
  perform 1 from public.empresa_miembros m where m.usuario_id=p_actor and m.empresa_id in(t.empresa_cliente_id,t.empresa_proveedora_id) order by m.empresa_id for share;
  if not diime_private.empresa_puede_operar_trabajo(p_trabajo,p_actor,'encargos') then
    raise exception 'No tienes permiso sobre este trabajo' using errcode='42501'; end if;
  perform set_config('diime.actor_usuario_id',p_actor::text,true);
end; $$;
revoke all on function diime_private.validar_actor_trabajo_empresa(uuid,uuid) from public,anon,authenticated;
grant execute on function diime_private.validar_actor_trabajo_empresa(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.diime_abrir_disputa(p_trabajo uuid, p_actor uuid, p_motivo text, p_rechazo_cancelacion boolean DEFAULT false, p_adjuntos text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare t public.trabajos%rowtype; e public.transacciones_escrow%rowtype; d public.disputas%rowtype; autor uuid; parte text;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo;
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);
  if nullif(trim(p_motivo),'') is null then raise exception 'Sin permiso o motivo'; end if;
  if t.cancelacion_aceptada_por is not null then raise exception 'La cancelación ya está aceptada'; end if;
  if exists(select 1 from public.disputas where trabajo_id=t.id and estado in('abierta','en_revision')) then raise exception 'Ya existe una disputa abierta'; end if;
  if t.estado not in('pendiente_pago','en_progreso','entregado') then raise exception 'El trabajo ya no admite disputas'; end if;
  autor := p_actor;
  parte:=case when diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos','cliente') then 'cliente' else 'proveedor' end;
  if p_rechazo_cancelacion then
    if t.cancelacion_estado is distinct from 'pendiente' or diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos',diime_private.parte_cancelacion(t.id)) then raise exception 'La cancelación ya no está pendiente'; end if;
    autor := t.cancelacion_solicitada_por;
    parte:=diime_private.parte_cancelacion(t.id);
    if parte is null then raise exception 'La cancelación histórica requiere conciliar su parte solicitante'; end if;
  elsif t.estado='pendiente_pago' and not coalesce(t.cancelacion_estado='rechazada' and diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos',diime_private.parte_cancelacion(t.id)),false) then
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
  insert into public.disputas(trabajo_id,cliente_id,profesional_id,tipo,motivo,estado,estado_trabajo_previo,estado_escrow_previo,escrow_id,origen,actor_apertura_id)
    values(t.id,t.cliente_id,t.profesional_id,parte,
      case when p_rechazo_cancelacion then 'Cancelación solicitada y rechazada. Motivo original: '||coalesce(t.cancelacion_razon,'')||'. Oposición: '||p_motivo else p_motivo end,
      'abierta',t.estado,e.estado,e.id,'usuario',p_actor) returning * into d;
  if e.id is not null then update public.transacciones_escrow set estado='disputa' where id=e.id; end if;
  update public.trabajos set estado='en_disputa',pago_bloqueado=true,
    cancelacion_estado=case when p_rechazo_cancelacion then 'rechazada' else cancelacion_estado end,
    cancelacion_respuesta_razon=case when p_rechazo_cancelacion then p_motivo else cancelacion_respuesta_razon end,
    cancelacion_adjuntos_respuesta=case when p_rechazo_cancelacion then p_adjuntos else cancelacion_adjuntos_respuesta end,
    updated_at=now() where id=t.id;
  insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
    select id,'disputa_abierta_admin','Nueva disputa para revisar', 'Revisa la disputa de "'||coalesce(t.titulo,'el trabajo')||'".',concat('/admin/disputas?trabajo=',t.id,'&solicitud=',t.solicitud_id,'&oferta=',t.oferta_id,'&aspecto=','disputa_abierta_admin','&disputa=',d.id),false,jsonb_strip_nulls(jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo,'disputa_id',d.id))
    from public.profiles where es_admin=true;
  return to_jsonb(d)||jsonb_build_object('parte_actor',case when diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos','cliente') then 'cliente' else 'proveedor' end);
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
  if p_cancelacion then perform diime_private.validar_actor_cobros_empresa(p_trabajo,p_actor);
  else perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor); end if;
  if (p_cancelacion or p_rechazo_cancelacion) and (diime_private.parte_cancelacion(t.id) is null or not diime_private.empresa_puede_operar_trabajo(t.id,p_actor,case when p_cancelacion then 'gestionar_cobros' else 'encargos' end,case when diime_private.parte_cancelacion(t.id)='cliente' then 'proveedor' else 'cliente' end)) then raise exception 'Solo la contraparte autorizada puede responder a la cancelación' using errcode='42501'; end if;
  if p_cancelacion then
    if t.cancelacion_aceptada_por is not null then return to_jsonb(t); end if;
    if t.estado not in ('pendiente_pago','en_progreso') or t.cancelacion_estado is distinct from 'pendiente'
      or diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos',diime_private.parte_cancelacion(t.id)) then raise exception 'La cancelación ya no admite esta respuesta'; end if;
    update public.trabajos set pago_bloqueado=true,cancelacion_aceptada_por=p_actor where id=p_trabajo returning * into t;
  else
    if t.estado not in ('pendiente_pago','en_progreso','entregado') or t.cancelacion_aceptada_por is not null then
      raise exception 'El trabajo ya no admite abrir una disputa'; end if;
    if p_rechazo_cancelacion then
      if t.cancelacion_estado is distinct from 'pendiente' or diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos',diime_private.parte_cancelacion(t.id)) then raise exception 'La cancelación ya no admite rechazo'; end if;
    elsif t.estado='pendiente_pago' and not coalesce(t.cancelacion_estado='rechazada' and diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos',diime_private.parte_cancelacion(t.id)),false) then
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
  perform diime_private.validar_actor_cobros_empresa(p_trabajo,p_actor);
  if t.cancelacion_aceptada_por is null or diime_private.parte_cancelacion(t.id) is null or not diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'gestionar_cobros',case when diime_private.parte_cancelacion(t.id)='cliente' then 'proveedor' else 'cliente' end) then raise exception 'Cancelación no aceptada por contraparte autorizada'; end if;
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
  -- Una baja concurrente se ordena antes o después de esta confirmación.
  perform 1 from public.empresa_miembros m where
    (m.empresa_id=t.empresa_cliente_id and m.usuario_id=coalesce(t.operador_cliente_id,t.cliente_id)) or
    (m.empresa_id=t.empresa_proveedora_id and m.usuario_id=coalesce(t.operador_proveedor_id,t.profesional_id))
    order by m.empresa_id,m.usuario_id for share of m;
  tardio := t.estado<>'pendiente_pago' or e.estado='cancelado' or t.cancelacion_aceptada_por is not null
    or (t.empresa_cliente_id is not null and not diime_private.empresa_puede_operar_trabajo(t.id,coalesce(t.operador_cliente_id,t.cliente_id),'gestionar_cobros','cliente'))
    or (t.empresa_proveedora_id is not null and not diime_private.empresa_puede_operar_trabajo(t.id,coalesce(t.operador_proveedor_id,t.profesional_id),'encargos','proveedor'));
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
      values(t.id,coalesce(e.actor_pago_id,t.operador_cliente_id,t.cliente_id),'mensaje','Pago recibido. La transferencia queda pendiente de confirmación o resolución.',0);
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
      values(coalesce(t.operador_proveedor_id,t.profesional_id),'pago_recibido','El cliente ha pagado: puedes empezar',
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
  perform diime_private.validar_actor_trabajo_empresa(d.trabajo_id,p_actor);
  if not diime_private.empresa_puede_operar_trabajo(d.trabajo_id,p_actor,'encargos',d.tipo) then return 'no_autorizado'; end if;
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

-- Mantener explícita la frontera service-only también al restaurar funciones.
revoke all on function public.diime_abrir_disputa(uuid,uuid,text,boolean,text[]),
  public.diime_bloquear_checkout(uuid,uuid,boolean,boolean),
  public.diime_cerrar_cancelacion(uuid,uuid),
  public.diime_confirmar_pago(uuid,text,text,text,numeric,text),
  public.diime_retirar_disputa(uuid,uuid) from public,anon,authenticated;
grant execute on function public.diime_abrir_disputa(uuid,uuid,text,boolean,text[]),
  public.diime_bloquear_checkout(uuid,uuid,boolean,boolean),
  public.diime_cerrar_cancelacion(uuid,uuid),
  public.diime_confirmar_pago(uuid,text,text,text,numeric,text),
  public.diime_retirar_disputa(uuid,uuid) to service_role;


-- A revoked employee cannot modify history; the current operator of the same
-- contractual side can continue it. Only this scoped server RPC changes it.
create function public.diime_gestionar_solicitud_cancelacion(p_trabajo uuid,p_actor uuid,p_accion text,p_razon text default '',p_adjuntos text[] default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.trabajos; parte text;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo for update;
  perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);
  if p_accion not in('solicitar','editar','retirar') or p_accion is null then raise exception 'Acción de cancelación no válida'; end if;
  if t.estado not in('pendiente_pago','en_progreso') or t.pago_bloqueado or t.cancelacion_aceptada_por is not null then raise exception 'El trabajo ya no admite modificar esta cancelación'; end if;
  if p_accion<>'retirar' and nullif(btrim(p_razon),'') is null then raise exception 'Explica por qué quieres cancelar el servicio.'; end if;
  if cardinality(p_adjuntos)>5 or exists(select 1 from unnest(p_adjuntos) x where x is null or x !~ '^https://[^[:space:]]+$') then raise exception 'Archivos adjuntos no válidos'; end if;
  parte:=case when diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos','cliente') then 'cliente' else 'proveedor' end;
  if p_accion='solicitar' then
    if t.cancelacion_estado='pendiente' then raise exception 'Ya hay una solicitud de cancelación pendiente'; end if;
    update public.trabajos set cancelacion_solicitada_por=p_actor,cancelacion_razon=btrim(p_razon),
      cancelacion_adjuntos_solicitante=coalesce(p_adjuntos,'{}'),cancelacion_respuesta_razon=null,
      cancelacion_adjuntos_respuesta='{}',cancelacion_estado='pendiente',updated_at=now() where id=t.id returning * into t;
  else
    if t.cancelacion_estado is distinct from 'pendiente' or diime_private.parte_cancelacion(t.id) is distinct from parte then
      raise exception 'Solo la parte que solicitó la cancelación puede modificarla mientras esté pendiente' using errcode='42501'; end if;
    if p_accion='editar' then
      update public.trabajos set cancelacion_razon=btrim(p_razon),cancelacion_adjuntos_solicitante=coalesce(p_adjuntos,'{}'),updated_at=now() where id=t.id returning * into t;
    else
      update public.trabajos set cancelacion_estado=null,cancelacion_solicitada_por=null,cancelacion_razon=null,
        cancelacion_adjuntos_solicitante='{}',cancelacion_respuesta_razon=null,cancelacion_adjuntos_respuesta='{}',updated_at=now() where id=t.id returning * into t;
    end if;
  end if;
  insert into public.actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje)
    values(t.id,p_actor,'mensaje',case p_accion when 'solicitar' then 'Cancelación solicitada: '||btrim(p_razon) when 'editar' then 'Solicitud de cancelación actualizada: '||btrim(p_razon) else 'Solicitud de cancelación retirada. El servicio continúa.' end);
  return jsonb_build_object('id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,
    'cliente_id',t.cliente_id,'profesional_id',t.profesional_id,'empresa_cliente_id',t.empresa_cliente_id,'empresa_proveedora_id',t.empresa_proveedora_id,
    'operador_cliente_id',t.operador_cliente_id,'operador_proveedor_id',t.operador_proveedor_id,
    'estado',t.estado,'titulo',t.titulo,'parte_actor',parte,'cancelacion_parte_solicitante',t.cancelacion_parte_solicitante);
end; $$;
revoke all on function public.diime_gestionar_solicitud_cancelacion(uuid,uuid,text,text,text[]) from public,anon,authenticated;
grant execute on function public.diime_gestionar_solicitud_cancelacion(uuid,uuid,text,text,text[]) to service_role;

commit;
