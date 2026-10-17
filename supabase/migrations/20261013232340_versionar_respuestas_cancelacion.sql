begin;

-- Consent belongs to the request that was actually read. The revision survives
-- financial continuation, but a new request, changed reason or evidence rotates it.
alter table public.trabajos add column cancelacion_revision uuid;
update public.trabajos set cancelacion_revision=gen_random_uuid()
  where cancelacion_solicitada_por is not null;

create function diime_private.versionar_solicitud_cancelacion()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.cancelacion_revision:=case when new.cancelacion_estado='pendiente' then gen_random_uuid() else null end;
  elsif new.cancelacion_estado='pendiente' and (
      old.cancelacion_estado is distinct from 'pendiente'
      or row(new.cancelacion_solicitada_por,new.cancelacion_razon,new.cancelacion_adjuntos_solicitante)
        is distinct from row(old.cancelacion_solicitada_por,old.cancelacion_razon,old.cancelacion_adjuntos_solicitante)) then
    new.cancelacion_revision:=gen_random_uuid();
  else
    -- A caller cannot inject a revision or change it by updating unrelated data.
    new.cancelacion_revision:=old.cancelacion_revision;
  end if;
  return new;
end; $$;
revoke all on function diime_private.versionar_solicitud_cancelacion() from public,anon,authenticated;
create trigger zz_trabajos_version_cancelacion before insert or update on public.trabajos
  for each row execute function diime_private.versionar_solicitud_cancelacion();

-- This gate and the existing financial gate share a transaction/lock. After it
-- succeeds, pago_bloqueado prevents edits while Stripe reconciliation proceeds.
-- The legacy financial primitive stays service-only for internal continuations.
create function public.diime_responder_cancelacion_versionada(p_trabajo uuid,p_actor uuid,p_revision uuid,p_aceptar boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.trabajos;
begin
  perform public.diime_bloquear_trabajo_financiero(p_trabajo);
  select * into t from public.trabajos where id=p_trabajo for update;
  if p_revision is null or t.cancelacion_revision is null or p_revision is distinct from t.cancelacion_revision then
    raise exception 'La cancelación ha cambiado. Actualiza la página y revisa la solicitud antes de responder.' using errcode='40001';
  end if;
  if p_aceptar is null then raise exception 'Indica una respuesta válida' using errcode='22023'; end if;
  return public.diime_bloquear_checkout(p_trabajo,p_actor,p_aceptar,not p_aceptar);
end; $$;
revoke all on function public.diime_responder_cancelacion_versionada(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.diime_responder_cancelacion_versionada(uuid,uuid,uuid,boolean) to service_role;

-- Existing company projection with the same visibility checks.
CREATE OR REPLACE FUNCTION diime_private.empresa_workspace()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'cancelacion_estado',t.cancelacion_estado,'cancelacion_parte_solicitante',to_jsonb(t)->>'cancelacion_parte_solicitante','cancelacion_razon',t.cancelacion_razon,'cancelacion_revision',t.cancelacion_revision,
        'disputa_actual',(select jsonb_build_object('id',d.id,'estado',d.estado,'motivo',d.motivo,'resolucion',d.resolucion,'resultado',d.resultado)
          from public.disputas d where d.trabajo_id=t.id order by (d.estado in ('abierta','en_revision')) desc,d.created_at desc,d.id desc limit 1),
        'parte',case when t.empresa_proveedora_id=e.id then 'proveedor' else 'cliente' end,
        'operador_usuario_id',case when t.empresa_proveedora_id=e.id then coalesce(t.operador_proveedor_id,t.profesional_id) else coalesce(t.operador_cliente_id,t.cliente_id) end,
        'operador_nombre',btrim(op.nombre||' '||coalesce(op.apellido,''))) order by t.created_at desc)
        from public.trabajos t join public.profiles p on p.id=case when t.empresa_proveedora_id=e.id then t.profesional_id else t.cliente_id end
          join public.profiles op on op.id=case when t.empresa_proveedora_id=e.id then coalesce(t.operador_proveedor_id,t.profesional_id) else coalesce(t.operador_cliente_id,t.cliente_id) end
        where (t.empresa_proveedora_id=e.id or t.empresa_cliente_id=e.id) and (admin_equipo or diime_private.empresa_puede_operar_trabajo(t.id,auth.uid(),'encargos',case when t.empresa_proveedora_id=e.id then 'proveedor' else 'cliente' end))),'[]')
    ));
end; $function$;

notify pgrst,'reload schema';
commit;
