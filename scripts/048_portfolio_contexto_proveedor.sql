-- Conserva por separado el texto original de la demanda y el aporte que el
-- profesional quiere añadir al mostrar un trabajo verificado en su portfolio.
alter table public.portfolio
  add column if not exists contexto_proveedor text;
