begin;
-- Corporate threads are separate from personal correspondence, even between
-- the same people. Access is resolved from current membership on every call.
create table public.empresa_conversaciones (
 id uuid primary key default gen_random_uuid(),
 participante_1 uuid not null references public.profiles(id),
 participante_2 uuid not null references public.profiles(id),
 empresa_1_id uuid references public.empresas(id),
 empresa_2_id uuid references public.empresas(id),
 responsable_1_id uuid not null references public.profiles(id),
 responsable_2_id uuid not null references public.profiles(id),
 solicitud_id uuid references public.solicitudes(id),
 trabajo_id uuid references public.trabajos(id),
 created_at timestamptz not null default now(),
 check (empresa_1_id is not null or empresa_2_id is not null),
 check (participante_1 <> participante_2),
 check (empresa_1_id is null or empresa_2_id is null or empresa_1_id <> empresa_2_id)
);
create unique index empresa_conversaciones_contexto on public.empresa_conversaciones
 (participante_1,participante_2,empresa_1_id,empresa_2_id,solicitud_id,trabajo_id) nulls not distinct;
create index empresa_conversaciones_empresa1 on public.empresa_conversaciones(empresa_1_id);
create index empresa_conversaciones_empresa2 on public.empresa_conversaciones(empresa_2_id);
create table public.empresa_mensajes (
 id uuid primary key default gen_random_uuid(), conversacion_id uuid not null references public.empresa_conversaciones(id),
 remitente_id uuid not null references public.profiles(id), remitente_nombre text not null,
 empresa_id uuid references public.empresas(id), contenido text not null check(length(contenido)<=10000),
 tipo text not null default 'texto' check(tipo in ('texto','imagen','archivo')),
 archivo_url text, archivo_nombre text, created_at timestamptz not null default clock_timestamp()
);
create index empresa_mensajes_conversacion_fecha on public.empresa_mensajes(conversacion_id,created_at);
create table public.empresa_chat_lecturas (
 conversacion_id uuid not null references public.empresa_conversaciones(id), usuario_id uuid not null references public.profiles(id),
 leido_hasta timestamptz not null, primary key(conversacion_id,usuario_id)
);
alter table public.empresa_conversaciones enable row level security;
alter table public.empresa_mensajes enable row level security;
alter table public.empresa_chat_lecturas enable row level security;
revoke all on public.empresa_conversaciones,public.empresa_mensajes,public.empresa_chat_lecturas from public,anon,authenticated;
grant all on public.empresa_conversaciones,public.empresa_mensajes,public.empresa_chat_lecturas to service_role;

create function diime_private.empresa_chat_parte(p_empresa uuid,p_persona uuid,p_responsable uuid,p_actor uuid,p_escritura boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor is not null and exists(select 1 from public.profiles where id=p_actor and cuenta_eliminada is null) and
 case when p_empresa is null then p_actor=p_persona else
 diime_private.es_miembro_empresa(p_empresa,p_actor) and
 (diime_private.empresa_es_administrador(p_empresa,p_actor) or (p_actor=p_responsable and diime_private.empresa_tiene_permiso(p_empresa,p_actor,'mensajes')))
 and (not p_escritura or diime_private.empresa_tiene_permiso(p_empresa,p_actor,'mensajes')) end;
$$;
revoke all on function diime_private.empresa_chat_parte(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
create function diime_private.empresa_chat_acceso(p_id uuid,p_escritura boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.empresa_conversaciones c where c.id=p_id and
 (diime_private.empresa_chat_parte(c.empresa_1_id,c.participante_1,c.responsable_1_id,auth.uid(),p_escritura)
 or diime_private.empresa_chat_parte(c.empresa_2_id,c.participante_2,c.responsable_2_id,auth.uid(),p_escritura)));
$$;
revoke all on function diime_private.empresa_chat_acceso(uuid,boolean) from public,anon,authenticated;

create function diime_private.empresa_chat_crear(p_empresa_id uuid default null,p_trabajo_id uuid default null,p_solicitud_id uuid default null,p_otro_usuario_id uuid default null,p_oferta_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p1 uuid; p2 uuid; e1 uuid; e2 uuid; r1 uuid; r2 uuid; s uuid; resultado uuid; t public.trabajos%rowtype; o public.ofertas%rowtype; demanda public.solicitudes%rowtype;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and cuenta_eliminada is null) then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
 if p_trabajo_id is not null then
  select * into t from public.trabajos where id=p_trabajo_id;
  if not found then raise exception 'Trabajo no disponible'; end if;
  if p_oferta_id is not null and p_oferta_id is distinct from t.oferta_id then raise exception 'La oferta no corresponde a este trabajo'; end if;
  p1:=t.cliente_id; p2:=t.profesional_id; e1:=t.empresa_cliente_id; e2:=t.empresa_proveedora_id; s:=t.solicitud_id;
  r1:=coalesce(t.operador_cliente_id,p1); r2:=coalesce(t.operador_proveedor_id,p2);
 elsif p_oferta_id is not null then
  select * into o from public.ofertas where id=p_oferta_id;
  if not found then raise exception 'Oferta no disponible'; end if;
  select * into demanda from public.solicitudes where id=o.solicitud_id;
  if not found or (p_solicitud_id is not null and p_solicitud_id is distinct from demanda.id) then raise exception 'La oferta no corresponde a esta demanda'; end if;
  p1:=demanda.cliente_id; p2:=o.profesional_id; e1:=demanda.empresa_id; e2:=o.empresa_id;
  s:=demanda.id; r1:=p1; r2:=p2;
  if p_otro_usuario_id is not null and p_otro_usuario_id not in (p1,p2) then raise exception 'El destinatario no corresponde a esta oferta'; end if;
 elsif p_solicitud_id is not null then
  select cliente_id,empresa_id into p1,e1 from public.solicitudes where id=p_solicitud_id and estado='abierta';
  if not found then raise exception 'Demanda no disponible'; end if;
  p2:=case when p1=actor then p_otro_usuario_id else actor end;
  if p2 is null or not exists(select 1 from public.profesionales where id=p2) then raise exception 'Proveedor no disponible'; end if;
  s:=p_solicitud_id; r1:=p1; r2:=p2;
 else
  select propietario_id into p2 from public.empresas where id=p_empresa_id and verificada=true;
  if not found then raise exception 'Empresa no disponible'; end if;
  p1:=actor; e2:=p_empresa_id; r1:=p1; r2:=p2;
 end if;
 if p1=p2 or (e1 is null and e2 is null) or (e1=e2) then raise exception 'Contexto de empresa no válido'; end if;
 if exists(select 1 from public.profiles where id in(p1,p2) and cuenta_eliminada is not null) then raise exception 'Usuario no disponible'; end if;
 if not (diime_private.empresa_chat_parte(e1,p1,r1,actor,true) or diime_private.empresa_chat_parte(e2,p2,r2,actor,true)) then raise exception 'No tienes acceso a esta conversación' using errcode='42501'; end if;
 if exists(select 1 from public.usuarios_bloqueados b where (b.bloqueador_id=p1 and b.bloqueado_id=p2) or (b.bloqueador_id=p2 and b.bloqueado_id=p1)) then raise exception 'La conversación está bloqueada'; end if;
 insert into public.empresa_conversaciones(participante_1,participante_2,empresa_1_id,empresa_2_id,responsable_1_id,responsable_2_id,solicitud_id,trabajo_id)
 values(p1,p2,e1,e2,r1,r2,s,p_trabajo_id) on conflict do nothing returning id into resultado;
 if resultado is null then select id into resultado from public.empresa_conversaciones where participante_1=p1 and participante_2=p2 and empresa_1_id is not distinct from e1 and empresa_2_id is not distinct from e2 and solicitud_id is not distinct from s and trabajo_id is not distinct from p_trabajo_id; end if;
 return jsonb_build_object('id',resultado,'empresarial',true);
end; $$;
revoke all on function diime_private.empresa_chat_crear(uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function diime_private.empresa_chat_crear(uuid,uuid,uuid,uuid,uuid) to authenticated;
create function public.empresa_chat_crear(p_empresa_id uuid default null,p_trabajo_id uuid default null,p_solicitud_id uuid default null,p_otro_usuario_id uuid default null,p_oferta_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select diime_private.empresa_chat_crear(p_empresa_id,p_trabajo_id,p_solicitud_id,p_otro_usuario_id,p_oferta_id); $$;
revoke all on function public.empresa_chat_crear(uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.empresa_chat_crear(uuid,uuid,uuid,uuid,uuid) to authenticated;

create function diime_private.empresa_conversaciones_listar()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',c.id,'empresarial',true,'participante_1',c.participante_1,'participante_2',c.participante_2,
 'empresa_1_id',c.empresa_1_id,'empresa_2_id',c.empresa_2_id,
 'empresa_nombre',coalesce(e2.nombre,e1.nombre),'puede_escribir',diime_private.empresa_chat_acceso(c.id,true),
 'otro_usuario_id',case when lado.uno then c.participante_2 else c.participante_1 end,
 'participante_otro',jsonb_build_object('nombre',case when lado.uno then coalesce(e2.nombre,p2.nombre) else coalesce(e1.nombre,p1.nombre) end,'apellido',case when lado.uno then case when e2.id is null then p2.apellido else '' end else case when e1.id is null then p1.apellido else '' end end),
 'mi_rol',case when lado.uno then 'cliente' else 'proveedor' end,'rol_otro',case when lado.uno then 'proveedor' else 'cliente' end,
 'solicitud_id',c.solicitud_id,'trabajo_id',c.trabajo_id,
 'ultimo_mensaje',ultimo.contenido,'fecha_ultimo_mensaje',coalesce(ultimo.created_at,c.created_at),
 'unread_count',(select count(*) from public.empresa_mensajes m where m.conversacion_id=c.id and m.remitente_id<>auth.uid() and m.created_at>coalesce(l.leido_hasta,'-infinity'::timestamptz))
 ) order by coalesce(ultimo.created_at,c.created_at) desc),'[]'::jsonb)
 from public.empresa_conversaciones c
 join public.profiles p1 on p1.id=c.participante_1 join public.profiles p2 on p2.id=c.participante_2
 left join public.empresas e1 on e1.id=c.empresa_1_id left join public.empresas e2 on e2.id=c.empresa_2_id
 left join public.empresa_chat_lecturas l on l.conversacion_id=c.id and l.usuario_id=auth.uid()
 cross join lateral(select diime_private.empresa_chat_parte(c.empresa_1_id,c.participante_1,c.responsable_1_id,auth.uid()) uno) lado
 left join lateral(select m.contenido,m.created_at from public.empresa_mensajes m where m.conversacion_id=c.id order by m.created_at desc limit 1) ultimo on true
 where diime_private.empresa_chat_acceso(c.id);
$$;
revoke all on function diime_private.empresa_conversaciones_listar() from public,anon;
grant execute on function diime_private.empresa_conversaciones_listar() to authenticated;
create function public.empresa_conversaciones_listar() returns jsonb language sql security invoker set search_path='' as $$ select diime_private.empresa_conversaciones_listar(); $$;
revoke all on function public.empresa_conversaciones_listar() from public,anon;
grant execute on function public.empresa_conversaciones_listar() to authenticated;

create function diime_private.empresa_mensajes_listar(p_conversacion_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare resultado jsonb; ultimo timestamptz;
begin
 if not exists(select 1 from public.empresa_conversaciones where id=p_conversacion_id) then return null; end if;
 if not diime_private.empresa_chat_acceso(p_conversacion_id) then raise exception 'No tienes acceso a esta conversación' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('empresa_nombre',(select e.nombre from public.empresas e where e.id=m.empresa_id)) order by m.created_at),'[]'::jsonb),max(m.created_at) into resultado,ultimo from public.empresa_mensajes m where m.conversacion_id=p_conversacion_id;
 if ultimo is not null then insert into public.empresa_chat_lecturas values(p_conversacion_id,auth.uid(),ultimo) on conflict(conversacion_id,usuario_id) do update set leido_hasta=greatest(empresa_chat_lecturas.leido_hasta,excluded.leido_hasta); end if;
 return resultado;
end; $$;
revoke all on function diime_private.empresa_mensajes_listar(uuid) from public,anon;
grant execute on function diime_private.empresa_mensajes_listar(uuid) to authenticated;
create function public.empresa_mensajes_listar(p_conversacion_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select diime_private.empresa_mensajes_listar(p_conversacion_id); $$;
revoke all on function public.empresa_mensajes_listar(uuid) from public,anon;
grant execute on function public.empresa_mensajes_listar(uuid) to authenticated;

create function diime_private.empresa_mensaje_enviar(p_conversacion_id uuid,p_contenido text,p_tipo text default 'texto',p_archivo_url text default null,p_archivo_nombre text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.empresa_conversaciones%rowtype; resultado public.empresa_mensajes%rowtype; empresa uuid; nombre text; lado_uno boolean;
begin
 select * into c from public.empresa_conversaciones where id=p_conversacion_id for update;
 if not found then return null; end if;
 -- Serialize with team revocations and permission changes.
 perform 1 from public.empresa_miembros where empresa_id in(c.empresa_1_id,c.empresa_2_id) and usuario_id=auth.uid() for share;
 if not diime_private.empresa_chat_acceso(c.id,true) then raise exception 'No tienes permiso para responder' using errcode='42501'; end if;
 if exists(select 1 from public.usuarios_bloqueados b where (b.bloqueador_id=c.participante_1 and b.bloqueado_id=c.participante_2) or (b.bloqueador_id=c.participante_2 and b.bloqueado_id=c.participante_1)) then raise exception 'La conversación está bloqueada'; end if;
 if p_contenido is null or length(p_contenido)>10000 or (nullif(btrim(p_contenido),'') is null and p_archivo_url is null) then raise exception 'Mensaje no válido'; end if;
 if p_tipo not in('texto','imagen','archivo') or (p_archivo_url is not null and p_archivo_url !~ '^https://') or length(coalesce(p_archivo_nombre,''))>255 then raise exception 'Adjunto no válido'; end if;
 lado_uno:=diime_private.empresa_chat_parte(c.empresa_1_id,c.participante_1,c.responsable_1_id,auth.uid(),true);
 empresa:=case when lado_uno then c.empresa_1_id else c.empresa_2_id end;
 select btrim(p.nombre||' '||coalesce(p.apellido,'')) into nombre from public.profiles p where p.id=auth.uid();
 insert into public.empresa_mensajes(conversacion_id,remitente_id,remitente_nombre,empresa_id,contenido,tipo,archivo_url,archivo_nombre)
 values(c.id,auth.uid(),coalesce(nombre,'Profesional'),empresa,p_contenido,p_tipo,p_archivo_url,p_archivo_nombre) returning * into resultado;
 if empresa is not null then perform diime_private.empresa_registrar_actividad(empresa,'Mensaje enviado','conversacion',c.id,jsonb_build_object('mensaje_id',resultado.id)); end if;
 insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
 select p.id,'mensaje','Nuevo mensaje de empresa','Tienes un mensaje nuevo en una conversación de empresa.','/mensajes?c='||c.id::text,false,jsonb_build_object('conversacion_id',c.id,'empresa_id',coalesce(c.empresa_2_id,c.empresa_1_id))
 from public.profiles p where p.id<>auth.uid() and
 case when lado_uno then diime_private.empresa_chat_parte(c.empresa_2_id,c.participante_2,c.responsable_2_id,p.id)
 else diime_private.empresa_chat_parte(c.empresa_1_id,c.participante_1,c.responsable_1_id,p.id) end;
 return to_jsonb(resultado)||jsonb_build_object('empresa_nombre',(select e.nombre from public.empresas e where e.id=empresa));
end; $$;
revoke all on function diime_private.empresa_mensaje_enviar(uuid,text,text,text,text) from public,anon;
grant execute on function diime_private.empresa_mensaje_enviar(uuid,text,text,text,text) to authenticated;
create function public.empresa_mensaje_enviar(p_conversacion_id uuid,p_contenido text,p_tipo text default 'texto',p_archivo_url text default null,p_archivo_nombre text default null)
returns jsonb language sql security invoker set search_path='' as $$ select diime_private.empresa_mensaje_enviar(p_conversacion_id,p_contenido,p_tipo,p_archivo_url,p_archivo_nombre); $$;
revoke all on function public.empresa_mensaje_enviar(uuid,text,text,text,text) from public,anon;
grant execute on function public.empresa_mensaje_enviar(uuid,text,text,text,text) to authenticated;
-- Assignment changes do not alter the original participants or message authors.
create function diime_private.empresa_chat_reasignado() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.empresa_conversaciones set responsable_1_id=coalesce(new.operador_cliente_id,new.cliente_id),responsable_2_id=coalesce(new.operador_proveedor_id,new.profesional_id) where trabajo_id=new.id;
 return new;
end; $$;
revoke all on function diime_private.empresa_chat_reasignado() from public,anon,authenticated;
create trigger empresa_chat_reasignado after update of operador_cliente_id,operador_proveedor_id on public.trabajos for each row execute function diime_private.empresa_chat_reasignado();
commit;
