begin;

-- Authorization is read from the database for every operation, never JWT metadata.
alter table public.empresa_miembros
  add column rol text not null default 'miembro' check (rol in ('principal','administrador','miembro')),
  add column permisos jsonb not null default '{"perfil":false,"mensajes":true,"presupuestos":false,"encargos":false,"equipo":false,"ver_cobros":false,"gestionar_cobros":false}',
  add column perfil_publico boolean not null default false;
alter table public.empresa_invitaciones
  add column rol text not null default 'miembro' check (rol in ('administrador','miembro')),
  add column permisos jsonb not null default '{"perfil":false,"mensajes":true,"presupuestos":false,"encargos":false,"equipo":false,"ver_cobros":false,"gestionar_cobros":false}',
  add column perfil_publico boolean not null default false;
alter table public.empresas add column estado_verificacion text not null default 'borrador'
  check (estado_verificacion in ('borrador','en_revision','verificada','requiere_informacion'));
update public.empresas set estado_verificacion='verificada' where verificada;
alter table public.empresas add column razon_social text;
update public.empresas set razon_social=nombre;
alter table public.empresas alter column razon_social set not null;
create function diime_private.empresa_sellar_razon_social()
returns trigger language plpgsql set search_path='' as $$
begin
  new.razon_social:=coalesce(nullif(btrim(new.razon_social),''),new.nombre);
  return new;
end; $$;
revoke all on function diime_private.empresa_sellar_razon_social() from public,anon,authenticated;
create trigger empresa_sellar_razon_social before insert on public.empresas for each row execute function diime_private.empresa_sellar_razon_social();

-- Preserve previously granted operational access and the already public team.
update public.empresa_miembros m set rol=case when m.usuario_id=e.propietario_id then 'principal' else 'miembro' end,
  permisos=case when m.usuario_id=e.propietario_id
    then '{"perfil":true,"mensajes":true,"presupuestos":true,"encargos":true,"equipo":true,"ver_cobros":true,"gestionar_cobros":true}'::jsonb
    else '{"perfil":false,"mensajes":true,"presupuestos":true,"encargos":true,"equipo":false,"ver_cobros":false,"gestionar_cobros":false}'::jsonb end,
  perfil_publico=true from public.empresas e where e.id=m.empresa_id;
create unique index empresa_un_principal_idx on public.empresa_miembros(empresa_id) where rol='principal';

create function diime_private.empresa_normalizar_permisos(p_permisos jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare base jsonb:='{"perfil":false,"mensajes":false,"presupuestos":false,"encargos":false,"equipo":false,"ver_cobros":false,"gestionar_cobros":false}';
begin
  if p_permisos is null or jsonb_typeof(p_permisos)<>'object' then raise exception 'Indica permisos válidos' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(p_permisos) v where not base ? v.key or jsonb_typeof(v.value)<>'boolean') then raise exception 'Los permisos deben ser valores booleanos conocidos' using errcode='22023'; end if;
  return base||p_permisos;
end; $$;
revoke all on function diime_private.empresa_normalizar_permisos(jsonb) from public,anon,authenticated;
alter table public.empresa_miembros add constraint empresa_permisos_validos check (permisos=diime_private.empresa_normalizar_permisos(permisos));
alter table public.empresa_invitaciones add constraint empresa_invitacion_permisos_validos check (permisos=diime_private.empresa_normalizar_permisos(permisos));

create function diime_private.empresa_tiene_permiso(p_empresa uuid,p_usuario uuid,p_permiso text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select (m.permisos->>p_permiso)::boolean from public.empresa_miembros m
    where m.empresa_id=p_empresa and m.usuario_id=p_usuario and diime_private.es_miembro_empresa(p_empresa,p_usuario)),false);
$$;
create function diime_private.empresa_es_administrador(p_empresa uuid,p_usuario uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.empresa_miembros m where m.empresa_id=p_empresa and m.usuario_id=p_usuario
    and m.rol in ('principal','administrador') and diime_private.es_miembro_empresa(p_empresa,p_usuario));
$$;
revoke all on function diime_private.empresa_tiene_permiso(uuid,uuid,text),diime_private.empresa_es_administrador(uuid,uuid) from public,anon;
grant execute on function diime_private.empresa_tiene_permiso(uuid,uuid,text),diime_private.empresa_es_administrador(uuid,uuid) to authenticated,service_role;
create function public.empresa_comprobar_permiso(p_empresa_id uuid,p_permiso text)
returns boolean language sql stable security invoker set search_path='' as $$
  select diime_private.empresa_tiene_permiso(p_empresa_id,auth.uid(),p_permiso);
$$;
revoke all on function public.empresa_comprobar_permiso(uuid,text) from public,anon;
grant execute on function public.empresa_comprobar_permiso(uuid,text) to authenticated;

create function diime_private.empresa_exigir_permiso(p_permiso text)
returns uuid language plpgsql security definer set search_path='' as $$
declare empresa uuid;
begin
  select m.empresa_id into empresa from public.empresa_miembros m where m.usuario_id=auth.uid() and m.estado='activo' for share of m;
  if empresa is null or not diime_private.empresa_tiene_permiso(empresa,auth.uid(),p_permiso) then
    raise exception 'No tienes permiso para realizar esta operación de empresa' using errcode='42501'; end if;
  return empresa;
end; $$;
revoke all on function diime_private.empresa_exigir_permiso(text) from public,anon,authenticated;

create or replace function diime_private.empresa_alta_titular()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.empresa_miembros(empresa_id,usuario_id,cargo,origen,rol,permisos,perfil_publico)
  values(new.id,new.propietario_id,'Titular','titular','principal','{"perfil":true,"mensajes":true,"presupuestos":true,"encargos":true,"equipo":true,"ver_cobros":true,"gestionar_cobros":true}',false);
  perform diime_private.empresa_registrar_actividad(new.id,'Empresa creada','empresa',new.id,'{}');
  return new;
end; $$;

create or replace function diime_private.empresa_contexto_actual()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',e.id,'nombre',e.nombre,'propietario_id',e.propietario_id,'cargo',m.cargo,
    'rol',m.rol,'permisos',m.permisos,'es_responsable_principal',m.rol='principal','estado_verificacion',e.estado_verificacion)
  from public.empresa_miembros m join public.empresas e on e.id=m.empresa_id
  where m.usuario_id=auth.uid() and diime_private.es_miembro_empresa(e.id,m.usuario_id);
$$;

-- Remove old overloads so PostgREST cannot choose the old authorization contract.
drop function public.empresa_crear_invitacion(text,text);
drop function diime_private.empresa_crear_invitacion(text,text);
create function diime_private.empresa_crear_invitacion(p_email text,p_cargo text,p_rol text default 'miembro',
  p_permisos jsonb default '{"mensajes":true}',p_perfil_publico boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('equipo'); actor public.empresa_miembros; permiso jsonb;
  token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''); i public.empresa_invitaciones;
begin
  select * into actor from public.empresa_miembros where empresa_id=empresa and usuario_id=auth.uid();
  permiso:=diime_private.empresa_normalizar_permisos(p_permisos);
  if p_rol is null or p_rol not in ('administrador','miembro') or (p_rol='administrador' and actor.rol<>'principal') then raise exception 'Solo el responsable principal puede nombrar administradores' using errcode='42501'; end if;
  if actor.rol<>'principal' and exists(select 1 from jsonb_each(permiso) v where v.value='true'::jsonb and actor.permisos->v.key<>'true'::jsonb) then raise exception 'No puedes conceder permisos que no tienes' using errcode='42501'; end if;
  if length(btrim(p_email))>254 or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or nullif(btrim(p_email),'') is null or nullif(btrim(p_cargo),'') is null or length(p_cargo)>120 then raise exception 'Indica un correo y cargo válidos' using errcode='22023'; end if;
  update public.empresa_invitaciones set estado='revocada',revocada_at=now() where empresa_id=empresa and email=lower(btrim(p_email)) and estado='pendiente';
  insert into public.empresa_invitaciones(empresa_id,email,cargo,token_hash,creada_por,rol,permisos,perfil_publico)
    values(empresa,lower(btrim(p_email)),btrim(p_cargo),encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid(),p_rol,permiso,coalesce(p_perfil_publico,false)) returning * into i;
  perform diime_private.empresa_registrar_actividad(empresa,'Invitación creada','invitacion',i.id,jsonb_build_object('cargo',i.cargo,'rol',i.rol));
  return jsonb_build_object('id',i.id,'token',token,'expira_at',i.expira_at);
end; $$;

create or replace function diime_private.empresa_consultar_invitacion(p_token text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('empresa_id',e.id,'empresa_nombre',e.nombre,'cargo',i.cargo,'rol',i.rol,'permisos',i.permisos,
    'perfil_publico',i.perfil_publico,'estado',case when i.estado='pendiente' and i.expira_at<=now() then 'caducada' else i.estado end,
    'expira_at',i.expira_at,'coincide_email',exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=i.email))
  from public.empresa_invitaciones i join public.empresas e on e.id=i.empresa_id
  where i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and auth.uid() is not null;
$$;
create or replace function diime_private.empresa_aceptar_invitacion(p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.empresa_invitaciones; actor uuid:=auth.uid(); empresa uuid; perfil public.profiles; creador public.empresa_miembros;
begin
  if actor is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  select empresa_id into empresa from public.empresa_invitaciones where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if empresa is null then raise exception 'Invitación no válida' using errcode='22023'; end if;
  perform 1 from public.empresas e join public.profiles titular on titular.id=e.propietario_id where e.id=empresa and titular.cuenta_eliminada is null for update of e;
  if not found then raise exception 'La empresa ya no está disponible' using errcode='42501'; end if;
  select * into i from public.empresa_invitaciones where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if i.estado<>'pendiente' or i.expira_at<=now() then raise exception 'La invitación ha caducado o ya se ha utilizado' using errcode='55000'; end if;
  select * into creador from public.empresa_miembros where empresa_id=empresa and usuario_id=i.creada_por for share;
  if not diime_private.empresa_tiene_permiso(empresa,i.creada_por,'equipo') or
    (i.rol='administrador' and creador.rol<>'principal') or
    (creador.rol<>'principal' and exists(select 1 from jsonb_each(i.permisos) v where v.value='true'::jsonb and creador.permisos->v.key<>'true'::jsonb)) then raise exception 'La autorización de esta invitación ya no está vigente' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null and lower(email)=i.email) then raise exception 'Inicia sesión con el correo verificado al que se dirigió la invitación' using errcode='42501'; end if;
  select * into perfil from public.profiles where id=actor and cuenta_eliminada is null for update;
  if perfil.id is null then raise exception 'Completa tu perfil personal antes de unirte al equipo' using errcode='55000'; end if;
  if exists(select 1 from public.empresa_miembros where usuario_id=actor and estado='activo') or perfil.empresa_id is not null then raise exception 'Ya perteneces a una empresa' using errcode='42501'; end if;
  insert into public.empresa_miembros(empresa_id,usuario_id,cargo,origen,rol,permisos,perfil_publico)
    values(empresa,actor,i.cargo,'invitacion',i.rol,i.permisos,i.perfil_publico)
    on conflict(empresa_id,usuario_id) do update set cargo=excluded.cargo,estado='activo',origen='invitacion',rol=excluded.rol,permisos=excluded.permisos,perfil_publico=excluded.perfil_publico,revocado_at=null,updated_at=now();
  update public.empresa_invitaciones set estado='aceptada',aceptada_por=actor,aceptada_at=now() where id=i.id;
  perform diime_private.empresa_registrar_actividad(empresa,'Invitación aceptada','miembro',actor,jsonb_build_object('cargo',i.cargo,'rol',i.rol));
  return empresa;
end; $$;

drop function public.empresa_actualizar_miembro(uuid,text,boolean);
drop function diime_private.empresa_actualizar_miembro(uuid,text,boolean);
create function diime_private.empresa_actualizar_miembro(p_usuario_id uuid,p_cargo text,p_revocar boolean default false,
  p_rol text default null,p_permisos jsonb default null,p_perfil_publico boolean default null)
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('equipo'); actor public.empresa_miembros; objetivo public.empresa_miembros; nuevos jsonb; rol_nuevo text;
begin
  select * into actor from public.empresa_miembros where empresa_id=empresa and usuario_id=auth.uid();
  select * into objetivo from public.empresa_miembros where empresa_id=empresa and usuario_id=p_usuario_id and estado='activo' for update;
  if objetivo.usuario_id is null then raise exception 'La persona no pertenece al equipo activo' using errcode='42501'; end if;
  if objetivo.rol='principal' and (p_revocar or actor.rol<>'principal' or coalesce(p_rol,'principal')<>'principal') then raise exception 'El responsable principal no puede ser revocado ni sustituido por esta acción' using errcode='42501'; end if;
  rol_nuevo:=coalesce(p_rol,objetivo.rol); nuevos:=diime_private.empresa_normalizar_permisos(coalesce(p_permisos,objetivo.permisos));
  if rol_nuevo not in ('principal','administrador','miembro') or (rol_nuevo='principal' and objetivo.rol<>'principal') then raise exception 'El rol indicado no es válido' using errcode='42501'; end if;
  if actor.rol<>'principal' and (objetivo.rol<>'miembro' or rol_nuevo<>'miembro' or objetivo.usuario_id=actor.usuario_id) then raise exception 'Solo el responsable principal puede gestionar administradores o sus propios permisos' using errcode='42501'; end if;
  if actor.rol<>'principal' and exists(select 1 from jsonb_each(nuevos) v where v.value='true'::jsonb and actor.permisos->v.key<>'true'::jsonb) then raise exception 'No puedes conceder permisos que no tienes' using errcode='42501'; end if;
  if not p_revocar and (nullif(btrim(p_cargo),'') is null or length(p_cargo)>120) then raise exception 'Indica un cargo válido' using errcode='22023'; end if;
  if objetivo.rol='principal' then nuevos:=objetivo.permisos; end if;
  update public.empresa_miembros set cargo=case when p_revocar then cargo else btrim(p_cargo) end,
    rol=rol_nuevo,permisos=nuevos,perfil_publico=coalesce(p_perfil_publico,perfil_publico),
    estado=case when p_revocar then 'revocado' else 'activo' end,revocado_at=case when p_revocar then now() else null end,updated_at=now()
    where empresa_id=empresa and usuario_id=p_usuario_id;
  if p_revocar then update public.empresa_invitaciones set estado='revocada',revocada_at=now() where empresa_id=empresa and creada_por=p_usuario_id and estado='pendiente'; end if;
  update public.profiles set empresa_id=case when p_revocar then null else empresa end,cargo_empresa=case when p_revocar then null else btrim(p_cargo) end where id=p_usuario_id and empresa_id=empresa;
  perform diime_private.empresa_registrar_actividad(empresa,case when p_revocar then 'Acceso revocado' else 'Permisos del equipo actualizados' end,'miembro',p_usuario_id,
    jsonb_build_object('cargo',p_cargo,'rol',rol_nuevo,'permisos',nuevos,'perfil_publico',coalesce(p_perfil_publico,objetivo.perfil_publico)));
end; $$;

create or replace function diime_private.empresa_revocar_invitacion(p_invitacion_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('equipo'); i public.empresa_invitaciones; rol_actor text;
begin
  select rol into rol_actor from public.empresa_miembros where empresa_id=empresa and usuario_id=auth.uid();
  select * into i from public.empresa_invitaciones where id=p_invitacion_id and empresa_id=empresa and estado='pendiente' for update;
  if i.id is null or (i.rol='administrador' and rol_actor<>'principal') then raise exception 'No puedes revocar esta invitación' using errcode='42501'; end if;
  update public.empresa_invitaciones set estado='revocada',revocada_at=now() where id=i.id;
  perform diime_private.empresa_registrar_actividad(empresa,'Invitación revocada','invitacion',i.id,'{}');
end; $$;

create or replace function diime_private.empresa_editar_perfil(p_nombre text,p_descripcion text,p_ubicacion text,p_sitio_web text,p_logo text,p_servicios text[])
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('perfil');
begin
  if nullif(btrim(p_nombre),'') is null or length(p_nombre)>160 or length(p_descripcion)>6000 or length(p_ubicacion)>200 or cardinality(p_servicios)>30 then raise exception 'Revisa el nombre, descripción y servicios de la empresa' using errcode='22023'; end if;
  if nullif(btrim(p_sitio_web),'') is not null and p_sitio_web !~ '^https?://' then raise exception 'La web debe comenzar por https:// o http://' using errcode='22023'; end if;
  if nullif(btrim(p_logo),'') is not null and p_logo !~ '^https://' then raise exception 'El logo debe ser una imagen alojada mediante https://' using errcode='22023'; end if;
  update public.empresas set nombre=btrim(p_nombre),descripcion=nullif(btrim(p_descripcion),''),ubicacion=nullif(btrim(p_ubicacion),''),sitio_web=nullif(btrim(p_sitio_web),''),logo=nullif(btrim(p_logo),''),servicios=coalesce(p_servicios,'{}'),updated_at=now() where id=empresa;
  perform diime_private.empresa_registrar_actividad(empresa,'Perfil actualizado','empresa',empresa,'{}');
end; $$;

-- Current operator is mutable; contractual parties and original authors remain sealed.
alter table public.trabajos
  add column operador_cliente_id uuid references public.profiles(id),
  add column operador_proveedor_id uuid references public.profiles(id);
update public.trabajos set operador_cliente_id=cliente_id where empresa_cliente_id is not null;
update public.trabajos set operador_proveedor_id=profesional_id where empresa_proveedora_id is not null;

create function diime_private.empresa_puede_operar_trabajo(p_trabajo uuid,p_actor uuid,p_permiso text default 'encargos',p_parte text default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.trabajos t join public.profiles p on p.id=p_actor and p.cuenta_eliminada is null
    where t.id=p_trabajo and (p_parte is null or p_parte in ('cliente','proveedor')) and (
      ((p_parte is null or p_parte='cliente') and (
        (t.empresa_cliente_id is null and t.cliente_id=p_actor) or
        (t.empresa_cliente_id is not null and diime_private.empresa_tiene_permiso(t.empresa_cliente_id,p_actor,p_permiso)
          and (coalesce(t.operador_cliente_id,t.cliente_id)=p_actor or diime_private.empresa_es_administrador(t.empresa_cliente_id,p_actor)))))
      or ((p_parte is null or p_parte='proveedor') and (
        (t.empresa_proveedora_id is null and t.profesional_id=p_actor) or
        (t.empresa_proveedora_id is not null and diime_private.empresa_tiene_permiso(t.empresa_proveedora_id,p_actor,p_permiso)
          and (coalesce(t.operador_proveedor_id,t.profesional_id)=p_actor or diime_private.empresa_es_administrador(t.empresa_proveedora_id,p_actor)))))
    ));
$$;
revoke all on function diime_private.empresa_puede_operar_trabajo(uuid,uuid,text,text) from public,anon;
grant execute on function diime_private.empresa_puede_operar_trabajo(uuid,uuid,text,text) to authenticated,service_role;
create function public.empresa_puede_operar_trabajo(p_trabajo_id uuid,p_permiso text default 'encargos',p_parte text default null)
returns boolean language sql stable security invoker set search_path='' as $$
  select diime_private.empresa_puede_operar_trabajo(p_trabajo_id,auth.uid(),p_permiso,p_parte);
$$;
revoke all on function public.empresa_puede_operar_trabajo(uuid,text,text) from public,anon;
grant execute on function public.empresa_puede_operar_trabajo(uuid,text,text) to authenticated;

create function diime_private.empresa_reasignar_trabajo(p_trabajo_id uuid,p_usuario_id uuid,p_parte text)
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('encargos'); t public.trabajos; anterior uuid;
begin
  if not diime_private.empresa_es_administrador(empresa,auth.uid()) then raise exception 'Solo los administradores pueden asignar encargos' using errcode='42501'; end if;
  perform public.diime_bloquear_trabajo_financiero(p_trabajo_id);
  select * into t from public.trabajos where id=p_trabajo_id for update;
  if t.id is null or p_parte is null or p_parte not in ('cliente','proveedor') or
    (case when p_parte='cliente' then t.empresa_cliente_id else t.empresa_proveedora_id end) is distinct from empresa then raise exception 'El encargo no pertenece a esta empresa' using errcode='42501'; end if;
  if t.estado in ('completado','cancelado') then raise exception 'El encargo ya está cerrado' using errcode='55000'; end if;
  perform 1 from public.empresa_miembros where empresa_id=empresa and usuario_id=p_usuario_id for share;
  if not diime_private.empresa_tiene_permiso(empresa,p_usuario_id,'encargos') then raise exception 'La persona asignada debe estar activa y tener permiso para encargos' using errcode='42501'; end if;
  anterior:=case when p_parte='cliente' then t.operador_cliente_id else t.operador_proveedor_id end;
  update public.trabajos set operador_cliente_id=case when p_parte='cliente' then p_usuario_id else operador_cliente_id end,
    operador_proveedor_id=case when p_parte='proveedor' then p_usuario_id else operador_proveedor_id end,updated_at=now() where id=t.id;
  perform diime_private.empresa_registrar_actividad(empresa,'Encargo reasignado','trabajos',t.id,
    jsonb_build_object('parte',p_parte,'operador_anterior_id',anterior,'operador_usuario_id',p_usuario_id,'titulo_objeto',t.titulo));
end; $$;

create function diime_private.empresa_actualizar_trabajo(p_trabajo_id uuid,p_progreso integer,p_entregar boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('encargos'); t public.trabajos; destinatario uuid;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo_id);
  select * into t from public.trabajos where id=p_trabajo_id for update;
  if t.empresa_proveedora_id is distinct from empresa or not diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos','proveedor') then raise exception 'No puedes actualizar este encargo' using errcode='42501'; end if;
  if t.estado<>'en_progreso' or t.cancelacion_estado='pendiente' or t.pago_bloqueado then raise exception 'El encargo no admite avances mientras no esté en progreso o tenga una incidencia pendiente' using errcode='55000'; end if;
  if p_progreso is null or p_progreso<0 or p_progreso>100 then raise exception 'Indica un progreso entre 0 y 100' using errcode='22023'; end if;
  update public.trabajos set progreso=case when p_entregar then 100 else p_progreso end,
    estado=case when p_entregar then 'entregado' else estado end,fecha_entrega=case when p_entregar then now() else fecha_entrega end,updated_at=now() where id=t.id;
  insert into public.actualizaciones_trabajo(trabajo_id,usuario_id,tipo,mensaje,progreso)
    values(t.id,auth.uid(),case when p_entregar then 'entrega' else 'progreso' end,
      case when p_entregar then 'El equipo ha entregado el trabajo para su revisión.' else 'El equipo ha actualizado el progreso del encargo.' end,case when p_entregar then 100 else p_progreso end);
  if p_entregar then
    destinatario:=coalesce(t.operador_cliente_id,t.cliente_id);
    insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
      values(destinatario,'trabajo_entregado','Entrega: '||t.titulo,'El equipo ha entregado el trabajo. Revisa la entrega antes de confirmar el pago.',
        case when t.empresa_cliente_id is null then '/mis-trabajos?trabajo='||t.id else '/mi-empresa?trabajo='||t.id end,false,
        jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'titulo_trabajo',t.titulo));
  end if;
end; $$;

-- Additional narrow checks supplement the existing immutable identity/workflow triggers.
create function diime_private.empresa_guardar_permisos_operacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); empresa uuid; permiso text; fila jsonb; s public.solicitudes; o public.ofertas;
begin
  if tg_op='DELETE' then fila:=to_jsonb(old); else fila:=to_jsonb(new); end if;
  if tg_table_name in ('solicitudes','ofertas') then
    empresa:=(fila->>'empresa_id')::uuid;
    permiso:=case when tg_table_name='ofertas' then 'presupuestos' else 'encargos' end;
    if empresa is not null and actor is not null and (tg_op='INSERT' or actor=(fila->>case when tg_table_name='ofertas' then 'profesional_id' else 'cliente_id' end)::uuid) then
      perform 1 from public.empresa_miembros where empresa_id=empresa and usuario_id=actor for share;
      if not diime_private.empresa_tiene_permiso(empresa,actor,permiso) then raise exception 'No tienes permiso para esta operación empresarial' using errcode='42501'; end if;
      if tg_op='INSERT' and not exists(select 1 from public.empresas where id=empresa and estado_verificacion='verificada') then raise exception 'La representación de la empresa debe estar verificada antes de operar' using errcode='42501'; end if;
    end if;
  elsif tg_op='INSERT' then
    select * into s from public.solicitudes where id=new.solicitud_id;
    select * into o from public.ofertas where id=new.oferta_id;
    if s.empresa_id is not null then
      perform 1 from public.empresa_miembros where empresa_id=s.empresa_id and usuario_id=actor for share;
      if not diime_private.empresa_tiene_permiso(s.empresa_id,actor,'encargos') or not exists(select 1 from public.empresas where id=s.empresa_id and estado_verificacion='verificada') then raise exception 'No puedes contratar por una empresa pendiente de verificación o sin permiso para encargos' using errcode='42501'; end if;
      new.operador_cliente_id:=new.cliente_id;
    else new.operador_cliente_id:=null; end if;
    if o.empresa_id is not null then
      perform 1 from public.empresa_miembros where empresa_id=o.empresa_id and usuario_id=o.profesional_id for share;
      if not diime_private.empresa_tiene_permiso(o.empresa_id,o.profesional_id,'presupuestos') or not exists(select 1 from public.empresas where id=o.empresa_id and estado_verificacion='verificada') then raise exception 'La oferta no tiene una autorización empresarial vigente' using errcode='42501'; end if;
      new.operador_proveedor_id:=new.profesional_id;
    else new.operador_proveedor_id:=null; end if;
  elsif tg_table_name='trabajos' and tg_op='UPDATE' and actor is not null then
    if new.operador_cliente_id is distinct from old.operador_cliente_id and
      not (diime_private.empresa_es_administrador(old.empresa_cliente_id,actor) and diime_private.empresa_tiene_permiso(old.empresa_cliente_id,actor,'encargos')) then raise exception 'No puedes reasignar el encargo del cliente' using errcode='42501'; end if;
    if new.operador_proveedor_id is distinct from old.operador_proveedor_id and
      not (diime_private.empresa_es_administrador(old.empresa_proveedora_id,actor) and diime_private.empresa_tiene_permiso(old.empresa_proveedora_id,actor,'encargos')) then raise exception 'No puedes reasignar el encargo del proveedor' using errcode='42501'; end if;
    -- A revoked original actor cannot keep updating a job assigned to someone else.
    if (old.empresa_cliente_id is not null and actor=old.cliente_id) or (old.empresa_proveedora_id is not null and actor=old.profesional_id) then
      if not diime_private.empresa_puede_operar_trabajo(old.id,actor,'encargos') then raise exception 'Ya no tienes permiso para operar este encargo empresarial' using errcode='42501'; end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function diime_private.empresa_guardar_permisos_operacion() from public,anon,authenticated;
create trigger aa_empresa_permisos before insert or update or delete on public.solicitudes for each row execute function diime_private.empresa_guardar_permisos_operacion();
create trigger aa_empresa_permisos before insert or update or delete on public.ofertas for each row execute function diime_private.empresa_guardar_permisos_operacion();
create trigger aa_empresa_permisos before insert or update or delete on public.trabajos for each row execute function diime_private.empresa_guardar_permisos_operacion();

-- Keep existing public portfolio/review projection, narrowing publication/team visibility.
alter function diime_private.empresa_perfil_publico(uuid) rename to empresa_perfil_publico_base;
revoke all on function diime_private.empresa_perfil_publico_base(uuid) from public,anon,authenticated;
create function diime_private.empresa_perfil_publico(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_set(jsonb_set(base,'{empresa,razon_social}',to_jsonb(razon_social)),'{miembros}',coalesce((select jsonb_agg(v||jsonb_build_object('tiene_perfil_profesional',exists(select 1 from public.profesionales p where p.id=(v->>'usuario_id')::uuid)))
    from jsonb_array_elements(base->'miembros') v join public.empresa_miembros m on m.empresa_id=p_empresa_id and m.usuario_id=(v->>'usuario_id')::uuid where m.perfil_publico),'[]'))
  from (select diime_private.empresa_perfil_publico_base(p_empresa_id) base,razon_social from public.empresas where id=p_empresa_id and estado_verificacion='verificada') q;
$$;
create or replace function public.empresa_perfil_publico(p_empresa_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.empresa_perfil_publico(p_empresa_id); $$;
grant execute on function diime_private.empresa_perfil_publico(uuid) to anon,authenticated;
revoke all on function diime_private.empresa_perfil_publico(uuid) from public;
alter function diime_private.empresas_publicas() rename to empresas_publicas_base;
revoke all on function diime_private.empresas_publicas_base() from public,anon,authenticated;
create function diime_private.empresas_publicas()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(v||jsonb_build_object('razon_social',e.razon_social,'miembros_count',(select count(*) from public.empresa_miembros m
    where m.empresa_id=(v->>'id')::uuid and m.perfil_publico and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id)))),'[]')
  from jsonb_array_elements(diime_private.empresas_publicas_base()) v
  join public.empresas e on e.id=(v->>'id')::uuid where e.estado_verificacion='verificada';
$$;
create or replace function public.empresas_publicas()
returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.empresas_publicas(); $$;
revoke all on function diime_private.empresas_publicas() from public;
grant execute on function diime_private.empresas_publicas() to anon,authenticated;
create or replace function diime_private.empresa_afiliacion_publica(p_usuario_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('empresa_id',m.empresa_id,'cargo',m.cargo) from public.empresa_miembros m join public.empresas e on e.id=m.empresa_id
  where m.usuario_id=p_usuario_id and m.perfil_publico and e.estado_verificacion='verificada' and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id);
$$;

-- Documentary evidence never appears in the public schema or a SELECT * contract.
create table diime_private.empresa_verificaciones (
  id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
  estado text not null check(estado in ('en_revision','verificada','requiere_informacion')),
  metodo text not null check(metodo in ('certificado','documental')), representante_nombre text not null,
  cargo_legal text not null, responsable_usuario_id uuid not null references public.profiles(id),
  documento_nombre text not null, documento bytea not null check(octet_length(documento)<=5242880),
  nota_revision text, revisada_por uuid references public.profiles(id), creada_at timestamptz not null default now(), revisada_at timestamptz
);
create unique index empresa_una_verificacion_pendiente on diime_private.empresa_verificaciones(empresa_id) where estado='en_revision';
alter table diime_private.empresa_verificaciones enable row level security;
revoke all on diime_private.empresa_verificaciones from public,anon,authenticated,service_role;
create function diime_private.empresa_admin_plataforma()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and es_admin=true and cuenta_eliminada is null);
$$;
revoke all on function diime_private.empresa_admin_plataforma() from public,anon,authenticated;

create function diime_private.empresa_solicitar_verificacion(p_metodo text,p_representante_nombre text,p_cargo_legal text,p_documento_nombre text,p_documento_base64 text,p_consentimiento boolean)
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_titular_actual(); documento bytea; v_id uuid;
begin
  perform 1 from public.empresas where id=empresa for update;
  if p_consentimiento is distinct from true or p_metodo is null or p_metodo not in ('certificado','documental') or
    nullif(btrim(p_representante_nombre),'') is null or length(p_representante_nombre)>160 or
    nullif(btrim(p_cargo_legal),'') is null or length(p_cargo_legal)>160 or
    nullif(btrim(p_documento_nombre),'') is null or length(p_documento_nombre)>200 or p_documento_base64 is null or length(p_documento_base64)>6990510 then
    raise exception 'Revisa la autorización, el representante y el documento PDF' using errcode='22023'; end if;
  documento:=decode(p_documento_base64,'base64');
  if octet_length(documento)<6 or octet_length(documento)>5242880 or substring(documento from 1 for 5)<>convert_to('%PDF-','UTF8') then raise exception 'Adjunta un documento PDF de hasta 5 MB' using errcode='22023'; end if;
  if exists(select 1 from public.empresas where id=empresa and estado_verificacion in ('en_revision','verificada')) then raise exception 'La empresa ya está verificada o tiene una revisión pendiente' using errcode='55000'; end if;
  insert into diime_private.empresa_verificaciones(empresa_id,estado,metodo,representante_nombre,cargo_legal,responsable_usuario_id,documento_nombre,documento)
    values(empresa,'en_revision',p_metodo,btrim(p_representante_nombre),btrim(p_cargo_legal),auth.uid(),btrim(p_documento_nombre),documento) returning id into v_id;
  update public.empresas set estado_verificacion='en_revision',verificada=false,updated_at=now() where id=empresa;
  perform diime_private.empresa_registrar_actividad(empresa,'Representación enviada a revisión','verificacion',v_id,'{}');
end; $$;
create function diime_private.empresa_revisar_verificacion(p_empresa_id uuid,p_decision text,p_nota text)
returns void language plpgsql security definer set search_path='' as $$
declare v diime_private.empresa_verificaciones;
begin
  if not diime_private.empresa_admin_plataforma() then raise exception 'Solo el equipo administrador de Diime puede revisar la representación' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('verificada','requiere_informacion') or nullif(btrim(p_nota),'') is null or length(p_nota)>4000 then raise exception 'Indica una decisión y las comprobaciones realizadas' using errcode='22023'; end if;
  perform 1 from public.empresas where id=p_empresa_id for update;
  select * into v from diime_private.empresa_verificaciones where empresa_id=p_empresa_id and estado='en_revision' for update;
  if v.id is null then raise exception 'No hay una revisión pendiente para esta empresa' using errcode='55000'; end if;
  if v.responsable_usuario_id=auth.uid() then raise exception 'No puedes aprobar ni revisar tu propia solicitud' using errcode='42501'; end if;
  update diime_private.empresa_verificaciones set estado=p_decision,nota_revision=btrim(p_nota),revisada_por=auth.uid(),revisada_at=now() where id=v.id;
  update public.empresas set estado_verificacion=p_decision,verificada=p_decision='verificada',updated_at=now() where id=p_empresa_id;
  perform diime_private.empresa_registrar_actividad(p_empresa_id,'Representación revisada','verificacion',v.id,jsonb_build_object('decision',p_decision));
end; $$;
create function diime_private.empresa_verificaciones_listar()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not diime_private.empresa_admin_plataforma() then raise exception 'No tienes permiso para revisar empresas' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v) order by v.creada_at desc) from (
    select distinct on (e.id) e.id empresa_id,e.razon_social empresa_nombre,e.cif,v.id,v.estado,v.metodo,v.representante_nombre,v.cargo_legal,v.responsable_usuario_id,v.documento_nombre,v.nota_revision,v.creada_at,v.revisada_at
    from public.empresas e join diime_private.empresa_verificaciones v on v.empresa_id=e.id order by e.id,v.creada_at desc
  ) v),'[]');
end; $$;
create function diime_private.empresa_verificacion_documento(p_empresa_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not diime_private.empresa_admin_plataforma() and not exists(select 1 from public.empresas e where e.id=p_empresa_id and e.propietario_id=auth.uid() and diime_private.es_miembro_empresa(e.id,auth.uid())) then raise exception 'No tienes acceso al documento de representación' using errcode='42501'; end if;
  return (select jsonb_build_object('nombre',documento_nombre,'base64',encode(documento,'base64')) from diime_private.empresa_verificaciones where empresa_id=p_empresa_id order by creada_at desc limit 1);
end; $$;

create or replace function diime_private.empresa_workspace()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.empresas; m public.empresa_miembros; admin_equipo boolean; gestor_equipo boolean; verificacion jsonb;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  select * into m from public.empresa_miembros where usuario_id=auth.uid() and estado='activo';
  if m.empresa_id is null or not diime_private.es_miembro_empresa(m.empresa_id,auth.uid()) then return null; end if;
  select * into e from public.empresas where id=m.empresa_id;
  admin_equipo:=diime_private.empresa_es_administrador(e.id,auth.uid()); gestor_equipo:=diime_private.empresa_tiene_permiso(e.id,auth.uid(),'equipo');
  if m.rol='principal' or diime_private.empresa_admin_plataforma() then
    select jsonb_build_object('id',v.id,'estado',v.estado,'metodo',v.metodo,'representante_nombre',v.representante_nombre,'cargo_legal',v.cargo_legal,
      'responsable_usuario_id',v.responsable_usuario_id,'documento_nombre',v.documento_nombre,'nota_revision',v.nota_revision,'creada_at',v.creada_at,'revisada_at',v.revisada_at)
      into verificacion from diime_private.empresa_verificaciones v where v.empresa_id=e.id order by v.creada_at desc limit 1;
  end if;
  return jsonb_build_object(
    'empresa',jsonb_build_object('id',e.id,'nombre',e.nombre,'razon_social',e.razon_social,'descripcion',e.descripcion,'ubicacion',e.ubicacion,'sitio_web',e.sitio_web,'logo',e.logo,'servicios',e.servicios,
      'verificada',e.verificada,'estado_verificacion',e.estado_verificacion,'cif',case when admin_equipo then e.cif else null end,'propietario_id',e.propietario_id),
    'usuario_id',auth.uid(),'es_titular',m.rol='principal','plataforma_admin',diime_private.empresa_admin_plataforma(),'verificacion',verificacion,
    'miembros',coalesce((select jsonb_agg(jsonb_build_object('usuario_id',p.id,'nombre',p.nombre,'apellido',p.apellido,'foto_perfil',p.foto_perfil,
      'cargo',mi.cargo,'bio',p.bio,'titulo',pr.titulo,'habilidades',coalesce(pr.habilidades,'[]'),'tiene_perfil_profesional',pr.id is not null,
      'estado',mi.estado,'es_titular',mi.rol='principal','rol',mi.rol,'permisos',case when admin_equipo or gestor_equipo or mi.usuario_id=auth.uid() then mi.permisos else '{}'::jsonb end,'perfil_publico',mi.perfil_publico)
      order by (mi.rol='principal') desc,mi.created_at) from public.empresa_miembros mi join public.profiles p on p.id=mi.usuario_id left join public.profesionales pr on pr.id=p.id
      where mi.empresa_id=e.id and (admin_equipo or gestor_equipo or mi.usuario_id=auth.uid() or (mi.estado='activo' and mi.perfil_publico))),'[]'),
    'invitaciones',case when gestor_equipo then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'cargo',i.cargo,'rol',i.rol,'permisos',i.permisos,'perfil_publico',i.perfil_publico,
      'estado',case when i.estado='pendiente' and i.expira_at<=now() then 'caducada' else i.estado end,'created_at',i.created_at,'expira_at',i.expira_at) order by i.created_at desc)
      from public.empresa_invitaciones i where i.empresa_id=e.id),'[]') else '[]'::jsonb end,
    'actividad',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'actor_usuario_id',a.actor_usuario_id,'actor_nombre',a.actor_nombre,'accion',a.accion,'entidad_tipo',a.entidad_tipo,'entidad_id',a.entidad_id,'detalle',a.detalle,'created_at',a.created_at) order by a.created_at desc)
      from public.empresa_actividad a where a.empresa_id=e.id and (admin_equipo or (a.actor_usuario_id=auth.uid() and (
        (a.entidad_tipo='solicitudes' and (m.permisos->>'encargos')::boolean) or (a.entidad_tipo='ofertas' and (m.permisos->>'presupuestos')::boolean) or
        (a.entidad_tipo='trabajos' and (m.permisos->>'encargos')::boolean) or (a.entidad_tipo in ('mensaje','conversacion') and (m.permisos->>'mensajes')::boolean))))),'[]'),
    'operaciones',jsonb_build_object(
      'solicitudes',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'titulo',s.titulo,'descripcion',s.descripcion,'estado',s.estado,'fecha',s.created_at,'actor_usuario_id',s.actor_usuario_id,'actor_nombre',btrim(p.nombre||' '||coalesce(p.apellido,'')),'solicitud_id',s.id,'parte','cliente') order by s.created_at desc)
        from public.solicitudes s join public.profiles p on p.id=s.cliente_id where s.empresa_id=e.id and (admin_equipo or ((m.permisos->>'encargos')::boolean and s.cliente_id=auth.uid()))),'[]'),
      'ofertas',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'titulo',s.titulo,'descripcion',o.descripcion,'estado',o.estado,'fecha',o.created_at,'actor_usuario_id',o.actor_usuario_id,'actor_nombre',btrim(p.nombre||' '||coalesce(p.apellido,'')),'precio',o.precio,'solicitud_id',s.id,'parte',case when o.empresa_id=e.id then 'proveedor' else 'cliente' end) order by o.created_at desc)
        from public.ofertas o join public.solicitudes s on s.id=o.solicitud_id join public.profiles p on p.id=o.profesional_id where
          (o.empresa_id=e.id and (admin_equipo or ((m.permisos->>'presupuestos')::boolean and o.profesional_id=auth.uid()))) or
          (s.empresa_id=e.id and (admin_equipo or ((m.permisos->>'encargos')::boolean and s.cliente_id=auth.uid())))),'[]'),
      'trabajos',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'trabajo_id',t.id,'titulo',t.titulo,'descripcion',t.descripcion,'estado',t.estado,'fecha',t.created_at,
        'actor_usuario_id',case when t.empresa_proveedora_id=e.id then t.profesional_id else t.cliente_id end,
        'actor_nombre',btrim(p.nombre||' '||coalesce(p.apellido,'')),'precio',t.precio_acordado,'solicitud_id',t.solicitud_id,'progreso',t.progreso,
        'cancelacion_estado',t.cancelacion_estado,'cancelacion_parte_solicitante',to_jsonb(t)->>'cancelacion_parte_solicitante','cancelacion_razon',t.cancelacion_razon,
        'disputa_actual',(select jsonb_build_object('id',d.id,'estado',d.estado,'motivo',d.motivo,'resolucion',d.resolucion,'resultado',d.resultado)
          from public.disputas d where d.trabajo_id=t.id order by (d.estado in ('abierta','en_revision')) desc,d.created_at desc,d.id desc limit 1),
        'parte',case when t.empresa_proveedora_id=e.id then 'proveedor' else 'cliente' end,
        'operador_usuario_id',case when t.empresa_proveedora_id=e.id then coalesce(t.operador_proveedor_id,t.profesional_id) else coalesce(t.operador_cliente_id,t.cliente_id) end,
        'operador_nombre',btrim(op.nombre||' '||coalesce(op.apellido,''))) order by t.created_at desc)
        from public.trabajos t join public.profiles p on p.id=case when t.empresa_proveedora_id=e.id then t.profesional_id else t.cliente_id end
          join public.profiles op on op.id=case when t.empresa_proveedora_id=e.id then coalesce(t.operador_proveedor_id,t.profesional_id) else coalesce(t.operador_cliente_id,t.cliente_id) end
        where (t.empresa_proveedora_id=e.id or t.empresa_cliente_id=e.id) and (admin_equipo or diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos',case when t.empresa_proveedora_id=e.id then 'proveedor' else 'cliente' end))),'[]')
    ));
end; $$;

-- Public wrappers expose only authenticated scoped RPCs, never private tables.
do $$
declare f record; llamada text;
begin
  for f in select p.proname,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_arguments(p.oid) args,pg_get_function_result(p.oid) resultado,p.proargnames
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='diime_private' and p.proname in (
      'empresa_crear_invitacion','empresa_actualizar_miembro','empresa_reasignar_trabajo','empresa_actualizar_trabajo',
      'empresa_solicitar_verificacion','empresa_revisar_verificacion','empresa_verificaciones_listar','empresa_verificacion_documento')
  loop
    llamada:=coalesce(array_to_string(f.proargnames,','),'');
    execute format('create or replace function public.%I(%s) returns %s language sql security invoker set search_path = '''' as $api$ select diime_private.%I(%s); $api$',f.proname,f.args,f.resultado,f.proname,llamada);
    execute format('revoke all on function public.%I(%s),diime_private.%I(%s) from public,anon,authenticated',f.proname,f.identity_args,f.proname,f.identity_args);
    execute format('grant execute on function public.%I(%s),diime_private.%I(%s) to authenticated',f.proname,f.identity_args,f.proname,f.identity_args);
  end loop;
end; $$;
grant execute on function diime_private.empresa_normalizar_permisos(jsonb) to service_role;

-- Legal identity is independent from the editable commercial display name.
create or replace function diime_private.sellar_facturacion_trabajo()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into diime_private.trabajos_facturacion(trabajo_id,datos)
  select new.id,jsonb_agg(jsonb_build_object(
    'parte',d.parte,'empresa_nombre',e.razon_social,'empresa_cif',e.cif,
    'empresa_ubicacion',e.ubicacion,'empresa_email',e.email,
    'persona_nombre',p.nombre,'persona_apellido',p.apellido,
    'persona_documento',case when d.empresa_id is null then p.documento else null end,
    'persona_cargo',case when d.empresa_id is not null then m.cargo else null end
  ) order by d.parte)
  from (values ('cliente',new.cliente_id,new.empresa_cliente_id),
               ('profesional',new.profesional_id,new.empresa_proveedora_id)) d(parte,usuario_id,empresa_id)
  join public.profiles p on p.id=d.usuario_id
  left join public.empresas e on e.id=d.empresa_id
  left join public.empresa_miembros m on m.usuario_id=d.usuario_id and m.empresa_id=d.empresa_id;
  return new;
end; $$;
revoke all on function diime_private.sellar_facturacion_trabajo() from public,anon,authenticated,service_role;

commit;
