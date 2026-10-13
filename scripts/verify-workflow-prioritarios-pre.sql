-- Solo lectura: conteos, huellas y permisos; no devuelve datos personales.
select jsonb_build_object(
 'observed_at',now(),
 'counts',jsonb_build_object(
  'trabajos',(select count(*) from public.trabajos),
  'solicitudes',(select count(*) from public.solicitudes),
  'ofertas',(select count(*) from public.ofertas),
  'reviews',(select count(*) from public."reseñas"),
  'portfolio',(select count(*) from public.portfolio)),
 'notes_before', (select jsonb_build_object('rows',count(*),'bytes',coalesce(sum(octet_length(notas_privadas_proveedor)),0),'digest',md5(coalesce(string_agg(id::text||':'||md5(notas_privadas_proveedor),E'\n' order by id),''))) from public.trabajos where notas_privadas_proveedor is not null),
 'review_anomalies', jsonb_build_object(
  'duplicate_contract_groups',(select count(*) from(select trabajo_id from public."reseñas" group by trabajo_id having count(*)>1) d),
  'wrong_provider',(select count(*) from public."reseñas" r join public.trabajos t on t.id=r.trabajo_id where r.profesional_id is distinct from t.profesional_id),
  'not_completed',(select count(*) from public."reseñas" r join public.trabajos t on t.id=r.trabajo_id where t.estado is distinct from 'completado'),
  'wrong_link',(select count(*) from public."reseñas" r join public.trabajos t on t.id=r.trabajo_id where t.review_cliente_id is distinct from r.id)),
 'portfolio_anomalies',jsonb_build_object(
  'wrong_provider',(select count(*) from public.portfolio p join public.trabajos t on t.id=p.trabajo_id where p.profesional_id is distinct from t.profesional_id),
  'not_completed',(select count(*) from public.portfolio p join public.trabajos t on t.id=p.trabajo_id where t.estado is distinct from 'completado')),
 'new_objects',jsonb_build_object(
  'notes_private',to_regclass('diime_private.notas_trabajo_proveedor') is not null,
  'private_files',to_regclass('public.archivos_privados') is not null,
  'refund_retries',to_regclass('diime_private.reintentos_reembolso') is not null,
  'reviews_version',exists(select 1 from pg_attribute where attrelid='public."reseñas"'::regclass and attname='integridad_version' and not attisdropped)),
 'functions', (select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition_hash',md5(pg_get_functiondef(p.oid)),'security_definer',p.prosecdef,'search_path',p.proconfig,'anon_execute',has_function_privilege('anon',p.oid,'execute'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'),'service_execute',has_function_privilege('service_role',p.oid,'execute')) order by p.oid::regprocedure::text)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','diime_private') and p.proname=any(array['diime_cerrar_cancelacion','diime_reclamar_liquidacion','diime_finalizar_liquidacion','proteger_reparto_escrow','diime_gestionar_solicitud_cancelacion','diime_abrir_disputa','empresa_puede_operar_trabajo','empresa_chat_parte','empresa_tiene_permiso','empresa_es_administrador','validar_actor_trabajo_empresa','validar_actor_cobros_empresa','parte_cancelacion'])),
 'dynamic_patch_ready',(select jsonb_object_agg(p.proname,position('perform diime_private.validar_actor_trabajo_empresa(p_trabajo,p_actor);' in pg_get_functiondef(p.oid))>0) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['diime_gestionar_solicitud_cancelacion','diime_abrir_disputa']))
) as verification;
