-- La función de empresas estaba a medias: se creaba la fila en `empresas` pero
-- el vínculo con la persona se perdía (profiles no tenía empresa_id, y el
-- empresaId que calculaba el registro se descartaba). Además, al registrarse
-- como empresa el campo "documento" se usaba como CIF, así que **la persona
-- real que actúa en nombre de la empresa nunca quedaba identificada**: no se
-- guardaba su DNI/NIE por ningún sitio.
--
-- Esto lo arregla:
--   1. profiles.documento  -> DNI/NIE de la PERSONA (siempre, sea particular o
--      represente a una empresa). Es quien responde de los actos en la web.
--   2. profiles.empresa_id -> a qué empresa pertenece y en nombre de quién
--      actúa. Con esto las facturas pueden emitirse a nombre de la empresa.
--   3. profiles.cargo_empresa -> cargo con el que actúa (opcional).
--
-- Una empresa puede ser cliente Y proveedor a la vez: el vínculo vive en el
-- perfil de la persona, y ese perfil puede publicar demandas (cliente) y tener
-- ficha de profesional (proveedor). No hace falta distinguirlo en `empresas`.
--
-- Aplicada ya en producción; queda versionada para reproducibilidad.

alter table public.profiles
  add column if not exists documento text,
  add column if not exists empresa_id uuid references public.empresas(id) on delete set null,
  add column if not exists cargo_empresa text;

create index if not exists profiles_empresa_id_idx on public.profiles (empresa_id);

-- Recuperar el DNI de los particulares ya registrados desde los metadatos de
-- auth. En las cuentas de empresa ese valor es el CIF, no el documento de la
-- persona, así que se excluyen para no guardar un dato incorrecto.
update public.profiles p
set documento = u.raw_user_meta_data->>'documento'
from auth.users u
where u.id = p.id
  and p.documento is null
  and nullif(u.raw_user_meta_data->>'documento', '') is not null
  and coalesce(u.raw_user_meta_data->>'tipo_entidad', 'particular') <> 'empresa';

-- Ahora que existe el vínculo, los miembros de una empresa pueden ver su ficha
-- (antes solo el propietario, porque no había forma de saber quién era miembro).
drop policy if exists "Ver mi empresa" on public.empresas;
create policy "Ver mi empresa"
on public.empresas for select
using (
  auth.uid() = propietario_id
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.empresa_id = empresas.id
  )
  or is_admin()
);
