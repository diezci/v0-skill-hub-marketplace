-- Contexto seguro de conversaciones y pertenencia al enviar mensajes.
--
-- Una conversación es única por pareja de usuarios. Al volver a abrirla desde
-- otra demanda o desde un trabajo hay que actualizar su contexto, pero no se
-- concede UPDATE directo sobre la tabla: esta función solo permite cambiar las
-- dos FK de contexto después de comprobar las partes implicadas.

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

drop trigger if exists trg_validar_contexto_conversacion on public.conversaciones;
create trigger trg_validar_contexto_conversacion
  before insert or update of participante_1, participante_2, solicitud_id, trabajo_id
  on public.conversaciones
  for each row
  execute function public.validar_contexto_conversacion();

create or replace function public.vincular_contexto_conversacion(
  p_conversacion_id uuid,
  p_solicitud_id uuid default null,
  p_trabajo_id uuid default null
)
returns table (id uuid, solicitud_id uuid, trabajo_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  conversacion public.conversaciones%rowtype;
  cliente_solicitud uuid;
  estado_solicitud text;
  profesional_contexto uuid;
  cliente_trabajo uuid;
  profesional_trabajo uuid;
  solicitud_trabajo uuid;
  solicitud_final uuid;
  trabajo_final uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select c.* into conversacion
  from public.conversaciones c
  where c.id = p_conversacion_id
    and auth.uid() in (c.participante_1, c.participante_2)
  for update;

  if not found then
    raise exception 'Conversación no disponible' using errcode = '42501';
  end if;

  solicitud_final := conversacion.solicitud_id;
  trabajo_final := conversacion.trabajo_id;

  if p_trabajo_id is not null then
    select t.cliente_id, t.profesional_id, t.solicitud_id
      into cliente_trabajo, profesional_trabajo, solicitud_trabajo
    from public.trabajos t
    where t.id = p_trabajo_id;

    if not found
       or not (
         (conversacion.participante_1 = cliente_trabajo and conversacion.participante_2 = profesional_trabajo)
         or (conversacion.participante_2 = cliente_trabajo and conversacion.participante_1 = profesional_trabajo)
       ) then
      raise exception 'El trabajo no corresponde a la conversación' using errcode = '42501';
    end if;
    if p_solicitud_id is not null and p_solicitud_id is distinct from solicitud_trabajo then
      raise exception 'La demanda no corresponde al trabajo' using errcode = '23514';
    end if;

    trabajo_final := p_trabajo_id;
    solicitud_final := coalesce(p_solicitud_id, solicitud_trabajo, conversacion.solicitud_id);
  elsif p_solicitud_id is not null then
    select s.cliente_id, s.estado into cliente_solicitud, estado_solicitud
    from public.solicitudes s
    where s.id = p_solicitud_id;

    if not found
       or cliente_solicitud not in (conversacion.participante_1, conversacion.participante_2) then
      raise exception 'La demanda no corresponde a la conversación' using errcode = '42501';
    end if;
    if estado_solicitud is distinct from 'abierta' then
      raise exception 'La demanda ya no admite nuevos contactos' using errcode = '42501';
    end if;

    profesional_contexto := case
      when conversacion.participante_1 = cliente_solicitud then conversacion.participante_2
      else conversacion.participante_1
    end;
    if not exists (select 1 from public.profesionales p where p.id = profesional_contexto) then
      raise exception 'La otra parte de una demanda debe ser un proveedor' using errcode = '42501';
    end if;

    -- Si el chat se abre desde una demanda distinta, el trabajo anterior ya no
    -- puede quedar mezclado con el nuevo encargo.
    if conversacion.solicitud_id is distinct from p_solicitud_id then
      trabajo_final := null;
    end if;
    solicitud_final := p_solicitud_id;
  end if;

  update public.conversaciones c
  set solicitud_id = solicitud_final,
      trabajo_id = trabajo_final
  where c.id = conversacion.id;

  return query
  select c.id, c.solicitud_id, c.trabajo_id
  from public.conversaciones c
  where c.id = conversacion.id;
end;
$$;

revoke all on function public.validar_contexto_conversacion() from public;
revoke all on function public.vincular_contexto_conversacion(uuid, uuid, uuid) from public, anon;
grant execute on function public.vincular_contexto_conversacion(uuid, uuid, uuid) to authenticated;

-- El remitente debe pertenecer al chat. La política anterior solo comprobaba
-- que auth.uid() coincidiera con remitente_id y permitía insertar en cualquier
-- conversación cuyo UUID se conociera.
drop policy if exists "Usuarios pueden enviar mensajes en sus conversaciones" on public.mensajes;
create policy "Usuarios pueden enviar mensajes en sus conversaciones"
on public.mensajes
for insert
to authenticated
with check (
  auth.uid() = remitente_id
  and exists (
    select 1
    from public.conversaciones c
    where c.id = conversacion_id
      and auth.uid() in (c.participante_1, c.participante_2)
  )
);
