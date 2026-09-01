-- La factura y las disputas leen la oferta aceptada y la solicitud original.
-- Esos términos no pueden seguir siendo editables por API después de que la
-- oferta quede vinculada a un trabajo: de lo contrario cualquiera de las partes
-- podría alterar las pruebas contractuales antes de abrir una disputa.
--
-- Se permite cambiar campos operativos como `estado` y `updated_at`; solo se
-- congelan los campos que describen el servicio. Un trabajo cancelado antes de
-- contratar no bloquea la oferta/solicitud para siempre.

create or replace function public.bloquear_cambios_oferta_vinculada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  oferta_uuid uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if exists (
    select 1
    from public.trabajos t
    where t.oferta_id = oferta_uuid
      and (
        coalesce(t.estado, '') <> 'cancelado'
        or exists (
          select 1
          from public.transacciones_escrow e
          where e.trabajo_id = t.id
            and (
              e.fecha_retencion is not null
              or e.estado in ('retenido', 'fondos_retenidos', 'liberado', 'completado', 'reembolsado', 'disputa')
            )
        )
      )
  ) then
    raise exception 'No se pueden modificar o eliminar los términos de una oferta vinculada a un trabajo'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_bloquear_edicion_oferta_vinculada on public.ofertas;
create trigger trg_bloquear_edicion_oferta_vinculada
  before update of precio, tiempo_estimado, unidad_tiempo, descripcion,
    materiales_incluidos, condiciones_pago, notas, archivos
  on public.ofertas
  for each row
  execute function public.bloquear_cambios_oferta_vinculada();

drop trigger if exists trg_bloquear_borrado_oferta_vinculada on public.ofertas;
create trigger trg_bloquear_borrado_oferta_vinculada
  before delete on public.ofertas
  for each row
  execute function public.bloquear_cambios_oferta_vinculada();

create or replace function public.bloquear_cambios_solicitud_vinculada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  solicitud_uuid uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if exists (
    select 1
    from public.trabajos t
    where t.solicitud_id = solicitud_uuid
      and (
        coalesce(t.estado, '') <> 'cancelado'
        or exists (
          select 1
          from public.transacciones_escrow e
          where e.trabajo_id = t.id
            and (
              e.fecha_retencion is not null
              or e.estado in ('retenido', 'fondos_retenidos', 'liberado', 'completado', 'reembolsado', 'disputa')
            )
        )
      )
  ) then
    raise exception 'No se pueden modificar o eliminar los términos de una solicitud vinculada a un trabajo'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_bloquear_edicion_solicitud_vinculada on public.solicitudes;
create trigger trg_bloquear_edicion_solicitud_vinculada
  before update of categoria_id, titulo, descripcion, ubicacion, presupuesto_min,
    presupuesto_max, urgencia, archivos, fecha_necesaria
  on public.solicitudes
  for each row
  execute function public.bloquear_cambios_solicitud_vinculada();

drop trigger if exists trg_bloquear_borrado_solicitud_vinculada on public.solicitudes;
create trigger trg_bloquear_borrado_solicitud_vinculada
  before delete on public.solicitudes
  for each row
  execute function public.bloquear_cambios_solicitud_vinculada();

revoke all on function public.bloquear_cambios_oferta_vinculada() from public;
revoke all on function public.bloquear_cambios_solicitud_vinculada() from public;
