-- La app usa los estados 'fondos_retenidos', 'completado' y 'disputa' en las
-- transacciones escrow, pero la constraint solo permitía 'retenido'/'liberado'.
-- Alineamos la constraint con la máquina de estados del código (manteniendo
-- los valores antiguos por compatibilidad).
-- Aplicado el 2026-06-15.
alter table public.transacciones_escrow drop constraint if exists transacciones_escrow_estado_check;
alter table public.transacciones_escrow add constraint transacciones_escrow_estado_check
  check (estado = any (array['pendiente','retenido','fondos_retenidos','liberado','completado','reembolsado','disputa','cancelado']));
