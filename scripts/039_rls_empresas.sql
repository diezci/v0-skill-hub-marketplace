-- ALERTA DE SEGURIDAD (Supabase advisor: rls_disabled_in_public).
-- `public.empresas` estaba expuesta por PostgREST SIN row level security: con la
-- URL del proyecto y la clave anónima, cualquiera podía leer, modificar y borrar
-- todas sus filas. La tabla guarda CIF, teléfono, email y sobre todo
-- token_invitacion, que es la credencial para unirse a una empresa: quien
-- pudiera leerla podría colarse en cualquier empresa. Estaba vacía (0 filas),
-- así que no hay constancia de datos comprometidos.
--
-- Se activa RLS y se acota el acceso a lo que la app necesita de verdad
-- (app/actions/auth.ts):
--   1. leer la empresa propia (su propietario, y los admins),
--   2. crear la empresa al registrarse siendo su propietario,
--   3. buscar una empresa por token de invitación al registrarse.
--
-- El caso 3 no puede cubrirse con una política: quien usa el token todavía no
-- es propietario de esa empresa. Se resuelve con una función SECURITY DEFINER
-- que, dado el token exacto, devuelve SOLO el id (nunca el CIF, el email ni el
-- resto de tokens). Es justo la capacidad que el token pretende conceder.
--
-- No hay política por "pertenencia" porque no existe tal vínculo: profiles no
-- tiene columna empresa_id (la función de empresas está a medias, ver el PR).
-- Cuando se complete, se añade aquí la condición de miembro.
--
-- No se crea política de DELETE: nadie puede borrar empresas desde la API.
--
-- Aplicada ya en producción; queda versionada para reproducibilidad.

alter table public.empresas enable row level security;

drop policy if exists "Ver mi empresa" on public.empresas;
create policy "Ver mi empresa"
on public.empresas for select
using (auth.uid() = propietario_id or is_admin());

drop policy if exists "Crear mi empresa" on public.empresas;
create policy "Crear mi empresa"
on public.empresas for insert
with check (auth.uid() = propietario_id);

drop policy if exists "Actualizar mi empresa" on public.empresas;
create policy "Actualizar mi empresa"
on public.empresas for update
using (auth.uid() = propietario_id or is_admin())
with check (auth.uid() = propietario_id or is_admin());

-- Búsqueda por token de invitación: devuelve solo el id de la empresa.
create or replace function public.empresa_id_por_token(p_token text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id
  from public.empresas
  where p_token is not null
    and length(trim(p_token)) > 0
    and token_invitacion = p_token
  limit 1;
$$;

revoke all on function public.empresa_id_por_token(text) from public;
grant execute on function public.empresa_id_por_token(text) to anon, authenticated;
