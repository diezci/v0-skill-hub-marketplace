-- El comentario y su porcentaje pertenecen a la misma actualización.
-- Se mantienen las políticas y los triggers con los privilegios del actor.
create or replace function public.actualizar_progreso_con_historial(
  p_trabajo_id uuid, p_progreso numeric, p_mensaje text default null
)
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
  if p_progreso is null or not (p_progreso between 0 and 100) or p_progreso <> trunc(p_progreso) then
    raise exception 'El progreso debe ser un número entero entre 0 y 100.' using errcode = '22023';
  end if;

  select * into trabajo from public.trabajos where id = p_trabajo_id for update;
  if not found or trabajo.profesional_id is distinct from actor then
    raise exception 'No tienes permiso para actualizar este trabajo' using errcode = '42501';
  end if;
  if trabajo.estado <> 'en_progreso' or trabajo.cancelacion_estado = 'pendiente' then
    raise exception 'Solo puedes actualizar el progreso de un trabajo pagado y en curso, sin cancelación pendiente.' using errcode = '55000';
  end if;

  update public.trabajos set progreso = p_progreso, updated_at = now()
    where id = p_trabajo_id returning * into trabajo;
  if not found then
    raise exception 'El estado del trabajo ha cambiado. Actualiza la página antes de continuar.' using errcode = '55000';
  end if;
  if nullif(btrim(p_mensaje), '') is not null then
    insert into public.actualizaciones_trabajo(trabajo_id, usuario_id, tipo, mensaje, progreso)
    values(p_trabajo_id, actor, 'progreso', p_mensaje, p_progreso);
  end if;
  return to_jsonb(trabajo);
end;
$$;

revoke all on function public.actualizar_progreso_con_historial(uuid, numeric, text) from public, anon;
grant execute on function public.actualizar_progreso_con_historial(uuid, numeric, text) to authenticated;
