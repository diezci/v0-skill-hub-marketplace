-- Verification follows the current authenticated membership, without rewriting
-- the professional's personal identity or the legacy owner-only company field.
-- Internal functions retain the existing authentication/administrator guards.
create or replace function diime_private.empresa_actual_verificacion(p_usuario_id uuid)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select m.empresa_id from public.empresa_miembros m
  where m.usuario_id=p_usuario_id and m.estado='activo'
    and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id);
$$;
revoke all on function diime_private.empresa_actual_verificacion(uuid) from public,anon,authenticated;

create or replace function diime_private.solicitar_verificacion_profesional(p_mensaje text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); perfil public.profiles%rowtype;
  solicitud public.solicitudes_verificacion_profesional%rowtype; empresa_actual uuid;
  mensaje_limpio text := btrim(coalesce(p_mensaje, ''));
begin
  if actor is null or not exists (select 1 from auth.users where id = actor and email_confirmed_at is not null) then
    raise exception 'Inicia sesión y confirma tu correo para solicitar la verificación' using errcode = '42501';
  end if;
  if char_length(coalesce(p_mensaje, '')) > 2000 then
    raise exception 'El mensaje no puede superar 2000 caracteres' using errcode = '22023';
  end if;
  -- Este bloqueo también serializa la revisión y los cambios de empresa.
  select * into perfil from public.profiles where id = actor and cuenta_eliminada is null for update;
  if not found or not exists (select 1 from public.profesionales where id = actor) then
    raise exception 'Completa tu perfil profesional antes de solicitar la verificación' using errcode = '42501';
  end if;
  if coalesce(perfil.verificado, false) then
    raise exception 'Tu perfil ya está verificado' using errcode = '22023';
  end if;
  empresa_actual := diime_private.empresa_actual_verificacion(actor);
  select * into solicitud from public.solicitudes_verificacion_profesional where profesional_id = actor for update;
  if found and solicitud.estado in ('pendiente', 'en_revision') then return solicitud.id; end if;
  insert into public.solicitudes_verificacion_profesional
    (profesional_id, estado, mensaje, empresa_id)
  values (actor, 'pendiente', mensaje_limpio, empresa_actual)
  on conflict (profesional_id) do update set estado = 'pendiente', mensaje = excluded.mensaje,
    comentario_publico = null, empresa_id = excluded.empresa_id, solicitada_at = now(),
    actualizada_at = clock_timestamp(), resuelta_at = null
  returning * into solicitud;
  insert into public.historial_verificacion_profesional
    (solicitud_id, profesional_id, actor_id, estado, empresa_id)
  values (solicitud.id, actor, actor, 'pendiente', empresa_actual);
  return solicitud.id;
end;
$$;

create or replace function diime_private.revisar_verificacion_profesional(
  p_profesional_id uuid, p_estado text, p_comentario_publico text,
  p_nota_interna text, p_compatibilidad boolean default false, p_actualizada_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); perfil public.profiles%rowtype;
  solicitud public.solicitudes_verificacion_profesional%rowtype; empresa_actual uuid;
  comentario text := nullif(btrim(coalesce(p_comentario_publico, '')), '');
  nota text := nullif(btrim(coalesce(p_nota_interna, '')), '');
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor
    and es_admin = true and cuenta_eliminada is null) then
    raise exception 'Solo un administrador puede revisar la verificación' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('en_revision', 'verificado', 'no_aprobado', 'retirada') then
    raise exception 'Estado de revisión no válido' using errcode = '22023';
  end if;
  if p_compatibilidad is null or (p_compatibilidad and p_estado not in ('verificado', 'retirada')) then
    raise exception 'La operación antigua solo permite conservar o retirar una insignia' using errcode = '22023';
  end if;
  if char_length(coalesce(p_comentario_publico, '')) > 2000 or char_length(coalesce(p_nota_interna, '')) > 4000 then
    raise exception 'El comentario público admite 2000 caracteres y la nota interna 4000' using errcode = '22023';
  end if;
  if p_estado in ('no_aprobado', 'retirada') and comentario is null then
    raise exception 'Indica un motivo público para no aprobar o retirar la verificación' using errcode = '22023';
  end if;
  select * into perfil from public.profiles where id = p_profesional_id and cuenta_eliminada is null for update;
  if not found or not exists (select 1 from public.profesionales where id = p_profesional_id) then
    raise exception 'No se encontró el perfil profesional' using errcode = 'P0002';
  end if;
  empresa_actual := diime_private.empresa_actual_verificacion(p_profesional_id);
  select * into solicitud from public.solicitudes_verificacion_profesional
    where profesional_id = p_profesional_id for update;
  -- Una pantalla antigua no puede aprobar una solicitud reenviada o revisada
  -- después de que el administrador la leyera, incluso si conserva el UUID.
  if not p_compatibilidad and (p_actualizada_at is null or solicitud.id is null
    or p_actualizada_at is distinct from solicitud.actualizada_at) then
    raise exception 'La solicitud ha cambiado. Actualiza la lista y revisa el expediente vigente' using errcode = '22023';
  end if;
  if p_compatibilidad and p_estado = 'verificado' then
    if coalesce(perfil.verificado, false) then return solicitud.id; end if;
    raise exception 'Para aprobar la verificación, abre y revisa el expediente vigente' using errcode = '22023';
  end if;
  if solicitud.id is null then
    -- La operación antigua de retirada puede revocar una insignia previa al
    -- sistema de expedientes, pero no puede aprobar un perfil nuevo.
    if coalesce(perfil.verificado, false) and p_estado = 'retirada' then
      insert into public.solicitudes_verificacion_profesional
        (profesional_id, estado, empresa_id, comentario_publico, resuelta_at)
      values (p_profesional_id, p_estado, empresa_actual,
        comentario, now())
      returning * into solicitud;
    elsif p_compatibilidad and p_estado = 'retirada' and not coalesce(perfil.verificado, false) then
      return null; -- Mantiene el reintento antiguo de «desmarcar» sin inventar un expediente.
    else
      raise exception 'El profesional debe enviar una solicitud de verificación vigente' using errcode = '22023';
    end if;
  else
    if p_estado <> 'retirada' and solicitud.empresa_id is distinct from empresa_actual then
      raise exception 'Ha cambiado la empresa. El profesional debe enviar una nueva solicitud' using errcode = '22023';
    end if;
    if solicitud.estado = p_estado then
      if coalesce(perfil.verificado, false) is distinct from (p_estado = 'verificado') then
        raise exception 'La insignia y el expediente no coinciden; revisa el historial' using errcode = '22023';
      end if;
      return solicitud.id; -- Doble clic/reintento no duplica decisiones ni cambia notas.
    end if;
    if not (
      (solicitud.estado in ('pendiente', 'en_revision') and p_estado in ('en_revision', 'verificado', 'no_aprobado', 'retirada'))
      or (solicitud.estado = 'verificado' and p_estado = 'retirada')
    ) then
      raise exception 'Esta solicitud está cerrada; el profesional debe volver a solicitar la verificación' using errcode = '22023';
    end if;
    update public.solicitudes_verificacion_profesional set estado = p_estado,
      comentario_publico = comentario, actualizada_at = clock_timestamp(),
      resuelta_at = case when p_estado = 'en_revision' then null else now() end
    where id = solicitud.id returning * into solicitud;
  end if;
  update public.profiles set verificado = (p_estado = 'verificado') where id = p_profesional_id;
  insert into public.historial_verificacion_profesional
    (solicitud_id, profesional_id, actor_id, estado, comentario_publico, nota_interna, empresa_id)
  values (solicitud.id, p_profesional_id, actor, p_estado, solicitud.comentario_publico, nota, solicitud.empresa_id);
  return solicitud.id;
end;
$$;

-- Joining, leaving or changing a company invalidates an existing professional
-- verification in the same transaction. Permission/title-only edits do not.
create or replace function diime_private.invalidar_verificacion_por_membresia(p_usuario_id uuid,p_empresa_anterior uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  perfil public.profiles%rowtype;
  solicitud public.solicitudes_verificacion_profesional%rowtype;
  actual uuid;
  actor uuid;
  motivo text := 'La representación ha cambiado. Solicita de nuevo la verificación de tu perfil actual.';
begin
  select * into perfil from public.profiles where id=p_usuario_id for update;
  if not found or not exists(select 1 from public.profesionales where id=p_usuario_id) then return; end if;
  actual := diime_private.empresa_actual_verificacion(p_usuario_id);
  select * into solicitud from public.solicitudes_verificacion_profesional where profesional_id=p_usuario_id for update;
  if solicitud.id is null then
    if not coalesce(perfil.verificado,false) then return; end if;
    insert into public.solicitudes_verificacion_profesional
      (profesional_id,estado,empresa_id,comentario_publico,resuelta_at)
      values(p_usuario_id,'retirada',p_empresa_anterior,motivo,now()) returning * into solicitud;
  elsif solicitud.empresa_id is not distinct from actual then return;
  elsif solicitud.estado not in ('pendiente','en_revision','verificado') and not coalesce(perfil.verificado,false) then return;
  end if;
  select id into actor from public.profiles where id=auth.uid();
  update public.solicitudes_verificacion_profesional
    set estado='retirada',comentario_publico=motivo,actualizada_at=clock_timestamp(),resuelta_at=now()
    where id=solicitud.id;
  if coalesce(perfil.verificado,false) then update public.profiles set verificado=false where id=p_usuario_id; end if;
  insert into public.historial_verificacion_profesional
    (solicitud_id,profesional_id,actor_id,estado,comentario_publico,empresa_id)
    values(solicitud.id,p_usuario_id,actor,'retirada',motivo,solicitud.empresa_id);
end;
$$;
revoke all on function diime_private.invalidar_verificacion_por_membresia(uuid,uuid) from public,anon,authenticated;

create or replace function diime_private.verificacion_membresia_cambiada()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and new.usuario_id is not distinct from old.usuario_id
    and new.empresa_id is not distinct from old.empresa_id and new.estado is not distinct from old.estado then return new; end if;
  if tg_op='DELETE' and old.estado<>'activo' then return old; end if;
  if tg_op='INSERT' and new.estado<>'activo' then return new; end if;
  if tg_op<>'INSERT' then
    perform diime_private.invalidar_verificacion_por_membresia(old.usuario_id,case when old.estado='activo' then old.empresa_id else null end);
  end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and new.usuario_id is distinct from old.usuario_id) then
    perform diime_private.invalidar_verificacion_por_membresia(new.usuario_id);
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function diime_private.verificacion_membresia_cambiada() from public,anon,authenticated;
create trigger trg_verificacion_membresia_cambiada
  after insert or delete or update of empresa_id,usuario_id,estado on public.empresa_miembros
  for each row execute function diime_private.verificacion_membresia_cambiada();

-- A pre-existing request recorded against the owner-only legacy field must be
-- reviewed again if it no longer matches the active membership. Preserve history.
do $$ declare fila record; begin
  for fila in select s.profesional_id from public.solicitudes_verificacion_profesional s
    where s.estado in ('pendiente','en_revision','verificado')
      and s.empresa_id is distinct from diime_private.empresa_actual_verificacion(s.profesional_id)
  loop perform diime_private.invalidar_verificacion_por_membresia(fila.profesional_id); end loop;
end $$;
