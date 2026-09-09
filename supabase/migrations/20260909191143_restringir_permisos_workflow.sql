-- La lectura de una conversación no concede edición de su historial. La única
-- actualización que admite el destinatario es marcar como leído el mensaje.
revoke update on public.mensajes from public, anon, authenticated;
revoke insert, update on public.notificaciones from public, anon, authenticated;
-- Quitar también concesiones de columna antiguas: se suman a las de tabla.
do $$
declare r record;
begin
  for r in select table_name, column_name
    from information_schema.column_privileges
    where table_schema = 'public' and table_name in ('mensajes', 'notificaciones')
      and privilege_type = 'UPDATE' and grantee in ('PUBLIC', 'anon', 'authenticated')
  loop
    execute format('revoke update (%I) on public.%I from public, anon, authenticated', r.column_name, r.table_name);
  end loop;
end;
$$;
grant update (leido) on public.mensajes to authenticated;
grant update (leida) on public.notificaciones to authenticated;

drop policy if exists "Usuarios pueden actualizar mensajes (marcar como leído)" on public.mensajes;
create policy "Destinatarios pueden marcar mensajes leídos"
on public.mensajes for update to authenticated
using (
  remitente_id <> (select auth.uid())
  and exists (select 1 from public.conversaciones c where c.id = conversacion_id
    and (c.participante_1 = (select auth.uid()) or c.participante_2 = (select auth.uid())))
)
with check (leido = true and remitente_id <> (select auth.uid()));

-- Defensa también frente a políticas antiguas permisivas: ni siquiera quien
-- tiene otra política UPDATE puede reabrir el recibido o marcar su propio envío.
create or replace function public.proteger_lectura_mensaje()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') and (
    new.remitente_id = auth.uid() or new.leido is distinct from true
    or (to_jsonb(new) - 'leido') is distinct from (to_jsonb(old) - 'leido')
  ) then
    raise exception 'Solo el destinatario puede marcar el mensaje como leído' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_lectura_mensaje() from public, anon, authenticated;
create trigger trg_proteger_lectura_mensaje before update on public.mensajes
for each row execute function public.proteger_lectura_mensaje();

-- Los datos de Connect solo se escriben tras una respuesta verificada de Stripe
-- con el cliente interno del servidor, nunca con la sesión del proveedor.
create or replace function public.proteger_datos_stripe_profesional()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare anterior jsonb; nuevo jsonb;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into nuevo
    from jsonb_each(to_jsonb(new)) where key like 'stripe\_%' escape '\';
  if tg_op = 'INSERT' then
    if new.stripe_account_id is not null or coalesce(new.stripe_onboarding_completado, false)
      or coalesce(new.stripe_transferencias_habilitadas, false)
      or coalesce(new.stripe_payouts_habilitados, false)
      or coalesce(new.stripe_requisitos_pendientes, '[]'::jsonb) <> '[]'::jsonb
      or new.stripe_estado_actualizado_at is not null then
      raise exception 'Los datos de cobros solo los configura el servidor' using errcode = '42501';
    end if;
  else
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into anterior
      from jsonb_each(to_jsonb(old)) where key like 'stripe\_%' escape '\';
    if nuevo is distinct from anterior then
      raise exception 'Los datos de cobros solo los configura el servidor' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_datos_stripe_profesional() from public, anon, authenticated;
create trigger trg_proteger_datos_stripe_profesional before insert or update on public.profesionales
for each row execute function public.proteger_datos_stripe_profesional();

-- La pertenencia es una autorización, no un campo libre del perfil. La función
-- estrecha de abajo valida el token o la propiedad y hace el vínculo atómico.
create or replace function public.proteger_pertenencia_empresa()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if (tg_op = 'INSERT' and new.empresa_id is not null)
    or (tg_op = 'UPDATE' and new.empresa_id is distinct from old.empresa_id) then
    raise exception 'Para vincular una empresa debes usar una invitación válida o crear tu propia empresa' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_pertenencia_empresa() from public, anon, authenticated;
create trigger trg_proteger_pertenencia_empresa before insert or update of empresa_id on public.profiles
for each row execute function public.proteger_pertenencia_empresa();

-- Un token no se transforma en un UUID reutilizable para una escritura libre.
revoke all on function public.empresa_id_por_token(text) from public, anon, authenticated;

create schema if not exists diime_private;
revoke all on schema diime_private from public, anon;
grant usage on schema diime_private to authenticated;

create or replace function diime_private.vincular_empresa(
  p_token text, p_nombre text, p_cif text, p_documento_personal text,
  p_cargo text, p_telefono text, p_ubicacion text
) returns uuid language plpgsql security definer set search_path = '' as $$
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
$$;
revoke all on function diime_private.vincular_empresa(text, text, text, text, text, text, text) from public, anon;
grant execute on function diime_private.vincular_empresa(text, text, text, text, text, text, text) to authenticated;

create or replace function public.vincular_mi_empresa(
  p_token text default null, p_nombre text default null, p_cif text default null,
  p_documento_personal text default null, p_cargo text default null,
  p_telefono text default null, p_ubicacion text default null
) returns uuid language sql security invoker set search_path = '' as $$
  select diime_private.vincular_empresa(p_token, p_nombre, p_cif, p_documento_personal, p_cargo, p_telefono, p_ubicacion);
$$;
revoke all on function public.vincular_mi_empresa(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.vincular_mi_empresa(text, text, text, text, text, text, text) to authenticated;

-- Una respuesta de Stripe puede llegar mientras la persona cambia a empresa.
-- El lock de perfil es el mismo que usa vincular_empresa: una lectura antigua
-- nunca vuelve a habilitar los cobros tras ese cambio de representación.
create or replace function public.actualizar_estado_cuenta_stripe(
  p_profesional_id uuid, p_account_id text, p_empresa_esperada uuid,
  p_onboarding boolean, p_transferencias boolean, p_payouts boolean, p_requisitos jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare empresa_actual uuid; cuenta_actual text;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Solo el servidor puede sincronizar Stripe' using errcode = '42501';
  end if;
  select empresa_id into empresa_actual from public.profiles
    where id = p_profesional_id and cuenta_eliminada is null for update;
  if not found or empresa_actual is distinct from p_empresa_esperada then return false; end if;
  select stripe_account_id into cuenta_actual from public.profesionales
    where id = p_profesional_id for update;
  if not found or cuenta_actual is distinct from p_account_id then return false; end if;
  if p_account_id is null or jsonb_typeof(coalesce(p_requisitos, '[]'::jsonb)) <> 'array' then
    raise exception 'Estado de Stripe no válido' using errcode = '22023';
  end if;
  update public.profesionales set
    stripe_onboarding_completado = coalesce(p_onboarding, false),
    stripe_transferencias_habilitadas = coalesce(p_transferencias, false),
    stripe_payouts_habilitados = coalesce(p_payouts, false),
    stripe_requisitos_pendientes = coalesce(p_requisitos, '[]'::jsonb),
    stripe_estado_actualizado_at = now()
  where id = p_profesional_id;
  return true;
end;
$$;
revoke all on function public.actualizar_estado_cuenta_stripe(uuid, text, uuid, boolean, boolean, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.actualizar_estado_cuenta_stripe(uuid, text, uuid, boolean, boolean, boolean, jsonb) to service_role;
