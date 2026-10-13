-- Cleanup after verified retirement, or deliberate abandonment before deletion.
-- Removing this guard never restores a deleted Blob; retain verification logs.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ declare tabla record; begin
  for tabla in
    select n.nspname,c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
    where t.tgname='diime_guard_adjuntos_legacy' and not t.tgisinternal
      and t.tgfoid=to_regprocedure('diime_private.bloquear_reintroduccion_adjuntos_legacy()')
    order by c.oid
  loop
    execute format('drop trigger diime_guard_adjuntos_legacy on %I.%I',tabla.nspname,tabla.relname);
  end loop;
end $$;
drop function if exists diime_private.bloquear_reintroduccion_adjuntos_legacy();
drop table if exists diime_private.adjuntos_legacy_en_retirada;
commit;
