-- El equipo de Diime debe permanecer siempre accesible desde soporte. Se
-- eliminan primero los bloqueos antiguos dirigidos a perfiles administrativos.
delete from public.usuarios_bloqueados b
using public.profiles p
where b.bloqueado_id = p.id
  and p.es_admin is true;

-- Esta guarda protege también las inserciones directas a la API de Supabase;
-- ocultar el botón en la interfaz no basta para imponer la regla.
create schema if not exists diime_private;
revoke all on schema diime_private from public, anon;

create or replace function diime_private.impedir_bloqueo_equipo_diime()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.profiles p
    where p.id = new.bloqueado_id
      and p.es_admin is true
  ) then
    raise exception 'No puedes bloquear al equipo de Diime.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function diime_private.impedir_bloqueo_equipo_diime() from public, anon, authenticated;

drop trigger if exists trg_impedir_bloqueo_equipo_diime on public.usuarios_bloqueados;
create trigger trg_impedir_bloqueo_equipo_diime
  before insert or update of bloqueado_id on public.usuarios_bloqueados
  for each row
  execute function diime_private.impedir_bloqueo_equipo_diime();

-- Si un perfil pasa a formar parte del equipo, deja de estar bloqueado de
-- inmediato aunque la relación se hubiera creado antes del cambio de rol.
create or replace function diime_private.limpiar_bloqueos_al_hacer_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.es_admin is true and old.es_admin is distinct from true then
    delete from public.usuarios_bloqueados
    where bloqueado_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function diime_private.limpiar_bloqueos_al_hacer_admin() from public, anon, authenticated;

drop trigger if exists trg_limpiar_bloqueos_al_hacer_admin on public.profiles;
create trigger trg_limpiar_bloqueos_al_hacer_admin
  after update of es_admin on public.profiles
  for each row
  execute function diime_private.limpiar_bloqueos_al_hacer_admin();
