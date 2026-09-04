-- Conserva la comisión pactada originalmente con el profesional. La columna
-- `comision_proveedor` pasa a representar la comisión finalmente aplicada al
-- reparto, por lo que no puede usarse como base de un segundo reintento.
alter table public.transacciones_escrow
  add column if not exists comision_proveedor_original decimal(10, 2);

-- Los repartos que ya se hubieran reclamado con la versión anterior pudieron
-- haber sobrescrito `comision_proveedor`. Para ellos se reconstruye la regla
-- vigente al cobrar (5 %, mínimo 2 EUR y nunca más que el precio base). Para
-- pagos aún no reclamados, el valor guardado al crear el pago es la fuente de
-- verdad y permite conservar futuros acuerdos de comisión distintos.
update public.transacciones_escrow
set comision_proveedor_original = case
  when liquidacion_operacion_id is not null and coalesce(monto_base, 0) > 0
    then least(
      monto_base,
      greatest(round(monto_base * 0.05, 2), 2.00)
    )
  else case
    when monto_base is null then greatest(coalesce(comision_proveedor, 0), 0)
    else least(
      greatest(coalesce(comision_proveedor, 0), 0),
      greatest(monto_base, 0)
    )
  end
end
where comision_proveedor_original is null;

create or replace function public.proteger_reparto_escrow()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.comision_proveedor_original := greatest(
      coalesce(new.comision_proveedor_original, new.comision_proveedor, 0),
      0
    );
    return new;
  end if;

  if new.comision_proveedor_original is distinct from old.comision_proveedor_original then
    raise exception 'La comisión original del profesional es inmutable'
      using errcode = '55000';
  end if;

  -- Algunas rutas antiguas completaban estos dos campos al confirmar Stripe,
  -- no al reclamar la operación. Se fijan aquí, antes del primer movimiento,
  -- para que desde ese instante también sean inmutables.
  if old.liquidacion_operacion_id is null and new.liquidacion_operacion_id is not null then
    new.comision_cliente_retenida := coalesce(
      new.comision_cliente_retenida,
      greatest(coalesce(old.comision_cliente, 0), 0)
    );
    new.retencion_plataforma := coalesce(
      new.retencion_plataforma,
      new.comision_cliente_retenida + greatest(coalesce(new.comision_proveedor, 0), 0)
    );
  end if;

  -- Tras reclamar una operación, la clave idempotente y el reparto económico
  -- quedan congelados. Los reintentos solo pueden cambiar estado, IDs externos,
  -- fechas y errores, nunca mandar a Stripe cifras distintas.
  if old.liquidacion_operacion_id is not null and (
    new.liquidacion_operacion_id is distinct from old.liquidacion_operacion_id
    or new.trabajo_id is distinct from old.trabajo_id
    or new.cliente_id is distinct from old.cliente_id
    or new.profesional_id is distinct from old.profesional_id
    or new.monto is distinct from old.monto
    or new.monto_base is distinct from old.monto_base
    or new.comision_cliente is distinct from old.comision_cliente
    or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
    or new.stripe_transfer_group is distinct from old.stripe_transfer_group
    or new.monto_reembolsado is distinct from old.monto_reembolsado
    or new.monto_bruto_proveedor is distinct from old.monto_bruto_proveedor
    or new.comision_proveedor is distinct from old.comision_proveedor
    or new.pago_neto_proveedor is distinct from old.pago_neto_proveedor
    or new.comision_cliente_retenida is distinct from old.comision_cliente_retenida
    or new.retencion_plataforma is distinct from old.retencion_plataforma
    or (
      old.stripe_charge_id is not null
      and new.stripe_charge_id is distinct from old.stripe_charge_id
    )
    or (
      old.stripe_refund_id is not null
      and new.stripe_refund_id is distinct from old.stripe_refund_id
    )
    or (
      old.stripe_transfer_id is not null
      and new.stripe_transfer_id is distinct from old.stripe_transfer_id
    )
  ) then
    raise exception 'No se puede cambiar un reparto después de iniciar su liquidación'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_reparto_escrow on public.transacciones_escrow;
create trigger trg_proteger_reparto_escrow
  before insert or update on public.transacciones_escrow
  for each row
  execute function public.proteger_reparto_escrow();

alter table public.transacciones_escrow
  alter column comision_proveedor_original set not null;

alter table public.transacciones_escrow
  drop constraint if exists transacciones_escrow_comision_original_check;

alter table public.transacciones_escrow
  add constraint transacciones_escrow_comision_original_check
  check (
    comision_proveedor_original >= 0
    and (
      monto_base is null
      or comision_proveedor_original <= greatest(monto_base, 0)
    )
  ) not valid;

alter table public.transacciones_escrow
  drop constraint if exists transacciones_escrow_estado_no_nulo_check;

alter table public.transacciones_escrow
  add constraint transacciones_escrow_estado_no_nulo_check
  check (estado is not null) not valid;

alter table public.transacciones_escrow
  drop constraint if exists transacciones_escrow_liquidacion_importes_check;

-- Al completar una operación, el total cobrado solo puede repartirse entre el
-- reembolso, el neto del profesional y las comisiones de Diime. Esta igualdad
-- admite tanto disputas (la comisión del cliente se retiene) como cancelaciones
-- de mutuo acuerdo (se devuelve todo y la retención es cero).
alter table public.transacciones_escrow
  add constraint transacciones_escrow_liquidacion_importes_check
  check (
    liquidacion_operacion_id is null
    or liquidacion_estado <> 'completada'
    or (
      coalesce(monto, 0) >= 0
      and coalesce(monto_reembolsado, 0) >= 0
      and coalesce(monto_bruto_proveedor, 0) >= 0
      and coalesce(comision_proveedor, 0) >= 0
      and coalesce(pago_neto_proveedor, 0) >= 0
      and coalesce(comision_cliente_retenida, 0) >= 0
      and coalesce(retencion_plataforma, 0) >= 0
      and coalesce(monto_bruto_proveedor, 0)
        = coalesce(pago_neto_proveedor, 0) + coalesce(comision_proveedor, 0)
      and coalesce(retencion_plataforma, 0)
        = coalesce(comision_cliente_retenida, 0) + coalesce(comision_proveedor, 0)
      and coalesce(monto, 0)
        = coalesce(monto_reembolsado, 0)
          + coalesce(pago_neto_proveedor, 0)
          + coalesce(retencion_plataforma, 0)
      and (
        -- Cancelación de mutuo acuerdo: se devuelve también la comisión del
        -- cliente y Diime no retiene nada.
        (
          coalesce(monto_reembolsado, 0) = coalesce(monto, 0)
          and coalesce(monto_bruto_proveedor, 0) = 0
          and coalesce(comision_proveedor, 0) = 0
          and coalesce(comision_cliente_retenida, 0) = 0
          and coalesce(retencion_plataforma, 0) = 0
        )
        or
        -- Confirmación o disputa: el reembolso solo sale del precio base, la
        -- comisión del cliente se conserva y la del profesional es el
        -- prorrateo exacto de la comisión originalmente pactada.
        (
          coalesce(monto_base, 0) > 0
          and coalesce(monto, 0)
            = coalesce(monto_base, 0) + coalesce(comision_cliente, 0)
          and coalesce(monto_reembolsado, 0) <= coalesce(monto_base, 0)
          and coalesce(monto_bruto_proveedor, 0)
            = coalesce(monto_base, 0) - coalesce(monto_reembolsado, 0)
          and coalesce(comision_cliente_retenida, 0) = coalesce(comision_cliente, 0)
          and coalesce(comision_proveedor, 0) = least(
            round(
              comision_proveedor_original * coalesce(monto_bruto_proveedor, 0)
                / nullif(coalesce(monto_base, 0), 0),
              2
            ),
            coalesce(monto_bruto_proveedor, 0)
          )
        )
      )
    )
  ) not valid;

-- No se eliminan escrows financieros automáticamente: ante históricos
-- duplicados no es posible saber por esquema cuál contiene el cobro real. El
-- trigger bloquea cualquier duplicado nuevo (también bajo concurrencia) y deja
-- que un operador cierre los antiguos. Si no hay duplicados, además se instala
-- el índice único parcial como garantía estructural.
create or replace function public.impedir_escrow_abierto_duplicado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado in ('pendiente', 'retenido', 'fondos_retenidos', 'liquidando', 'disputa') then
    perform pg_advisory_xact_lock(hashtextextended(new.trabajo_id::text, 0));

    if exists (
      select 1
      from public.transacciones_escrow existente
      where existente.trabajo_id = new.trabajo_id
        and existente.id is distinct from new.id
        and existente.estado in ('pendiente', 'retenido', 'fondos_retenidos', 'liquidando', 'disputa')
    ) then
      raise exception 'Ya existe un escrow abierto para este trabajo'
        using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_impedir_escrow_abierto_duplicado on public.transacciones_escrow;
create trigger trg_impedir_escrow_abierto_duplicado
  before insert or update of trabajo_id, estado on public.transacciones_escrow
  for each row
  execute function public.impedir_escrow_abierto_duplicado();

do $$
begin
  if exists (
    select 1
    from public.transacciones_escrow
    where estado in ('pendiente', 'retenido', 'fondos_retenidos', 'liquidando', 'disputa')
    group by trabajo_id
    having count(*) > 1
  ) then
    raise warning 'Hay escrows abiertos duplicados: se omite el índice único hasta conciliarlos; el trigger ya impide crear más';
  else
    create unique index if not exists transacciones_escrow_un_abierto_por_trabajo
      on public.transacciones_escrow (trabajo_id)
      where estado in ('pendiente', 'retenido', 'fondos_retenidos', 'liquidando', 'disputa');
  end if;
end;
$$;

revoke all on function public.proteger_reparto_escrow() from public;
revoke all on function public.impedir_escrow_abierto_duplicado() from public;
