-- Current contract and identity guards for isolated SQL tests; no user data.
CREATE OR REPLACE FUNCTION public.diime_bloquear_trabajo_financiero(p_trabajo uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_solicitud uuid;
begin
  select solicitud_id into v_solicitud from public.trabajos where id=p_trabajo;
  if v_solicitud is not null then perform 1 from public.solicitudes where id=v_solicitud for update; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_trabajo::text,0));
  perform 1 from public.trabajos where id=p_trabajo for update;
  if not found then raise exception 'Trabajo no encontrado'; end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.guardar_integridad_trabajo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  permitidos text[] := array[
    'updated_at', 'estado', 'progreso', 'fecha_entrega',
    'cancelacion_estado', 'cancelacion_solicitada_por', 'cancelacion_razon',
    'cancelacion_adjuntos_solicitante', 'cancelacion_respuesta_razon',
    'cancelacion_adjuntos_respuesta', 'review_cliente_id',
    'horas_estimadas', 'horas_registradas', 'notas_privadas_proveedor', 'prioridad',
    'fecha_inicio', 'fecha_estimada_fin'
  ];
  cancelacion_campos text[] := array[
    'cancelacion_estado', 'cancelacion_solicitada_por', 'cancelacion_razon',
    'cancelacion_adjuntos_solicitante', 'cancelacion_respuesta_razon',
    'cancelacion_adjuntos_respuesta'
  ];
  cambio_cancelacion boolean;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op <> 'UPDATE' then
    raise exception 'Los contratos se crean y cancelan mediante su flujo autorizado' using errcode = '42501';
  end if;
  if actor is null or (actor is distinct from old.cliente_id and actor is distinct from old.profesional_id) then
    raise exception 'No tienes permiso sobre este trabajo' using errcode = '42501';
  end if;
  if (to_jsonb(new) - permitidos) is distinct from (to_jsonb(old) - permitidos) then
    raise exception 'No se pueden modificar los participantes, términos o datos de pago del contrato' using errcode = '42501';
  end if;
  -- Planificación personal del calendario: no altera precio ni términos de la
  -- oferta aceptada. Solo el proveedor del contrato puede mantener estos datos.
  if new.horas_estimadas is distinct from old.horas_estimadas
     or new.horas_registradas is distinct from old.horas_registradas
     or new.notas_privadas_proveedor is distinct from old.notas_privadas_proveedor
     or new.prioridad is distinct from old.prioridad
     or new.fecha_inicio is distinct from old.fecha_inicio
     or new.fecha_estimada_fin is distinct from old.fecha_estimada_fin then
    if actor is distinct from old.profesional_id
       or coalesce(new.horas_estimadas, 0) < 0 or coalesce(new.horas_registradas, 0) < 0
       or (new.fecha_inicio is not null and new.fecha_estimada_fin is not null
         and new.fecha_estimada_fin < new.fecha_inicio) then
      raise exception 'Solo el proveedor puede actualizar la planificación con fechas y horas válidas' using errcode = '42501';
    end if;
  end if;
  if new.review_cliente_id is distinct from old.review_cliente_id then
    if actor is distinct from old.cliente_id or old.estado <> 'completado'
       or old.review_cliente_id is not null or not exists (
         select 1 from public."reseñas" r where r.id = new.review_cliente_id
           and r.trabajo_id = old.id and r.autor_id = actor and r.profesional_id = old.profesional_id
       ) then
      raise exception 'La reseña debe corresponder al cliente y al trabajo completado' using errcode = '42501';
    end if;
  end if;

  select exists (
    select 1 from unnest(cancelacion_campos) as c(nombre)
    where to_jsonb(new) -> c.nombre is distinct from to_jsonb(old) -> c.nombre
  ) into cambio_cancelacion;
  if cambio_cancelacion then
    if old.estado not in ('pendiente_pago', 'en_progreso')
       or coalesce((to_jsonb(old)->>'pago_bloqueado')::boolean, false)
       or to_jsonb(old)->>'cancelacion_aceptada_por' is not null then
      raise exception 'La cancelación ya se está resolviendo o el trabajo no admite cancelación' using errcode = '55000';
    end if;
    if old.cancelacion_estado = 'pendiente' then
      if actor is distinct from old.cancelacion_solicitada_por then
        raise exception 'La respuesta a una cancelación debe tramitarse por su flujo autorizado' using errcode = '42501';
      end if;
      if new.cancelacion_estado is null then
        if new.cancelacion_solicitada_por is not null or new.cancelacion_razon is not null
           or coalesce(to_jsonb(new)->'cancelacion_adjuntos_solicitante', '[]'::jsonb) <> '[]'::jsonb
           or new.cancelacion_respuesta_razon is not null
           or coalesce(to_jsonb(new)->'cancelacion_adjuntos_respuesta', '[]'::jsonb) <> '[]'::jsonb then
          raise exception 'Retirar la cancelación requiere limpiar sus argumentos y pruebas' using errcode = '22023';
        end if;
      elsif new.cancelacion_estado <> 'pendiente'
         or new.cancelacion_solicitada_por is distinct from old.cancelacion_solicitada_por
         or new.cancelacion_respuesta_razon is distinct from old.cancelacion_respuesta_razon
         or new.cancelacion_adjuntos_respuesta is distinct from old.cancelacion_adjuntos_respuesta then
        raise exception 'No puedes responder ni cambiar el autor de tu propia cancelación' using errcode = '42501';
      end if;
    elsif new.cancelacion_estado is distinct from 'pendiente'
       or new.cancelacion_solicitada_por is distinct from actor
       or new.cancelacion_respuesta_razon is not null
       or coalesce(to_jsonb(new)->'cancelacion_adjuntos_respuesta', '[]'::jsonb) <> '[]'::jsonb then
      raise exception 'La solicitud de cancelación no es válida' using errcode = '42501';
    end if;
    if new.cancelacion_estado = 'pendiente' and nullif(btrim(new.cancelacion_razon), '') is null then
      raise exception 'Explica por qué quieres cancelar el servicio' using errcode = '22023';
    end if;
  end if;

  if new.estado is distinct from old.estado
     or new.progreso is distinct from old.progreso
     or new.fecha_entrega is distinct from old.fecha_entrega then
    if actor is distinct from old.profesional_id or old.estado <> 'en_progreso'
       or old.cancelacion_estado = 'pendiente' or new.cancelacion_estado = 'pendiente'
       or coalesce((to_jsonb(old)->>'pago_bloqueado')::boolean, false)
       or not exists (
         select 1 from public.transacciones_escrow e where e.trabajo_id = old.id
           and e.estado in ('retenido', 'fondos_retenidos')
           and e.fecha_retencion is not null
       ) then
      raise exception 'Solo el proveedor puede avanzar o entregar un trabajo pagado y en curso' using errcode = '42501';
    end if;
    if new.progreso is null or new.progreso < 0 or new.progreso > 100 then
      raise exception 'El progreso debe estar entre 0 y 100' using errcode = '22023';
    end if;
    if new.estado is distinct from old.estado then
      if new.estado <> 'entregado' or new.progreso <> 100 then
        raise exception 'La finalización, cancelación y disputa requieren su flujo de pago autorizado' using errcode = '42501';
      end if;
      new.fecha_entrega := now();
    elsif new.fecha_entrega is distinct from old.fecha_entrega then
      raise exception 'La fecha de entrega solo se registra al entregar el trabajo' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validar_nuevo_contrato()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  demanda public.solicitudes%rowtype;
  oferta public.ofertas%rowtype;
begin
  new.contratacion_version := 2;
  perform private.bloquear_cuentas_contratacion(array[new.cliente_id, new.profesional_id]);
  select * into demanda from public.solicitudes where id = new.solicitud_id for update;
  select * into oferta from public.ofertas where id = new.oferta_id;
  if demanda.id is null or oferta.id is null or oferta.solicitud_id is distinct from demanda.id
     or new.cliente_id is distinct from demanda.cliente_id
     or new.profesional_id is distinct from oferta.profesional_id
     or new.cliente_id = new.profesional_id or new.precio_acordado is distinct from oferta.precio then
    raise exception 'El contrato no coincide con la oferta, la demanda y sus participantes' using errcode = '23514';
  end if;
  if demanda.estado <> 'abierta' or oferta.estado not in ('pendiente', 'enviada', 'en_negociacion')
     or new.estado <> 'pendiente_pago' or new.progreso <> 0 then
    raise exception 'La oferta o la demanda ya no permiten crear este contrato' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.trabajos t where t.solicitud_id = new.solicitud_id and (
      t.estado is distinct from 'cancelado'
      or exists (select 1 from public.transacciones_escrow e where e.trabajo_id = t.id
        and (e.estado in ('pendiente', 'retenido', 'fondos_retenidos', 'liquidando', 'disputa', 'pago_tardio')
          or e.stripe_disputa_id is not null))
    )
  ) then
    raise exception 'Esta demanda ya tiene un contrato. Cancélalo y espera su cierre antes de elegir otra oferta' using errcode = '23505';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_integridad_solicitud()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('diime-cuenta:' || coalesce(auth.uid()::text, ''), 0));
    if exists (select 1 from public.profiles where id = auth.uid() and cuenta_eliminada is not null) then
      raise exception 'La cuenta está dada de baja y no puede publicar demandas' using errcode = '42501';
    end if;
    if new.cliente_id is distinct from auth.uid() or new.estado <> 'abierta' then
      raise exception 'Solo puedes publicar demandas abiertas a tu nombre' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.cliente_id is distinct from auth.uid() then
    raise exception 'No tienes permiso sobre esta demanda' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.trabajos where solicitud_id = old.id) then
      raise exception 'La demanda forma parte de un historial contractual y debe conservarse' using errcode = '55000';
    end if;
    return old;
  end if;
  if new.id is distinct from old.id or new.cliente_id is distinct from old.cliente_id then
    raise exception 'No se puede cambiar el propietario de una demanda' using errcode = '42501';
  end if;
  if new.estado is distinct from old.estado then
    if old.estado not in ('abierta', 'cancelada') or new.estado not in ('abierta', 'cancelada')
       or exists (select 1 from public.trabajos where solicitud_id = old.id and estado is distinct from 'cancelado') then
      raise exception 'El estado de una demanda contratada lo determina su trabajo y pago' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.proteger_pertenencia_empresa()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if (tg_op = 'INSERT' and new.empresa_id is not null)
    or (tg_op = 'UPDATE' and new.empresa_id is distinct from old.empresa_id) then
    raise exception 'Para vincular una empresa debes usar una invitación válida o crear tu propia empresa' using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_integridad_oferta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  demanda public.solicitudes%rowtype;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'DELETE' then
    if actor is distinct from old.profesional_id or old.estado = 'aceptada'
       or exists (select 1 from public.trabajos where oferta_id = old.id) then
      raise exception 'No se puede eliminar una oferta contratada o de otro proveedor' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id
      or new.solicitud_id is distinct from old.solicitud_id
      or new.profesional_id is distinct from old.profesional_id) then
    raise exception 'No se puede trasladar una oferta a otra demanda o proveedor' using errcode = '42501';
  end if;
  -- No bloquea la demanda tras bloquear una oferta: ese orden invertiría el de
  -- aceptación. La aceptación relee y bloquea ambas filas antes de contratar.
  select * into demanda from public.solicitudes where id = new.solicitud_id;
  if actor is null or demanda.id is null then
    raise exception 'La demanda no está disponible' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('diime-cuenta:' || coalesce(actor::text, ''), 0));
    if exists (select 1 from public.profiles where id = actor and cuenta_eliminada is not null) then
      raise exception 'La cuenta está dada de baja y no puede enviar ofertas' using errcode = '42501';
    end if;
    if actor is distinct from new.profesional_id or actor = demanda.cliente_id
       or demanda.estado <> 'abierta' or new.estado not in ('pendiente', 'enviada', 'en_negociacion') then
      raise exception 'Solo el proveedor puede enviar una oferta a una demanda abierta ajena' using errcode = '42501';
    end if;
  elsif actor = demanda.cliente_id then
    if (to_jsonb(new) - array['estado','updated_at']) is distinct from (to_jsonb(old) - array['estado','updated_at'])
       or old.estado not in ('pendiente','enviada','en_negociacion') or new.estado <> 'rechazada' then
      raise exception 'El cliente solo puede rechazar una oferta pendiente; aceptar requiere crear su contrato' using errcode = '42501';
    end if;
  elsif actor = old.profesional_id then
    if new.estado = 'aceptada' or old.estado = 'aceptada' then
      raise exception 'Una oferta contratada requiere el flujo de cancelación del trabajo' using errcode = '42501';
    end if;
    if new.estado is distinct from old.estado and not (
      new.estado = 'retirada' or (old.estado in ('rechazada','retirada') and new.estado = 'pendiente')
    ) then
      raise exception 'Este cambio de estado de oferta no está permitido' using errcode = '42501';
    end if;
    if new.estado <> 'retirada' and demanda.estado <> 'abierta' then
      raise exception 'Esta demanda ya no admite cambios en sus ofertas' using errcode = '55000';
    end if;
    if old.estado in ('rechazada','retirada') and new.estado = 'pendiente'
       and exists (select 1 from public.trabajos where oferta_id = old.id) then
      raise exception 'Conserva la oferta contratada en el historial y envía una nueva' using errcode = '55000';
    end if;
  else
    raise exception 'No tienes permiso sobre esta oferta' using errcode = '42501';
  end if;
  if new.precio <= 0 or new.tiempo_estimado <= 0
     or new.unidad_tiempo not in ('horas','dias','semanas','meses') then
    raise exception 'El precio y el plazo de la oferta deben ser válidos y positivos' using errcode = '22023';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION diime_private.vincular_empresa(p_token text, p_nombre text, p_cif text, p_documento_personal text, p_cargo text, p_telefono text, p_ubicacion text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid(); vinculada uuid; elegida uuid; email_actor text;
begin
  if actor is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  select email into email_actor from auth.users where id = actor and email_confirmed_at is not null;
  if email_actor is null then raise exception 'Confirma tu correo antes de vincular una empresa' using errcode = '42501'; end if;
  if nullif(trim(p_documento_personal), '') is null then
    raise exception 'Indica el DNI/NIE de la persona que representa a la empresa' using errcode = '22023';
  end if;
  select empresa_id into vinculada from public.profiles where id = actor and cuenta_eliminada is null for update;
  if not found then raise exception 'Completa primero tu perfil personal' using errcode = 'P0002'; end if;

  if nullif(trim(p_token), '') is not null then
    select id into elegida from public.empresas where token_invitacion = trim(p_token) for share;
    if elegida is null then raise exception 'Token de invitación inválido' using errcode = '22023'; end if;
  else
    if nullif(trim(p_nombre), '') is null or nullif(trim(p_cif), '') is null then
      raise exception 'Indica el nombre y CIF de tu empresa' using errcode = '22023';
    end if;
    -- Recupera altas antiguas que dejaron empresa propia sin asociar al perfil.
    select id into elegida from public.empresas where propietario_id = actor and cif = upper(trim(p_cif)) for update;
    if elegida is null then
      if vinculada is not null then raise exception 'Ya perteneces a una empresa' using errcode = '42501'; end if;
      insert into public.empresas (nombre, cif, propietario_id, email, telefono, ubicacion)
      values (trim(p_nombre), upper(trim(p_cif)), actor, email_actor, nullif(trim(p_telefono), ''), nullif(trim(p_ubicacion), ''))
      returning id into elegida;
    end if;
  end if;
  if vinculada is not null and vinculada <> elegida then
    raise exception 'Ya perteneces a otra empresa. Contacta con soporte para cambiar la representación' using errcode = '42501';
  end if;
  -- Cambiar de particular a empresa exige volver a verificar la titularidad
  -- de Connect. Se conserva la cuenta histórica y solo se deshabilitan cobros.
  if vinculada is distinct from elegida then
    update public.profesionales set stripe_onboarding_completado = false,
      stripe_transferencias_habilitadas = false, stripe_payouts_habilitados = false,
      stripe_estado_actualizado_at = now()
    where id = actor and stripe_account_id is not null;
  end if;
  update public.profiles set empresa_id = elegida, documento = trim(p_documento_personal),
    cargo_empresa = nullif(trim(p_cargo), '') where id = actor;
  return elegida;
end;
$function$;

CREATE OR REPLACE FUNCTION private.aceptar_oferta_y_crear_trabajo(p_oferta_id uuid, p_solicitud_id uuid, p_profesional_id uuid, p_fecha_estimada_fin timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  demanda public.solicitudes%rowtype;
  oferta public.ofertas%rowtype;
  trabajo public.trabajos%rowtype;
  contratos bigint;
  fin timestamptz;
begin
  if actor is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  perform private.bloquear_cuentas_contratacion(array[actor, p_profesional_id]);
  if exists (select 1 from public.profiles where id in (actor, p_profesional_id) and cuenta_eliminada is not null) then
    raise exception 'Una de las cuentas ya está dada de baja y no admite nuevas contrataciones' using errcode = '55000';
  end if;
  -- Orden común con las RPC financieras: demanda -> trabajo -> escrow.
  select * into demanda from public.solicitudes where id = p_solicitud_id for update;
  if demanda.id is null or demanda.cliente_id is distinct from actor then
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
    if trabajo.oferta_id = oferta.id and trabajo.cliente_id = actor
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
    actor, oferta.profesional_id, demanda.id, oferta.id, demanda.titulo, oferta.descripcion,
    demanda.ubicacion, oferta.precio, 'pendiente_pago', now(), fin, 0
  ) returning * into trabajo;
  update public.ofertas set estado = 'aceptada', updated_at = now() where id = oferta.id;
  return jsonb_build_object('trabajo', to_jsonb(trabajo), 'reutilizado', false);
end;
$function$;

CREATE OR REPLACE FUNCTION private.bloquear_cuentas_contratacion(p_cuentas uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare cuenta uuid;
begin
  for cuenta in select distinct id from unnest(p_cuentas) as c(id) where id is not null order by id loop
    perform pg_advisory_xact_lock(hashtextextended('diime-cuenta:' || cuenta::text, 0));
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.vincular_mi_empresa(p_token text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_cif text DEFAULT NULL::text, p_documento_personal text DEFAULT NULL::text, p_cargo text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_ubicacion text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select diime_private.vincular_empresa(p_token, p_nombre, p_cif, p_documento_personal, p_cargo, p_telefono, p_ubicacion);
$function$;
