-- Las facturas de un trabajo deben emitirse a nombre de la EMPRESA cuando la
-- parte actúa por una, indicando además la persona que actúa en su nombre.
--
-- Problema: `empresas` tiene RLS (solo propietario/miembros/admin), así que el
-- profesional no puede leer la empresa del cliente ni al revés, y la factura se
-- quedaría sin los datos de la otra parte.
--
-- Se resuelve con una función SECURITY DEFINER acotada a UN trabajo: solo
-- responde si quien llama es una de las partes de ese trabajo (o admin), y
-- devuelve exclusivamente datos de facturación. Nunca expone token_invitacion,
-- ni permite enumerar empresas sueltas.
--
-- Nota fiscal: de la empresa se devuelve el CIF (lo que va en factura) y de la
-- persona su nombre y cargo. El DNI de la persona solo se devuelve cuando NO
-- hay empresa, porque en ese caso es su identificador fiscal como particular o
-- autónomo; si factura la empresa, el DNI del representante no pinta nada.
--
-- Aplicada ya en producción; queda versionada para reproducibilidad.

create or replace function public.facturacion_trabajo(p_trabajo_id uuid)
returns table (
  parte text,
  empresa_nombre text,
  empresa_cif text,
  empresa_ubicacion text,
  empresa_email text,
  persona_nombre text,
  persona_apellido text,
  persona_documento text,
  persona_cargo text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  t public.trabajos%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into t from public.trabajos where id = p_trabajo_id;
  if not found then return; end if;

  -- Solo las partes del trabajo (o un admin) ven estos datos.
  if not (v_uid = t.cliente_id or v_uid = t.profesional_id or is_admin()) then
    return;
  end if;

  return query
  select
    d.parte,
    e.nombre,
    e.cif,
    e.ubicacion,
    e.email,
    p.nombre,
    p.apellido,
    case when p.empresa_id is null then p.documento else null end,
    p.cargo_empresa
  from (
    values ('cliente', t.cliente_id), ('profesional', t.profesional_id)
  ) as d(parte, usuario_id)
  join public.profiles p on p.id = d.usuario_id
  left join public.empresas e on e.id = p.empresa_id;
end;
$$;

revoke all on function public.facturacion_trabajo(uuid) from public;
grant execute on function public.facturacion_trabajo(uuid) to authenticated;
