-- Cancelación de mutuo acuerdo (solo trabajos en 'pendiente_pago').
-- Una parte solicita la cancelación; la otra la acepta (trabajo -> cancelado) o
-- la rechaza (estado 'rechazada'), tras lo cual el solicitante puede abrir disputa.
-- Aplicado el 2026-06-28.

alter table public.trabajos
  add column if not exists cancelacion_solicitada_por uuid references public.profiles(id),
  add column if not exists cancelacion_razon text,
  add column if not exists cancelacion_estado text;

-- Estados válidos de la solicitud de cancelación: null (ninguna), pendiente, rechazada.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trabajos_cancelacion_estado_check'
  ) then
    alter table public.trabajos
      add constraint trabajos_cancelacion_estado_check
      check (cancelacion_estado is null or cancelacion_estado in ('pendiente', 'rechazada'));
  end if;
end $$;
