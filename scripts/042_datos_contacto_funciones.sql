-- Datos personales de `profiles` (email, teléfono, documento).
--
-- Hasta ahora la política SELECT de `profiles` era `true` y tanto `anon` como
-- `authenticated` tenían SELECT sobre TODAS las columnas: cualquiera, incluso
-- sin iniciar sesión, podía volcar los correos, los teléfonos y el DNI de todo
-- el mundo. La RLS no distingue columnas, así que el corte se hace con permisos
-- de columna (ver 043) y estas funciones dan la vía legítima de acceso.
--
-- Este archivo solo AÑADE funciones: se puede aplicar sin romper nada. El
-- REVOKE va aparte porque hay que desplegar antes el código que ya no lee esas
-- columnas directamente.

-- Datos de contacto de una o varias personas, solo para quien tiene motivo:
--   * uno mismo,
--   * un administrador,
--   * la otra parte de un trabajo compartido (facturas, disputas, contratos),
--   * alguien de la misma empresa.
-- El documento (DNI/NIE) es más sensible y solo se devuelve a su titular y a un
-- admin; para las facturas ya existe `facturacion_trabajo`, que lo entrega
-- acotado a un trabajo concreto.
create or replace function public.contacto_perfiles(p_ids uuid[])
returns table (id uuid, email text, telefono text, documento text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.email,
    p.telefono,
    case when p.id = auth.uid() or public.is_admin() then p.documento end
  from public.profiles p
  where p.id = any(p_ids)
    and (
      p.id = auth.uid()
      or public.is_admin()
      or exists (
        select 1 from public.trabajos t
        where (t.cliente_id = auth.uid() and t.profesional_id = p.id)
           or (t.profesional_id = auth.uid() and t.cliente_id = p.id)
      )
      or exists (
        select 1 from public.profiles yo
        where yo.id = auth.uid()
          and yo.empresa_id is not null
          and yo.empresa_id = p.empresa_id
      )
    );
$$;

-- Hay que revocar de `anon` explícitamente: Supabase tiene ALTER DEFAULT
-- PRIVILEGES que concede EXECUTE a anon/authenticated al crear la función, y un
-- `revoke from public` no retira esa concesión nominal.
revoke all on function public.contacto_perfiles(uuid[]) from public;
revoke all on function public.contacto_perfiles(uuid[]) from anon;
grant execute on function public.contacto_perfiles(uuid[]) to authenticated;

-- Teléfono que un profesional publica para que le llamen. El directorio de
-- profesionales es público y el botón "Llamar" de su ficha depende de esto, así
-- que se mantiene abierto, pero SOLO para quien se ha dado de alta como
-- profesional: el teléfono de un cliente ya no lo ve nadie.
create or replace function public.telefono_publico(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.telefono
  from public.profiles p
  join public.profesionales pr on pr.id = p.id
  where p.id = p_id;
$$;

revoke all on function public.telefono_publico(uuid) from public;
grant execute on function public.telefono_publico(uuid) to anon, authenticated;
