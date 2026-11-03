begin;

-- Explicit business contacts must never inherit the account owner's email or
-- phone stored during company registration.
alter table public.empresas
  add column titulo text,
  add column telefono_contacto text,
  add column email_contacto text,
  add column tarifa_hora numeric(10,2),
  add column anos_experiencia integer not null default 0,
  add column tiempo_respuesta text not null default '24 horas',
  add column disponible boolean not null default true,
  add column habilidades text[] not null default '{}',
  add column certificaciones text[] not null default '{}',
  add column idiomas text[] not null default '{}',
  add constraint empresas_tarifa_hora_valida check (tarifa_hora is null or tarifa_hora between 0 and 100000),
  add constraint empresas_experiencia_valida check (anos_experiencia between 0 and 100);

create function diime_private.empresa_editar_perfil_profesional(
  p_nombre text,p_descripcion text,p_ubicacion text,p_sitio_web text,p_logo text,p_servicios text[],p_provincias text[],
  p_portada text,p_presupuesto_min_interes numeric,p_presupuesto_max_interes numeric,p_datos_profesionales jsonb,
  p_actualizar_portada boolean default true,p_actualizar_presupuesto boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare
  empresa uuid;
  clave text; valor jsonb; maximo integer;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión' using errcode='42501'; end if;
  empresa:=diime_private.empresa_exigir_permiso('perfil');
  if p_datos_profesionales is null or jsonb_typeof(p_datos_profesionales)<>'object'
    or exists(select 1 from jsonb_object_keys(p_datos_profesionales) k where k not in
      ('titulo','telefono','emailContacto','tarifaHora','anosExperiencia','tiempoRespuesta','disponible','habilidades','certificaciones','idiomas')) then
    raise exception 'Revisa los datos profesionales de la empresa.' using errcode='22023';
  end if;
  if length(coalesce(p_ubicacion,''))>200 or coalesce(p_ubicacion,'') ~ '[[:cntrl:]]' then
    raise exception 'Revisa la ubicación de la empresa.' using errcode='22023';
  end if;
  for clave,valor in select * from jsonb_each(p_datos_profesionales) loop
    if clave in ('titulo','telefono','emailContacto','tiempoRespuesta') then
      maximo:=case clave when 'titulo' then 160 when 'telefono' then 40 when 'emailContacto' then 254 else 80 end;
      if jsonb_typeof(valor)<>'string' or length(valor#>>'{}')>maximo or (valor#>>'{}') ~ '[[:cntrl:]]' then
        raise exception 'Revisa el campo % de la empresa.',clave using errcode='22023';
      end if;
    elsif clave in ('habilidades','certificaciones','idiomas') then
      if jsonb_typeof(valor)<>'array' then raise exception 'Revisa la lista de % de la empresa.',clave using errcode='22023'; end if;
      if jsonb_array_length(valor)>100 or exists(select 1 from jsonb_array_elements(valor) v
        where jsonb_typeof(v)<>'string' or nullif(btrim(v#>>'{}'),'') is null or length(v#>>'{}')>300 or (v#>>'{}') ~ '[[:cntrl:]]') then
        raise exception 'Revisa la lista de % de la empresa.',clave using errcode='22023';
      end if;
    elsif clave='tarifaHora' and valor<>'null'::jsonb then
      if jsonb_typeof(valor)<>'number' then raise exception 'Revisa la tarifa por hora.' using errcode='22023'; end if;
      if (valor#>>'{}')::numeric not between 0 and 100000 then raise exception 'Revisa la tarifa por hora.' using errcode='22023'; end if;
    elsif clave='anosExperiencia' then
      if jsonb_typeof(valor)<>'number' then raise exception 'Revisa los años de experiencia.' using errcode='22023'; end if;
      if (valor#>>'{}')::numeric not between 0 and 100 or trunc((valor#>>'{}')::numeric)<>(valor#>>'{}')::numeric then
        raise exception 'Revisa los años de experiencia.' using errcode='22023';
      end if;
    elsif clave='disponible' and jsonb_typeof(valor)<>'boolean' then
      raise exception 'Revisa la disponibilidad de la empresa.' using errcode='22023';
    end if;
  end loop;
  if nullif(btrim(p_datos_profesionales->>'emailContacto'),'') is not null
    and btrim(p_datos_profesionales->>'emailContacto') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Introduce un correo de contacto válido.' using errcode='22023';
  end if;

  -- The established RPC validates cover, budget and canonical coverage and
  -- records one audit event. Restore the independently selected head location.
  perform diime_private.empresa_editar_perfil_completo(p_nombre,p_descripcion,p_ubicacion,p_sitio_web,p_logo,p_servicios,p_provincias,
    p_portada,p_presupuesto_min_interes,p_presupuesto_max_interes,p_actualizar_portada,p_actualizar_presupuesto);
  update public.empresas set
    ubicacion=nullif(btrim(p_ubicacion),''),
    titulo=case when p_datos_profesionales?'titulo' then nullif(btrim(p_datos_profesionales->>'titulo'),'') else titulo end,
    telefono_contacto=case when p_datos_profesionales?'telefono' then nullif(btrim(p_datos_profesionales->>'telefono'),'') else telefono_contacto end,
    email_contacto=case when p_datos_profesionales?'emailContacto' then lower(nullif(btrim(p_datos_profesionales->>'emailContacto'),'')) else email_contacto end,
    tarifa_hora=case when p_datos_profesionales?'tarifaHora' then (p_datos_profesionales->>'tarifaHora')::numeric else tarifa_hora end,
    anos_experiencia=case when p_datos_profesionales?'anosExperiencia' then (p_datos_profesionales->>'anosExperiencia')::numeric::integer else anos_experiencia end,
    tiempo_respuesta=case when p_datos_profesionales?'tiempoRespuesta' then btrim(p_datos_profesionales->>'tiempoRespuesta') else tiempo_respuesta end,
    disponible=case when p_datos_profesionales?'disponible' then (p_datos_profesionales->>'disponible')::boolean else disponible end,
    habilidades=case when p_datos_profesionales?'habilidades' then array(select btrim(v) from jsonb_array_elements_text(p_datos_profesionales->'habilidades') with ordinality items(v,orden) group by btrim(v) order by min(orden)) else habilidades end,
    certificaciones=case when p_datos_profesionales?'certificaciones' then array(select btrim(v) from jsonb_array_elements_text(p_datos_profesionales->'certificaciones') with ordinality items(v,orden) group by btrim(v) order by min(orden)) else certificaciones end,
    idiomas=case when p_datos_profesionales?'idiomas' then array(select btrim(v) from jsonb_array_elements_text(p_datos_profesionales->'idiomas') with ordinality items(v,orden) group by btrim(v) order by min(orden)) else idiomas end
    where id=empresa;
end; $$;
create function public.empresa_editar_perfil_profesional(
  p_nombre text,p_descripcion text,p_ubicacion text,p_sitio_web text,p_logo text,p_servicios text[],p_provincias text[],
  p_portada text,p_presupuesto_min_interes numeric,p_presupuesto_max_interes numeric,p_datos_profesionales jsonb,
  p_actualizar_portada boolean default true,p_actualizar_presupuesto boolean default true)
returns void language sql security invoker set search_path='' as $$
  select diime_private.empresa_editar_perfil_profesional(p_nombre,p_descripcion,p_ubicacion,p_sitio_web,p_logo,p_servicios,p_provincias,
    p_portada,p_presupuesto_min_interes,p_presupuesto_max_interes,p_datos_profesionales,p_actualizar_portada,p_actualizar_presupuesto);
$$;
revoke all on function public.empresa_editar_perfil_profesional(text,text,text,text,text,text[],text[],text,numeric,numeric,jsonb,boolean,boolean),
  diime_private.empresa_editar_perfil_profesional(text,text,text,text,text,text[],text[],text,numeric,numeric,jsonb,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.empresa_editar_perfil_profesional(text,text,text,text,text,text[],text[],text,numeric,numeric,jsonb,boolean,boolean),
  diime_private.empresa_editar_perfil_profesional(text,text,text,text,text,text[],text[],text,numeric,numeric,jsonb,boolean,boolean) to authenticated;

-- Preserve the complete workspace and its existing permission scopes.
do $migration$
declare
  definition text:=pg_get_functiondef('diime_private.empresa_workspace()'::regprocedure);
  needle text:='''foto_portada'',e.foto_portada,''servicios'',e.servicios,';
  replacement text:='''foto_portada'',e.foto_portada,''servicios'',e.servicios,
      ''titulo'',e.titulo,''telefono_contacto'',e.telefono_contacto,''email_contacto'',e.email_contacto,
      ''tarifa_hora'',e.tarifa_hora,''anos_experiencia'',e.anos_experiencia,''tiempo_respuesta'',e.tiempo_respuesta,
      ''disponible'',e.disponible,''habilidades'',e.habilidades,''certificaciones'',e.certificaciones,''idiomas'',e.idiomas,
      ''proyectos_completados'',(select count(*) from public.trabajos t where t.empresa_proveedora_id=e.id and t.estado=''completado''),';
begin
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
    raise exception 'Expected exactly one workspace company projection; migration aborted';
  end if;
  execute replace(definition,needle,replacement);
end;
$migration$;

-- This allowlist contains business profile fields only. Registration contacts,
-- notification budgets, tax data and private portfolio budgets stay private.
create or replace function diime_private.empresa_perfil_contenido_publico(p_empresa_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with contenido as (
    select diime_private.empresa_perfil_publico_base(e.id) datos,
      jsonb_build_object('razon_social',e.razon_social,'provincias',e.provincias,'foto_portada',e.foto_portada,
        'estado_verificacion',e.estado_verificacion,'verificada',e.estado_verificacion='verificada',
        'titulo',e.titulo,'telefono_contacto',e.telefono_contacto,'email_contacto',e.email_contacto,
        'tarifa_hora',e.tarifa_hora,'anos_experiencia',e.anos_experiencia,'tiempo_respuesta',e.tiempo_respuesta,
        'disponible',e.disponible,'habilidades',e.habilidades,'certificaciones',e.certificaciones,'idiomas',e.idiomas,
        'proyectos_completados',(select count(*) from public.trabajos t where t.empresa_proveedora_id=e.id and t.estado='completado')) perfil
    from public.empresas e where e.id=p_empresa_id
  )
  select c.datos || jsonb_build_object(
    'empresa',(c.datos->'empresa') || c.perfil,
    'miembros',visibles.miembros,
    'portfolio',coalesce((select jsonb_agg(jsonb_set(p.valor,'{participantes_ids}',
      coalesce((select jsonb_agg(participante.valor order by participante.orden)
        from jsonb_array_elements(coalesce(p.valor->'participantes_ids','[]')) with ordinality participante(valor,orden)
        where exists(select 1 from jsonb_array_elements(visibles.miembros) m
          where m->'usuario_id'=participante.valor)),'[]')) order by p.orden)
      from jsonb_array_elements(diime_private.empresa_portfolio_publico(p_empresa_id)) with ordinality p(valor,orden)),'[]'))
  from contenido c cross join lateral (
    select coalesce(jsonb_agg(v.valor || jsonb_build_object('tiene_perfil_profesional',
      exists(select 1 from public.profesionales pr where pr.id=(v.valor->>'usuario_id')::uuid)) order by v.orden),'[]') miembros
    from jsonb_array_elements(c.datos->'miembros') with ordinality v(valor,orden)
    join public.empresa_miembros m on m.empresa_id=p_empresa_id and m.usuario_id=(v.valor->>'usuario_id')::uuid
    where m.perfil_publico and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id)
  ) visibles where c.datos is not null;
$$;
revoke all on function diime_private.empresa_perfil_contenido_publico(uuid) from public,anon,authenticated,service_role;

create or replace function diime_private.empresas_publicas()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(v||jsonb_build_object('razon_social',e.razon_social,'provincias',e.provincias,
    'foto_portada',e.foto_portada,'titulo',e.titulo,'telefono_contacto',e.telefono_contacto,'email_contacto',e.email_contacto,
    'tarifa_hora',e.tarifa_hora,'anos_experiencia',e.anos_experiencia,'tiempo_respuesta',e.tiempo_respuesta,
    'disponible',e.disponible,'habilidades',e.habilidades,'certificaciones',e.certificaciones,'idiomas',e.idiomas,
    'proyectos_completados',(select count(*) from public.trabajos t where t.empresa_proveedora_id=e.id and t.estado='completado'),
    'miembros_count',(select count(*) from public.empresa_miembros m where m.empresa_id=e.id and m.perfil_publico
      and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id)))),'[]')
  from jsonb_array_elements(diime_private.empresas_publicas_base()) v
  join public.empresas e on e.id=(v->>'id')::uuid where e.estado_verificacion='verificada';
$$;

notify pgrst,'reload schema';
commit;
