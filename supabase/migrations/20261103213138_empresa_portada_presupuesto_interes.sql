begin;

alter table public.empresas
  add column foto_portada text,
  add column presupuesto_min_interes numeric(10,2),
  add column presupuesto_max_interes numeric(10,2),
  add constraint empresas_presupuesto_interes_valido check (
    (presupuesto_min_interes is null or presupuesto_min_interes between 0 and 100000)
    and (presupuesto_max_interes is null or presupuesto_max_interes between 0 and 100000)
    and (presupuesto_min_interes is null or presupuesto_max_interes is null or presupuesto_min_interes <= presupuesto_max_interes)
  );
comment on column public.empresas.foto_portada is 'Imagen pública de portada del perfil de empresa.';
comment on column public.empresas.presupuesto_min_interes is 'Preferencia privada de avisos de demandas. NULL significa sin mínimo.';
comment on column public.empresas.presupuesto_max_interes is 'Preferencia privada de avisos de demandas. NULL significa sin máximo.';

-- Older clients must not clear a saved cover or budget. The existing coverage
-- RPC owns canonical validation and the single audit event for this save.
create function diime_private.empresa_editar_perfil_completo(
  p_nombre text,p_descripcion text,p_ubicacion text,p_sitio_web text,p_logo text,p_servicios text[],p_provincias text[],
  p_portada text,p_presupuesto_min_interes numeric,p_presupuesto_max_interes numeric,
  p_actualizar_portada boolean default true,p_actualizar_presupuesto boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare empresa uuid:=diime_private.empresa_exigir_permiso('perfil');
begin
  if p_actualizar_portada and nullif(btrim(p_portada),'') is not null
    and (length(p_portada)>2048 or p_portada !~ '^https://[^[:space:]@]+$') then
    raise exception 'La portada debe ser una imagen alojada mediante https://' using errcode='22023';
  end if;
  if p_actualizar_presupuesto then
    if (p_presupuesto_min_interes is not null and p_presupuesto_min_interes not between 0 and 100000)
      or (p_presupuesto_max_interes is not null and p_presupuesto_max_interes not between 0 and 100000) then
      raise exception 'El presupuesto de los avisos debe estar entre 0 y 100.000 €.' using errcode='22023';
    end if;
    if p_presupuesto_min_interes is not null and p_presupuesto_max_interes is not null
      and p_presupuesto_min_interes > p_presupuesto_max_interes then
      raise exception 'El presupuesto mínimo de los avisos no puede superar el máximo.' using errcode='22023';
    end if;
  end if;
  perform diime_private.empresa_editar_perfil_cobertura(p_nombre,p_descripcion,p_ubicacion,p_sitio_web,p_logo,p_servicios,p_provincias);
  update public.empresas set
    foto_portada=case when p_actualizar_portada then nullif(btrim(p_portada),'') else foto_portada end,
    presupuesto_min_interes=case when p_actualizar_presupuesto then nullif(p_presupuesto_min_interes,0) else presupuesto_min_interes end,
    presupuesto_max_interes=case when p_actualizar_presupuesto then nullif(p_presupuesto_max_interes,100000) else presupuesto_max_interes end
    where id=empresa;
end; $$;
create function public.empresa_editar_perfil_completo(
  p_nombre text,p_descripcion text,p_ubicacion text,p_sitio_web text,p_logo text,p_servicios text[],p_provincias text[],
  p_portada text,p_presupuesto_min_interes numeric,p_presupuesto_max_interes numeric,
  p_actualizar_portada boolean default true,p_actualizar_presupuesto boolean default true)
returns void language sql security invoker set search_path='' as $$
  select diime_private.empresa_editar_perfil_completo(p_nombre,p_descripcion,p_ubicacion,p_sitio_web,p_logo,p_servicios,p_provincias,
    p_portada,p_presupuesto_min_interes,p_presupuesto_max_interes,p_actualizar_portada,p_actualizar_presupuesto);
$$;
revoke all on function public.empresa_editar_perfil_completo(text,text,text,text,text,text[],text[],text,numeric,numeric,boolean,boolean),
  diime_private.empresa_editar_perfil_completo(text,text,text,text,text,text[],text[],text,numeric,numeric,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.empresa_editar_perfil_completo(text,text,text,text,text,text[],text[],text,numeric,numeric,boolean,boolean),
  diime_private.empresa_editar_perfil_completo(text,text,text,text,text,text[],text[],text,numeric,numeric,boolean,boolean) to authenticated;

-- Preserve all existing workspace operation scopes, cancellation metadata,
-- function attributes and ACL; extend only the company projection.
do $migration$
declare
  definition text:=pg_get_functiondef('diime_private.empresa_workspace()'::regprocedure);
  needle text:='''sitio_web'',e.sitio_web,''logo'',e.logo,''servicios'',e.servicios,';
  replacement text:='''sitio_web'',e.sitio_web,''logo'',e.logo,''foto_portada'',e.foto_portada,''servicios'',e.servicios,
      ''presupuesto_min_interes'',e.presupuesto_min_interes,''presupuesto_max_interes'',e.presupuesto_max_interes,';
begin
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
    raise exception 'Expected exactly one workspace company projection; migration aborted';
  end if;
  execute replace(definition,needle,replacement);
end;
$migration$;

-- Public profiles expose cover only, never notification budget preferences.
create or replace function diime_private.empresa_perfil_contenido_publico(p_empresa_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with contenido as (
    select diime_private.empresa_perfil_publico_base(e.id) datos,
      e.razon_social,e.provincias,e.estado_verificacion,e.foto_portada
    from public.empresas e where e.id=p_empresa_id
  )
  select c.datos || jsonb_build_object(
    'empresa',(c.datos->'empresa') || jsonb_build_object(
      'razon_social',c.razon_social,'provincias',c.provincias,'foto_portada',c.foto_portada,
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

-- Only authorized preview receives the private preferences.
create or replace function diime_private.empresa_perfil_vista_previa()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare empresa uuid; perfil jsonb; preferencias jsonb;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  select m.empresa_id into empresa from public.empresa_miembros m
    where m.usuario_id=auth.uid() and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id);
  if empresa is null then return null; end if;
  if not (diime_private.empresa_es_administrador(empresa,auth.uid())
    or diime_private.empresa_tiene_permiso(empresa,auth.uid(),'perfil')) then
    raise exception 'No tienes permiso para realizar esta operación de empresa' using errcode='42501';
  end if;
  perfil:=diime_private.empresa_perfil_contenido_publico(empresa);
  select jsonb_build_object('presupuesto_min_interes',e.presupuesto_min_interes,'presupuesto_max_interes',e.presupuesto_max_interes)
    into preferencias from public.empresas e where e.id=empresa;
  return jsonb_set(perfil,'{empresa}',(perfil->'empresa')||preferencias);
end;
$$;

notify pgrst,'reload schema';
commit;
