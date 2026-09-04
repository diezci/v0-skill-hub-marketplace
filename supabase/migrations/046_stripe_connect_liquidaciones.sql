-- Stripe Connect: cobros en la plataforma y transferencias posteriores al
-- profesional. La migración es aditiva para no alterar pagos históricos.

alter table public.profesionales
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarding_completado boolean not null default false,
  add column if not exists stripe_transferencias_habilitadas boolean not null default false,
  add column if not exists stripe_payouts_habilitados boolean not null default false,
  add column if not exists stripe_requisitos_pendientes jsonb not null default '[]'::jsonb,
  add column if not exists stripe_estado_actualizado_at timestamptz;

create unique index if not exists profesionales_stripe_account_id_unique
  on public.profesionales (stripe_account_id)
  where stripe_account_id is not null;

alter table public.transacciones_escrow
  add column if not exists stripe_transfer_group text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_refund_id text,
  add column if not exists stripe_refund_status text,
  add column if not exists monto_bruto_proveedor decimal(10, 2),
  add column if not exists comision_cliente_retenida decimal(10, 2),
  add column if not exists liquidacion_estado text not null default 'pendiente',
  add column if not exists liquidacion_operacion_id text,
  add column if not exists liquidacion_error text;

create unique index if not exists transacciones_escrow_stripe_transfer_id_unique
  on public.transacciones_escrow (stripe_transfer_id)
  where stripe_transfer_id is not null;

create unique index if not exists transacciones_escrow_liquidacion_operacion_unique
  on public.transacciones_escrow (liquidacion_operacion_id)
  where liquidacion_operacion_id is not null;

alter table public.transacciones_escrow
  drop constraint if exists transacciones_escrow_liquidacion_estado_check;

alter table public.transacciones_escrow
  add constraint transacciones_escrow_liquidacion_estado_check
  check (liquidacion_estado in ('pendiente', 'procesando', 'completada', 'error'));

-- "liquidando" permite reclamar una operación antes de hablar con Stripe. Si
-- el proceso se interrumpe, la misma clave idempotente puede reanudarla sin
-- duplicar el movimiento externo.
alter table public.transacciones_escrow
  drop constraint if exists transacciones_escrow_estado_check;

alter table public.transacciones_escrow
  add constraint transacciones_escrow_estado_check
  check (estado = any (array[
    'pendiente', 'retenido', 'fondos_retenidos', 'liquidando', 'liberado',
    'completado', 'reembolsado', 'disputa', 'cancelado'
  ]));

update public.transacciones_escrow
set
  monto_bruto_proveedor = case
    when estado in ('completado', 'liberado')
      then greatest(coalesce(monto_base, 0) - coalesce(monto_reembolsado, 0), 0)
    else monto_bruto_proveedor
  end,
  comision_cliente_retenida = case
    when coalesce(monto_reembolsado, 0) > 0
      and coalesce(monto_reembolsado, 0) < coalesce(monto, 0)
      then coalesce(comision_cliente, 0)
    else comision_cliente_retenida
  end,
  liquidacion_estado = case
    when estado in ('completado', 'liberado', 'reembolsado') then 'completada'
    else liquidacion_estado
  end;

-- Los participantes solo pueden leer su resumen económico. Todos los cambios
-- de dinero pasan por acciones de servidor validadas o por el webhook. La
-- política antigua FOR ALL permitía falsificar importes/estados desde el SDK.
drop policy if exists "Sistema puede gestionar transacciones" on public.transacciones_escrow;

create table if not exists public.stripe_eventos_webhook (
  id text primary key,
  tipo text not null,
  estado text not null default 'procesando'
    check (estado in ('procesando', 'completado', 'error')),
  intentos integer not null default 1,
  ultimo_error text,
  created_at timestamptz not null default now(),
  procesado_at timestamptz
);

alter table public.stripe_eventos_webhook enable row level security;
-- Sin políticas para usuarios: solo el service role del webhook puede leer o
-- escribir este registro técnico.
