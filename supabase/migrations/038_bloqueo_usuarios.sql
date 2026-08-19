-- Bloqueo entre usuarios para impedir nuevas comunicaciones y cumplir las
-- políticas de contenido generado por usuarios de App Store y Google Play.

create table if not exists public.usuarios_bloqueados (
  bloqueador_id uuid not null references public.profiles(id) on delete cascade,
  bloqueado_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bloqueador_id, bloqueado_id),
  constraint usuarios_bloqueados_distintos check (bloqueador_id <> bloqueado_id)
);

create index if not exists usuarios_bloqueados_bloqueado_idx
  on public.usuarios_bloqueados (bloqueado_id);

alter table public.usuarios_bloqueados enable row level security;

drop policy if exists "bloqueos_select_propios" on public.usuarios_bloqueados;
create policy "bloqueos_select_propios" on public.usuarios_bloqueados
  for select using (bloqueador_id = auth.uid());

drop policy if exists "bloqueos_insert_propios" on public.usuarios_bloqueados;
create policy "bloqueos_insert_propios" on public.usuarios_bloqueados
  for insert with check (bloqueador_id = auth.uid() and bloqueado_id <> auth.uid());

drop policy if exists "bloqueos_delete_propios" on public.usuarios_bloqueados;
create policy "bloqueos_delete_propios" on public.usuarios_bloqueados
  for delete using (bloqueador_id = auth.uid());

grant select, insert, delete on public.usuarios_bloqueados to authenticated;
revoke all on public.usuarios_bloqueados from anon;

-- Incluye ambos sentidos sin revelar quién bloqueó a quién. La interfaz lo
-- usa para ocultar chats y el servidor para explicar por qué no puede abrirse
-- una conversación.
create or replace function public.interaccion_bloqueada_con(p_otro uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.usuarios_bloqueados b
    where (b.bloqueador_id = auth.uid() and b.bloqueado_id = p_otro)
       or (b.bloqueador_id = p_otro and b.bloqueado_id = auth.uid())
  );
$$;

create or replace function public.usuarios_incompatibles()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when b.bloqueador_id = auth.uid() then b.bloqueado_id
    else b.bloqueador_id
  end
  from public.usuarios_bloqueados b
  where b.bloqueador_id = auth.uid() or b.bloqueado_id = auth.uid();
$$;

revoke all on function public.interaccion_bloqueada_con(uuid) from public, anon;
revoke all on function public.usuarios_incompatibles() from public, anon;
grant execute on function public.interaccion_bloqueada_con(uuid) to authenticated;
grant execute on function public.usuarios_incompatibles() to authenticated;

-- La comprobación está también en la base de datos: no basta con deshabilitar
-- botones porque un cliente podría llamar directamente a la API de Supabase.
create or replace function public.impedir_conversacion_bloqueada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.usuarios_bloqueados b
    where (b.bloqueador_id = new.participante_1 and b.bloqueado_id = new.participante_2)
       or (b.bloqueador_id = new.participante_2 and b.bloqueado_id = new.participante_1)
  ) then
    raise exception 'No se puede iniciar una conversación entre estos usuarios.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_impedir_conversacion_bloqueada on public.conversaciones;
create trigger trg_impedir_conversacion_bloqueada
  before insert or update of participante_1, participante_2 on public.conversaciones
  for each row execute function public.impedir_conversacion_bloqueada();

create or replace function public.impedir_mensaje_bloqueado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p1 uuid;
  p2 uuid;
begin
  select participante_1, participante_2 into p1, p2
  from public.conversaciones where id = new.conversacion_id;

  if exists (
    select 1 from public.usuarios_bloqueados b
    where (b.bloqueador_id = p1 and b.bloqueado_id = p2)
       or (b.bloqueador_id = p2 and b.bloqueado_id = p1)
  ) then
    raise exception 'No se pueden enviar mensajes entre estos usuarios.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_impedir_mensaje_bloqueado on public.mensajes;
create trigger trg_impedir_mensaje_bloqueado
  before insert on public.mensajes
  for each row execute function public.impedir_mensaje_bloqueado();

-- Una baja elimina también la lista de bloqueos, que ya no hace falta y forma
-- parte de los datos de uso de la cuenta.
create or replace function public.limpiar_bloqueos_al_eliminar_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.cuenta_eliminada is null and new.cuenta_eliminada is not null then
    delete from public.usuarios_bloqueados
    where bloqueador_id = new.id or bloqueado_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limpiar_bloqueos_al_eliminar_cuenta on public.profiles;
create trigger trg_limpiar_bloqueos_al_eliminar_cuenta
  after update of cuenta_eliminada on public.profiles
  for each row execute function public.limpiar_bloqueos_al_eliminar_cuenta();
