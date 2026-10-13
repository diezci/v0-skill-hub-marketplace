-- Operational, reversible guard. Apply only AFTER verified private copies have
-- been registered in archivos_privados, before retiring any Blob originals.
-- No external files or URLs are downloaded by this script.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table if not exists diime_private.adjuntos_legacy_en_retirada (
  legacy_url text primary key check(length(legacy_url)>0),
  registrado_en timestamptz not null default clock_timestamp()
);
alter table diime_private.adjuntos_legacy_en_retirada enable row level security;
revoke all on diime_private.adjuntos_legacy_en_retirada from public,anon,authenticated,service_role;
insert into diime_private.adjuntos_legacy_en_retirada(legacy_url)
select legacy_url from public.archivos_privados
where legacy_url ~ '^https://[a-zA-Z0-9]+[.]public[.]blob[.]vercel-storage[.]com/'
  and sha256 ~ '^[0-9a-f]{64}$' and bytes between 1 and 10485760
  and propietario_id is null and compartido and storage_path like 'legacy/%'
on conflict do nothing;

do $$ begin
  if not exists(select 1 from diime_private.adjuntos_legacy_en_retirada) then
    raise exception 'No hay copias verificadas que proteger' using errcode='55000';
  end if;
end $$;

create or replace function diime_private.bloquear_reintroduccion_adjuntos_legacy()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  anterior jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  campo record; enlace record; valor_nuevo text; valor_anterior text;
  nuevos integer; anteriores integer;
begin
  -- A transaction with an older REPEATABLE READ/SERIALIZABLE snapshot might not
  -- see the newly installed inventory. Force its writer to retry at the normal
  -- READ COMMITTED level for this brief operational window.
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'Retirada de adjuntos en curso: reintenta en READ COMMITTED' using errcode='55000';
  end if;
  for campo in select * from jsonb_each_text(to_jsonb(new)) loop
    valor_nuevo:=coalesce(campo.value,'');
    valor_anterior:=coalesce(anterior->>campo.key,'');
    if valor_nuevo=valor_anterior then continue; end if;
    for enlace in select legacy_url from diime_private.adjuntos_legacy_en_retirada loop
      nuevos:=(length(valor_nuevo)-length(replace(valor_nuevo,enlace.legacy_url,'')))/length(enlace.legacy_url);
      anteriores:=(length(valor_anterior)-length(replace(valor_anterior,enlace.legacy_url,'')))/length(enlace.legacy_url);
      if nuevos>anteriores then
        raise exception 'Este enlace antiguo está siendo retirado; utiliza la copia actual' using errcode='42501';
      end if;
    end loop;
  end loop;
  return new;
end; $$;
revoke all on function diime_private.bloquear_reintroduccion_adjuntos_legacy() from public,anon,authenticated,service_role;

do $$ declare tabla record; begin
  for tabla in
    select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in('r','p') and not c.relispartition
      and c.relname<>'archivos_privados' order by c.oid
  loop
    execute format('drop trigger if exists diime_guard_adjuntos_legacy on %I.%I',tabla.nspname,tabla.relname);
    execute format('create trigger diime_guard_adjuntos_legacy before insert or update on %I.%I for each row execute function diime_private.bloquear_reintroduccion_adjuntos_legacy()',tabla.nspname,tabla.relname);
  end loop;
end $$;
commit;

select (select count(*) from diime_private.adjuntos_legacy_en_retirada) guarded_urls,
  (select count(*) from pg_trigger where tgname='diime_guard_adjuntos_legacy' and not tgisinternal) guarded_tables;
