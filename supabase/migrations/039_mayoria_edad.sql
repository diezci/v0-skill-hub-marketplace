-- Diime permite celebrar contratos y mover dinero entre clientes y
-- profesionales. El registro queda limitado a personas de 18 años o más y la
-- confirmación se guarda de forma auditable sin recoger la fecha de nacimiento.

alter table public.profiles
  add column if not exists mayor_edad_confirmada_at timestamptz,
  add column if not exists mayor_edad_version text;

comment on column public.profiles.mayor_edad_confirmada_at is
  'Fecha en la que la persona confirmó expresamente tener 18 años o más.';

comment on column public.profiles.mayor_edad_version is
  'Versión del texto de mayoría de edad aceptado; no contiene la fecha de nacimiento.';

create or replace function public.completar_mayoria_edad_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb;
begin
  select raw_user_meta_data into metadata
  from auth.users
  where id = new.id;

  if new.mayor_edad_confirmada_at is null
     and nullif(metadata->>'mayor_edad_confirmada_at', '') is not null then
    begin
      new.mayor_edad_confirmada_at := (metadata->>'mayor_edad_confirmada_at')::timestamptz;
    exception when invalid_datetime_format then
      -- Un metadato manipulado no debe impedir el alta ni contar como prueba.
      new.mayor_edad_confirmada_at := null;
    end;
  end if;

  if new.mayor_edad_version is null then
    new.mayor_edad_version := nullif(metadata->>'mayor_edad_version', '');
  end if;

  return new;
end;
$$;

revoke all on function public.completar_mayoria_edad_perfil() from public, anon, authenticated;

drop trigger if exists trg_completar_mayoria_edad_perfil on public.profiles;
create trigger trg_completar_mayoria_edad_perfil
  before insert on public.profiles
  for each row execute function public.completar_mayoria_edad_perfil();
