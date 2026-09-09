-- Fija en cada oferta los gastos de servicio que el profesional aceptó al
-- enviarla. Así una modificación posterior de la tarifa de Diime no cambia el
-- neto de ofertas ya presentadas o aceptadas.

alter table public.ofertas
  add column if not exists comision_proveedor_porcentaje decimal(5, 2),
  add column if not exists comision_proveedor_minima decimal(10, 2),
  add column if not exists comision_proveedor_prevista decimal(10, 2),
  add column if not exists pago_neto_proveedor_previsto decimal(10, 2);

-- Prioridad: conservar un snapshot existente y acreditar las ofertas antiguas
-- con los importes originales del Checkout. Nunca se reescriben escrows, cargos,
-- reembolsos ni liquidaciones históricas para adaptarlos a una tarifa nueva.
-- Cuando 5 % y 10 % coinciden por el mínimo, la fecha anterior al cambio de
-- tarifa identifica el acuerdo antiguo (commit f922645, 2026-09-07 18:00:47Z).
-- Las ofertas sin ningún intento de pago anteriores a ese cambio conservan 5 %.
-- Si la evidencia es incompatible o posterior/desconocida, los cuatro campos
-- quedan NULL: contratar y pagar exige que el proveedor vuelva a aceptar gastos.
with evidencia as (
  select o.id, o.precio, o.created_at,
    count(e.id) as intentos,
    coalesce(bool_and(e.monto_base = o.precio and
      e.comision_proveedor_original = least(o.precio, greatest(round(o.precio * 0.05, 2), 2))), false) as coincide_5,
    coalesce(bool_and(e.monto_base = o.precio and
      e.comision_proveedor_original = least(o.precio, greatest(round(o.precio * 0.10, 2), 2))), false) as coincide_10
  from public.ofertas o
  left join public.trabajos t on t.oferta_id = o.id
  left join public.transacciones_escrow e on e.trabajo_id = t.id
  group by o.id
), tarifas as (
  select id, case
    when intentos > 0 and coincide_5 and not coincide_10 then 5.00
    when intentos > 0 and coincide_10 and not coincide_5 then 10.00
    when intentos > 0 and coincide_5 and coincide_10
      then case when created_at < timestamptz '2026-09-07 18:00:47+00' then 5.00 else 10.00 end
    when intentos = 0 and created_at < timestamptz '2026-09-07 18:00:47+00' then 5.00
    else null
  end as porcentaje
  from evidencia
)
update public.ofertas o set
  comision_proveedor_porcentaje = t.porcentaje,
  comision_proveedor_minima = 2.00,
  comision_proveedor_prevista = least(o.precio, greatest(round(o.precio * t.porcentaje / 100, 2), 2.00)),
  pago_neto_proveedor_previsto = o.precio - least(o.precio, greatest(round(o.precio * t.porcentaje / 100, 2), 2.00))
from tarifas t
where t.id = o.id and t.porcentaje is not null
  and o.comision_proveedor_porcentaje is null
  and o.comision_proveedor_minima is null
  and o.comision_proveedor_prevista is null
  and o.pago_neto_proveedor_previsto is null;

alter table public.ofertas
  drop constraint if exists ofertas_comision_proveedor_snapshot_check;

alter table public.ofertas
  add constraint ofertas_comision_proveedor_snapshot_check check (
    (comision_proveedor_porcentaje is null and comision_proveedor_minima is null
      and comision_proveedor_prevista is null and pago_neto_proveedor_previsto is null)
    or (comision_proveedor_porcentaje is not null and comision_proveedor_minima is not null
      and comision_proveedor_prevista is not null and pago_neto_proveedor_previsto is not null
    and precio > 0
    and comision_proveedor_porcentaje >= 0
    and comision_proveedor_porcentaje <= 100
    and comision_proveedor_minima >= 0
    and comision_proveedor_prevista >= 0
    and comision_proveedor_prevista <= precio
    and comision_proveedor_prevista = least(
      precio,
      greatest(
        round(precio * comision_proveedor_porcentaje / 100, 2),
        comision_proveedor_minima
      )
    )
    and pago_neto_proveedor_previsto >= 0
    and pago_neto_proveedor_previsto = precio - comision_proveedor_prevista
  ));

-- La RLS permite que el profesional inserte y edite su propia oferta. Por eso
-- estos importes no pueden confiar en valores enviados por el navegador: el
-- trigger fija la tarifa y deriva la liquidación dentro de la base de datos.
-- Cuando cambie la tarifa en el futuro, debe versionarse también esta función.
create or replace function public.fijar_comision_proveedor_oferta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.comision_proveedor_porcentaje := 10.00;
    new.comision_proveedor_minima := 2.00;
  elsif old.estado in ('rechazada', 'retirada') and new.estado not in ('rechazada', 'retirada') then
    -- Volver a pujar requiere una nueva aceptación expresa y adopta la tarifa
    -- vigente, aunque se reutilice técnicamente la fila cerrada anterior.
    if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from old.profesional_id then
      raise exception 'Solo el profesional puede volver a abrir su oferta'
        using errcode = '42501';
    end if;
    if exists (
      select 1
      from public.trabajos t
      where t.oferta_id = old.id
        and (
          coalesce(t.estado, '') <> 'cancelado'
          or exists (
            select 1
            from public.transacciones_escrow e
            where e.trabajo_id = t.id
              and (
                e.fecha_retencion is not null
                or e.estado in (
                  'retenido', 'fondos_retenidos', 'liquidando', 'liberado',
                  'completado', 'reembolsado', 'disputa'
                )
              )
          )
        )
    ) then
      raise exception 'No se puede cambiar la tarifa de una oferta vinculada a un trabajo'
        using errcode = '55000';
    end if;
    new.comision_proveedor_porcentaje := 10.00;
    new.comision_proveedor_minima := 2.00;
  elsif old.comision_proveedor_porcentaje is null then
    if auth.uid() = old.profesional_id
      and new.comision_proveedor_porcentaje = 10.00
      and new.comision_proveedor_minima = 2.00 then
      if exists (select 1 from public.trabajos t where t.oferta_id = old.id
        and (t.estado <> 'cancelado' or exists (
          select 1 from public.transacciones_escrow e where e.trabajo_id = t.id
            and (e.fecha_retencion is not null or e.estado in
              ('retenido','fondos_retenidos','liquidando','liberado','completado','reembolsado','disputa'))))) then
        raise exception 'La oferta tiene historial contractual; crea una oferta nueva para aceptar los gastos vigentes'
          using errcode = '55000';
      end if;
      new.comision_proveedor_porcentaje := 10.00;
      new.comision_proveedor_minima := 2.00;
    else
      new.comision_proveedor_porcentaje := null;
      new.comision_proveedor_minima := null;
      new.comision_proveedor_prevista := null;
      new.pago_neto_proveedor_previsto := null;
      return new;
    end if;
  else
    new.comision_proveedor_porcentaje := old.comision_proveedor_porcentaje;
    new.comision_proveedor_minima := old.comision_proveedor_minima;
  end if;

  new.comision_proveedor_prevista := least(
    new.precio,
    greatest(
      round(new.precio * new.comision_proveedor_porcentaje / 100, 2),
      new.comision_proveedor_minima
    )
  );
  new.pago_neto_proveedor_previsto := new.precio - new.comision_proveedor_prevista;
  return new;
end;
$$;

drop trigger if exists trg_fijar_comision_proveedor_oferta on public.ofertas;
create trigger trg_fijar_comision_proveedor_oferta
  before insert or update on public.ofertas
  for each row
  execute function public.fijar_comision_proveedor_oferta();

-- Los cuatro campos forman parte de los términos económicos congelados cuando
-- una oferta se vincula a un trabajo. Se amplía el trigger creado en la 042.
drop trigger if exists trg_bloquear_edicion_oferta_vinculada on public.ofertas;
create trigger trg_bloquear_edicion_oferta_vinculada
  before update of precio, tiempo_estimado, unidad_tiempo, descripcion,
    materiales_incluidos, condiciones_pago, notas, archivos,
    comision_proveedor_porcentaje, comision_proveedor_minima,
    comision_proveedor_prevista, pago_neto_proveedor_previsto
  on public.ofertas
  for each row
  execute function public.bloquear_cambios_oferta_vinculada();

revoke all on function public.fijar_comision_proveedor_oferta() from public;
