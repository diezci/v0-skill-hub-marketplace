-- La cifra pública cuenta contratos completados, nunca proyectos externos del
-- portfolio ni un número que el proveedor pueda editar directamente.
lock table public.trabajos in share row exclusive mode;

create function diime_private.proteger_contador_trabajos()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') and (
    (tg_op='INSERT' and coalesce(new.total_trabajos,0)<>0) or
    (tg_op='UPDATE' and new.total_trabajos is distinct from old.total_trabajos)
  ) then
    raise exception 'Los proyectos completados se calculan a partir de los contratos' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function diime_private.proteger_contador_trabajos() from public,anon,authenticated;
create trigger proteger_contador_trabajos before insert or update on public.profesionales
for each row execute function diime_private.proteger_contador_trabajos();

create function diime_private.actualizar_contador_trabajos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare anterior uuid; siguiente uuid; profesional uuid; variacion integer;
begin
  if tg_op <> 'INSERT' and old.estado='completado' then anterior := old.profesional_id; end if;
  if tg_op <> 'DELETE' and new.estado='completado' then siguiente := new.profesional_id; end if;
  if anterior is not distinct from siguiente then return null; end if;
  -- Un incremento relativo bajo bloqueo de fila evita perder finalizaciones
  -- concurrentes. El orden es estable incluso si se reasigna un contrato.
  for profesional in select distinct id from unnest(array[anterior,siguiente]) as ids(id)
    where id is not null order by id
  loop
    variacion := (case when profesional=siguiente then 1 else 0 end)
                - (case when profesional=anterior then 1 else 0 end);
    update public.profesionales set total_trabajos=coalesce(total_trabajos,0)+variacion
      where id=profesional;
  end loop;
  return null;
end; $$;
revoke all on function diime_private.actualizar_contador_trabajos() from public,anon,authenticated;
create trigger actualizar_contador_trabajos after insert or update or delete on public.trabajos
for each row execute function diime_private.actualizar_contador_trabajos();

-- Conciliar el histórico en la misma transacción que instala la actualización.
update public.profesionales p set total_trabajos=(
  select count(*)::integer from public.trabajos t where t.profesional_id=p.id and t.estado='completado'
);
