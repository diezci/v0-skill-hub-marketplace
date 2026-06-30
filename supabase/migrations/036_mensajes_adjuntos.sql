-- Adjuntos en los mensajes del chat (imagen/archivo). El render ya soporta
-- tipo/archivo_url/archivo_nombre; faltaban las columnas. Aplicado el 2026-06-29.

alter table public.mensajes
  add column if not exists tipo text not null default 'texto',
  add column if not exists archivo_url text,
  add column if not exists archivo_nombre text;
