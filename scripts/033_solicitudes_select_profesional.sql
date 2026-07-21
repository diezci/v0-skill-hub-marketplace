-- La política de SELECT de solicitudes solo permitía ver las abiertas o las
-- propias, así que el profesional perdía acceso a la demanda en cuanto el
-- pago consumaba la contratación (estado en_progreso): en la factura le
-- desaparecía la "Necesidad publicada por el cliente" (datos.ts recibía null
-- en silencio) y en Mis Pujas la publicación embebida de la demanda. El
-- cliente sí la veía por ser suya.
--
-- Quien pujó (y quien fue contratado) debe seguir viendo la publicación: era
-- pública mientras estuvo abierta y forma parte de los términos del encargo
-- que recoge la factura.
--
-- No se puede expresar con una subconsulta directa a ofertas: la política de
-- SELECT de ofertas ya consulta solicitudes, y Postgres abortaría por
-- recursión mutua entre políticas. Se usa una función SECURITY DEFINER
-- (mismo patrón que is_admin()) que solo revela si el usuario actual tiene
-- una puja en esa solicitud. El caso del profesional contratado se cubre
-- además vía trabajos, cuyas políticas no tienen subconsultas (sin riesgo de
-- recursión), por si existiera un trabajo sin oferta asociada.
--
-- Aplicada ya en producción; queda versionada para reproducibilidad.

create or replace function public.ha_pujado_en_solicitud(solicitud_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from ofertas
    where solicitud_id = solicitud_uuid
      and profesional_id = auth.uid()
  );
$$;

drop policy if exists "Quien pujó o fue contratado puede ver la solicitud" on solicitudes;

create policy "Quien pujó o fue contratado puede ver la solicitud"
on solicitudes
for select
using (
  ha_pujado_en_solicitud(id)
  or exists (
    select 1 from trabajos t
    where t.solicitud_id = solicitudes.id
      and t.profesional_id = auth.uid()
  )
);
