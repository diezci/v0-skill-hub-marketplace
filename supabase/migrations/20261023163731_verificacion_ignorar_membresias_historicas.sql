-- Changes to historical inactive memberships do not change current representation.
create or replace function diime_private.verificacion_membresia_cambiada()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and new.usuario_id is not distinct from old.usuario_id
    and new.empresa_id is not distinct from old.empresa_id and new.estado is not distinct from old.estado then return new; end if;
  if tg_op='UPDATE' and old.estado<>'activo' and new.estado<>'activo' then return new; end if;
  if tg_op='DELETE' and old.estado<>'activo' then return old; end if;
  if tg_op='INSERT' and new.estado<>'activo' then return new; end if;
  if tg_op<>'INSERT' then
    perform diime_private.invalidar_verificacion_por_membresia(old.usuario_id,case when old.estado='activo' then old.empresa_id else null end);
  end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and new.usuario_id is distinct from old.usuario_id) then
    perform diime_private.invalidar_verificacion_por_membresia(new.usuario_id);
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function diime_private.verificacion_membresia_cambiada() from public,anon,authenticated;
