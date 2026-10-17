begin;

-- Match String.prototype.trim whitespace, including line breaks, NBSP and BOM.
-- btrim(text) alone removes spaces, so direct API writes could store blank lines.
create or replace function diime_private.texto_tiene_contenido(p_texto text)
returns boolean language sql immutable set search_path='' as $$
  select length(btrim(coalesce(p_texto,''),U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0;
$$;
revoke all on function diime_private.texto_tiene_contenido(text) from public,anon;
grant execute on function diime_private.texto_tiene_contenido(text) to authenticated,service_role;

-- New offers and explicit description edits must contain real text. Preserve
-- historical blank descriptions when a workflow updates other columns.
create or replace function diime_private.validar_descripcion_oferta()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (tg_op='INSERT' or new.descripcion is distinct from old.descripcion)
    and not diime_private.texto_tiene_contenido(new.descripcion) then
    raise exception 'La descripción de la oferta no puede estar vacía.' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function diime_private.validar_descripcion_oferta() from public,anon,authenticated;
create trigger validar_descripcion_oferta before insert or update of descripcion on public.ofertas
  for each row execute function diime_private.validar_descripcion_oferta();

create or replace function diime_private.validar_resena_trabajo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.trabajos;
begin
  if auth.uid() is null or new.autor_id is distinct from auth.uid() then
    raise exception 'La reseña debe pertenecer al cliente autenticado' using errcode='42501'; end if;
  select * into t from public.trabajos where id=new.trabajo_id for update;
  if t.id is null or not diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','cliente') then
    raise exception 'No tienes permiso para dejar una reseña en este trabajo' using errcode='42501'; end if;
  if t.estado is distinct from 'completado' then raise exception 'Solo puedes dejar reseña en trabajos completados' using errcode='55000'; end if;
  if new.profesional_id is distinct from t.profesional_id then raise exception 'El profesional no corresponde al trabajo' using errcode='42501'; end if;
  if new.rating not between 1 and 5 or not diime_private.texto_tiene_contenido(new.comentario) then
    raise exception 'Indica una puntuación entre 1 y 5 y un comentario' using errcode='22023'; end if;
  if tg_op='UPDATE' and (new.trabajo_id,new.profesional_id,new.autor_id,new.integridad_version) is distinct from (old.trabajo_id,old.profesional_id,old.autor_id,old.integridad_version) then
    raise exception 'La identidad de la reseña es inmutable' using errcode='42501'; end if;
  if tg_op='INSERT' and (t.review_cliente_id is not null or exists(select 1 from public."reseñas" r where r.trabajo_id=t.id)) then
    raise exception 'Este trabajo ya tiene una reseña' using errcode='23505'; end if;
  if tg_op='INSERT' then new.integridad_version:=2; end if;
  new.tipo_proyecto:=coalesce(nullif(btrim(new.tipo_proyecto),''),t.titulo);
  return new;
end; $$;
revoke all on function diime_private.validar_resena_trabajo() from public,anon,authenticated;

commit;
