-- Los administradores pueden verificar perfiles profesionales.
-- Además, evita que un usuario aproveche la política de edición de su propio
-- perfil para cambiar `verificado` o concederse permisos de administrador.

create or replace function public.proteger_campos_administrativos_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if (
      coalesce(new.verificado, false)
      or coalesce(new.es_admin, false)
    ) and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'No puedes crear un perfil verificado o administrador'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if (
    new.verificado is distinct from old.verificado
    or new.es_admin is distinct from old.es_admin
  ) and not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo un administrador puede modificar la verificación o el rol administrativo'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_campos_administrativos_perfil on public.profiles;
create trigger trg_proteger_campos_administrativos_perfil
  before update of verificado, es_admin on public.profiles
  for each row
  execute function public.proteger_campos_administrativos_perfil();

drop trigger if exists trg_proteger_campos_administrativos_perfil_insert on public.profiles;
create trigger trg_proteger_campos_administrativos_perfil_insert
  before insert on public.profiles
  for each row
  execute function public.proteger_campos_administrativos_perfil();

-- Operación estrecha para el panel: no se concede a los administradores permiso
-- genérico de edición sobre todos los campos de todos los perfiles.
create or replace function public.actualizar_verificacion_profesional(
  p_profesional_id uuid,
  p_verificado boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No tienes permiso para verificar profesionales'
      using errcode = '42501';
  end if;

  if p_verificado is null then
    raise exception 'El estado de verificación no puede estar vacío'
      using errcode = '22004';
  end if;

  if not exists (
    select 1
    from public.profesionales
    where id = p_profesional_id
  ) then
    raise exception 'El usuario seleccionado no es profesional'
      using errcode = 'P0002';
  end if;

  update public.profiles
  set verificado = p_verificado
  where id = p_profesional_id;

  return found;
end;
$$;

revoke all on function public.actualizar_verificacion_profesional(uuid, boolean) from public;
grant execute on function public.actualizar_verificacion_profesional(uuid, boolean) to authenticated;
