-- La insignia manual verifica al profesional y a su representación actual.
-- No modifica pagos, comisiones, Connect ni crea notificaciones.
create table public.solicitudes_verificacion_profesional (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null unique references public.profesionales(id) on delete cascade,
  estado text not null check (estado in ('pendiente', 'en_revision', 'verificado', 'no_aprobado', 'retirada')),
  mensaje text not null default '' check (char_length(mensaje) <= 2000),
  comentario_publico text check (char_length(comentario_publico) <= 2000),
  empresa_id uuid references public.empresas(id) on delete set null,
  solicitada_at timestamptz not null default now(),
  actualizada_at timestamptz not null default now(),
  resuelta_at timestamptz,
  constraint verificacion_resolucion_coherente check (
    (estado in ('pendiente', 'en_revision') and resuelta_at is null)
    or (estado in ('verificado', 'no_aprobado', 'retirada') and resuelta_at is not null)
  )
);
create table public.historial_verificacion_profesional (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes_verificacion_profesional(id) on delete cascade,
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  estado text not null check (estado in ('pendiente', 'en_revision', 'verificado', 'no_aprobado', 'retirada')),
  comentario_publico text check (char_length(comentario_publico) <= 2000),
  nota_interna text check (char_length(nota_interna) <= 4000),
  -- Conserva la representación de cada decisión aunque se reabra el expediente.
  empresa_id uuid,
  creado_at timestamptz not null default now()
);
create index solicitudes_verificacion_estado_fecha_idx
  on public.solicitudes_verificacion_profesional (estado, solicitada_at desc);
create index historial_verificacion_solicitud_fecha_idx
  on public.historial_verificacion_profesional (solicitud_id, creado_at desc);

alter table public.solicitudes_verificacion_profesional enable row level security;
alter table public.historial_verificacion_profesional enable row level security;
revoke all on public.solicitudes_verificacion_profesional, public.historial_verificacion_profesional
  from public, anon, authenticated;
grant select on public.solicitudes_verificacion_profesional, public.historial_verificacion_profesional to authenticated;
create policy "Titular y administradores consultan solicitud de verificación"
  on public.solicitudes_verificacion_profesional for select to authenticated
  using (profesional_id = (select auth.uid()) or (select public.is_admin()));
create policy "Solo administradores consultan historial de verificación"
  on public.historial_verificacion_profesional for select to authenticated
  using ((select public.is_admin()));

create schema if not exists diime_private;
revoke all on schema diime_private from public, anon;
grant usage on schema diime_private to authenticated;

-- Un UPDATE directo desde una sesión, incluso de administrador, no puede
-- saltarse la solicitud y el historial. Los RPC internos ejecutan como owner.
create or replace function public.proteger_campos_administrativos_perfil()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.verificado, false) or coalesce(new.es_admin, false) then
      raise exception 'No puedes crear un perfil verificado o administrador' using errcode = '42501';
    end if;
  else
    if new.verificado is distinct from old.verificado then
      raise exception 'Para cambiar la verificación debes usar el expediente de revisión' using errcode = '42501';
    end if;
    if new.es_admin is distinct from old.es_admin and not public.is_admin() then
      raise exception 'Solo un administrador puede modificar el rol administrativo' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_campos_administrativos_perfil() from public, anon, authenticated;

create or replace function diime_private.solicitar_verificacion_profesional(p_mensaje text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); perfil public.profiles%rowtype;
  solicitud public.solicitudes_verificacion_profesional%rowtype;
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
  select * into solicitud from public.solicitudes_verificacion_profesional where profesional_id = actor for update;
  if found and solicitud.estado in ('pendiente', 'en_revision') then return solicitud.id; end if;
  insert into public.solicitudes_verificacion_profesional
    (profesional_id, estado, mensaje, empresa_id)
  values (actor, 'pendiente', mensaje_limpio, perfil.empresa_id)
  on conflict (profesional_id) do update set estado = 'pendiente', mensaje = excluded.mensaje,
    comentario_publico = null, empresa_id = excluded.empresa_id, solicitada_at = now(),
    actualizada_at = clock_timestamp(), resuelta_at = null
  returning * into solicitud;
  insert into public.historial_verificacion_profesional
    (solicitud_id, profesional_id, actor_id, estado, empresa_id)
  values (solicitud.id, actor, actor, 'pendiente', perfil.empresa_id);
  return solicitud.id;
end;
$$;
revoke all on function diime_private.solicitar_verificacion_profesional(text) from public, anon;
grant execute on function diime_private.solicitar_verificacion_profesional(text) to authenticated;

create or replace function public.solicitar_verificacion_profesional(p_mensaje text default '')
returns uuid language sql security invoker set search_path = '' as $$
  select diime_private.solicitar_verificacion_profesional(p_mensaje);
$$;
revoke all on function public.solicitar_verificacion_profesional(text) from public, anon;
grant execute on function public.solicitar_verificacion_profesional(text) to authenticated;

create or replace function diime_private.revisar_verificacion_profesional(
  p_profesional_id uuid, p_estado text, p_comentario_publico text,
  p_nota_interna text, p_compatibilidad boolean default false, p_actualizada_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); perfil public.profiles%rowtype;
  solicitud public.solicitudes_verificacion_profesional%rowtype;
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
      values (p_profesional_id, p_estado, perfil.empresa_id,
        comentario, now())
      returning * into solicitud;
    elsif p_compatibilidad and p_estado = 'retirada' and not coalesce(perfil.verificado, false) then
      return null; -- Mantiene el reintento antiguo de «desmarcar» sin inventar un expediente.
    else
      raise exception 'El profesional debe enviar una solicitud de verificación vigente' using errcode = '22023';
    end if;
  else
    if p_estado <> 'retirada' and solicitud.empresa_id is distinct from perfil.empresa_id then
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
revoke all on function diime_private.revisar_verificacion_profesional(uuid, text, text, text, boolean, timestamptz) from public, anon;
grant execute on function diime_private.revisar_verificacion_profesional(uuid, text, text, text, boolean, timestamptz) to authenticated;

create or replace function public.revisar_verificacion_profesional(
  p_profesional_id uuid, p_estado text, p_comentario_publico text default '', p_nota_interna text default '',
  p_actualizada_at timestamptz default null
) returns uuid language sql security invoker set search_path = '' as $$
  select diime_private.revisar_verificacion_profesional(p_profesional_id, p_estado, p_comentario_publico, p_nota_interna, false, p_actualizada_at);
$$;
revoke all on function public.revisar_verificacion_profesional(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.revisar_verificacion_profesional(uuid, text, text, text, timestamptz) to authenticated;

create or replace function public.actualizar_verificacion_profesional(p_profesional_id uuid, p_verificado boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_verificado is null then raise exception 'El estado de verificación es obligatorio' using errcode = '22004'; end if;
  perform diime_private.revisar_verificacion_profesional(p_profesional_id,
    case when p_verificado then 'verificado' else 'retirada' end,
    case when p_verificado then '' else 'Verificación retirada por un administrador.' end, '', true, null);
  return true;
end;
$$;
revoke all on function public.actualizar_verificacion_profesional(uuid, boolean) from public, anon;
grant execute on function public.actualizar_verificacion_profesional(uuid, boolean) to authenticated;

create or replace function diime_private.invalidar_verificacion_por_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  solicitud public.solicitudes_verificacion_profesional%rowtype;
  motivo text := 'La representación ha cambiado. Solicita de nuevo la verificación de tu perfil actual.';
  actor uuid;
begin
  if new.empresa_id is not distinct from old.empresa_id then return new; end if;
  if not exists (select 1 from public.profesionales where id = new.id) then return new; end if;
  select id into actor from public.profiles where id = auth.uid();
  select * into solicitud from public.solicitudes_verificacion_profesional
    where profesional_id = new.id for update;
  if found and (solicitud.estado in ('pendiente', 'en_revision', 'verificado') or coalesce(old.verificado, false)) then
    update public.solicitudes_verificacion_profesional set estado = 'retirada', comentario_publico = motivo,
      actualizada_at = clock_timestamp(), resuelta_at = now() where id = solicitud.id returning * into solicitud;
  elsif coalesce(old.verificado, false) and solicitud.id is null then
    insert into public.solicitudes_verificacion_profesional
      (profesional_id, estado, empresa_id, comentario_publico, resuelta_at)
    values (new.id, 'retirada', (select id from public.empresas where id = old.empresa_id), motivo, now()) returning * into solicitud;
  else
    if coalesce(new.verificado, false) then update public.profiles set verificado = false where id = new.id; end if;
    return new;
  end if;
  if coalesce(new.verificado, false) then update public.profiles set verificado = false where id = new.id; end if;
  insert into public.historial_verificacion_profesional
    (solicitud_id, profesional_id, actor_id, estado, comentario_publico, empresa_id)
  values (solicitud.id, new.id, actor, 'retirada', motivo, old.empresa_id);
  return new;
end;
$$;
revoke all on function diime_private.invalidar_verificacion_por_empresa() from public, anon, authenticated;
create trigger trg_invalidar_verificacion_por_empresa after update of empresa_id on public.profiles
for each row execute function diime_private.invalidar_verificacion_por_empresa();
