-- Pruebas aportadas por ambas partes durante una solicitud de cancelación.
--
-- Se guardan por papel dentro del proceso (quien solicita / quien se opone),
-- no por cliente/proveedor, porque cualquiera de los dos puede iniciar la
-- cancelación. Así el admin puede atribuir cada argumento y cada archivo.

alter table public.trabajos
  add column if not exists cancelacion_adjuntos_solicitante text[] not null default '{}',
  add column if not exists cancelacion_respuesta_razon text,
  add column if not exists cancelacion_adjuntos_respuesta text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trabajos_cancelacion_adjuntos_limite_check'
  ) then
    alter table public.trabajos
      add constraint trabajos_cancelacion_adjuntos_limite_check
      check (
        cardinality(cancelacion_adjuntos_solicitante) <= 5
        and cardinality(cancelacion_adjuntos_respuesta) <= 5
      );
  end if;
end $$;
