-- Run AFTER installing the selective guard and repointing the reviewed public
-- images, BEFORE ANY Blob deletion. No pagination: concurrent unrelated row
-- deletes/inserts or primary-key changes cannot make this scan skip a row.
-- With the guard installed and zero references, no writer can add one later.
begin;
set local statement_timeout='60s';
do $$ declare tabla record; restantes bigint; protegidas bigint; begin
  if to_regclass('diime_private.adjuntos_legacy_en_retirada') is null then
    raise exception 'Falta guard de adjuntos legacy' using errcode='55000';
  end if;
  select count(*) into protegidas from diime_private.adjuntos_legacy_en_retirada;
  if protegidas=0 then raise exception 'Inventario protegido vacío' using errcode='55000'; end if;
  if exists(select 1 from public.archivos_privados a where a.legacy_url is not null
    and not exists(select 1 from diime_private.adjuntos_legacy_en_retirada g where g.legacy_url=a.legacy_url)) then
    raise exception 'Hay originales sin protección de guard' using errcode='55000';
  end if;
  for tabla in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in('r','p') and not c.relispartition and c.relname<>'archivos_privados'
  loop
    if not exists(select 1 from pg_trigger where tgrelid=tabla.oid and tgname='diime_guard_adjuntos_legacy'
      and tgfoid='diime_private.bloquear_reintroduccion_adjuntos_legacy()'::regprocedure and tgenabled='O' and not tgisinternal) then
      raise exception 'Tabla sin guard activo: %',tabla.relname using errcode='55000';
    end if;
    execute format('select count(*) from %I.%I t where exists(select 1 from diime_private.adjuntos_legacy_en_retirada g where position(g.legacy_url in to_jsonb(t)::text)>0)',tabla.nspname,tabla.relname) into restantes;
    if restantes>0 then raise exception 'Persisten % filas con enlaces antiguos en %',restantes,tabla.relname using errcode='55000'; end if;
  end loop;
end $$;
commit;
select 'zero_legacy_references_guard_active' as verification,
  (select count(*) from diime_private.adjuntos_legacy_en_retirada) guarded_urls;
