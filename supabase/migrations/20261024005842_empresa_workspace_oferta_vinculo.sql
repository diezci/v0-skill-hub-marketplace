-- Extend only the metadata of offer rows already authorized by empresa_workspace.
-- Preserve its complete existing scope predicates, function attributes and ACL.
begin;
do $migration$
declare
  definition text := pg_get_functiondef('diime_private.empresa_workspace()'::regprocedure);
  needle text := '''id'',o.id,''titulo'',s.titulo';
  replacement text := '''id'',o.id,''oferta_origen_id'',o.oferta_origen_id,''titulo'',s.titulo';
begin
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then
    raise exception 'Expected exactly one existing workspace offer projection; migration aborted';
  end if;
  execute replace(definition, needle, replacement);
end;
$migration$;
notify pgrst, 'reload schema';
commit;
