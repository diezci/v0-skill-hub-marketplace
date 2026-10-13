begin;

-- El bucket nunca expone URLs públicas ni admite acceso directo de clientes.
insert into storage.buckets(id,name,public,file_size_limit)
values ('adjuntos-privados','adjuntos-privados',false,10485760)
on conflict(id) do update set public=false,file_size_limit=10485760;
create policy adjuntos_privados_solo_servidor on storage.objects as restrictive
for all to anon,authenticated using (bucket_id <> 'adjuntos-privados')
with check (bucket_id <> 'adjuntos-privados');

create table public.archivos_privados (
 id uuid primary key,
 propietario_id uuid references public.profiles(id) on delete set null,
 storage_path text not null unique,
 url text not null unique,
 legacy_url text unique,
 sha256 text check(sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
 nombre text not null check(length(nombre) between 1 and 180),
 tipo text not null,
 bytes bigint not null check(bytes between 1 and 10485760),
 compartido boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.archivos_privados enable row level security;
revoke all on public.archivos_privados from public,anon,authenticated;
grant all on public.archivos_privados to service_role;

create function diime_private.archivo_solicitud_acceso(p_id uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.solicitudes s where s.id=p_id and (
  -- La demanda abierta sigue accesible para usuarios registrados; los archivos
  -- ya no son accesibles por visitantes que solamente conocen la URL.
  s.estado='abierta' or
  (s.empresa_id is null and s.cliente_id=p_actor) or
  (s.empresa_id is not null and diime_private.empresa_tiene_permiso(s.empresa_id,p_actor,'encargos') and
   (s.cliente_id=p_actor or diime_private.empresa_es_administrador(s.empresa_id,p_actor))) or
  exists(select 1 from public.trabajos t where t.solicitud_id=s.id and diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos')) or
  exists(select 1 from public.ofertas o where o.solicitud_id=s.id and
   ((o.empresa_id is null and o.profesional_id=p_actor) or (o.empresa_id is not null and diime_private.empresa_tiene_permiso(o.empresa_id,p_actor,'presupuestos') and
    (o.profesional_id=p_actor or diime_private.empresa_es_administrador(o.empresa_id,p_actor)))))
 ));
$$;

create function diime_private.archivo_oferta_acceso(p_id uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ofertas o join public.solicitudes s on s.id=o.solicitud_id where o.id=p_id and (
  (o.empresa_id is null and o.profesional_id=p_actor) or
  (o.empresa_id is not null and diime_private.empresa_tiene_permiso(o.empresa_id,p_actor,'presupuestos') and
    (o.profesional_id=p_actor or diime_private.empresa_es_administrador(o.empresa_id,p_actor))) or
  (s.empresa_id is null and s.cliente_id=p_actor) or
  (s.empresa_id is not null and diime_private.empresa_tiene_permiso(s.empresa_id,p_actor,'encargos') and
    (s.cliente_id=p_actor or diime_private.empresa_es_administrador(s.empresa_id,p_actor))) or
  exists(select 1 from public.trabajos t where t.oferta_id=o.id and diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos'))
 ));
$$;

create function diime_private.archivo_url_acceso(p_url text,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.solicitudes s where s.archivos @> jsonb_build_array(p_url) and diime_private.archivo_solicitud_acceso(s.id,p_actor))
 or exists(select 1 from public.ofertas o where o.archivos @> jsonb_build_array(p_url) and diime_private.archivo_oferta_acceso(o.id,p_actor))
 or exists(select 1 from public.trabajos t where (t.archivos @> jsonb_build_array(p_url) or p_url=any(t.cancelacion_adjuntos_solicitante) or p_url=any(t.cancelacion_adjuntos_respuesta)) and diime_private.empresa_puede_operar_trabajo(t.id,p_actor,'encargos'))
 or exists(select 1 from public.actualizaciones_trabajo u where p_url=any(u.archivos) and diime_private.empresa_puede_operar_trabajo(u.trabajo_id,p_actor,'encargos'))
 or exists(select 1 from public.mensajes m join public.conversaciones c on c.id=m.conversacion_id where m.archivo_url=p_url and p_actor in(c.participante_1,c.participante_2) and not exists(select 1 from public.usuarios_bloqueados b where (b.bloqueador_id=c.participante_1 and b.bloqueado_id=c.participante_2) or (b.bloqueador_id=c.participante_2 and b.bloqueado_id=c.participante_1)))
 or exists(select 1 from public.empresa_mensajes m join public.empresa_conversaciones c on c.id=m.conversacion_id where m.archivo_url=p_url and (diime_private.empresa_chat_parte(c.empresa_1_id,c.participante_1,c.responsable_1_id,p_actor,false) or diime_private.empresa_chat_parte(c.empresa_2_id,c.participante_2,c.responsable_2_id,p_actor,false)) and not exists(select 1 from public.usuarios_bloqueados b where (b.bloqueador_id=c.participante_1 and b.bloqueado_id=c.participante_2) or (b.bloqueador_id=c.participante_2 and b.bloqueado_id=c.participante_1)))
;
$$;

create function diime_private.archivo_puede_leer(p_id uuid,actor uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.archivos_privados; vinculado boolean;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and cuenta_eliminada is null) then return false; end if;
 select * into a from public.archivos_privados where id=p_id;
 if not found then return false; end if;
 if exists(select 1 from public.profiles where id=actor and es_admin=true) then return true; end if;
 if diime_private.archivo_url_acceso(a.url,actor) then return true; end if;
 select exists(select 1 from public.solicitudes where archivos @> jsonb_build_array(a.url))
 or exists(select 1 from public.ofertas where archivos @> jsonb_build_array(a.url))
 or exists(select 1 from public.trabajos where archivos @> jsonb_build_array(a.url) or a.url=any(cancelacion_adjuntos_solicitante) or a.url=any(cancelacion_adjuntos_respuesta))
 or exists(select 1 from public.actualizaciones_trabajo where a.url=any(archivos))
 or exists(select 1 from public.mensajes where archivo_url=a.url)
 or exists(select 1 from public.empresa_mensajes where archivo_url=a.url) into vinculado;
 -- Un borrador solo lo ve quien lo subió. Una vez compartido manda el permiso
 -- vigente del padre: haberlo subido no conserva acceso tras una revocación.
 return not a.compartido and not vinculado and a.propietario_id=actor;
end; $$;

create function diime_private.archivo_puede_leer(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select diime_private.archivo_puede_leer(p_id,auth.uid());
$$;

create function diime_private.archivo_privado_metadata(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('storage_path',a.storage_path,'nombre',a.nombre,'tipo',a.tipo,'bytes',a.bytes)
 from public.archivos_privados a where a.id=p_id and diime_private.archivo_puede_leer(a.id);
$$;
create function public.archivo_privado_metadata(p_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select diime_private.archivo_privado_metadata(p_id);
$$;
revoke all on function diime_private.archivo_solicitud_acceso(uuid,uuid),diime_private.archivo_oferta_acceso(uuid,uuid),diime_private.archivo_url_acceso(text,uuid),diime_private.archivo_puede_leer(uuid),diime_private.archivo_puede_leer(uuid,uuid),diime_private.archivo_privado_metadata(uuid),public.archivo_privado_metadata(uuid) from public,anon,authenticated;
grant execute on function diime_private.archivo_privado_metadata(uuid),public.archivo_privado_metadata(uuid) to authenticated;

-- Impide ganar acceso a un archivo ajeno copiando su URL a un objeto propio.
create function diime_private.validar_vinculos_archivos_privados()
returns trigger language plpgsql security definer set search_path='' as $$
declare campos text[]:=array['archivos','cancelacion_adjuntos_solicitante','cancelacion_adjuntos_respuesta','archivo_url']; campo text; valor jsonb; urls text[]:='{}'; enlace text; archivo uuid; anterior jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
 foreach campo in array campos loop
  valor:=to_jsonb(new)->campo;
  if valor is not distinct from anterior->campo then continue; end if;
  if jsonb_typeof(valor)='string' then urls:=array_append(urls,valor#>>'{}');
  elsif jsonb_typeof(valor)='array' then select urls||coalesce(array_agg(v#>>'{}'),'{}'::text[]) into urls from jsonb_array_elements(valor) v where jsonb_typeof(v)='string'; end if;
 end loop;
 select coalesce(array_agg(distinct u),'{}'::text[]) into urls from unnest(urls) u;
 foreach enlace in array urls loop
  select id into archivo from public.archivos_privados where url=enlace;
  if auth.uid() is not null and not coalesce(case when archivo is not null
    then diime_private.archivo_puede_leer(archivo)
    else diime_private.archivo_url_acceso(enlace,auth.uid()) end,false) then
   raise exception 'No tienes acceso a este archivo' using errcode='42501'; end if;
  if archivo is not null then update public.archivos_privados set compartido=true where id=archivo; end if;
 end loop;
 return new;
end; $$;
revoke all on function diime_private.validar_vinculos_archivos_privados() from public,anon,authenticated;
create trigger validar_archivos_solicitud before insert or update of archivos on public.solicitudes for each row execute function diime_private.validar_vinculos_archivos_privados();
create trigger validar_archivos_oferta before insert or update of archivos on public.ofertas for each row execute function diime_private.validar_vinculos_archivos_privados();
create trigger validar_archivos_trabajo before insert or update of archivos,cancelacion_adjuntos_solicitante,cancelacion_adjuntos_respuesta on public.trabajos for each row execute function diime_private.validar_vinculos_archivos_privados();
create trigger validar_archivos_actualizacion before insert or update of archivos on public.actualizaciones_trabajo for each row execute function diime_private.validar_vinculos_archivos_privados();
create trigger validar_archivos_mensaje before insert or update of archivo_url on public.mensajes for each row execute function diime_private.validar_vinculos_archivos_privados();
create trigger validar_archivos_mensaje_empresa before insert or update of archivo_url on public.empresa_mensajes for each row execute function diime_private.validar_vinculos_archivos_privados();
-- Las RPC financieras reciben al actor verificado desde el servidor (service_role).
-- Validar allí evita que copiar una URL ajena mediante cancelación/disputa conceda acceso.
create function diime_private.validar_adjuntos_actor(p_urls text[],p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare enlace text; archivo uuid;
begin
 foreach enlace in array coalesce(p_urls,'{}') loop
  select id into archivo from public.archivos_privados where url=enlace;
  if not coalesce(case when archivo is not null then diime_private.archivo_puede_leer(archivo,p_actor)
    else diime_private.archivo_url_acceso(enlace,p_actor) end,false) then
   raise exception 'No tienes acceso a este archivo' using errcode='42501';
  end if;
 end loop;
end; $$;
revoke all on function diime_private.validar_adjuntos_actor(text[],uuid) from public,anon,authenticated;
grant execute on function diime_private.validar_adjuntos_actor(text[],uuid) to service_role;
do $patch$
declare firma text; definicion text; punto text:='perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);';
begin
 foreach firma in array array['public.diime_gestionar_solicitud_cancelacion(uuid,uuid,text,text,text[])','public.diime_abrir_disputa(uuid,uuid,text,boolean,text[])'] loop
  definicion:=pg_get_functiondef(firma::regprocedure);
  if position(punto in definicion)=0 then raise exception 'No se encontró la validación del actor en %',firma; end if;
  execute replace(definicion,punto,punto||E'\n  perform diime_private.validar_adjuntos_actor(p_adjuntos,p_actor);');
 end loop;
end; $patch$;
-- Conversión reanudable de adjuntos históricos; copiar y comprobar los bytes
-- en Storage ANTES de llamar. No borra originales ni imágenes de perfil.
create function public.migrar_referencia_archivo_privado(p_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.archivos_privados; tabla text; campo text;
begin
 select * into a from public.archivos_privados where id=p_id for update;
 if a.id is null or nullif(a.legacy_url,'') is null or a.legacy_url=a.url then
  raise exception 'Falta la referencia de origen del archivo'; end if;
 foreach tabla in array array['solicitudes','ofertas','trabajos'] loop
  execute format('update public.%I set archivos=(select jsonb_agg(case when v=to_jsonb($1::text) then to_jsonb($2::text) else v end) from jsonb_array_elements(archivos) v) where archivos @> jsonb_build_array($1::text)',tabla)
  using a.legacy_url,a.url;
 end loop;
 foreach campo in array array['cancelacion_adjuntos_solicitante','cancelacion_adjuntos_respuesta'] loop
  execute format('update public.trabajos set %I=array_replace(%I,$1,$2) where $1=any(%I)',campo,campo,campo)
  using a.legacy_url,a.url;
 end loop;
 update public.actualizaciones_trabajo set archivos=array_replace(archivos,a.legacy_url,a.url) where a.legacy_url=any(archivos);
 update public.mensajes set archivo_url=a.url where archivo_url=a.legacy_url;
 update public.empresa_mensajes set archivo_url=a.url where archivo_url=a.legacy_url;
 update public.archivos_privados set compartido=true where id=a.id;
end; $$;
revoke all on function public.migrar_referencia_archivo_privado(uuid) from public,anon,authenticated;
grant execute on function public.migrar_referencia_archivo_privado(uuid) to service_role;
commit;
