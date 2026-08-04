-- Aviso automático cuando se pasa la fecha de entrega de un trabajo.
--
-- Va con pg_cron (dentro de la propia base de datos) y no con un cron externo
-- porque no necesita infraestructura nueva: nada de endpoint que proteger ni de
-- servicio aparte que pueda caerse. Y sobre todo, esto TIENE que ocurrir aunque
-- nadie abra la web: si dependiera del código del navegador, el aviso no
-- saltaría justo cuando hace falta, que es cuando el trabajo está parado.

create extension if not exists pg_cron;

create or replace function public.avisar_entregas_fuera_de_plazo()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  insertadas integer := 0;
begin
  with vencidos as (
    select t.id, t.titulo, t.cliente_id, t.profesional_id, t.fecha_estimada_fin
    from public.trabajos t
    where t.fecha_estimada_fin is not null
      and t.fecha_estimada_fin < current_date
      -- Solo trabajos vivos: si ya está entregado, completado, cancelado o en
      -- disputa, el retraso ya no es lo relevante.
      and t.estado = 'en_progreso'
      -- Una sola vez por trabajo. El identificador va en `metadata`, no en el
      -- texto: comparar mensajes sería frágil en cuanto cambie la redacción.
      and not exists (
        select 1 from public.notificaciones n
        where n.tipo = 'entrega_retrasada'
          and n.metadata ->> 'trabajo_id' = t.id::text
      )
  ),
  nuevas as (
    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, link, leida, metadata)
    select
      destinatario.usuario_id,
      'entrega_retrasada',
      'Entrega fuera de plazo',
      case
        when destinatario.es_cliente then
          'La fecha de entrega prevista de "' || v.titulo || '" (' ||
          to_char(v.fecha_estimada_fin, 'DD/MM/YYYY') ||
          ') ya ha pasado y el trabajo sigue en curso. Habla con el profesional; si no hay avances, puedes abrir una incidencia.'
        else
          'La fecha de entrega prevista de "' || v.titulo || '" (' ||
          to_char(v.fecha_estimada_fin, 'DD/MM/YYYY') ||
          ') ya ha pasado. Actualiza el progreso o entrega el trabajo para que el cliente sepa cómo va.'
      end,
      case when destinatario.es_cliente then '/mis-solicitudes' else '/mis-trabajos' end,
      false,
      jsonb_build_object('trabajo_id', v.id)
    from vencidos v
    cross join lateral (
      values (v.cliente_id, true), (v.profesional_id, false)
    ) as destinatario(usuario_id, es_cliente)
    where destinatario.usuario_id is not null
    returning 1
  )
  select count(*) into insertadas from nuevas;

  return insertadas;
end;
$$;

-- Solo la ejecuta el planificador: ningún usuario debe poder dispararla.
revoke all on function public.avisar_entregas_fuera_de_plazo() from public;
revoke all on function public.avisar_entregas_fuera_de_plazo() from anon;
revoke all on function public.avisar_entregas_fuera_de_plazo() from authenticated;

-- Una vez al día a las 08:00 UTC. Con `unschedule` previo para que reaplicar
-- esta migración no acumule tareas duplicadas.
select cron.unschedule('avisar-entregas-fuera-de-plazo')
where exists (select 1 from cron.job where jobname = 'avisar-entregas-fuera-de-plazo');

select cron.schedule(
  'avisar-entregas-fuera-de-plazo',
  '0 8 * * *',
  $$select public.avisar_entregas_fuera_de_plazo();$$
);
