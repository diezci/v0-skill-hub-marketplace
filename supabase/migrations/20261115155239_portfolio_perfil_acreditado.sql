begin;

-- One portfolio per professional profile, whether the provider is an individual
-- or a business. This flow has no dependency on company workspaces/membership.
alter table public.portfolio add column evidencia_acreditacion text check(length(evidencia_acreditacion)<=4000);
create table diime_private.portfolio_acreditaciones (
 item_id uuid primary key references public.portfolio(id) on delete cascade,
 revision_id uuid not null default gen_random_uuid(),
 estado text not null default 'pendiente' check(estado in ('pendiente','acreditado','requiere_informacion')),
 nota text,
 revisado_por uuid references public.profiles(id) on delete set null,
 presentado_en timestamptz not null default now(),
 revisado_en timestamptz
);
alter table diime_private.portfolio_acreditaciones enable row level security;
revoke all on diime_private.portfolio_acreditaciones from public,anon,authenticated,service_role;
create table diime_private.portfolio_acreditaciones_historial (
 id uuid primary key default gen_random_uuid(), item_id uuid not null,
 revision_id uuid not null, decision text not null, nota text not null,
 revisado_por uuid references public.profiles(id) on delete set null, revisado_en timestamptz not null default now()
);
alter table diime_private.portfolio_acreditaciones_historial enable row level security;
revoke all on diime_private.portfolio_acreditaciones_historial from public,anon,authenticated,service_role;

create function diime_private.portfolio_reiniciar_acreditacion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- A visibility toggle does not change the evidence or content that was reviewed.
 if tg_op='UPDATE' and (to_jsonb(new)-'updated_at'-'visible')=(to_jsonb(old)-'updated_at'-'visible') then return new; end if;
 insert into diime_private.portfolio_acreditaciones(item_id) values(new.id)
 on conflict(item_id) do update set revision_id=gen_random_uuid(),estado='pendiente',nota=null,
   revisado_por=null,presentado_en=now(),revisado_en=null;
 return new;
end; $$;
revoke all on function diime_private.portfolio_reiniciar_acreditacion() from public,anon,authenticated,service_role;
create trigger portfolio_acreditacion_revision after insert or update on public.portfolio
 for each row execute function diime_private.portfolio_reiniciar_acreditacion();
-- Preserve historical work, but never label an unreviewed external item as accredited.
insert into diime_private.portfolio_acreditaciones(item_id) select id from public.portfolio;

create function diime_private.portfolio_publicable(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.portfolio p where p.id=p_id and p.visible
  and exists(select 1 from public.profiles u where u.id=p.profesional_id and u.verificado and u.cuenta_eliminada is null)
  and
  ((p.trabajo_id is not null and exists(select 1 from public.trabajos t
    where t.id=p.trabajo_id and t.estado='completado' and t.profesional_id=p.profesional_id))
   or (p.trabajo_id is null and exists(select 1 from diime_private.portfolio_acreditaciones a
     where a.item_id=p.id and a.estado='acreditado'))));
$$;
revoke all on function diime_private.portfolio_publicable(uuid) from public,anon,authenticated,service_role;
grant execute on function diime_private.portfolio_publicable(uuid) to anon,authenticated;
-- Restrictive policy also closes any older permissive SELECT policy.
create policy portfolio_solo_acreditados on public.portfolio as restrictive for select to anon,authenticated
 using(profesional_id=(select auth.uid()) or diime_private.portfolio_publicable(id));

create function diime_private.mis_acreditaciones_portfolio()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'No autenticado' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.item_id,'acreditacion',a.estado,'nota_acreditacion',a.nota))
  from diime_private.portfolio_acreditaciones a join public.portfolio p on p.id=a.item_id
  where p.profesional_id=auth.uid()),'[]');
end; $$;

create function diime_private.portfolio_acreditaciones_listar()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and es_admin and cuenta_eliminada is null) then
  raise exception 'Solo el equipo de Diime puede revisar proyectos.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.presentado_en,q.item_id) from (
  select a.*,p.titulo,p.descripcion,p.imagenes,p.evidencia_acreditacion,p.contexto_proveedor,
   concat_ws(' ',u.nombre,u.apellido) as proveedor,p.profesional_id as proveedor_id
  from diime_private.portfolio_acreditaciones a join public.portfolio p on a.item_id=p.id
  join public.profiles u on u.id=p.profesional_id where p.trabajo_id is null
 ) q),'[]');
end; $$;

create function diime_private.portfolio_acreditacion_revisar(p_item_id uuid,p_revision_id uuid,p_decision text,p_nota text)
returns void language plpgsql security definer set search_path='' as $$
declare revision diime_private.portfolio_acreditaciones; propietario uuid; evidencia text; trabajo uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and es_admin and cuenta_eliminada is null) then
  raise exception 'Solo el equipo de Diime puede revisar proyectos.' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('acreditado','requiere_informacion') or length(btrim(coalesce(p_nota,''))) not between 10 and 2000 then
  raise exception 'Indica una decisión y el motivo de la revisión (10–2.000 caracteres).' using errcode='22023'; end if;
 -- Match the project -> review locking order used by the edit trigger.
 select p.profesional_id,p.evidencia_acreditacion,p.trabajo_id into propietario,evidencia,trabajo
  from public.portfolio p where p.id=p_item_id for share;
 if not found or trabajo is not null then raise exception 'Este proyecto no está disponible para revisión.' using errcode='22023'; end if;
 if propietario=auth.uid() then raise exception 'No puedes acreditar tus propios proyectos.' using errcode='42501'; end if;
 select * into revision from diime_private.portfolio_acreditaciones a where a.item_id=p_item_id for update;
 if revision.revision_id is distinct from p_revision_id then raise exception 'El proyecto ha cambiado. Recarga antes de revisar.' using errcode='40001'; end if;
 if p_decision='acreditado' and length(btrim(coalesce(evidencia,'')))<20 then
  raise exception 'Faltan referencias o evidencias para acreditar este proyecto.' using errcode='22023'; end if;
 update diime_private.portfolio_acreditaciones a set estado=p_decision,nota=btrim(p_nota),revisado_por=auth.uid(),revisado_en=now()
 where a.item_id=p_item_id;
 insert into diime_private.portfolio_acreditaciones_historial(item_id,revision_id,decision,nota,revisado_por)
 values(p_item_id,p_revision_id,p_decision,btrim(p_nota),auth.uid());
end; $$;

create function public.mis_acreditaciones_portfolio() returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.mis_acreditaciones_portfolio(); $$;
create function public.portfolio_acreditaciones_listar() returns jsonb language sql stable security invoker set search_path='' as $$ select diime_private.portfolio_acreditaciones_listar(); $$;
create function public.portfolio_acreditacion_revisar(p_item_id uuid,p_revision_id uuid,p_decision text,p_nota text) returns void language sql security invoker set search_path='' as $$ select diime_private.portfolio_acreditacion_revisar(p_item_id,p_revision_id,p_decision,p_nota); $$;
revoke all on function public.mis_acreditaciones_portfolio(),diime_private.mis_acreditaciones_portfolio(),
 public.portfolio_acreditaciones_listar(),diime_private.portfolio_acreditaciones_listar(),
 public.portfolio_acreditacion_revisar(uuid,uuid,text,text),diime_private.portfolio_acreditacion_revisar(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.mis_acreditaciones_portfolio(),diime_private.mis_acreditaciones_portfolio(),
 public.portfolio_acreditaciones_listar(),diime_private.portfolio_acreditaciones_listar(),
 public.portfolio_acreditacion_revisar(uuid,uuid,text,text),diime_private.portfolio_acreditacion_revisar(uuid,uuid,text,text) to authenticated;
create or replace function public.portfolio_publico(p_profesional_id uuid)
returns table (
  id uuid,
  trabajo_id uuid,
  titulo text,
  descripcion text,
  categoria text,
  imagenes text[],
  ubicacion text,
  duracion text,
  fecha_proyecto date,
  contexto_proveedor text,
  tramo_precio smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.trabajo_id,
    p.titulo,
    p.descripcion,
    p.categoria,
    p.imagenes,
    p.ubicacion,
    p.duracion,
    p.fecha_proyecto,
    p.contexto_proveedor,
    case
      when p.presupuesto is null or p.presupuesto <= 0 then null
      when p.presupuesto < 100 then 0
      when p.presupuesto < 250 then 1
      when p.presupuesto < 500 then 2
      when p.presupuesto < 1000 then 3
      when p.presupuesto < 2500 then 4
      when p.presupuesto < 5000 then 5
      when p.presupuesto < 10000 then 6
      when p.presupuesto < 25000 then 7
      when p.presupuesto < 50000 then 8
      when p.presupuesto < 100000 then 9
      else 10
    end::smallint as tramo_precio
  from public.portfolio p
  where p.profesional_id = p_profesional_id
    and diime_private.portfolio_publicable(p.id)
  order by p.fecha_proyecto desc nulls last, p.created_at desc;
$$;


notify pgrst,'reload schema';
commit;
