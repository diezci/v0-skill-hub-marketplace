-- Keep a stable thread per personal/request/job context. No historical message
-- or conversation is reclassified here: ambiguous legacy contexts abort.
lock table public.conversaciones in share row exclusive mode;
alter table public.conversaciones add column contexto_archivado boolean not null default false;
do $$
begin
  if exists (
    select 1 from public.conversaciones where not contexto_archivado
    group by least(participante_1,participante_2), greatest(participante_1,participante_2),
      case when trabajo_id is not null then 'trabajo'
        when solicitud_id is not null then 'solicitud' else 'personal' end,
      coalesce(trabajo_id,solicitud_id)
    having count(*) > 1
  ) then
    raise exception 'Conversaciones ambiguas para la misma pareja y contexto; revisar manualmente antes de migrar'
      using errcode = '23505';
  end if;
end;
$$;

alter table public.conversaciones
  drop constraint conversaciones_participante_1_participante_2_key;
drop index public.idx_unique_conversation_solicitud;
drop index public.idx_unique_conversation_trabajo;

create unique index conversaciones_contexto_trabajo_unique
  on public.conversaciones(least(participante_1,participante_2),greatest(participante_1,participante_2),trabajo_id)
  where trabajo_id is not null and not contexto_archivado;
create unique index conversaciones_contexto_solicitud_unique
  on public.conversaciones(least(participante_1,participante_2),greatest(participante_1,participante_2),solicitud_id)
  where trabajo_id is null and solicitud_id is not null and not contexto_archivado;
create unique index conversaciones_contexto_personal_unique
  on public.conversaciones(least(participante_1,participante_2),greatest(participante_1,participante_2))
  where trabajo_id is null and solicitud_id is null and not contexto_archivado;

-- Even a delayed writer cannot move a thread and its documents to another job.
-- Existing validation and participant/blocking/RLS checks remain in force.
create function public.impedir_reasignacion_contexto_conversacion()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.contexto_archivado then
      raise exception 'No se puede crear una conversación archivada' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.participante_1 is distinct from old.participante_1
     or new.participante_2 is distinct from old.participante_2 then
    raise exception 'No se pueden cambiar los participantes de una conversación' using errcode = '42501';
  end if;
  if new.solicitud_id is distinct from old.solicitud_id
     or new.trabajo_id is distinct from old.trabajo_id then
    -- Preserve ON DELETE SET NULL semantics without turning a historical
    -- project thread into a personal thread or colliding with an active one.
    if (new.solicitud_id is not distinct from old.solicitud_id
        or (new.solicitud_id is null and old.solicitud_id is not null
          and not exists(select 1 from public.solicitudes s where s.id=old.solicitud_id)))
       and (new.trabajo_id is not distinct from old.trabajo_id
        or (new.trabajo_id is null and old.trabajo_id is not null
          and not exists(select 1 from public.trabajos t where t.id=old.trabajo_id))) then
      new.contexto_archivado:=true;
      return new;
    end if;
    raise exception 'El contexto de una conversación no se puede reasignar; abre el chat del nuevo contexto'
      using errcode = '42501';
  end if;
  if new.contexto_archivado is distinct from old.contexto_archivado then
    raise exception 'El archivo de una conversación no se puede alterar manualmente' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.impedir_reasignacion_contexto_conversacion() from public, anon, authenticated;
create trigger trg_impedir_reasignacion_contexto_conversacion
  before insert or update of participante_1, participante_2, solicitud_id, trabajo_id, contexto_archivado on public.conversaciones
  for each row execute function public.impedir_reasignacion_contexto_conversacion();

create or replace function public.validar_contexto_conversacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cliente_solicitud uuid;
  estado_solicitud text;
  profesional_contexto uuid;
  otro_participante uuid;
  cliente_trabajo uuid;
  profesional_trabajo uuid;
  solicitud_trabajo uuid;
begin
  if tg_op = 'UPDATE' and new.contexto_archivado
     and (new.solicitud_id is distinct from old.solicitud_id
       or new.trabajo_id is distinct from old.trabajo_id) then
    -- The earlier immutable-context trigger permits only FK nullification
    -- after the referenced parent has actually disappeared.
    return new;
  end if;
  if (new.trabajo_id is not null and exists(
      select 1 from public.trabajos t where t.id=new.trabajo_id
        and (t.empresa_cliente_id is not null or t.empresa_proveedora_id is not null)))
     or (new.solicitud_id is not null and exists(
      select 1 from public.solicitudes s where s.id=new.solicitud_id and s.empresa_id is not null)) then
    raise exception 'El contexto empresarial requiere su conversación de empresa' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if new.participante_1 = new.participante_2 then
    raise exception 'No se puede abrir una conversación con uno mismo'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id in (new.participante_1, new.participante_2)
      and p.cuenta_eliminada is not null
  ) then
    raise exception 'Uno de los usuarios ya no está disponible'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and (new.participante_1 is distinct from old.participante_1
       or new.participante_2 is distinct from old.participante_2) then
    raise exception 'No se pueden cambiar los participantes de una conversación'
      using errcode = '42501';
  end if;

  if new.trabajo_id is null and new.solicitud_id is null then
    if auth.uid() not in (new.participante_1, new.participante_2) then
      raise exception 'No perteneces a esta conversación' using errcode = '42501';
    end if;

    otro_participante := case
      when auth.uid() = new.participante_1 then new.participante_2
      else new.participante_1
    end;

    -- El contacto sin proyecto sirve para cliente -> profesional y para
    -- soporte. Profesional -> cliente exige una demanda o trabajo real.
    if not exists (select 1 from public.profesionales p where p.id = otro_participante)
       and not exists (
         select 1 from public.profiles p
         where p.id in (new.participante_1, new.participante_2)
           and p.es_admin is true
       ) then
      raise exception 'Para contactar a un cliente hace falta una demanda o trabajo'
        using errcode = '42501';
    end if;
  elsif new.trabajo_id is not null then
    select t.cliente_id, t.profesional_id, t.solicitud_id
      into cliente_trabajo, profesional_trabajo, solicitud_trabajo
    from public.trabajos t
    where t.id = new.trabajo_id;

    if not found
       or not (
         (new.participante_1 = cliente_trabajo and new.participante_2 = profesional_trabajo)
         or (new.participante_2 = cliente_trabajo and new.participante_1 = profesional_trabajo)
       ) then
      raise exception 'El trabajo no corresponde a los participantes del chat'
        using errcode = '42501';
    end if;

    if new.solicitud_id is not null and new.solicitud_id is distinct from solicitud_trabajo then
      raise exception 'La demanda no corresponde al trabajo del chat'
        using errcode = '23514';
    end if;
  elsif new.solicitud_id is not null then
    select s.cliente_id, s.estado into cliente_solicitud, estado_solicitud
    from public.solicitudes s
    where s.id = new.solicitud_id;

    if not found or cliente_solicitud not in (new.participante_1, new.participante_2) then
      raise exception 'La demanda no corresponde a los participantes del chat'
        using errcode = '42501';
    end if;
    if estado_solicitud is distinct from 'abierta' then
      raise exception 'La demanda ya no admite nuevos contactos'
        using errcode = '42501';
    end if;

    profesional_contexto := case
      when new.participante_1 = cliente_solicitud then new.participante_2
      else new.participante_1
    end;
    if not exists (select 1 from public.profesionales p where p.id = profesional_contexto) then
      raise exception 'La otra parte de una demanda debe ser un proveedor'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


-- Keep the RPC signature/ACL. Linking now returns the exact authorized target
-- thread; it never changes the source thread or moves any of its messages.
create or replace function public.vincular_contexto_conversacion(
  p_conversacion_id uuid,
  p_solicitud_id uuid default null,
  p_trabajo_id uuid default null
)
returns table (id uuid, solicitud_id uuid, trabajo_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_conversacion public.conversaciones%rowtype;
  v_cliente uuid;
  v_profesional uuid;
  v_solicitud_trabajo uuid;
  v_estado_solicitud text;
  v_solicitud uuid;
  v_trabajo uuid;
  v_resultado uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  select c.* into v_conversacion from public.conversaciones c
    where c.id=p_conversacion_id and auth.uid() in(c.participante_1,c.participante_2);
  if not found then
    raise exception 'Conversación no disponible' using errcode = '42501';
  end if;
  if exists(select 1 from public.profiles p
      where p.id in(v_conversacion.participante_1,v_conversacion.participante_2)
        and p.cuenta_eliminada is not null)
     or exists(select 1 from public.usuarios_bloqueados b
      where (b.bloqueador_id=v_conversacion.participante_1 and b.bloqueado_id=v_conversacion.participante_2)
         or (b.bloqueador_id=v_conversacion.participante_2 and b.bloqueado_id=v_conversacion.participante_1)) then
    raise exception 'La conversación no está disponible' using errcode = '42501';
  end if;

  if (p_trabajo_id is not null and exists(
      select 1 from public.trabajos t where t.id=p_trabajo_id
        and (t.empresa_cliente_id is not null or t.empresa_proveedora_id is not null)))
     or (p_solicitud_id is not null and exists(
      select 1 from public.solicitudes s where s.id=p_solicitud_id and s.empresa_id is not null)) then
    raise exception 'El contexto empresarial requiere su conversación de empresa' using errcode = '42501';
  end if;

  if p_trabajo_id is not null then
    select t.cliente_id,t.profesional_id,t.solicitud_id
      into v_cliente,v_profesional,v_solicitud_trabajo
      from public.trabajos t where t.id=p_trabajo_id;
    if not found or not (
      (v_conversacion.participante_1=v_cliente and v_conversacion.participante_2=v_profesional)
      or (v_conversacion.participante_2=v_cliente and v_conversacion.participante_1=v_profesional)) then
      raise exception 'El trabajo no corresponde a la conversación' using errcode = '42501';
    end if;
    if p_solicitud_id is not null and p_solicitud_id is distinct from v_solicitud_trabajo then
      raise exception 'La demanda no corresponde al trabajo' using errcode = '23514';
    end if;
    v_trabajo:=p_trabajo_id;
    v_solicitud:=v_solicitud_trabajo;
  elsif p_solicitud_id is not null then
    select s.cliente_id,s.estado into v_cliente,v_estado_solicitud
      from public.solicitudes s where s.id=p_solicitud_id;
    if not found or v_cliente not in(v_conversacion.participante_1,v_conversacion.participante_2) then
      raise exception 'La demanda no corresponde a la conversación' using errcode = '42501';
    end if;
    if v_estado_solicitud is distinct from 'abierta' then
      raise exception 'La demanda ya no admite nuevos contactos' using errcode = '42501';
    end if;
    v_profesional:=case when v_conversacion.participante_1=v_cliente
      then v_conversacion.participante_2 else v_conversacion.participante_1 end;
    if not exists(select 1 from public.profesionales p where p.id=v_profesional) then
      raise exception 'La otra parte de una demanda debe ser un proveedor' using errcode = '42501';
    end if;
    v_solicitud:=p_solicitud_id;
  else
    return query select c.id,c.solicitud_id,c.trabajo_id
      from public.conversaciones c where c.id=v_conversacion.id;
    return;
  end if;

  select c.id into v_resultado from public.conversaciones c
    where least(c.participante_1,c.participante_2)=least(v_conversacion.participante_1,v_conversacion.participante_2)
      and greatest(c.participante_1,c.participante_2)=greatest(v_conversacion.participante_1,v_conversacion.participante_2)
      and not c.contexto_archivado
      and c.trabajo_id is not distinct from v_trabajo
      and (v_trabajo is not null or c.solicitud_id is not distinct from v_solicitud);
  if v_resultado is null then
    insert into public.conversaciones(participante_1,participante_2,solicitud_id,trabajo_id)
      values(least(v_conversacion.participante_1,v_conversacion.participante_2),
        greatest(v_conversacion.participante_1,v_conversacion.participante_2),v_solicitud,v_trabajo)
      on conflict do nothing returning conversaciones.id into v_resultado;
    if v_resultado is null then
      select c.id into v_resultado from public.conversaciones c
        where least(c.participante_1,c.participante_2)=least(v_conversacion.participante_1,v_conversacion.participante_2)
          and greatest(c.participante_1,c.participante_2)=greatest(v_conversacion.participante_1,v_conversacion.participante_2)
          and not c.contexto_archivado
          and c.trabajo_id is not distinct from v_trabajo
          and (v_trabajo is not null or c.solicitud_id is not distinct from v_solicitud);
    end if;
  end if;
  if v_resultado is null then
    raise exception 'No se pudo abrir el chat del contexto solicitado' using errcode = '40001';
  end if;
  return query select c.id,c.solicitud_id,c.trabajo_id
    from public.conversaciones c where c.id=v_resultado;
end;
$$;
revoke all on function public.vincular_contexto_conversacion(uuid,uuid,uuid) from public,anon;
grant execute on function public.vincular_contexto_conversacion(uuid,uuid,uuid) to authenticated;
