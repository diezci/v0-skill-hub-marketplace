-- Hace atómica la reclamación de eventos Stripe: los reenvíos simultáneos no
-- procesan dos veces el mismo evento y un proceso caído puede recuperarse.
alter table public.stripe_eventos_webhook
  add column if not exists ultimo_intento_at timestamptz not null default now();

update public.stripe_eventos_webhook
set ultimo_intento_at = coalesce(procesado_at, created_at, now());
