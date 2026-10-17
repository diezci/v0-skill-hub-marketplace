begin;

-- With email confirmation, registrarUsuario has no session and cannot update
-- profiles. Copy the submitted personal contact fields when the profile is born.
-- Metadata never grants company membership, verification or admin privileges.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles (
    id,email,nombre,apellido,foto_perfil,tipo_usuario,verificado,es_admin,
    documento,telefono,ubicacion,fecha_registro,created_at,updated_at
  ) values (
    new.id,new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'nombre'),''),nullif(btrim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'apellido',''),
    coalesce(new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture'),
    'cliente',false,false,
    nullif(btrim(new.raw_user_meta_data->>'documento'),''),
    nullif(btrim(new.raw_user_meta_data->>'telefono'),''),
    nullif(btrim(new.raw_user_meta_data->>'ubicacion'),''),
    now(),now(),now()
  ) on conflict (id) do nothing;
  -- Auth also calls this trigger on metadata changes. Existing profile edits
  -- remain authoritative and must not be overwritten by old signup metadata.
  return new;
exception when others then
  raise warning 'Error creating profile for user %: %',new.id,sqlerrm;
  return new;
end;
$$;

commit;
