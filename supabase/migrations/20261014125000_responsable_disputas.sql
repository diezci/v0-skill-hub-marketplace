-- El seguimiento no cambia decisiones ni mueve fondos. La antigüedad del SLA
-- continúa siendo created_at, también al pasar a revisión o cambiar responsable.
alter table public.disputas
  add column responsable_id uuid references public.profiles(id),
  add column asignada_at timestamptz;

create table diime_private.disputa_asignaciones (
  id bigint generated always as identity primary key,
  disputa_id uuid not null references public.disputas(id),
  actor_id uuid not null references public.profiles(id),
  anterior_id uuid references public.profiles(id),
  responsable_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
revoke all on diime_private.disputa_asignaciones from public, anon, authenticated;

create function public.diime_asignarme_disputa(p_disputa uuid, p_asignar boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); d public.disputas%rowtype; anterior uuid; activo boolean;
begin
  perform 1 from public.profiles where id=actor and es_admin for share;
  if not found then raise exception 'No tienes permiso para gestionar responsables de disputas' using errcode='42501'; end if;
  if p_asignar is null then raise exception 'Indica si quieres asumir o liberar la revisión'; end if;
  select * into d from public.disputas where id=p_disputa for update;
  if not found then raise exception 'Disputa no encontrada'; end if;
  if d.estado not in ('abierta','en_revision') then raise exception 'La disputa ya no está pendiente de revisión'; end if;
  anterior := d.responsable_id;
  if anterior is not null and anterior<>actor then
    select es_admin into activo from public.profiles where id=anterior for share;
    if coalesce(activo,false) then raise exception 'Otro administrador ya se ocupa de esta disputa'; end if;
  end if;
  if (p_asignar and anterior=actor) or (not p_asignar and anterior is null) then return to_jsonb(d); end if;
  update public.disputas set responsable_id=case when p_asignar then actor else null end,
    asignada_at=case when p_asignar then now() else null end,
    estado=case when p_asignar then 'en_revision' else estado end, updated_at=now()
    where id=p_disputa returning * into d;
  insert into diime_private.disputa_asignaciones(disputa_id,actor_id,anterior_id,responsable_id)
    values(p_disputa,actor,anterior,d.responsable_id);
  return to_jsonb(d);
end;
$$;
revoke all on function public.diime_asignarme_disputa(uuid,boolean) from public,anon;
grant execute on function public.diime_asignarme_disputa(uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
