-- A completed confirmation is a true no-op for the contract and request.
-- Keep the repair path when Stripe settled but contract closure was interrupted.
begin;
do $migration$
declare
  definition text;
  old_work text := 'update public.trabajos set estado=''completado'',fecha_fin=coalesce(fecha_fin,now()),updated_at=now() where id=t.id;';
  new_work text := 'update public.trabajos set estado=''completado'',fecha_fin=coalesce(fecha_fin,now()),updated_at=now() where id=t.id and (estado is distinct from ''completado'' or fecha_fin is null);';
  old_request text := 'update public.solicitudes set estado=''completada'' where id=t.solicitud_id;';
  new_request text := 'update public.solicitudes set estado=''completada'' where id=t.solicitud_id and estado is distinct from ''completada'';';
begin
  select pg_get_functiondef('public.diime_finalizar_liquidacion(uuid,text,text,text,text,text)'::regprocedure) into definition;
  -- Guard the known single confirmation branch before altering the function.
  if (length(definition)-length(replace(definition,old_work,'')))/length(old_work) <> 1
    or (length(definition)-length(replace(definition,old_request,'')))/length(old_request) <> 1 then
    raise invalid_parameter_value;
  end if;
  execute replace(replace(definition,old_work,new_work),old_request,new_request);
end;
$migration$;
commit;
