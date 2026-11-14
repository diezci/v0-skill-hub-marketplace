-- READ ONLY. Run after ALL milestone migrations, before enabling the new UI.
-- Expected: every row has ok=true. This creates no fixtures or money movements.
with auth_rpc(signature,definer,defaults) as (values
 ('public.obtener_plan_oferta(uuid)',false,0),
 ('public.proponer_plan_oferta(uuid,text,jsonb,integer)',false,0),
 ('public.responder_plan_oferta(uuid,integer,boolean)',false,0),
 ('public.obtener_plan_hitos(uuid)',false,0),
 ('public.proponer_plan_trabajo(uuid,text,jsonb,integer)',false,0),
 ('public.responder_plan_trabajo(uuid,integer,boolean)',false,0),
 ('public.entregar_hito(uuid,uuid,text,text[])',false,1),
 ('public.rechazar_entrega_hito(uuid,uuid,text,text[])',false,1),
 ('public.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz)',false,1),
 ('public.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz,integer)',false,0),
 ('private.aceptar_oferta_y_crear_trabajo(uuid,uuid,uuid,timestamptz,integer)',true,2),
 ('diime_private.obtener_plan_oferta(uuid)',true,0),
 ('diime_private.proponer_plan_oferta(uuid,text,jsonb,integer)',true,0),
 ('diime_private.responder_plan_oferta(uuid,integer,boolean)',true,0),
 ('diime_private.obtener_plan_hitos(uuid)',true,0),
 ('diime_private.proponer_plan_trabajo(uuid,text,jsonb,integer)',true,0),
 ('diime_private.responder_plan_trabajo(uuid,integer,boolean)',true,0),
 ('diime_private.entregar_hito(uuid,uuid,text,text[])',true,1),
 ('diime_private.rechazar_entrega_hito(uuid,uuid,text,text[])',true,1)
), financial_rpc(signature) as (values
 ('public.empresa_fijar_destino_cobro_trabajo(uuid,uuid,text)'),
 ('public.preparar_pago_hito(uuid,uuid,uuid)'),
 ('public.diime_confirmar_pago(uuid,text,text,text,numeric,text)'),
 ('public.diime_reclamar_liquidacion(uuid,uuid,text,numeric,uuid,text,text)'),
 ('public.diime_finalizar_liquidacion(uuid,text,text,text,text,text)'),
 ('public.diime_registrar_contracargo(text,text)'),
 ('public.diime_finalizar_conciliacion_contracargo(uuid,text,uuid,uuid,text)'),
 ('public.diime_abrir_disputa(uuid,uuid,text,boolean,text[])'),
 ('public.diime_retirar_disputa(uuid,uuid)'),
 ('public.diime_resolver_mediacion(uuid,uuid,text,text)')
), legacy(signature,body_md5) as (values
 ('private.aceptar_oferta_y_crear_trabajo_sin_plan(uuid,uuid,uuid,timestamptz)','9d541deed57932d062b86ed41fc443dd'),
 ('diime_private.cerrar_cancelacion_aceptada_pago_unico(uuid)','9533e54e827b7d818f1db1778565bc32'),
 ('public.diime_abrir_disputa_pago_unico(uuid,uuid,text,boolean,text[])','1360f8a39a8e2b026b3377379a74a1e9'),
 ('public.diime_confirmar_pago_pago_unico(uuid,text,text,text,numeric,text)','8e4315b0477b5e7de3885fa2d9d3a55d'),
 ('public.diime_finalizar_conciliacion_contracargo_pago_unico(uuid,text,uuid,uuid,text)','6df2447f3c29d0a42ce373ee16d32440'),
 ('public.diime_finalizar_liquidacion_pago_unico(uuid,text,text,text,text,text)','b5a21b031dc4be9bae12909cc8e65bfe'),
 ('public.diime_reclamar_liquidacion_pago_unico(uuid,uuid,text,numeric,uuid,text,text)','586394f1adf40f0319b6c02f0949f37b'),
 ('public.diime_registrar_contracargo_pago_unico(text,text)','87617c2a428f179f0563e84df39e6088'),
 ('public.diime_resolver_mediacion_pago_unico(uuid,uuid,text,text)','de9fc4f8da5f0f6998d3cea2acb22d7a'),
 ('public.diime_retirar_disputa_pago_unico(uuid,uuid)','c4e6357c6baa48081c14f5254d975bbe')
), new_table(name) as (values ('trabajos_hitos'),('trabajos_planes_hitos'),('ofertas_planes_hitos')),
mode_table(name) as (values ('solicitudes'),('ofertas'),('trabajos')),
checks as (
 select 'authenticated_rpc: '||e.signature as check_name,
   coalesce(p.oid is not null and has_function_privilege('authenticated',p.oid,'EXECUTE')
     and not has_function_privilege('anon',p.oid,'EXECUTE') and p.prosecdef=e.definer
     and p.pronargdefaults=e.defaults and 'search_path=""'=any(p.proconfig),false) as ok
 from auth_rpc e left join pg_proc p on p.oid=to_regprocedure(e.signature)
 union all
 select 'service_only_rpc: '||e.signature,
   coalesce(p.oid is not null and has_function_privilege('service_role',p.oid,'EXECUTE')
     and not has_function_privilege('authenticated',p.oid,'EXECUTE')
     and not has_function_privilege('anon',p.oid,'EXECUTE') and not p.prosecdef
     and (case when e.signature like 'public.diime_reclamar_liquidacion(%' then 'search_path=public' else 'search_path=""' end)=any(p.proconfig),false)
 from financial_rpc e left join pg_proc p on p.oid=to_regprocedure(e.signature)
 union all
 select 'legacy_body_and_no_client_bypass: '||e.signature,
   coalesce(p.oid is not null and md5(p.prosrc)=e.body_md5
     and not has_function_privilege('authenticated',p.oid,'EXECUTE')
     and not has_function_privilege('anon',p.oid,'EXECUTE'),false)
 from legacy e left join pg_proc p on p.oid=to_regprocedure(e.signature)
 union all
 select 'table_rls_and_grants: '||e.name,
   coalesce(c.relrowsecurity and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     and has_table_privilege('service_role',c.oid,'SELECT') and has_table_privilege('service_role',c.oid,'INSERT')
     and has_table_privilege('service_role',c.oid,'UPDATE') and has_table_privilege('service_role',c.oid,'DELETE'),false)
 from new_table e left join pg_class c on c.oid=to_regclass('public.'||e.name)
 union all
 select 'legacy_default_unico: '||e.name,
   exists(select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
     where a.attrelid=to_regclass('public.'||e.name) and a.attname='modalidad_pago' and a.attnotnull
       and pg_get_expr(d.adbin,d.adrelid)='''unico''::text')
 from mode_table e
 union all
 select 'legacy_versions_default_zero', count(*)=2
 from information_schema.columns where table_schema='public' and table_name in('ofertas','trabajos')
   and column_name='plan_version' and column_default='0' and is_nullable='NO'
 union all
 select 'legacy_provider_consent_default_true',exists(select 1 from information_schema.columns
   where table_schema='public' and table_name='ofertas' and column_name='plan_aceptado_proveedor' and column_default='true' and is_nullable='NO')
 union all
 select 'optional_legacy_hito_references',count(*)=2 from information_schema.columns
   where table_schema='public' and table_name in('transacciones_escrow','actualizaciones_trabajo') and column_name='hito_id' and is_nullable='YES'
 union all
 select 'escrow_hito_same_contract_fk',exists(select 1 from pg_constraint where conrelid='public.transacciones_escrow'::regclass
   and conname='escrow_hito_trabajo_fk' and contype='f' and convalidated and pg_get_constraintdef(oid) like 'FOREIGN KEY (hito_id, trabajo_id)%')
 union all
 select 'open_escrow_unique_split',
   exists(select 1 from pg_indexes where schemaname='public' and indexname='transacciones_escrow_un_abierto_por_trabajo' and indexdef like '%UNIQUE%' and indexdef like '%hito_id IS NULL%')
   and exists(select 1 from pg_indexes where schemaname='public' and indexname='transacciones_escrow_un_abierto_por_hito' and indexdef like '%UNIQUE%' and indexdef like '%hito_id IS NOT NULL%')
 union all
 select 'enabled_guards',count(*)=7 from pg_trigger where not tgisinternal and tgenabled='O'
   and tgname in('trg_hitos_solicitud','trg_hitos_oferta','trg_hitos_oferta_historial','trg_hitos_contrato','trg_hitos_contrato_creado','trg_hitos_inmutables','trg_hitos_estado_trabajo')
 union all
 select 'workspace_projection_preserved',position('''modalidad_pago'',s.modalidad_pago' in pg_get_functiondef(to_regprocedure('diime_private.empresa_workspace()')))>0
   and position('''plan_version'',t.plan_version' in pg_get_functiondef(to_regprocedure('diime_private.empresa_workspace()')))>0
 union all
 select 'contract_document_projection',position('''modalidad_pago'',t.modalidad_pago' in pg_get_functiondef(to_regprocedure('diime_private.documento_contratacion(uuid)')))>0
 union all
 select 'company_notification_route_guard',position('if new.link is distinct from (''/trabajos/''||t.id||''/hitos'')' in pg_get_functiondef(to_regprocedure('diime_private.proteger_destinatario_aviso_empresa()')))>0
 union all
 select 'continuing_milestone_reuses_frozen_destination',position('t.modalidad_pago=''hitos'' and t.estado=''en_progreso'' and t.proveedor_stripe_account_id is not null' in pg_get_functiondef(to_regprocedure('public.empresa_fijar_destino_cobro_trabajo(uuid,uuid,text)')))>0
)
select check_name,coalesce(ok,false) as ok from checks order by check_name;
