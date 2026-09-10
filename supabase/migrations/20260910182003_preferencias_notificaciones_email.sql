-- Preferencias granulares para duplicar por correo los avisos de la aplicación.
-- La campana de Diime no depende de esta tabla: desactivar una categoría solo
-- silencia su copia por email.

alter table public.profiles
  add column if not exists email_notificaciones boolean not null default true;

create table if not exists public.preferencias_notificaciones (
  usuario_id uuid primary key references public.profiles(id) on delete cascade,
  email_activo boolean not null default true,
  email_oportunidades boolean not null default true,
  email_ofertas boolean not null default true,
  email_proyectos boolean not null default true,
  email_pagos boolean not null default true,
  email_disputas boolean not null default true,
  email_cuenta boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.preferencias_notificaciones is
  'Canales y categorías de avisos elegidos por cada usuario; no forma parte de su perfil público.';
comment on column public.preferencias_notificaciones.email_oportunidades is
  'Solicitudes nuevas que coinciden con las categorías, provincias y presupuesto del profesional.';

-- Conserva la baja global que ya existía. Las categorías nuevas empiezan
-- activadas para no dejar de enviar avisos que antes sí llegaban por correo.
insert into public.preferencias_notificaciones (usuario_id, email_activo)
select id, coalesce(email_notificaciones, true)
from public.profiles
on conflict (usuario_id) do nothing;

alter table public.preferencias_notificaciones enable row level security;

revoke all on public.preferencias_notificaciones from public, anon, authenticated;
grant select, insert, update on public.preferencias_notificaciones to authenticated;
grant all on public.preferencias_notificaciones to service_role;

drop policy if exists "Usuarios leen sus preferencias de notificaciones" on public.preferencias_notificaciones;
create policy "Usuarios leen sus preferencias de notificaciones"
  on public.preferencias_notificaciones for select
  to authenticated
  using ((select auth.uid()) = usuario_id);

drop policy if exists "Usuarios crean sus preferencias de notificaciones" on public.preferencias_notificaciones;
create policy "Usuarios crean sus preferencias de notificaciones"
  on public.preferencias_notificaciones for insert
  to authenticated
  with check ((select auth.uid()) = usuario_id);

drop policy if exists "Usuarios actualizan sus preferencias de notificaciones" on public.preferencias_notificaciones;
create policy "Usuarios actualizan sus preferencias de notificaciones"
  on public.preferencias_notificaciones for update
  to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

-- Los perfiles creados a partir de ahora reciben también su fila privada. La
-- función es invoker: no amplía permisos y el trigger conserva el contexto del
-- flujo que da de alta el perfil.
create or replace function public.inicializar_preferencias_notificaciones()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.preferencias_notificaciones (usuario_id)
  values (new.id)
  on conflict (usuario_id) do nothing;
  return new;
end;
$$;

revoke all on function public.inicializar_preferencias_notificaciones() from public, anon, authenticated;

drop trigger if exists trg_inicializar_preferencias_notificaciones on public.profiles;
create trigger trg_inicializar_preferencias_notificaciones
  after insert on public.profiles
  for each row execute function public.inicializar_preferencias_notificaciones();
