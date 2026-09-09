-- Contratación única. No elimina ni fusiona contratos históricos duplicados:
-- si los encuentra, bloquea una nueva contratación hasta su conciliación.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create index if not exists idx_trabajos_solicitud_contrato
  on public.trabajos(solicitud_id, oferta_id, estado);

-- No se puede imponer un índice único a duplicados históricos sin decidir qué
-- contrato/cobro conservar. Se marca únicamente la nueva generación; el índice
-- la protege incluso con aislamiento REPEATABLE READ, y la RPC revisa además
-- todos los contratos anteriores antes de permitir una nueva aceptación.
alter table public.trabajos add column if not exists contratacion_version smallint;
alter table public.trabajos alter column contratacion_version set default 2;
create unique index if not exists uq_trabajo_nuevo_por_solicitud
  on public.trabajos(solicitud_id)
  where contratacion_version = 2 and estado is distinct from 'cancelado';

-- Serializa altas contractuales con la baja de cualquiera de sus dos partes.
-- Siempre antes de demanda -> trabajo -> escrow, sin bloquear filas de perfil
-- que otras transacciones necesitan como referencias para sus notificaciones.
create or replace function private.bloquear_cuentas_contratacion(p_cuentas uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare cuenta uuid;
begin
  for cuenta in select distinct id from unnest(p_cuentas) as c(id) where id is not null order by id loop
    perform pg_advisory_xact_lock(hashtextextended('diime-cuenta:' || cuenta::text, 0));
  end loop;
end;
$$;
revoke all on function private.bloquear_cuentas_contratacion(uuid[]) from public, anon, authenticated;

-- Esta función es SECURITY INVOKER deliberadamente: current_user distingue
-- el acceso directo authenticated del servidor service_role y las RPC privadas.
create or replace function public.guardar_integridad_trabajo()
returns trigger language plpgsql security invoker set search_path = '' as $$
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
$$;
revoke all on function public.guardar_integridad_trabajo() from public, anon, authenticated;
drop trigger if exists trg_guardar_integridad_trabajo on public.trabajos;
create trigger trg_guardar_integridad_trabajo before insert or update or delete on public.trabajos
  for each row execute function public.guardar_integridad_trabajo();

-- También protege inserciones del servidor frente a contratos incompatibles.
-- El bloqueo de demanda serializa aceptación/contratación por cualquier camino.
create or replace function public.validar_nuevo_contrato()
returns trigger language plpgsql security definer set search_path = '' as $$
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
$$;
revoke all on function public.validar_nuevo_contrato() from public, anon, authenticated;
drop trigger if exists trg_validar_nuevo_contrato on public.trabajos;
create trigger trg_validar_nuevo_contrato before insert on public.trabajos
  for each row execute function public.validar_nuevo_contrato();

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
$$;
revoke all on function private.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz) from public, anon;
grant execute on function private.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz) to authenticated;

create or replace function public.aceptar_oferta_y_crear_trabajo(
  p_oferta_id uuid, p_solicitud_id uuid, p_profesional_id uuid,
  p_fecha_estimada_fin timestamptz default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.aceptar_oferta_y_crear_trabajo(p_oferta_id, p_solicitud_id, p_profesional_id, p_fecha_estimada_fin);
$$;
revoke all on function public.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz) from public, anon;
grant execute on function public.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz) to authenticated;

-- La RLS decide qué fila pertenece al usuario; el trigger limita qué puede
-- cambiar. El cliente puede rechazar una pendiente, nunca reescribir su precio.
create or replace function public.guardar_integridad_oferta()
returns trigger language plpgsql security invoker set search_path = '' as $$
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
$$;
revoke all on function public.guardar_integridad_oferta() from public, anon, authenticated;
drop trigger if exists trg_guardar_integridad_oferta on public.ofertas;
create trigger trg_guardar_integridad_oferta before insert or update or delete on public.ofertas
  for each row execute function public.guardar_integridad_oferta();

create or replace function public.guardar_integridad_solicitud()
returns trigger language plpgsql security invoker set search_path = '' as $$
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
$$;
revoke all on function public.guardar_integridad_solicitud() from public, anon, authenticated;
drop trigger if exists trg_guardar_integridad_solicitud on public.solicitudes;
create trigger trg_guardar_integridad_solicitud before insert or update or delete on public.solicitudes
  for each row execute function public.guardar_integridad_solicitud();

-- El marcador de baja es una decisión del servidor, no un campo editable del
-- perfil que un token antiguo pueda restablecer para volver a contratar.
create or replace function public.proteger_estado_baja_perfil()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
  if (tg_op = 'INSERT' and new.cuenta_eliminada is not null)
     or (tg_op = 'UPDATE' and new.cuenta_eliminada is distinct from old.cuenta_eliminada) then
    raise exception 'La baja de la cuenta solo puede tramitarse desde su proceso autorizado' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_estado_baja_perfil() from public, anon, authenticated;
drop trigger if exists trg_proteger_estado_baja_perfil on public.profiles;
create trigger trg_proteger_estado_baja_perfil before insert or update of cuenta_eliminada on public.profiles
  for each row execute function public.proteger_estado_baja_perfil();

-- Conserva la lógica existente de borrado/pseudonimización, pero la rutina
-- original deja de ser un endpoint accesible que eludiría la conciliación.
do $$
begin
  if to_regprocedure('private.eliminar_mi_cuenta_original()') is null then
    alter function public.eliminar_mi_cuenta() set schema private;
    alter function private.eliminar_mi_cuenta() rename to eliminar_mi_cuenta_original;
  end if;
  if to_regprocedure('private.consecuencias_eliminar_cuenta_original()') is null then
    alter function public.consecuencias_de_eliminar_mi_cuenta() set schema private;
    alter function private.consecuencias_de_eliminar_mi_cuenta() rename to consecuencias_eliminar_cuenta_original;
  end if;
end;
$$;
revoke all on function private.eliminar_mi_cuenta_original() from public, anon, authenticated, service_role;
revoke all on function private.consecuencias_eliminar_cuenta_original() from public, anon, authenticated, service_role;

create or replace function private.eliminar_mi_cuenta_segura()
returns void language plpgsql security definer set search_path = '' as $$
declare yo uuid := auth.uid();
begin
  if yo is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  perform private.bloquear_cuentas_contratacion(array[yo]);
  perform 1 from public.solicitudes s
    where s.cliente_id = yo or exists (select 1 from public.trabajos t where t.solicitud_id = s.id and t.profesional_id = yo)
    order by s.id for update;
  perform 1 from public.trabajos where cliente_id = yo or profesional_id = yo order by id for update;
  perform 1 from public.transacciones_escrow where cliente_id = yo or profesional_id = yo order by id for update;
  if exists (select 1 from public.trabajos where (cliente_id = yo or profesional_id = yo)
      and (estado is null or estado not in ('cancelado','completado','rechazado')))
    or exists (select 1 from public.disputas where (cliente_id = yo or profesional_id = yo)
      and estado in ('abierta','en_revision'))
    or exists (select 1 from public.transacciones_escrow where (cliente_id = yo or profesional_id = yo)
      and (estado is null or estado not in ('cancelado','reembolsado','completado','liberado')
        or stripe_disputa_id is not null
        or (liquidacion_operacion_id is not null and liquidacion_estado in ('procesando','error')))) then
    raise exception 'Finaliza o cancela tus contratos y espera a que sus pagos y disputas queden resueltos antes de darte de baja.' using errcode = '55000';
  end if;
  -- Los tokens ya emitidos no desaparecen por cerrar las cookies. Se revocan
  -- las sesiones y el rol administrativo; la guarda de cuenta permanece activa.
  delete from auth.sessions where user_id = yo;
  update public.profiles set es_admin = false where id = yo;
  perform private.eliminar_mi_cuenta_original();
end;
$$;
revoke all on function private.eliminar_mi_cuenta_segura() from public, anon;
grant execute on function private.eliminar_mi_cuenta_segura() to authenticated;

create or replace function public.eliminar_mi_cuenta()
returns void language sql security invoker set search_path = '' as $$
  select private.eliminar_mi_cuenta_segura();
$$;
revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;

create or replace function private.consecuencias_eliminar_cuenta_segura()
returns json language plpgsql security definer set search_path = '' as $$
declare yo uuid := auth.uid(); r jsonb;
begin
  if yo is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  r := private.consecuencias_eliminar_cuenta_original()::jsonb;
  return (r || jsonb_build_object(
    'trabajos_pendientes', (select count(*) from public.trabajos where (cliente_id = yo or profesional_id = yo)
      and (estado is null or estado not in ('cancelado','completado','rechazado'))),
    'pagos_pendientes', (select count(*) from public.transacciones_escrow where (cliente_id = yo or profesional_id = yo)
      and (estado is null or estado not in ('cancelado','reembolsado','completado','liberado')
        or stripe_disputa_id is not null
        or (liquidacion_operacion_id is not null and liquidacion_estado in ('procesando','error')))),
    'disputas_abiertas', (select count(*) from public.disputas where (cliente_id = yo or profesional_id = yo)
      and estado in ('abierta','en_revision'))
  ))::json;
end;
$$;
revoke all on function private.consecuencias_eliminar_cuenta_segura() from public, anon;
grant execute on function private.consecuencias_eliminar_cuenta_segura() to authenticated;

create or replace function public.consecuencias_de_eliminar_mi_cuenta()
returns json language sql security invoker set search_path = '' as $$
  select private.consecuencias_eliminar_cuenta_segura();
$$;
revoke all on function public.consecuencias_de_eliminar_mi_cuenta() from public, anon;
grant execute on function public.consecuencias_de_eliminar_mi_cuenta() to authenticated;
