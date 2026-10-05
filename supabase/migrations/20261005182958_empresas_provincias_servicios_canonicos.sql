begin;

-- Canonical coverage is explicit; historical free-text locations remain untouched.
-- Lists match lib/provincias.ts and lib/categorias.ts (tested against both sources).
alter table public.empresas add column provincias text[] not null default '{}';
alter table public.empresas add constraint empresas_provincias_canonicas check (
  cardinality(provincias)<=52 and coalesce(array_ndims(provincias),1)=1
  and array_position(provincias,null) is null and provincias <@ array['A Coruña','Álava','Albacete','Alicante','Almería','Asturias','Ávila','Badajoz','Barcelona','Burgos','Cáceres','Cádiz','Cantabria','Castellón','Ceuta','Ciudad Real','Córdoba','Cuenca','Girona','Granada','Guadalajara','Gipuzkoa','Huelva','Huesca','Illes Balears','Jaén','La Rioja','Las Palmas','León','Lleida','Lugo','Madrid','Málaga','Melilla','Murcia','Navarra','Ourense','Palencia','Pontevedra','Salamanca','Santa Cruz de Tenerife','Segovia','Sevilla','Soria','Tarragona','Teruel','Toledo','Valencia','Valladolid','Bizkaia','Zamora','Zaragoza']::text[]
);

-- A distinct RPC avoids overloaded PostgREST signatures and preserves old clients.
create function diime_private.empresa_editar_perfil_cobertura(
  p_nombre text,p_descripcion text,p_ubicacion text,p_sitio_web text,p_logo text,p_servicios text[],p_provincias text[])
returns void language plpgsql security definer set search_path='' as $$
declare
  empresa uuid:=diime_private.empresa_exigir_permiso('perfil');
  provincias_validas constant text[]:=array['A Coruña','Álava','Albacete','Alicante','Almería','Asturias','Ávila','Badajoz','Barcelona','Burgos','Cáceres','Cádiz','Cantabria','Castellón','Ceuta','Ciudad Real','Córdoba','Cuenca','Girona','Granada','Guadalajara','Gipuzkoa','Huelva','Huesca','Illes Balears','Jaén','La Rioja','Las Palmas','León','Lleida','Lugo','Madrid','Málaga','Melilla','Murcia','Navarra','Ourense','Palencia','Pontevedra','Salamanca','Santa Cruz de Tenerife','Segovia','Sevilla','Soria','Tarragona','Teruel','Toledo','Valencia','Valladolid','Bizkaia','Zamora','Zaragoza']::text[];
  servicios_validos constant text[]:=array['Reformas integrales','Albañilería','Demoliciones y desescombro','Fachadas','Tejados y cubiertas','Fontanería','Electricidad','Climatización','Instalación de gas','Domótica e instalaciones inteligentes','Pintura y decoración','Carpintería','Solados y alicatados','Techos y falsos techos','Ventanas y cerramientos','Vidrio y cristalería a medida','Cocinas','Baños','Aislamiento e impermeabilización','Energía y eficiencia','Detección de fugas y humedades','Tratamiento de madera','Cerrajería','Accesibilidad','Arquitectura e interiorismo','Certificados y gestión de obra','Limpieza','Montaje de muebles','Restauración y tapicería de muebles','"Manitas" / pequeñas reparaciones','Control de plagas','Mudanzas, portes y guardamuebles','Jardinería y poda','Diseño de jardines y paisajismo','Riego automático','Piscinas','Toldos, pérgolas y protección solar','Vallados y cerramientos exteriores','Mecánica general','Chapa y pintura','Neumáticos','Lavado y detailing','Asistencia en carretera','Reparación de móviles y ordenadores','Reparación de electrodomésticos','Instalación de TV, antenas y fibra','Soporte informático a domicilio','Alarmas y videovigilancia','Catering','Fotografía y vídeo','Música y DJ','Decoración de eventos','Animación infantil','Arreglos de ropa y costura','Modistas a medida','Otros']::text[];
  provincias_nuevas text[]; servicios_nuevos text[];
begin
  if p_provincias is null or cardinality(p_provincias) not between 1 and cardinality(provincias_validas)
    or array_ndims(p_provincias)<>1 or array_position(p_provincias,null) is not null or not p_provincias <@ provincias_validas
    then raise exception 'Selecciona al menos una provincia válida de la lista.' using errcode='22023'; end if;
  if p_servicios is null or cardinality(p_servicios) not between 1 and cardinality(servicios_validos)
    or array_ndims(p_servicios)<>1 or array_position(p_servicios,null) is not null or not p_servicios <@ servicios_validos
    then raise exception 'Selecciona al menos un servicio válido de la lista.' using errcode='22023'; end if;
  if nullif(btrim(p_nombre),'') is null or length(p_nombre)>160 or length(p_descripcion)>6000
    then raise exception 'Revisa el nombre, descripción y servicios de la empresa' using errcode='22023'; end if;
  if nullif(btrim(p_sitio_web),'') is not null and p_sitio_web !~ '^https?://'
    then raise exception 'La web debe comenzar por https:// o http://' using errcode='22023'; end if;
  if nullif(btrim(p_logo),'') is not null and p_logo !~ '^https://'
    then raise exception 'El logo debe ser una imagen alojada mediante https://' using errcode='22023'; end if;
  select array_agg(valor order by posicion) into provincias_nuevas
    from (select valor,min(orden) posicion from unnest(p_provincias) with ordinality a(valor,orden) group by valor) valores;
  select array_agg(valor order by posicion) into servicios_nuevos
    from (select valor,min(orden) posicion from unnest(p_servicios) with ordinality a(valor,orden) group by valor) valores;
  update public.empresas set nombre=btrim(p_nombre),descripcion=nullif(btrim(p_descripcion),''),
    provincias=provincias_nuevas,ubicacion=array_to_string(provincias_nuevas,', '),
    sitio_web=nullif(btrim(p_sitio_web),''),logo=nullif(btrim(p_logo),''),servicios=servicios_nuevos,updated_at=now()
    where id=empresa;
  perform diime_private.empresa_registrar_actividad(empresa,'Perfil actualizado','empresa',empresa,'{}');
end; $$;
create function public.empresa_editar_perfil_cobertura(
  p_nombre text,p_descripcion text,p_ubicacion text,p_sitio_web text,p_logo text,p_servicios text[],p_provincias text[])
returns void language sql security invoker set search_path='' as $$
  select diime_private.empresa_editar_perfil_cobertura(p_nombre,p_descripcion,p_ubicacion,p_sitio_web,p_logo,p_servicios,p_provincias);
$$;
revoke all on function public.empresa_editar_perfil_cobertura(text,text,text,text,text,text[],text[]),
  diime_private.empresa_editar_perfil_cobertura(text,text,text,text,text,text[],text[]) from public,anon,authenticated;
grant execute on function public.empresa_editar_perfil_cobertura(text,text,text,text,text,text[],text[]),
  diime_private.empresa_editar_perfil_cobertura(text,text,text,text,text,text[],text[]) to authenticated;

-- Preserve the existing publication, membership and operation scopes; add only coverage.
create or replace function diime_private.empresa_perfil_publico(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_set(jsonb_set(jsonb_set(base,'{empresa,razon_social}',to_jsonb(razon_social)),'{empresa,provincias}',to_jsonb(provincias)),'{miembros}',coalesce((select jsonb_agg(v||jsonb_build_object('tiene_perfil_profesional',exists(select 1 from public.profesionales p where p.id=(v->>'usuario_id')::uuid)))
    from jsonb_array_elements(base->'miembros') v join public.empresa_miembros m on m.empresa_id=p_empresa_id and m.usuario_id=(v->>'usuario_id')::uuid where m.perfil_publico),'[]'))
  from (select diime_private.empresa_perfil_publico_base(p_empresa_id) base,razon_social,provincias from public.empresas where id=p_empresa_id and estado_verificacion='verificada') q;
$$;
create or replace function diime_private.empresas_publicas()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(v||jsonb_build_object('razon_social',e.razon_social,'provincias',e.provincias,'miembros_count',(select count(*) from public.empresa_miembros m
    where m.empresa_id=(v->>'id')::uuid and m.perfil_publico and diime_private.es_miembro_empresa(m.empresa_id,m.usuario_id)))),'[]')
  from jsonb_array_elements(diime_private.empresas_publicas_base()) v
  join public.empresas e on e.id=(v->>'id')::uuid where e.estado_verificacion='verificada';
$$;
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
    'empresa',jsonb_build_object('id',e.id,'nombre',e.nombre,'razon_social',e.razon_social,'descripcion',e.descripcion,'ubicacion',e.ubicacion,'provincias',e.provincias,'sitio_web',e.sitio_web,'logo',e.logo,'servicios',e.servicios,
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

notify pgrst,'reload schema';
commit;
