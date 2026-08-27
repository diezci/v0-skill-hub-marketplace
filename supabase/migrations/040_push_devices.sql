-- Dispositivos nativos autorizados para recibir notificaciones push.
-- Cada token pertenece siempre al último usuario que inició sesión en ese
-- dispositivo; el token nunca queda expuesto a otros usuarios mediante RLS.

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  plataforma text not null check (plataforma in ('ios', 'android')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_devices_usuario_activo_idx
  on public.push_devices (usuario_id, activo);

alter table public.push_devices enable row level security;

drop policy if exists "push_devices_select_own" on public.push_devices;
create policy "push_devices_select_own"
  on public.push_devices for select
  using (auth.uid() = usuario_id);

drop policy if exists "push_devices_delete_own" on public.push_devices;
create policy "push_devices_delete_own"
  on public.push_devices for delete
  using (auth.uid() = usuario_id);

-- SECURITY DEFINER permite reasignar de forma segura un token cuando otra
-- cuenta inicia sesión en el mismo móvil, sin revelar tokens ajenos.
create or replace function public.registrar_dispositivo_push(
  p_token text,
  p_plataforma text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'Token push inválido';
  end if;

  if p_plataforma not in ('ios', 'android') then
    raise exception 'Plataforma push inválida';
  end if;

  insert into public.push_devices (usuario_id, token, plataforma, activo, updated_at)
  values (auth.uid(), trim(p_token), p_plataforma, true, now())
  on conflict (token) do update
    set usuario_id = excluded.usuario_id,
        plataforma = excluded.plataforma,
        activo = true,
        updated_at = now();
end;
$$;

create or replace function public.eliminar_dispositivo_push(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_devices
  where usuario_id = auth.uid()
    and token = trim(p_token);
$$;

revoke all on function public.registrar_dispositivo_push(text, text) from public;
revoke all on function public.eliminar_dispositivo_push(text) from public;
grant execute on function public.registrar_dispositivo_push(text, text) to authenticated;
grant execute on function public.eliminar_dispositivo_push(text) to authenticated;

revoke all on table public.push_devices from anon;
grant select, delete on table public.push_devices to authenticated;
