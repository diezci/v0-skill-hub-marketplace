begin;

-- Shared public-shaped content. Only guarded definer wrappers may call this
-- builder; it never grants direct access to drafts or to workspace/private data.
create function diime_private.empresa_perfil_contenido_publico(p_empresa_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with contenido as (
    select diime_private.empresa_perfil_publico_base(e.id) datos,
      e.razon_social,e.provincias,e.estado_verificacion
    from public.empresas e where e.id=p_empresa_id
  )
  select c.datos || jsonb_build_object(
    'empresa',(c.datos->'empresa') || jsonb_build_object(
      'razon_social',c.razon_social,'provincias',c.provincias,
      'estado_verificacion',c.estado_verificacion,'verificada',c.estado_verificacion='verificada'),
    'miembros',visibles.miembros,
    'portfolio',coalesce((select jsonb_agg(jsonb_set(p.valor,'{participantes_ids}',
      coalesce((select jsonb_agg(participante.valor order by participante.orden)
        from jsonb_array_elements(coalesce(p.valor->'participantes_ids','[]')) with ordinality participante(valor,orden)
        where exists(select 1 from jsonb_array_elements(visibles.miembros) m
          where m->'usuario_id'=participante.valor)),'[]')) order by p.orden)
      from jsonb_array_elements(c.datos->'portfolio') with ordinality p(valor,orden)),'[]'))
  from contenido c cross join lateral (
    select coalesce(jsonb_agg(v.valor || jsonb_build_object('tiene_perfil_profesional',
      exists(select 1 from public.profesionales pr where pr.id=(v.valor->>'usuario_id')::uuid)) order by v.orden),'[]') miembros
    from jsonb_array_elements(c.datos->'miembros') with ordinality v(valor,orden)
    join public.empresa_miembros m on m.empresa_id=p_empresa_id and m.usuario_id=(v.valor->>'usuario_id')::uuid
    where m.perfil_publico and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id)
  ) visibles where c.datos is not null;
$$;
revoke all on function diime_private.empresa_perfil_contenido_publico(uuid) from public,anon,authenticated,service_role;

-- Public profile keeps its existing verification gate and existing API grants.
create or replace function diime_private.empresa_perfil_publico(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select diime_private.empresa_perfil_contenido_publico(e.id)
  from public.empresas e where e.id=p_empresa_id and e.estado_verificacion='verificada';
$$;

-- No caller-controlled company ID: preview always belongs to the active member.
create function diime_private.empresa_perfil_vista_previa()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare empresa uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  select m.empresa_id into empresa from public.empresa_miembros m
    where m.usuario_id=auth.uid() and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id);
  if empresa is null then return null; end if;
  if not (diime_private.empresa_es_administrador(empresa,auth.uid())
    or diime_private.empresa_tiene_permiso(empresa,auth.uid(),'perfil')) then
    raise exception 'No tienes permiso para realizar esta operación de empresa' using errcode='42501';
  end if;
  return diime_private.empresa_perfil_contenido_publico(empresa);
end;
$$;
create function public.empresa_perfil_vista_previa()
returns jsonb language sql stable security invoker set search_path='' as $$
  select diime_private.empresa_perfil_vista_previa();
$$;
revoke all on function public.empresa_perfil_vista_previa(),diime_private.empresa_perfil_vista_previa()
  from public,anon,authenticated,service_role;
grant execute on function public.empresa_perfil_vista_previa(),diime_private.empresa_perfil_vista_previa() to authenticated;

notify pgrst,'reload schema';
commit;
