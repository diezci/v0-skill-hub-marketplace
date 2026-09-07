-- Fija en cada oferta los gastos de servicio que el profesional aceptó al
-- enviarla. Así una modificación posterior de la tarifa de Diime no cambia el
-- neto de ofertas ya presentadas o aceptadas.

alter table public.ofertas
  add column if not exists comision_proveedor_porcentaje decimal(5, 2),
  add column if not exists comision_proveedor_minima decimal(10, 2),
  add column if not exists comision_proveedor_prevista decimal(10, 2),
  add column if not exists pago_neto_proveedor_previsto decimal(10, 2);

-- Todas las ofertas que ya existían se enviaron bajo la tarifa anterior:
-- 5 %, con un mínimo de 2 EUR y sin poder descontar más que el precio.
update public.ofertas
set
  comision_proveedor_porcentaje = 5.00,
  comision_proveedor_minima = 2.00,
  comision_proveedor_prevista = least(
    precio,
    greatest(round(precio * 0.05, 2), 2.00)
  ),
  pago_neto_proveedor_previsto = precio - least(
    precio,
    greatest(round(precio * 0.05, 2), 2.00)
  )
where
  comision_proveedor_porcentaje is null
  or comision_proveedor_minima is null
  or comision_proveedor_prevista is null
  or pago_neto_proveedor_previsto is null;

-- Versiones anteriores redondeaban la comisión y el neto por separado. Eso
-- podía descuadrar un céntimo y hacer fallar el cierre en base de datos después
-- de que Stripe ya hubiera transferido el dinero. Se corrigen solo operaciones
-- que todavía no han iniciado una liquidación externa; el total cobrado y la
-- comisión original aceptada por el profesional permanecen inmutables.
update public.transacciones_escrow
set
  comision_cliente = round(monto - monto_base, 2),
  comision_proveedor = least(
    greatest(comision_proveedor_original, 0),
    monto_base
  ),
  pago_neto_proveedor = monto_base - least(
    greatest(comision_proveedor_original, 0),
    monto_base
  ),
  monto_bruto_proveedor = monto_base
where
  estado in ('pendiente', 'retenido', 'fondos_retenidos', 'disputa')
  and liquidacion_operacion_id is null
  and monto is not null
  and monto_base is not null
  and comision_proveedor_original is not null
  and monto >= monto_base
  and monto_base >= 0;

alter table public.ofertas
  alter column comision_proveedor_porcentaje set not null,
  alter column comision_proveedor_minima set not null,
  alter column comision_proveedor_prevista set not null,
  alter column pago_neto_proveedor_previsto set not null;

alter table public.ofertas
  drop constraint if exists ofertas_comision_proveedor_snapshot_check;

alter table public.ofertas
  add constraint ofertas_comision_proveedor_snapshot_check check (
    precio > 0
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
  );

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
