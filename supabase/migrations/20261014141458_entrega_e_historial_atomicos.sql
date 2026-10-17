-- Entrega e historial se guardan en una sola transacción bajo el JWT del actor.
-- Las políticas RLS y los triggers existentes siguen validando pago, operador,
-- pertenencia empresarial y ausencia de cancelación o disputa concurrente.
create or replace function public.entregar_trabajo_con_historial(p_trabajo_id uuid, p_mensaje text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trabajo public.trabajos%rowtype;
begin
  if actor is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select * into trabajo from public.trabajos where id = p_trabajo_id for update;
  if not found or trabajo.profesional_id is distinct from actor then
    raise exception 'No tienes permiso para actualizar este trabajo' using errcode = '42501';
  end if;
  if trabajo.estado <> 'en_progreso' then
    raise exception 'Solo se puede entregar un trabajo que esté en progreso.' using errcode = '55000';
  end if;
  if trabajo.cancelacion_estado = 'pendiente' then
    raise exception 'Hay una cancelación pendiente. Debe resolverse antes de entregar el trabajo.' using errcode = '55000';
  end if;

  update public.trabajos
     set estado = 'entregado', progreso = 100, fecha_entrega = now(), updated_at = now()
   where id = p_trabajo_id
   returning * into trabajo;
  if not found then
    raise exception 'El estado del trabajo ha cambiado. Actualiza la página antes de continuar.' using errcode = '55000';
  end if;

  insert into public.actualizaciones_trabajo(trabajo_id, usuario_id, tipo, mensaje, progreso)
  values(p_trabajo_id, actor, 'entrega',
    coalesce(nullif(btrim(p_mensaje), ''), 'El trabajo ha sido entregado y está pendiente de confirmación del cliente.'), 100);

  return to_jsonb(trabajo);
end;
$$;

revoke all on function public.entregar_trabajo_con_historial(uuid, text) from public, anon;
grant execute on function public.entregar_trabajo_con_historial(uuid, text) to authenticated;
