-- Lectura documental acotada: los operadores actuales no heredan SELECT
-- global sobre trabajos, ofertas ni solicitudes por poder ver una factura.
create function diime_private.documento_contratacion(p_trabajo_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  es_admin boolean;
  es_cliente boolean;
  es_proveedor boolean;
  t public.trabajos%rowtype;
  oferta jsonb;
  solicitud jsonb;
begin
  select p.es_admin into es_admin from public.profiles p
    where p.id=actor and p.cuenta_eliminada is null;
  if not found then return null; end if;
  es_cliente := diime_private.empresa_puede_operar_trabajo(p_trabajo_id,actor,'ver_cobros','cliente');
  es_proveedor := diime_private.empresa_puede_operar_trabajo(p_trabajo_id,actor,'ver_cobros','proveedor');
  if not (coalesce(es_admin,false) or es_cliente or es_proveedor) then return null; end if;
  select * into t from public.trabajos where id=p_trabajo_id;
  if not found then return null; end if;
  select jsonb_build_object(
    'descripcion',o.descripcion,'notas',o.notas,'archivos',o.archivos,
    'tiempo_estimado',o.tiempo_estimado,'unidad_tiempo',o.unidad_tiempo,
    'materiales_incluidos',o.materiales_incluidos,'condiciones_pago',o.condiciones_pago,
    'comision_proveedor_minima',case when es_admin or es_proveedor then o.comision_proveedor_minima end,
    'comision_proveedor_porcentaje',case when es_admin or es_proveedor then o.comision_proveedor_porcentaje end,
    'comision_proveedor_prevista',case when es_admin or es_proveedor then o.comision_proveedor_prevista end,
    'pago_neto_proveedor_previsto',case when es_admin or es_proveedor then o.pago_neto_proveedor_previsto end
  ) into oferta from public.ofertas o where o.id=t.oferta_id;
  select jsonb_build_object('titulo',s.titulo,'descripcion',s.descripcion,
    'ubicacion',s.ubicacion,'archivos',s.archivos)
    into solicitud from public.solicitudes s where s.id=t.solicitud_id;
  return jsonb_build_object(
    'trabajo',jsonb_build_object('id',t.id,'cliente_id',t.cliente_id,
      'profesional_id',t.profesional_id,'oferta_id',t.oferta_id,'solicitud_id',t.solicitud_id,
      'titulo',t.titulo,'descripcion',t.descripcion,'ubicacion',t.ubicacion,
      'precio_acordado',t.precio_acordado,'created_at',t.created_at,
      'fecha_inicio',t.fecha_inicio,'fecha_estimada_fin',t.fecha_estimada_fin),
    'oferta',oferta,'solicitud',solicitud);
end; $$;
revoke all on function diime_private.documento_contratacion(uuid) from public,anon,service_role;
grant execute on function diime_private.documento_contratacion(uuid) to authenticated;

create function public.documento_contratacion(p_trabajo_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select diime_private.documento_contratacion(p_trabajo_id);
$$;
revoke all on function public.documento_contratacion(uuid) from public,anon,service_role;
grant execute on function public.documento_contratacion(uuid) to authenticated;
