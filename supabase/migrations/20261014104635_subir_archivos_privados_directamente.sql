begin;

-- A signed upload only reserves an object. It is neither readable nor attachable
-- until the server checks the bytes and publishes archivos_privados atomically.
create table public.archivos_subidas_pendientes (
 id uuid primary key,
 propietario_id uuid not null references public.profiles(id),
 storage_path text not null unique,
 url text not null unique,
 nombre text not null check(length(nombre) between 1 and 180),
 tipo text not null,
 bytes_declarados bigint not null check(bytes_declarados between 1 and 10485760),
 purpose text not null default 'privado' check(purpose in ('privado','imagen_publica')),
 public_url text,
 public_sha256 text check(public_sha256 ~ '^[0-9a-f]{64}$'),
 staging_eliminado_at timestamptz,
 estado text not null default 'pendiente' check(estado in ('pendiente','confirmado','confirmado_publico','rechazado')),
 created_at timestamptz not null default now(),
 -- Supabase signed upload tokens last 2 hours. Never remove the object earlier:
 -- a still-valid upload token could otherwise recreate it after cleanup.
 expira_at timestamptz not null default now()+interval '2 hours 5 minutes'
);
create index archivos_subidas_caducadas on public.archivos_subidas_pendientes(expira_at) where estado<>'confirmado';
alter table public.archivos_subidas_pendientes enable row level security;
revoke all on public.archivos_subidas_pendientes from public,anon,authenticated;
grant all on public.archivos_subidas_pendientes to service_role;

create function diime_private.confirmar_archivo_subida(p_id uuid,p_usuario uuid,p_bytes bigint,p_tipo text,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.archivos_subidas_pendientes; a public.archivos_privados;
begin
 select * into r from public.archivos_subidas_pendientes where id=p_id for update;
 if not found or p_usuario is null or r.propietario_id is distinct from p_usuario or
    not exists(select 1 from public.profiles where id=p_usuario and cuenta_eliminada is null) then
   raise exception 'Subida no disponible.' using errcode='42501'; end if;
 if r.purpose<>'privado' then raise exception 'Uso de archivo no válido.' using errcode='22023'; end if;
 if r.estado='confirmado' then
   select * into a from public.archivos_privados where id=r.id;
 else
   if r.estado<>'pendiente' or r.expira_at<=now() then raise exception 'La subida ha caducado o no es válida.' using errcode='55000'; end if;
   if p_bytes is distinct from r.bytes_declarados or p_tipo is distinct from r.tipo or
      p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
     raise exception 'El archivo recibido no coincide con la subida autorizada.' using errcode='22023'; end if;
   insert into public.archivos_privados(id,propietario_id,storage_path,url,nombre,tipo,bytes,sha256)
     values(r.id,r.propietario_id,r.storage_path,r.url,r.nombre,p_tipo,p_bytes,p_sha256) returning * into a;
   update public.archivos_subidas_pendientes set estado='confirmado' where id=r.id;
 end if;
 return jsonb_build_object('id',a.id,'url',a.url,'filename',a.nombre,'type',a.tipo,'size',a.bytes);
end; $$;
revoke all on function diime_private.confirmar_archivo_subida(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function diime_private.confirmar_archivo_subida(uuid,uuid,bigint,text,text) to service_role;
create function public.confirmar_archivo_subida(p_id uuid,p_usuario uuid,p_bytes bigint,p_tipo text,p_sha256 text)
returns jsonb language sql security invoker set search_path='' as $$
 select diime_private.confirmar_archivo_subida(p_id,p_usuario,p_bytes,p_tipo,p_sha256);
$$;
revoke all on function public.confirmar_archivo_subida(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.confirmar_archivo_subida(uuid,uuid,bigint,text,text) to service_role;

-- Public images use the same private staging area. Their confirmation never
-- creates private attachment metadata, so a public URL cannot grant chat access.
create function diime_private.confirmar_imagen_publica(p_id uuid,p_usuario uuid,p_bytes bigint,p_tipo text,p_sha256 text,p_url text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.archivos_subidas_pendientes;
begin
 select * into r from public.archivos_subidas_pendientes where id=p_id for update;
 if not found or p_usuario is null or r.propietario_id is distinct from p_usuario or
    not exists(select 1 from public.profiles where id=p_usuario and cuenta_eliminada is null) then
   raise exception 'Subida no disponible.' using errcode='42501'; end if;
 if r.purpose<>'imagen_publica' then raise exception 'Uso de archivo no válido.' using errcode='22023'; end if;
 if r.estado<>'confirmado_publico' then
   if r.estado<>'pendiente' or r.expira_at<=now() then raise exception 'La subida ha caducado o no es válida.' using errcode='55000'; end if;
   if p_bytes is distinct from r.bytes_declarados or p_tipo is distinct from r.tipo or p_tipo not like 'image/%' or
      p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_url is null or
      p_url !~ '^https://[a-zA-Z0-9-]+[.]public[.]blob[.]vercel-storage[.]com/' then
     raise exception 'El archivo recibido no coincide con la subida autorizada.' using errcode='22023'; end if;
   update public.archivos_subidas_pendientes set estado='confirmado_publico',public_url=p_url,public_sha256=p_sha256
     where id=r.id returning * into r;
 end if;
 return jsonb_build_object('id',r.id,'url',r.public_url,'filename',r.nombre,'type',r.tipo,'size',r.bytes_declarados);
end; $$;
revoke all on function diime_private.confirmar_imagen_publica(uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function diime_private.confirmar_imagen_publica(uuid,uuid,bigint,text,text,text) to service_role;
create function public.confirmar_imagen_publica(p_id uuid,p_usuario uuid,p_bytes bigint,p_tipo text,p_sha256 text,p_url text)
returns jsonb language sql security invoker set search_path='' as $$
 select diime_private.confirmar_imagen_publica(p_id,p_usuario,p_bytes,p_tipo,p_sha256,p_url);
$$;
revoke all on function public.confirmar_imagen_publica(uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.confirmar_imagen_publica(uuid,uuid,bigint,text,text,text) to service_role;

commit;
