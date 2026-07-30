-- Permitir que quien abrió una disputa o incidencia la RETIRE mientras un admin
-- no la haya resuelto. Las tablas solo dejan actualizar a los admins (RLS), así
-- que no basta con una server action: se usan funciones SECURITY DEFINER que
-- validan que quien llama es el autor y que aún está abierta, y que restauran
-- el trabajo y el escrow a como estaban antes de la disputa. Así no hace falta
-- dar a las partes permiso general de UPDATE (que les dejaría tocar la
-- resolución o las notas del admin).
--
-- Aplicada ya en producción; queda versionada para reproducibilidad.

-- 1) Al abrir una disputa se congela el trabajo (en_disputa) y el escrow
--    (disputa). Para poder deshacerlo al retirar, se guarda el estado previo.
alter table disputas
  add column if not exists estado_trabajo_previo text,
  add column if not exists estado_escrow_previo text;

-- 2) Nuevo estado "retirada" para las incidencias (disputas.estado no tiene CHECK).
alter table incidencias drop constraint if exists incidencias_estado_check;
alter table incidencias add constraint incidencias_estado_check
  check (estado = any (array['abierta', 'en_revision', 'resuelta', 'cerrada', 'retirada']));

-- 3) Retirar una disputa: solo el autor (según 'tipo') y solo si sigue abierta.
create or replace function public.retirar_disputa(p_disputa_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.disputas%rowtype;
  v_uid uuid := auth.uid();
  v_autor uuid;
begin
  select * into d from public.disputas where id = p_disputa_id;
  if not found then return 'no_encontrada'; end if;
  if d.estado <> 'abierta' then return 'no_abierta'; end if;

  v_autor := case when d.tipo = 'cliente' then d.cliente_id else d.profesional_id end;
  if v_uid is null or v_uid <> v_autor then return 'no_autorizado'; end if;

  -- Restaurar el trabajo y el escrow (fallback razonable si no se guardó el previo).
  update public.trabajos
    set estado = coalesce(d.estado_trabajo_previo, 'en_progreso')
    where id = d.trabajo_id and estado = 'en_disputa';
  update public.transacciones_escrow
    set estado = coalesce(d.estado_escrow_previo, 'fondos_retenidos')
    where trabajo_id = d.trabajo_id and estado = 'disputa';

  update public.disputas set estado = 'retirada', updated_at = now() where id = p_disputa_id;
  return 'ok';
end;
$$;

-- 4) Retirar una incidencia: solo quien la reportó y solo si no la ha tocado un admin.
create or replace function public.retirar_incidencia(p_incidencia_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.incidencias%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into i from public.incidencias where id = p_incidencia_id;
  if not found then return 'no_encontrada'; end if;
  if v_uid is null or v_uid <> i.reportado_por then return 'no_autorizado'; end if;
  if i.estado not in ('abierta', 'en_revision') then return 'no_retirable'; end if;

  update public.incidencias set estado = 'retirada', updated_at = now() where id = p_incidencia_id;
  return 'ok';
end;
$$;

grant execute on function public.retirar_disputa(uuid) to authenticated;
grant execute on function public.retirar_incidencia(uuid) to authenticated;
