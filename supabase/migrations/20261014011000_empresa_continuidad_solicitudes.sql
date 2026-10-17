-- Continue company requests with a current authorized manager, preserving the historical client.
BEGIN;
create or replace function private.aceptar_oferta_y_crear_trabajo(
  p_oferta_id uuid, p_solicitud_id uuid, p_profesional_id uuid,
  p_fecha_estimada_fin timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  demanda public.solicitudes%rowtype;
  oferta public.ofertas%rowtype;
  trabajo public.trabajos%rowtype;
  contratos bigint;
  fin timestamptz;
  cliente_original uuid;
begin
  if actor is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  select cliente_id into cliente_original from public.solicitudes where id=p_solicitud_id;
  perform private.bloquear_cuentas_contratacion(array[actor, cliente_original, p_profesional_id]);
  if exists (select 1 from public.profiles where id in (actor, p_profesional_id) and cuenta_eliminada is not null) then
    raise exception 'Una de las cuentas ya está dada de baja y no admite nuevas contrataciones' using errcode = '55000';
  end if;
  -- Orden común con las RPC financieras: demanda -> trabajo -> escrow.
  select * into demanda from public.solicitudes where id = p_solicitud_id for update;
  if demanda.empresa_id is not null then
    -- Serialize membership/permission removal against a new contract or retry.
    perform 1 from public.empresa_miembros where empresa_id=demanda.empresa_id and usuario_id=actor for share;
  end if;
  if demanda.id is null or
    (demanda.empresa_id is null and demanda.cliente_id is distinct from actor) or
    (demanda.empresa_id is not null and (
      not diime_private.empresa_tiene_permiso(demanda.empresa_id,actor,'encargos') or
      (demanda.cliente_id is distinct from actor and not diime_private.empresa_es_administrador(demanda.empresa_id,actor))
    )) then
    raise exception 'No tienes permiso para aceptar ofertas de esta demanda' using errcode = '42501';
  end if;
  select * into oferta from public.ofertas where id = p_oferta_id for update;
  if oferta.id is null or oferta.solicitud_id is distinct from demanda.id
     or oferta.profesional_id is distinct from p_profesional_id or oferta.profesional_id = actor then
    raise exception 'La oferta no corresponde a esta demanda y proveedor' using errcode = '22023';
  end if;

  select count(*) into contratos from public.trabajos t
    where t.solicitud_id = demanda.id and t.estado is distinct from 'cancelado';
  if contratos > 1 then
    raise exception 'Esta demanda tiene contratos históricos duplicados. Contacta con Diime para revisarlos antes de continuar' using errcode = '55000';
  end if;
  select * into trabajo from public.trabajos t
    where t.solicitud_id = demanda.id and t.estado is distinct from 'cancelado' limit 1;
  if trabajo.id is not null then
    if trabajo.oferta_id = oferta.id and trabajo.cliente_id = demanda.cliente_id
       and trabajo.profesional_id = oferta.profesional_id then
      if trabajo.estado = 'pendiente_pago' and (
        oferta.comision_proveedor_porcentaje is null or oferta.comision_proveedor_minima is null
        or oferta.comision_proveedor_prevista is null or oferta.pago_neto_proveedor_previsto is null
      ) then
        raise exception 'El proveedor debe confirmar los gastos de servicio de esta oferta antes de contratar' using errcode = '55000';
      end if;
      return jsonb_build_object('trabajo', to_jsonb(trabajo), 'reutilizado', true);
    end if;
    raise exception 'Ya hay una oferta contratada. Cancela ese contrato y espera su cierre antes de elegir otra' using errcode = '55000';
  end if;
  if demanda.estado <> 'abierta' or oferta.estado not in ('pendiente', 'enviada', 'en_negociacion') then
    raise exception 'Esta oferta ya no está disponible para contratar' using errcode = '55000';
  end if;
  if oferta.precio <= 0 or oferta.tiempo_estimado <= 0
     or oferta.unidad_tiempo not in ('horas', 'dias', 'semanas', 'meses') then
    raise exception 'La oferta contiene un importe o un plazo no válido' using errcode = '22023';
  end if;
  if oferta.comision_proveedor_porcentaje is null or oferta.comision_proveedor_minima is null
     or oferta.comision_proveedor_prevista is null or oferta.pago_neto_proveedor_previsto is null then
    raise exception 'El proveedor debe confirmar los gastos de servicio de esta oferta antes de contratar' using errcode = '55000';
  end if;
  -- Mantiene horas como horas. Antes una oferta de 8 horas añadía 8 días.
  fin := coalesce(p_fecha_estimada_fin, now() + oferta.tiempo_estimado * case oferta.unidad_tiempo
    when 'horas' then interval '1 hour' when 'dias' then interval '1 day'
    when 'semanas' then interval '7 days' when 'meses' then interval '30 days' end);
  if fin <= now() then raise exception 'La fecha estimada debe ser futura' using errcode = '22023'; end if;
  insert into public.trabajos (
    cliente_id, profesional_id, solicitud_id, oferta_id, titulo, descripcion,
    ubicacion, precio_acordado, estado, fecha_inicio, fecha_estimada_fin, progreso
  ) values (
    demanda.cliente_id, oferta.profesional_id, demanda.id, oferta.id, demanda.titulo, oferta.descripcion,
    demanda.ubicacion, oferta.precio, 'pendiente_pago', now(), fin, 0
  ) returning * into trabajo;
  update public.ofertas set estado = 'aceptada', updated_at = now() where id = oferta.id;
  return jsonb_build_object('trabajo', to_jsonb(trabajo), 'reutilizado', false);
end;
$$;
create or replace function diime_private.empresa_guardar_permisos_operacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); empresa uuid; permiso text; fila jsonb; s public.solicitudes; o public.ofertas;
begin
  if tg_op='DELETE' then fila:=to_jsonb(old); else fila:=to_jsonb(new); end if;
  if tg_table_name in ('solicitudes','ofertas') then
    empresa:=(fila->>'empresa_id')::uuid;
    permiso:=case when tg_table_name='ofertas' then 'presupuestos' else 'encargos' end;
    if empresa is not null and actor is not null and (tg_op='INSERT' or actor=(fila->>case when tg_table_name='ofertas' then 'profesional_id' else 'cliente_id' end)::uuid) then
      perform 1 from public.empresa_miembros where empresa_id=empresa and usuario_id=actor for share;
      if not diime_private.empresa_tiene_permiso(empresa,actor,permiso) then raise exception 'No tienes permiso para esta operación empresarial' using errcode='42501'; end if;
      if tg_op='INSERT' and not exists(select 1 from public.empresas where id=empresa and estado_verificacion='verificada') then raise exception 'La representación de la empresa debe estar verificada antes de operar' using errcode='42501'; end if;
    end if;
  elsif tg_op='INSERT' then
    select * into s from public.solicitudes where id=new.solicitud_id;
    select * into o from public.ofertas where id=new.oferta_id;
    if s.empresa_id is not null then
      perform 1 from public.empresa_miembros where empresa_id=s.empresa_id and usuario_id=actor for share;
      if not diime_private.empresa_tiene_permiso(s.empresa_id,actor,'encargos') or not exists(select 1 from public.empresas where id=s.empresa_id and estado_verificacion='verificada') then raise exception 'No puedes contratar por una empresa pendiente de verificación o sin permiso para encargos' using errcode='42501'; end if;
      new.operador_cliente_id:=actor;
    else new.operador_cliente_id:=null; end if;
    if o.empresa_id is not null then
      perform 1 from public.empresa_miembros where empresa_id=o.empresa_id and usuario_id=o.profesional_id for share;
      if not diime_private.empresa_tiene_permiso(o.empresa_id,o.profesional_id,'presupuestos') or not exists(select 1 from public.empresas where id=o.empresa_id and estado_verificacion='verificada') then raise exception 'La oferta no tiene una autorización empresarial vigente' using errcode='42501'; end if;
      new.operador_proveedor_id:=new.profesional_id;
    else new.operador_proveedor_id:=null; end if;
  elsif tg_table_name='trabajos' and tg_op='UPDATE' and actor is not null then
    if new.operador_cliente_id is distinct from old.operador_cliente_id and
      not (diime_private.empresa_es_administrador(old.empresa_cliente_id,actor) and diime_private.empresa_tiene_permiso(old.empresa_cliente_id,actor,'encargos')) then raise exception 'No puedes reasignar el encargo del cliente' using errcode='42501'; end if;
    if new.operador_proveedor_id is distinct from old.operador_proveedor_id and
      not (diime_private.empresa_es_administrador(old.empresa_proveedora_id,actor) and diime_private.empresa_tiene_permiso(old.empresa_proveedora_id,actor,'encargos')) then raise exception 'No puedes reasignar el encargo del proveedor' using errcode='42501'; end if;
    -- A revoked original actor cannot keep updating a job assigned to someone else.
    if (old.empresa_cliente_id is not null and actor=old.cliente_id) or (old.empresa_proveedora_id is not null and actor=old.profesional_id) then
      if not diime_private.empresa_puede_operar_trabajo(old.id,actor,'encargos') then raise exception 'Ya no tienes permiso para operar este encargo empresarial' using errcode='42501'; end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

-- Narrow projection for a company manager whose incoming offer is outside the
-- personal offers policy. Contract mutation rechecks authorization under lock.
CREATE FUNCTION diime_private.empresa_oferta_para_contratar(p_oferta_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.ofertas; s public.solicitudes;
BEGIN
  SELECT * INTO o FROM public.ofertas WHERE id=p_oferta_id;
  SELECT * INTO s FROM public.solicitudes WHERE id=o.solicitud_id;
  IF s.empresa_id IS NULL OR NOT diime_private.empresa_es_administrador(s.empresa_id,auth.uid())
    OR NOT diime_private.empresa_tiene_permiso(s.empresa_id,auth.uid(),'encargos') THEN
    RAISE EXCEPTION 'No tienes permiso para aceptar ofertas de esta demanda' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('id',o.id,'solicitud_id',o.solicitud_id,'profesional_id',o.profesional_id,
    'solicitud',jsonb_build_object('cliente_id',s.cliente_id,'empresa_id',s.empresa_id,'titulo',s.titulo));
END; $$;
REVOKE ALL ON FUNCTION diime_private.empresa_oferta_para_contratar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION diime_private.empresa_oferta_para_contratar(uuid) TO authenticated;
CREATE FUNCTION public.empresa_oferta_para_contratar(p_oferta_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT diime_private.empresa_oferta_para_contratar(p_oferta_id);
$$;
REVOKE ALL ON FUNCTION public.empresa_oferta_para_contratar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.empresa_oferta_para_contratar(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
